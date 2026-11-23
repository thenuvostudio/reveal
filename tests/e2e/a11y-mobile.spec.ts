import { test, expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { CSV_A, expectPage, open, openLibrary, openSettings, rulerLabel, rulerLabels, seed } from "./helpers";

// Accessibility on phones and tablets. Runs in the a11y-* projects (see playwright.config.ts), one per device.
//
// Target size: WCAG 2.2 AA (2.5.8) — at least 24×24 CSS px, or spaced so a 24 px circle centred on the
// target touches no other target. Anything under 44×44 (2.5.5, AAA / Apple's guideline) is listed as advice only.
// Each screen check uses expect.soft, so one run reports every problem rather than stopping at the first.

// axe and the per-element measurements are slow on a busy machine (several seeded screens per test)
test.describe.configure({ timeout: 180_000 });

const MIN_TARGET = 24;
const COMFORT_TARGET = 44;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const BLOCKING = new Set(["serious", "critical"]);

/** Accepted on purpose, and checked by the "arrow keys" test below instead: the feed itself never takes focus,
 *  but the arrow / Page keys page it (and step the ruler when it is open) from anywhere on the page. */
const ACCEPTED = [{ rule: "scrollable-region-focusable", target: "#feed" }];

const isTablet = (info: TestInfo) => info.project.name.startsWith("a11y-tablet");

/* ---------- the screens ---------- */

const screens: { name: string; go: (page: Page) => Promise<void> }[] = [
  { name: "welcome", go: async (page) => { await open(page); await expect(page.locator("#welcome")).toBeVisible(); } },
  {
    name: "import dialog",
    go: async (page) => {
      await open(page);
      await page.setInputFiles("#csvInput", CSV_A);
      await expect(page.locator(".overlay .modal")).toBeVisible();
    },
  },
  { name: "quote feed", go: seed },
  { name: "library drawer", go: async (page) => { await seed(page); await openLibrary(page); await settle(page, "#library"); } },
  { name: "settings drawer", go: async (page) => { await seed(page); await openSettings(page); await settle(page, "#settings"); } },
  {
    name: "filter panel",
    go: async (page) => {
      await seed(page);
      await page.click("#filterBtn");
      await expect(page.getByTestId("filter-panel")).toBeVisible();
    },
  },
  {
    name: "ruler",
    go: async (page) => {
      await seed(page);
      await page.tap("#bm"); // touch screens have no hover
      await expect(page.locator("#ruler")).toHaveClass(/open/);
      await settle(page, "#ruler");
    },
  },
];

/** Waits for a sliding panel's transition to finish so measurements are taken where it rests. */
async function settle(page: Page, selector: string) {
  await page.locator(selector).evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))));
}

/* ---------- checks ---------- */

async function axe(page: Page, info: TestInfo, screen: string) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  for (const v of results.violations) {
    const kept = v.nodes.filter((n) => !ACCEPTED.some((a) => a.rule === v.id && n.target.join(" ") === a.target));
    if (kept.length < v.nodes.length) info.annotations.push({ type: "axe accepted", description: `${screen}: ${v.id} on #feed (arrow keys page it)` });
    v.nodes = kept;
  }
  results.violations = results.violations.filter((v) => v.nodes.length);
  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ""));
  const advisory = results.violations.filter((v) => !BLOCKING.has(v.impact ?? ""));
  for (const v of advisory) info.annotations.push({ type: `axe ${v.impact}`, description: `${screen}: ${v.id} — ${v.help} (${v.nodes.length}×)` });
  if (results.violations.length) {
    const slug = screen.replace(/\W+/g, "-");
    await info.attach(`axe-${slug}.json`, { body: JSON.stringify(results.violations, null, 2), contentType: "application/json" });
    await info.attach(`axe-${slug}.png`, { body: await page.screenshot(), contentType: "image/png" });
  }
  const report = blocking.map((v) =>
    `[${v.impact}] ${v.id}: ${v.help}\n  ${v.helpUrl}\n` +
    v.nodes.slice(0, 6).map((n) => `  - ${n.target.join(" ")}\n    ${n.failureSummary?.replace(/\n/g, "\n    ")}`).join("\n") +
    (v.nodes.length > 6 ? `\n  …and ${v.nodes.length - 6} more` : ""));
  expect.soft(report, `${screen}: serious/critical axe violations`).toEqual([]);
}

async function noSidewaysScroll(page: Page, screen: string) {
  const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: innerWidth }));
  expect.soft(sizes.scroll, `${screen}: page scrolls sideways (${sizes.scroll}px of content in a ${sizes.view}px screen)`).toBeLessThanOrEqual(sizes.view);
}

type Target = { what: string; w: number; h: number };

/** Visible, on-screen interactive elements that fail 2.5.8, plus those under the comfortable size. */
function measureTargets(page: Page) {
  return page.evaluate(([min, comfort]) => {
    const sel = "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=menuitem], [role=tab], [role=checkbox], [role=radio], [role=switch], [role=option], [tabindex]:not([tabindex='-1'])";
    const describe = (el: Element) => {
      const name = el.getAttribute("aria-label") || el.getAttribute("title") || (el.textContent || "").trim().slice(0, 30);
      return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.classList.length ? "." + [...el.classList].join(".") : ""}${name ? ` "${name}"` : ""}`;
    };
    const inline = (el: Element) => el.tagName === "A" && getComputedStyle(el).display === "inline"; // links in a sentence are exempt
    const all = [...document.querySelectorAll(sel)]
      .filter((el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !inline(el))
      .filter((el) => !(el instanceof HTMLInputElement && el.type === "file"))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 1 && r.height > 1 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight)
      // only what a finger can actually hit: skip targets covered by something else (e.g. behind a dialog's overlay)
      .filter(({ el, r }) => {
        const hit = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1));
        return !!hit && (el.contains(hit) || hit.contains(el));
      })
      // the target is what the finger hits: skip elements nested inside another target
      .filter(({ el }, _i, arr) => !arr.some((o) => o.el !== el && o.el.contains(el)));
    const small = (r: DOMRect) => r.width < min - 0.5 || r.height < min - 0.5;
    const centre = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    const distToRect = (p: { x: number; y: number }, r: DOMRect) => Math.hypot(Math.max(r.left - p.x, 0, p.x - r.right), Math.max(r.top - p.y, 0, p.y - r.bottom));
    const fails: { what: string; w: number; h: number }[] = [];
    const advice: { what: string; w: number; h: number }[] = [];
    for (const t of all) {
      const box = { what: describe(t.el), w: Math.round(t.r.width), h: Math.round(t.r.height) };
      if (t.r.width < comfort - 0.5 || t.r.height < comfort - 0.5) advice.push(box);
      if (!small(t.r)) continue;
      const c = centre(t.r);
      const crowded = all.some((o) => {
        if (o === t) return false;
        if (small(o.r)) { const oc = centre(o.r); return Math.hypot(c.x - oc.x, c.y - oc.y) < min; } // circles meet
        return distToRect(c, o.r) < min / 2; // circle reaches the other target
      });
      if (crowded) fails.push(box);
    }
    return { fails, advice };
  }, [MIN_TARGET, COMFORT_TARGET] as const) as Promise<{ fails: Target[]; advice: Target[] }>;
}

async function targetSizes(page: Page, info: TestInfo, screen: string) {
  const { fails, advice } = await measureTargets(page);
  if (advice.length) info.annotations.push({ type: "under 44×44 (advice)", description: `${screen}: ${advice.map((t) => `${t.what} ${t.w}×${t.h}`).join("; ")}` });
  expect.soft(fails.map((t) => `${t.what} is ${t.w}×${t.h}`), `${screen}: targets smaller than ${MIN_TARGET}×${MIN_TARGET} without enough space around them`).toEqual([]);
}

async function textNotClipped(page: Page, screen: string) {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const clips = (cs: CSSStyleDeclaration) => /hidden|clip/.test(cs.overflowX);
    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      if (el.closest("#tape, script, style, svg")) continue; // the ruler tape loops past the edges by design
      const ownText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
      if (!ownText || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue; // fully off screen (closed drawers, other pages)
      const what = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.classList.length ? "." + [...el.classList].join(".") : ""} "${(el.textContent || "").trim().slice(0, 30)}"`;
      if (r.left < -1 || r.right > innerWidth + 1) { out.push(`${what} runs off the screen (${Math.round(r.left)}…${Math.round(r.right)} of ${innerWidth})`); continue; }
      for (const box of [el, el.parentElement!]) {
        const cs = getComputedStyle(box);
        if (clips(cs) && cs.textOverflow !== "ellipsis" && box.scrollWidth > box.clientWidth + 1) {
          out.push(`${what} is cut off (${box.scrollWidth}px of text in ${box.clientWidth}px)`);
          break;
        }
      }
    }
    return out;
  });
  expect.soft(problems, `${screen}: clipped or overflowing text`).toEqual([]);
}

/* ---------- tests ---------- */

test.describe("mobile accessibility", () => {
  for (const s of screens) {
    test(`${s.name}: axe, no sideways scroll, target size, text fits`, async ({ page }, info) => {
      await s.go(page);
      await axe(page, info, s.name);
      await noSidewaysScroll(page, s.name);
      await targetSizes(page, info, s.name);
      await textNotClipped(page, s.name);
    });
  }

  test("every visible button has an accessible name", async ({ page }) => {
    const check = async (where: string) => {
      const buttons = page.getByRole("button");
      for (let i = 0, n = await buttons.count(); i < n; i++) {
        const b = buttons.nth(i);
        if (!(await b.isVisible())) continue;
        const what = await b.evaluate((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${[...el.classList].join(".")} "${(el.textContent || "").trim().slice(0, 20)}"`);
        await expect.soft(b, `${where}: ${what} has no accessible name`).toHaveAccessibleName(/\S/);
      }
    };
    await seed(page);
    await check("feed");
    await openLibrary(page);
    await check("library");
    await page.locator("#library [data-close]").click();
    await openSettings(page);
    await check("settings");
  });

  test("keyboard focus is visible and on screen", async ({ page }) => {
    await seed(page);
    const seen = new Set<string>();
    const problems: string[] = [];
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const sig = () => {
          const cs = getComputedStyle(el);
          const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 ? `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}` : "none";
          return [outline, cs.boxShadow, cs.backgroundColor, cs.borderColor, cs.color, cs.textDecorationLine].join("|");
        };
        const focused = sig();
        const box = el.getBoundingClientRect();
        el.blur();
        const blurred = sig();
        el.focus(); // keyboard modality is kept, so :focus-visible comes back
        const what = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.classList.length ? "." + [...el.classList].join(".") : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 25)}"`;
        return {
          what, changed: focused !== blurred,
          onScreen: box.width > 0 && box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight,
        };
      });
      if (!r) continue;
      if (seen.has(r.what)) break; // focus has gone round once
      seen.add(r.what);
      if (!r.changed) problems.push(`${r.what}: no visible focus indicator`);
      if (!r.onScreen) problems.push(`${r.what}: focused but off screen`);
    }
    expect(seen.size, "Tab reaches some controls").toBeGreaterThan(3);
    expect.soft(problems).toEqual([]);
  });

  test("controls are reachable: top bar on screen, drawers can be closed and scrolled to the end", async ({ page }) => {
    await seed(page);
    await expectTopBarOnScreen(page);
    for (const [openIt, id] of [[openLibrary, "#library"], [openSettings, "#settings"]] as const) {
      await openIt(page);
      await settle(page, id);
      const drawer = page.locator(id);
      await expect.soft(drawer.locator("[data-close]"), `${id} close button`).toBeInViewport();
      const last = drawer.locator("button, input, select, textarea, [role=button]").filter({ visible: true }).last();
      await last.scrollIntoViewIfNeeded();
      await expect.soft(last, `${id}: last control can be scrolled into view`).toBeInViewport();
      await drawer.locator("[data-close]").click();
      await expect(drawer).not.toHaveClass(/open/);
    }
  });

  test("arrow keys page the feed and step the ruler, without the feed having focus", async ({ page }) => {
    await seed(page);
    await page.locator("#allBtn").click();
    await expectPage(page, 0);
    await page.keyboard.press("ArrowDown");
    await expectPage(page, 1);
    await page.keyboard.press("PageDown");
    await expectPage(page, 2);
    await page.keyboard.press("ArrowUp");
    await expectPage(page, 1);
    // the ruler: B opens it, the arrows move the needle
    const labels = await rulerLabels(page);
    await page.keyboard.press("b");
    await expect(page.locator("#ruler")).toHaveClass(/open/);
    const start = labels.indexOf((await rulerLabel(page)) ?? "");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => rulerLabel(page)).toBe(labels[(start + 1) % labels.length]);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => rulerLabel(page)).toBe(labels[start]);
  });

  test("closed drawers are out of the tab order; opening one moves focus in, closing brings it back", async ({ page }) => {
    await seed(page);
    for (const id of ["#library", "#settings"]) await expect(page.locator(id)).toHaveJSProperty("inert", true);
    // Tab right round the page: focus never lands inside a closed drawer
    const visited: string[] = [];
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      visited.push(await page.evaluate(() => { const a = document.activeElement!; return a.closest("#library, #settings") ? `IN DRAWER: ${a.getAttribute("aria-label") || a.textContent?.trim().slice(0, 20)}` : a.id || a.tagName; }));
    }
    expect(visited.filter((v) => v.startsWith("IN DRAWER"))).toEqual([]);

    for (const [opener, id] of [["#setBtn", "#settings"], ["#brandBtn", "#library"]] as const) {
      await page.locator(opener).focus();
      await page.keyboard.press("Enter");
      const drawer = page.locator(id);
      await expect(drawer).toHaveClass(/open/);
      await expect(drawer).toHaveJSProperty("inert", false);
      await expect(drawer.locator("[data-close]"), `${id}: focus moves to its close button`).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(drawer).not.toHaveClass(/open/);
      await expect(page.locator(opener), `${id}: focus goes back to ${opener}`).toBeFocused();
      // the same when closed with its own × button
      await page.keyboard.press("Enter");
      await expect(drawer.locator("[data-close]")).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(drawer).not.toHaveClass(/open/);
      await expect(page.locator(opener)).toBeFocused();
    }
  });

  test("zoom: phones allow pinch-zoom; tablets still work at 200% zoom", async ({ page }, info) => {
    // Every font size is set in px, so the phone's text-size setting doesn't change the text. Pinch-zoom has to work instead.
    await open(page);
    const meta = (await page.locator("meta[name=viewport]").getAttribute("content")) ?? "";
    expect.soft(meta, "viewport meta must not disable zoom").not.toMatch(/user-scalable\s*=\s*(no|0)/i);
    const max = /maximum-scale\s*=\s*([\d.]+)/i.exec(meta);
    if (max) expect.soft(parseFloat(max[1]), "maximum-scale allows at least 200%").toBeGreaterThanOrEqual(2);
    test.skip(!isTablet(info), "200% layout check runs on tablets (half a phone width is below WCAG's 320 px reflow width)");

    // 200% browser zoom = the same layout in half the CSS pixels.
    const vp = page.viewportSize()!;
    await page.setViewportSize({ width: Math.round(vp.width / 2), height: Math.round(vp.height / 2) });
    await seed(page);
    await noSidewaysScroll(page, "200% zoom");
    await textNotClipped(page, "200% zoom");
    await expectTopBarOnScreen(page);
    for (const [openIt, id] of [[openLibrary, "#library"], [openSettings, "#settings"]] as const) {
      await openIt(page);
      await settle(page, id);
      await expect.soft(page.locator(`${id} [data-close]`), `200% zoom: ${id} close button`).toBeInViewport();
      await page.locator(`${id} [data-close]`).click();
      await expect(page.locator(id)).not.toHaveClass(/open/);
    }
  });
});

async function expectTopBarOnScreen(page: Page) {
  for (const id of ["#brandBtn", "#searchBtn", "#filterBtn", "#diceBtn", "#allBtn", "#importBtn", "#setBtn"]) {
    const el = page.locator(id);
    if (id === "#searchBtn" && !(await el.isVisible())) continue; // wide screens show the search box instead of the chip
    await expect.soft(el, `${id} is visible`).toBeVisible();
    await expect.soft(el, `${id} is fully on screen`).toBeInViewport({ ratio: 1 });
  }
}

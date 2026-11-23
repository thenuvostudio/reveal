import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { dialog, expectPage, modeLabel, rulerLabels, seed, state } from "./helpers";
import { drawerColors } from "../../lib/palettes";

// Runs in the "phone" project only (Pixel 7: 412 px wide, touch, no hover).
// Phones start with two quotes per scroll, so 63 highlights make 32 pages.
const pages = (page: Page) => page.locator(".page[data-pi]");
const quotes = (page: Page) => page.locator(".slot[data-id]");
const ruler = (page: Page) => page.locator("#ruler");
const cur = (page: Page) => page.locator("#tape .tick.cur .lb");

/** A one-finger swipe along the ruler, in small moves like a real finger. */
async function swipe(page: Page, from: { x: number; y: number }, dx: number) {
  const cdp = await page.context().newCDPSession(page);
  const point = (x: number) => [{ x, y: from.y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from.x) });
  const steps = 12;
  for (let i = 1; i <= steps; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(from.x + (dx * i) / steps) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
/** A vertical swipe on the feed, past half the screen's height: the snap then goes to the next page however slow
 *  the gesture comes out (a shorter swipe only gets there with enough speed, which a busy test machine may not give it). */
async function swipeUp(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const point = (y: number) => [{ x: 200, y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(700) });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(700 - i * 55) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test.describe("phone layout", () => {
  test("the top bar is compact, everything fits the screen and nothing overlaps", async ({ page }) => {
    await seed(page);
    const top = page.locator("#top");
    await expect(top).toHaveClass(/tiny/);
    await expect(page.locator("#brandBtn .name")).toBeHidden();
    await expect(page.locator("#searchBtn")).toBeVisible();
    await expect(page.locator("#searchWrap")).toBeHidden();
    const boxes = await page.evaluate(() => ["brandBtn", "searchBtn", "filterBtn", "diceBtn", "allBtn", "importBtn", "setBtn"].map((id) => {
      const r = document.getElementById(id)!.getBoundingClientRect();
      return { id, x0: r.left, x1: r.right, w: r.width, h: r.height };
    }));
    const vw = page.viewportSize()!.width;
    for (const b of boxes) {
      expect(b.x0, b.id).toBeGreaterThanOrEqual(0);
      expect(b.x1, b.id).toBeLessThanOrEqual(vw);
      expect(Math.min(b.w, b.h), `${b.id} is big enough to tap`).toBeGreaterThanOrEqual(34);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      expect(a.x1 <= b.x0 + 0.5 || b.x1 <= a.x0 + 0.5, `${a.id} and ${b.id} overlap`).toBe(true);
    }
    // no sideways scrolling, and the quote stays inside the screen
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.tap("#allBtn");
    for (const i of [0, 10, 20, 31]) {
      await page.evaluate((n) => { const f = document.getElementById("feed")!; f.scrollTop = n * f.clientHeight; }, i);
      await expectPage(page, i);
      await expect.poll(() => page.evaluate(() => {
        const f = document.getElementById("feed")!;
        const slot = f.children[Math.round(f.scrollTop / f.clientHeight)].querySelector<HTMLElement>(".slot[data-id]")!;
        const w = slot.querySelector(".qwrap")!.getBoundingClientRect(), s = slot.getBoundingClientRect();
        return w.left >= 0 && w.right <= innerWidth + 0.5 && w.top >= s.top - 1 && w.bottom <= s.bottom + 1;
      }), { message: `page ${i} fits` }).toBe(true);
    }
  });

  test("a swipe goes to the next quote", async ({ page }) => {
    await seed(page);
    await page.tap("#allBtn");
    await expectPage(page, 0);
    await swipeUp(page);
    await expectPage(page, 1);
  });

  test("phones start with 32 px quotes, two per scroll", async ({ page }) => {
    await seed(page);
    expect(await state<number>(page, "s => s.settings.fontSize")).toBe(32);
    expect(await state<number>(page, "s => s.settings.perScroll")).toBe(2);
    await expect(pages(page)).toHaveCount(32);
    await expect(pages(page).first().locator(".slot[data-id]")).toHaveCount(2);
    await page.tap("#setBtn");
    await expect(page.locator("#fsLbl")).toHaveText("32px");
  });

  test("a quotes-per-scroll choice made in Settings survives a reload", async ({ page }) => {
    await seed(page);
    await page.tap("#setBtn");
    await page.tap("#segN [data-v='1']");
    await expect(pages(page)).toHaveCount(63);
    await page.reload();
    await expect(page.locator(".page[data-pi]").first()).toBeVisible();
    await expect(pages(page)).toHaveCount(63);
    expect(await state<number>(page, "s => s.settings.perScroll")).toBe(1);
    expect(await state<number>(page, "s => s.settings.fontSize")).toBe(32);
  });

  test("the drawers fill the screen and close again", async ({ page }) => {
    await seed(page);
    await page.tap("#setBtn");
    const settings = page.locator("#settings");
    await expect(settings).toHaveClass(/open/);
    const vw = page.viewportSize()!.width;
    await expect.poll(async () => { const b = (await settings.boundingBox())!; return b.x >= 0 && b.x + b.width <= vw + 0.5 && b.width >= Math.min(400, vw) - 0.5; }).toBe(true);
    await page.tap("#segN [data-v='1']");
    await expect(pages(page)).toHaveCount(63);
    await page.tap("#segN [data-v='2']");
    await expect(pages(page)).toHaveCount(32);
    await settings.locator("[data-close]").tap();
    await expect(settings).not.toHaveClass(/open/);
  });
});

test.describe("phone: logo", () => {
  test("tapping the logo opens the library; tapping a book opens it", async ({ page }) => {
    await seed(page);
    await page.tap("#brandBtn");
    const lib = page.locator("#library");
    await expect(lib).toHaveClass(/open/);
    await expect(lib.locator(".lsec").first()).toContainText("Books · 3");
    await lib.locator(".lrow[data-kind='book'][data-id='bC'] .t").tap();
    await expect(lib).not.toHaveClass(/open/);
    await expect(quotes(page)).toHaveCount(3);
    await expect(pages(page)).toHaveCount(2);
    await expect(page.getByTestId("progress")).toHaveText("Book C");
    await page.tap("#brandBtn");
    await lib.locator("[data-close]").tap();
    await expect(lib).not.toHaveClass(/open/);
  });
});

test.describe("phone: search", () => {
  test("the search chip expands across the bar and folds back", async ({ page }) => {
    await seed(page);
    await page.tap("#searchBtn");
    await expect(page.locator("#top")).toHaveClass(/sopen/);
    await expect(page.locator("#search")).toBeFocused();
    const vw = page.viewportSize()!.width;
    const box = (await page.locator("#searchWrap").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(vw - 8);
    expect(box.width).toBeGreaterThan(vw * 0.8);
    for (const id of ["#brandBtn", "#filterBtn", "#diceBtn", "#allBtn", "#importBtn", "#setBtn", "#searchBtn"]) await expect(page.locator(id)).toBeHidden();

    await page.fill("#search", "EDITED");
    await expect(pages(page)).toHaveCount(1);
    await expect(page.locator(".quote mark.q")).toHaveText("EDITED");
    await page.keyboard.press("Enter"); // the keyboard's search key: results stay, the box stays
    await expect(page.locator("#searchWrap")).toBeVisible();
    await expect(pages(page)).toHaveCount(1);

    await page.tap("#sclear");
    await expect(page.locator("#search")).toHaveValue("");
    await expect(quotes(page)).toHaveCount(63);
    await page.locator("#search").blur();
    await expect(page.locator("#top")).not.toHaveClass(/sopen/);
    await expect(page.locator("#searchBtn")).toBeVisible();
    await expect(page.locator("#brandBtn")).toBeVisible();
  });
});

test.describe("phone: ruler", () => {
  test("a tap on the tab opens the ruler, another tap closes it", async ({ page }) => {
    await seed(page);
    await expect(ruler(page)).not.toHaveClass(/open/);
    await page.tap("#bm");
    await expect(ruler(page)).toHaveClass(/open/);
    await expect(cur(page)).toHaveText((await rulerLabels(page))[0]);
    await page.waitForTimeout(400);
    await expect(ruler(page)).toHaveClass(/open/); // it stays open
    await page.tap("#bm");
    await expect(ruler(page)).not.toHaveClass(/open/);
    await page.tap("#bm");
    await expect(ruler(page)).toHaveClass(/open/);
  });

  test("tapping a tick moves to it and loads it; tapping the current tick closes the ruler", async ({ page }) => {
    await seed(page);
    await page.tap("#bm");
    await expect(ruler(page)).toHaveClass(/open/);
    const labels = await rulerLabels(page);
    await page.locator("#tape .tick.cur + .tick").tap();
    await expect(cur(page)).toHaveText(labels[1]);
    await expect.poll(() => modeLabel(page)).toBe(labels[1]);
    await expect(ruler(page)).toHaveClass(/open/);
    await page.locator("#tape .tick.cur").tap();
    await expect(ruler(page)).not.toHaveClass(/open/);
    await expect(page.locator("#diceBtn")).not.toHaveClass(/on/);
  });

  test("swiping the ruler moves the needle and loads where it stops", async ({ page }) => {
    await seed(page);
    await page.tap("#bm");
    await expect(ruler(page)).toHaveClass(/open/);
    const labels = await rulerLabels(page);
    const track = (await page.locator("#track").boundingBox())!;
    const from = { x: track.x + track.width / 2, y: track.y + track.height / 2 };
    const itemW = await page.locator("#tape .tick.cur").evaluate((el) => el.getBoundingClientRect().width);
    await swipe(page, from, -itemW * 0.6 * 2.5); // finger to the left: two items further
    await expect(cur(page)).toHaveText(labels[2]);
    await expect.poll(() => modeLabel(page)).toBe(labels[2]);
    await expect(ruler(page)).toHaveClass(/open/); // a swipe is not a tap: it doesn't close
    await swipe(page, from, itemW * 0.6 * 1.5); // finger to the right: one back
    await expect(cur(page)).toHaveText(labels[1]);
    await expect.poll(() => modeLabel(page)).toBe(labels[1]);
  });

  test("a tap outside closes the ruler", async ({ page }) => {
    await seed(page);
    await page.tap("#bm");
    await expect(ruler(page)).toHaveClass(/open/);
    await page.touchscreen.tap(200, 300);
    await expect(ruler(page)).not.toHaveClass(/open/);
  });
});

test.describe("phone: quote actions", () => {
  const inView = (page: Page) => page.getByTestId("quote-actions").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const barH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--barH")) || 64;
    return { cls: el.className, ok: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight - barH + 0.5 };
  });
  const tapQuote = async (page: Page) => {
    await pages(page).first().locator(".quote").tap();
    const qa = page.getByTestId("quote-actions");
    await expect(qa).toBeVisible();
    await qa.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  };
  /** One quote per scroll at 72 px (the desktop defaults), so a long quote fills the screen. */
  const bigQuotes = async (page: Page) => {
    await page.tap("#setBtn");
    await page.tap("#segN [data-v='1']");
    await page.locator("#fs").fill("72");
    await expect(page.locator("#fsLbl")).toHaveText("72px");
    await page.locator("#settings [data-close]").tap();
    await expect(page.locator("#settings")).not.toHaveClass(/open/);
  };

  test("a long quote leaves no room, so its actions dock above the bottom bar", async ({ page }) => {
    await seed(page);
    await bigQuotes(page);
    await page.tap("#searchBtn");
    await page.fill("#search", "如何早日脫離低谷"); // the longest quote in the sample
    await expect(pages(page)).toHaveCount(1);
    await page.locator("#search").blur();
    await tapQuote(page);
    const place = await inView(page);
    expect(place.cls).toContain("dock");
    expect(place.ok).toBe(true);
    for (const a of ["edit", "note", "tag", "copy", "del"]) await expect(page.locator(`[data-qa=${a}]`)).toBeVisible();
    await expect(page.locator("[data-qa=note-view]")).toContainText("my note on A2");
  });

  test("a short quote shows its actions next to it, inside the screen", async ({ page }) => {
    await seed(page);
    await page.tap("#searchBtn");
    await page.fill("#search", "第三本書的句子 2");
    await expect(pages(page)).toHaveCount(1);
    await page.locator("#search").blur();
    await tapQuote(page);
    const place = await inView(page);
    expect(place.cls).not.toContain("dock");
    expect(place.ok).toBe(true);
  });

  test("the docked actions work by touch: note, tag and delete", async ({ page }) => {
    await seed(page);
    await bigQuotes(page);
    await page.tap("#searchBtn");
    await page.fill("#search", "如何早日脫離低谷");
    await expect(pages(page)).toHaveCount(1);
    await page.locator("#search").blur();
    await tapQuote(page);

    await page.tap("[data-qa=note]");
    await expect(dialog(page).locator("h3")).toHaveText("Edit note");
    const box = (await dialog(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.fill("#noteTa", "from the phone");
    await dialog(page).locator("[data-ok]").tap();
    await expect(page.locator("[data-qa=note-view]")).toContainText("from the phone");

    await page.tap("[data-qa=tag]");
    await page.fill("#tagIn", "mobile");
    await dialog(page).locator("[data-ok]").tap();
    expect(await state<string[]>(page, "s => s.lib.highlights.find(h => h.id === 'bA-2').tags")).toEqual(["mobile"]);

    await page.tap("[data-qa=edit]");
    await expect(page.locator(".rte-body")).toBeVisible();
    const bar = (await page.locator(".rte-bar").boundingBox())!;
    expect(bar.x + bar.width).toBeLessThanOrEqual(page.viewportSize()!.width); // the toolbar wraps instead of overflowing
    await dialog(page).locator("[data-x]").tap();

    await page.tap("[data-qa=del]");
    await dialog(page).locator("[data-ok]").tap();
    expect(await state<number>(page, "s => s.lib.highlights.length")).toBe(62);
  });
});

test.describe("phone: full-screen drawers", () => {
  const DRAWERS = [
    { id: "settings", open: "#setBtn", set: "stone" },
    { id: "library", open: "#brandBtn", set: "plants" },
  ] as const;
  const rulerTab = (page: Page) => page.getByRole("button", { name: "Choose a book, folder or tag" });

  for (const d of DRAWERS) {
    test(`${d.id} covers the whole screen, hides the ruler tab and closes again`, async ({ page }) => {
      await seed(page);
      await expect(rulerTab(page)).toBeVisible();
      await page.tap(d.open);
      const drawer = page.locator(`#${d.id}`);
      await expect(drawer).toHaveClass(/open/);
      const vp = page.viewportSize()!;
      await expect.poll(async () => { const b = (await drawer.boundingBox())!; return [b.x, b.y, b.width, b.height].map(Math.round); }).toEqual([0, 0, vp.width, vp.height]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.evaluate(() => getComputedStyle(document.getElementById("feed")!).overflowY)).toBe("hidden"); // the page behind can't scroll
      // the ruler tab is gone: not shown, out of the accessibility tree, not focusable, not tappable
      await expect(rulerTab(page)).toHaveCount(0);
      await expect(page.locator("#bm")).toBeHidden();
      expect(await page.evaluate(() => { const b = document.getElementById("bm")!; b.focus(); return document.activeElement === b; })).toBe(false);
      // the close button is on screen and big enough to tap
      const x = (await drawer.locator("[data-close]").boundingBox())!;
      expect(x.x + x.width).toBeLessThanOrEqual(vp.width);
      expect(x.y).toBeGreaterThanOrEqual(0);
      expect(Math.min(x.width, x.height)).toBeGreaterThanOrEqual(44);
      await drawer.locator("[data-close]").tap();
      await expect(drawer).not.toHaveClass(/open/);
      await expect(rulerTab(page)).toBeVisible();
      expect(await page.evaluate(() => getComputedStyle(document.getElementById("feed")!).overflowY)).not.toBe("hidden");
    });

    test(`${d.id} is coloured from the "${d.set}" set and its text passes colour contrast`, async ({ page }) => {
      await seed(page);
      await page.tap(d.open);
      const drawer = page.locator(`#${d.id}`);
      await expect(drawer).toHaveClass(/open/);
      await drawer.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      const c = drawerColors(d.set);
      const got = await drawer.evaluate((el) => { const s = getComputedStyle(el); return ["--paper", "--ink", "--ink-2", "--ink-3", "--accent"].map((v) => s.getPropertyValue(v).trim()); });
      expect(got).toEqual([c.paper, c.ink, c.ink2, c.ink3, c.accent]);
      const results = await new AxeBuilder({ page }).include(`#${d.id}`).withRules(["color-contrast"]).analyze();
      expect(results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")}: ${n.failureSummary}`))).toEqual([]);
    });
  }
});

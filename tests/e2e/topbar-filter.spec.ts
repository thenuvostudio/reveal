import { test, expect, type Page } from "@playwright/test";
import { expectPage, feedIds, goTo, openRuler, rulerLabels, seed, state, toast } from "./helpers";

const pages = (page: Page) => page.locator(".page[data-pi]");
const mode = (page: Page) => state<string>(page, "s => s.mode.type + ':' + s.mode.id");

test.describe("search", () => {
  test("finds text and marks the matches, also inside edited quotes", async ({ page }) => {
    await seed(page);
    await page.fill("#search", "EDITED");
    await expect(pages(page)).toHaveCount(1);
    await expect(page.locator("#top")).toHaveClass(/searching/);
    await expect(page.locator(".slot[data-id='bA-3'] .quote b mark.q")).toHaveText("EDITED");
    expect(await mode(page)).toBe("search:null");
    await page.fill("#search", "順境");
    await expect(pages(page)).not.toHaveCount(1);
    await expect(page.locator(".quote mark.q").first()).toHaveText("順境");
    const ids = (await feedIds(page)).flat();
    expect(ids.length).toBeGreaterThan(3);
    expect(ids.every((id) => id.startsWith("bA-"))).toBe(true);
  });

  test("also searches notes, tags and book titles; several words must all match", async ({ page }) => {
    await seed(page);
    await page.fill("#search", "my note on A2"); // a note
    await expect(pages(page)).toHaveCount(1);
    await expect(page.locator(".slot[data-id='bA-2']")).toBeVisible();
    await page.fill("#search", "Book C"); // a title
    await expect(pages(page)).toHaveCount(3);
    await page.fill("#search", "book 句子 1"); // all three words
    await expect(pages(page)).toHaveCount(1);
    await expect(page.locator(".slot[data-id='bC-1']")).toBeVisible();
    await page.fill("#search", "#x 串流"); // a tag plus a title
    await expect(pages(page)).toHaveCount(1);
    await expect(page.locator(".slot[data-id='bB-0']")).toBeVisible();
  });

  test("× clears the search and keeps the cursor in the box", async ({ page }) => {
    await seed(page);
    await expect(page.locator("#sclear")).toBeHidden();
    await page.fill("#search", "EDITED");
    await expect(pages(page)).toHaveCount(1);
    await page.click("#sclear");
    await expect(page.locator("#search")).toHaveValue("");
    await expect(page.locator("#search")).toBeFocused();
    await expect(pages(page)).toHaveCount(63);
    await expect(page.locator("#top")).not.toHaveClass(/searching/);
    await expect(page.locator("#sclear")).toBeHidden();
  });

  test("Esc clears it, from the box and from the page", async ({ page }) => {
    await seed(page);
    await page.fill("#search", "EDITED");
    await expect(pages(page)).toHaveCount(1);
    await page.keyboard.press("Escape"); // focus is in the box
    await expect(page.locator("#search")).toHaveValue("");
    await expect(page.locator("#search")).not.toBeFocused();
    await expect(pages(page)).toHaveCount(63);

    await page.fill("#search", "EDITED");
    await expect(pages(page)).toHaveCount(1);
    await page.keyboard.press("Enter"); // leaves the box, keeps the results
    await expect(page.locator("#search")).not.toBeFocused();
    await expect(pages(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator("#search")).toHaveValue("");
    await expect(pages(page)).toHaveCount(63);
  });

  test("/ focuses the search box", async ({ page }) => {
    await seed(page);
    await expect(page.locator("#search")).not.toBeFocused();
    await page.keyboard.press("/");
    await expect(page.locator("#search")).toBeFocused();
    await expect(page.locator("#search")).toHaveValue(""); // the slash itself isn't typed
    await page.keyboard.type("a/b"); // inside the box a slash is just a character
    await expect(page.locator("#search")).toHaveValue("a/b");
  });

  test("clearing the search goes back to where you were", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    await page.fill("#search", "EDITED");
    await expect(pages(page)).toHaveCount(1);
    await page.click("#sclear");
    expect(await mode(page)).toBe("book:bC");
    await expect(pages(page)).toHaveCount(3);
  });
});

test.describe("dice and All", () => {
  test("the dice reshuffles the random mix", async ({ page }) => {
    await seed(page);
    const seed0 = await state<number>(page, "s => s.mode.seed");
    const before = (await feedIds(page)).flat();
    await page.keyboard.press("End");
    await expectPage(page, 62);
    await page.click("#diceBtn");
    await expect(toast(page)).toHaveText("🎲 Reshuffled");
    expect(await state<number>(page, "s => s.mode.seed")).not.toBe(seed0);
    await expectPage(page, 0); // back at the top
    const after = (await feedIds(page)).flat();
    expect(after).not.toEqual(before);
    expect([...after].sort()).toEqual([...before].sort());
  });

  test("from another mode the dice goes back to random", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    await expect(page.locator("#diceBtn")).not.toHaveClass(/on/);
    await page.click("#diceBtn");
    await expect(toast(page)).toHaveText("🎲 Random mix from every category");
    expect(await mode(page)).toBe("random:null");
    await expect(page.locator("#diceBtn")).toHaveClass(/on/);
    await expect(pages(page)).toHaveCount(63);
  });

  test("All shows every quote, book by book", async ({ page }) => {
    await seed(page);
    await page.click("#allBtn");
    expect(await mode(page)).toBe("all:null");
    await expect(page.locator("#allBtn")).toHaveClass(/on/);
    await expect(page.locator("#diceBtn")).not.toHaveClass(/on/);
    const books = (await feedIds(page)).map((ids) => ids[0].split("-")[0]);
    expect(books).toHaveLength(63);
    const runs = books.filter((b, i) => b !== books[i - 1]);
    expect(runs).toHaveLength(3); // each book in one block
    expect(runs[2]).toBe("bC"); // books in folders come first, loose books last
  });

  test("dice and All both leave a search", async ({ page }) => {
    await seed(page);
    await page.fill("#search", "EDITED");
    await expect(pages(page)).toHaveCount(1);
    await page.click("#allBtn");
    await expect(page.locator("#search")).toHaveValue("");
    expect(await mode(page)).toBe("all:null");
    await page.fill("#search", "EDITED");
    await expect(pages(page)).toHaveCount(1);
    await page.click("#diceBtn");
    await expect(page.locator("#search")).toHaveValue("");
    expect(await mode(page)).toBe("random:null");
    await expect(pages(page)).toHaveCount(63);
  });
});

test.describe("filter", () => {
  const panel = (page: Page) => page.getByTestId("filter-panel");
  const summary = (page: Page) => page.getByTestId("filter-summary");
  const openPanel = async (page: Page) => { await page.click("#filterBtn"); await expect(panel(page)).toBeVisible(); };

  test("the panel lists folders and tags with their counts", async ({ page }) => {
    await seed(page);
    await openPanel(page);
    await expect(page.locator("#filterBtn")).toHaveAttribute("aria-expanded", "true");
    await expect(summary(page)).toHaveText("Showing everything");
    await expect(panel(page).locator("[data-fclear]")).toHaveCount(0);
    await expect(panel(page).locator(".frow", { hasText: "自我成長" }).locator(".c")).toHaveText("35");
    await expect(panel(page).locator(".frow", { hasText: "商業與媒體" }).locator(".c")).toHaveText("25");
    await expect(panel(page).locator("[data-ft=x]")).toHaveText("#x 3");
    await expect(panel(page).locator("[data-ft=y]")).toHaveText("#y 1");
    await expect(page.locator("#filterBadge")).toBeHidden();
  });

  test("a folder narrows the feed, the badge and the tooltip show it", async ({ page }) => {
    await seed(page);
    await openPanel(page);
    await panel(page).locator("[data-ff=fA]").check();
    await expect(summary(page)).toHaveText("1 book · 35 highlights match");
    await expect(pages(page)).toHaveCount(35);
    expect((await feedIds(page)).flat().every((id) => id.startsWith("bA-"))).toBe(true);
    await expect(page.locator("#filterBtn")).toHaveClass(/on/);
    await expect(page.locator("#filterBadge")).toHaveText("1");
    await expect(page.locator("#filterBadge")).toBeVisible();
    await expect(page.locator("#filterBtn")).toHaveAttribute("title", "Filter on: 自我成長");
    await panel(page).locator("[data-ff=fB]").check(); // folders add up
    await expect(summary(page)).toHaveText("2 books · 60 highlights match");
    await expect(pages(page)).toHaveCount(60);
    await expect(page.locator("#filterBadge")).toHaveText("2");
  });

  test("tags add up with each other; a folder AND a tag must both match", async ({ page }) => {
    await seed(page);
    await openPanel(page);
    await panel(page).locator("[data-ft=x]").click();
    await expect(panel(page).locator("[data-ft=x]")).toHaveClass(/on/);
    await expect(summary(page)).toHaveText("2 books · 3 highlights match");
    await expect(pages(page)).toHaveCount(3);
    await panel(page).locator("[data-ft=y]").click(); // x OR y
    await expect(summary(page)).toHaveText("2 books · 3 highlights match");
    await expect(panel(page).locator(".fnote")).toHaveCount(0);
    await panel(page).locator("[data-ff=fA]").check(); // …AND in folder A
    await expect(summary(page)).toHaveText("1 book · 2 highlights match");
    await expect(panel(page).locator(".fnote")).toContainText("in the chosen folders and carry one of the chosen tags");
    await expect(pages(page)).toHaveCount(2);
    expect((await feedIds(page)).flat().sort()).toEqual(["bA-0", "bA-1"]);
    await expect(page.locator("#filterBadge")).toHaveText("3");
    await expect(page.locator("#filterBtn")).toHaveAttribute("title", "Filter on: 自我成長, #x, #y");
    await panel(page).locator("[data-ft=x]").click(); // folder A AND y: one highlight short
    await expect(toast(page)).toHaveText("Nothing matches this filter yet");
    await expect(summary(page)).toHaveText("0 books · 0 highlights match");
    await expect(page.locator(".empty-msg")).toContainText("Nothing here yet");
  });

  test("Clear all removes the filter", async ({ page }) => {
    await seed(page);
    await openPanel(page);
    await panel(page).locator("[data-ff=fA]").check();
    await panel(page).locator("[data-ft=x]").click();
    await expect(pages(page)).toHaveCount(2);
    await panel(page).locator("[data-fclear]").click();
    await expect(summary(page)).toHaveText("Showing everything");
    await expect(panel(page).locator("[data-ff=fA]")).not.toBeChecked();
    await expect(panel(page).locator("[data-ft=x]")).not.toHaveClass(/on/);
    await expect(pages(page)).toHaveCount(63);
    await expect(page.locator("#filterBadge")).toBeHidden();
    await expect(page.locator("#filterBtn")).not.toHaveClass(/on/);
    await expect(page.locator("#filterBtn")).toHaveAttribute("title", "Filter by folder or tag");
  });

  test("Done, Esc, a click outside and the funnel itself all close the panel and keep the filter", async ({ page }) => {
    await seed(page);
    await openPanel(page);
    await panel(page).locator("[data-ff=fA]").check();
    await panel(page).locator("[data-fdone]").click();
    await expect(panel(page)).toHaveCount(0);
    await expect(page.locator("#filterBtn")).toHaveAttribute("aria-expanded", "false");
    await expect(pages(page)).toHaveCount(35);

    await openPanel(page);
    await expect(panel(page).locator("[data-ff=fA]")).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);

    await openPanel(page);
    await page.mouse.click(200, 600);
    await expect(panel(page)).toHaveCount(0);

    await openPanel(page);
    await page.click("#filterBtn");
    await expect(panel(page)).toHaveCount(0);
    await expect(pages(page)).toHaveCount(35);
    await expect(page.locator("#filterBadge")).toHaveText("1");
  });

  test("Esc on the panel doesn't also leave the search", async ({ page }) => {
    await seed(page);
    await page.fill("#search", "順境");
    await expect(pages(page)).toHaveCount(4);
    await page.keyboard.press("Enter");
    await openPanel(page);
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(page.locator("#search")).toHaveValue("順境");
    await expect(pages(page)).toHaveCount(4);
    expect(await mode(page)).toBe("search:null");
  });

  test("search, All and the ruler all stay inside the filter", async ({ page }) => {
    await seed(page);
    await openPanel(page);
    await panel(page).locator("[data-ff=fA]").check();
    await panel(page).locator("[data-fdone]").click();
    await page.click("#allBtn");
    await expect(pages(page)).toHaveCount(35);
    await page.fill("#search", "Book C"); // outside the filter
    await expect(page.locator(".empty-msg")).toContainText("No highlights match");
    await page.click("#sclear");
    await page.locator("#search").blur();
    await openRuler(page);
    expect(await rulerLabels(page)).toEqual(["🎲 隨機 Random", "全部 All", "自我成長", "峰與谷", "#x"]);
    await expect(page.locator("#tape .tick.random .ct").first()).toHaveText("35");
    await expect(page.locator("#tape .tick.tag .ct").first()).toHaveText("2");
  });

  test("a book outside the new filter is left for the random mix", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    await openPanel(page);
    await panel(page).locator("[data-ff=fA]").check();
    expect(await mode(page)).toBe("random:null");
    await expect(pages(page)).toHaveCount(35);
  });
});

test.describe("brand and settings buttons", () => {
  test("the logo opens the library, also from the keyboard", async ({ page }) => {
    await seed(page);
    await page.click("#brandBtn");
    await expect(page.locator("#library")).toHaveClass(/open/);
    await expect(page.locator("#library")).toHaveAttribute("aria-hidden", "false");
    await page.keyboard.press("Escape");
    await expect(page.locator("#library")).not.toHaveClass(/open/);
    await page.locator("#brandBtn").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#library")).toHaveClass(/open/);
    await page.keyboard.press("Enter"); // the same key closes it again
    await expect(page.locator("#library")).not.toHaveClass(/open/);
    await page.keyboard.press("Space");
    await expect(page.locator("#library")).toHaveClass(/open/);
  });

  test("the gear opens the settings", async ({ page }) => {
    await seed(page);
    await page.click("#setBtn");
    await expect(page.locator("#settings")).toHaveClass(/open/);
    await expect(page.locator("#setBody")).toBeVisible();
    await expect(page.locator("#library")).not.toHaveClass(/open/);
  });
});

test.describe("layout", () => {
  /** Every visible control of the top bar with its box. */
  const boxes = (page: Page) => page.evaluate(() => {
    const ids = ["brandBtn", "searchBtn", "searchWrap", "filterBtn", "diceBtn", "allBtn", "importBtn", "setBtn"];
    return ids.map((id) => {
      const el = document.getElementById(id)!, r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return { id, x0: r.left, x1: r.right, y0: r.top, y1: r.bottom, shown: cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 };
    }).filter((b) => b.shown);
  });

  for (const [w, h, kind] of [[1440, 900, "full"], [1024, 768, "full"], [600, 800, "compact"], [390, 844, "tiny"]] as const) {
    test(`nothing overlaps at ${w}px wide`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await seed(page);
      const top = page.locator("#top");
      if (kind === "tiny") await expect(top).toHaveClass(/tiny/); else await expect(top).not.toHaveClass(/tiny/);
      if (kind === "full") await expect(top).not.toHaveClass(/compact/); else await expect(top).toHaveClass(/compact/);
      const bs = await boxes(page);
      const shown = bs.map((b) => b.id);
      expect(shown).toEqual(expect.arrayContaining(["brandBtn", "filterBtn", "diceBtn", "allBtn", "importBtn", "setBtn"]));
      expect(shown).toContain(kind === "tiny" ? "searchBtn" : "searchWrap");
      expect(shown).not.toContain(kind === "tiny" ? "searchWrap" : "searchBtn");
      for (const b of bs) {
        expect(b.x0, `${b.id} left edge`).toBeGreaterThanOrEqual(0);
        expect(b.x1, `${b.id} right edge`).toBeLessThanOrEqual(w);
        expect(b.y0, `${b.id} top edge`).toBeGreaterThanOrEqual(0);
        expect(b.y1, `${b.id} bottom edge`).toBeLessThanOrEqual(64);
      }
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j];
        expect(a.x1 <= b.x0 + 0.5 || b.x1 <= a.x0 + 0.5, `${a.id} and ${b.id} overlap`).toBe(true);
      }
      await expect(page.locator("#brandBtn .name")).toBeVisible({ visible: kind === "full" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }

  test("the layout adapts when the window is resized", async ({ page }) => {
    await seed(page);
    await expect(page.locator("#searchWrap")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("#top")).toHaveClass(/tiny/);
    await expect(page.locator("#searchBtn")).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator("#top")).not.toHaveClass(/tiny|compact/);
    await expect(page.locator("#searchWrap")).toBeVisible();
    await expectPage(page, 0);
  });

  test("on a narrow window the search chip expands across the bar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
    await page.click("#searchBtn");
    await expect(page.locator("#top")).toHaveClass(/sopen/);
    await expect(page.locator("#search")).toBeFocused();
    await expect(page.locator("#searchWrap")).toBeVisible();
    await expect(page.locator("#brandBtn")).toBeHidden();
    await expect(page.locator("#setBtn")).toBeHidden();
    const box = (await page.locator("#searchWrap").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.width).toBeGreaterThan(300);
    await page.locator("#search").blur(); // empty: folds back
    await expect(page.locator("#top")).not.toHaveClass(/sopen/);
    await expect(page.locator("#brandBtn")).toBeVisible();
    await page.keyboard.press("/"); // the shortcut expands it too
    await expect(page.locator("#search")).toBeFocused();
    await page.keyboard.type("EDITED");
    await expect(page.locator(".page[data-pi]")).toHaveCount(1);
    await page.locator("#search").blur(); // with text it stays open
    await expect(page.locator("#searchWrap")).toBeVisible();
    await page.click("#sclear");
    await expect(page.locator(".page[data-pi]")).toHaveCount(63);
  });
});

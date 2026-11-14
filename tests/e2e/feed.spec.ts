import { test, expect, type Page } from "@playwright/test";
import { closeDrawer, currentIds, expectPage, feedIds, goTo, openSettings, seed, selectCurrentQuote, state } from "./helpers";

const TITLES: Record<string, string> = { bA: "峰與谷", bB: "串流媒體", bC: "Book C" };
const bookOf = (id: string) => id.split("-")[0];

/** Does the quote on the current page fit inside its slot, at a size between the minimum and the setting? */
const fitOfCurrentPage = (page: Page) => page.evaluate(() => {
  const f = document.getElementById("feed")!;
  const p = f.children[Math.round(f.scrollTop / f.clientHeight)];
  return [...p.querySelectorAll<HTMLElement>(".slot[data-id]")].map((slot) => {
    const q = slot.querySelector<HTMLElement>(".quote")!, wrap = slot.querySelector<HTMLElement>(".qwrap")!;
    const s = slot.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    return { font: parseFloat(getComputedStyle(q).fontSize), inside: w.top >= s.top - 1 && w.bottom <= s.bottom + 1 && w.left >= s.left - 1 && w.right <= s.right + 1, overflow: slot.scrollHeight - slot.clientHeight };
  });
});

test.describe("random mode", () => {
  test("is the mode the app starts in and takes turns between categories", async ({ page }) => {
    await seed(page);
    expect(await state<string>(page, "s => s.mode.type")).toBe("random");
    await expect(page.locator("#diceBtn")).toHaveClass(/on/);
    const books = (await feedIds(page)).map((ids) => bookOf(ids[0]));
    expect(books).toHaveLength(63);
    // three categories (two folders and one unfiled book): every round of three shows each of them once
    for (let r = 0; r < 3; r++) expect(new Set(books.slice(r * 3, r * 3 + 3)).size).toBe(3);
    // Book C runs out after 3 rounds; the two folders keep alternating for 22 more rounds (pages 9–52)…
    for (let i = 9; i < 52; i++) expect(books[i]).not.toBe(books[i + 1]);
    // …until the smaller folder runs out too and only the bigger one is left
    expect(new Set(books.slice(53))).toEqual(new Set(["bA"]));
    // every highlight is shown exactly once
    expect(new Set((await feedIds(page)).flat()).size).toBe(63);
  });
});

test.describe("quote fitting", () => {
  test("a short quote uses the full font size; a long one shrinks until it fits", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    const short = await fitOfCurrentPage(page);
    expect(short).toHaveLength(1);
    expect(short[0].font).toBe(72);
    expect(short[0].inside).toBe(true);

    // two long quotes on one page with the largest font: both must shrink, and still fit
    await openSettings(page);
    await page.click("#segN [data-v='2']");
    await page.locator("#fs").focus();
    await page.keyboard.press("End");
    await expect(page.locator("#fsLbl")).toHaveText("120px");
    await closeDrawer(page);
    await goTo(page, "book", "bA");
    await expect(page.locator(".page[data-pi]")).toHaveCount(18);
    for (let i = 0; i < 18; i += 3) {
      await page.evaluate((n) => { const f = document.getElementById("feed")!; f.scrollTop = n * f.clientHeight; }, i);
      await expectPage(page, i);
      await expect.poll(async () => (await fitOfCurrentPage(page)).every((f) => f.inside && f.overflow <= 0 && f.font < 120 && f.font >= 14), { message: `page ${i} fits` }).toBe(true);
    }
  });

  test("every page of the library fits at the default settings", async ({ page }) => {
    await seed(page);
    await page.click("#allBtn");
    for (let i = 0; i < 63; i += 6) {
      await page.evaluate((n) => { const f = document.getElementById("feed")!; f.scrollTop = n * f.clientHeight; }, i);
      await expectPage(page, i);
      await expect.poll(async () => (await fitOfCurrentPage(page)).every((f) => f.inside && f.font <= 72 && f.font >= 14)).toBe(true);
    }
  });
});

test.describe("keyboard paging", () => {
  test("↓ Space PageDown go forward, ↑ PageUp go back, End and Home jump", async ({ page }) => {
    await seed(page);
    await page.click("#allBtn");
    await expectPage(page, 0);
    await page.keyboard.press("ArrowDown"); await expectPage(page, 1);
    await page.keyboard.press("Space"); await expectPage(page, 2);
    await page.keyboard.press("PageDown"); await expectPage(page, 3);
    await page.keyboard.press("ArrowUp"); await expectPage(page, 2);
    await page.keyboard.press("PageUp"); await expectPage(page, 1);
    await page.keyboard.press("End"); await expectPage(page, 62);
    await page.keyboard.press("ArrowDown"); // already at the end: stays
    await page.waitForTimeout(300);
    await expectPage(page, 62);
    await page.keyboard.press("Home"); await expectPage(page, 0);
    await page.keyboard.press("ArrowUp"); // already at the start: stays
    await page.waitForTimeout(300);
    await expectPage(page, 0);
  });

  test("paging keys do nothing while a dialog is open or while typing", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    await page.click("#search");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("End");
    await page.waitForTimeout(300);
    await expectPage(page, 0);
    await page.locator("#search").blur();
    await selectCurrentQuote(page);
    await page.click("[data-qa=note]");
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(300);
    await expectPage(page, 0);
  });
});

test.describe("blur between pages", () => {
  /** Watches every frame while the feed moves: was any quote blurred on the way? */
  const blurSeenWhilePaging = async (page: Page) => {
    await page.evaluate(() => {
      const w = window as unknown as { __blur: boolean; __watch: boolean };
      w.__blur = false; w.__watch = true;
      const tick = () => {
        // only quotes the reader can see count (pages waiting off-screen are kept pre-blurred)
        const seen = (s: HTMLElement) => { const r = s.getBoundingClientRect(); return r.bottom > 1 && r.top < innerHeight - 1; };
        if ([...document.querySelectorAll<HTMLElement>(".slot[data-id]")].some((s) => seen(s) && s.style.filter.includes("blur"))) w.__blur = true;
        if (w.__watch) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.keyboard.press("ArrowDown");
    await expectPage(page, 1);
    return page.evaluate(() => { const w = window as unknown as { __blur: boolean; __watch: boolean }; w.__watch = false; return w.__blur; });
  };
  const restingStyles = (page: Page) => page.evaluate(() => {
    const f = document.getElementById("feed")!;
    const s = f.children[Math.round(f.scrollTop / f.clientHeight)].querySelector<HTMLElement>(".slot[data-id]")!;
    return { filter: s.style.filter, opacity: s.style.opacity };
  });

  test("quotes blur while the page is moving and are sharp at rest", async ({ page }) => {
    await seed(page);
    await page.click("#allBtn");
    expect(await restingStyles(page)).toEqual({ filter: "", opacity: "" });
    expect(await blurSeenWhilePaging(page)).toBe(true);
    await expect.poll(() => restingStyles(page)).toEqual({ filter: "", opacity: "" });
  });

  test("with the setting off nothing is ever blurred", async ({ page }) => {
    await seed(page);
    await page.click("#allBtn");
    await openSettings(page);
    await page.locator("#blurT").uncheck();
    await closeDrawer(page);
    expect(await blurSeenWhilePaging(page)).toBe(false);
  });
});

test.describe("progress label", () => {
  test("shows the title of the book on screen and follows the reader", async ({ page }) => {
    await seed(page);
    const progress = page.getByTestId("progress");
    // random: whatever book the first page is from
    await expect(progress).toHaveText(TITLES[bookOf((await currentIds(page))[0])]);
    await goTo(page, "book", "bC");
    await expect(progress).toHaveText("Book C");
    await page.click("#allBtn");
    const pages = await feedIds(page);
    await expect(progress).toHaveText(TITLES[bookOf(pages[0][0])]);
    await page.keyboard.press("End");
    await expectPage(page, 62);
    await expect(progress).toHaveText(TITLES[bookOf(pages[62][0])]);
    expect(bookOf(pages[0][0])).not.toBe(bookOf(pages[62][0]));
  });
});

test.describe("selecting a quote", () => {
  test("a click shows its actions, a second click or a click elsewhere hides them", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    const qa = page.getByTestId("quote-actions");
    await expect(qa).toHaveCount(0);
    await selectCurrentQuote(page);
    await expect(page.locator(".slot.sel")).toHaveAttribute("data-id", "bC-2");
    for (const a of ["edit", "note", "tag", "copy", "del"]) await expect(qa.locator(`[data-qa=${a}]`)).toBeVisible();
    await page.locator(".slot.sel .quote").click();
    await expect(qa).toHaveCount(0);
    await selectCurrentQuote(page);
    await page.mouse.click(30, 450); // the page's margin
    await expect(qa).toHaveCount(0);
  });

  test("Esc deselects, and so does going to another page", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    const qa = page.getByTestId("quote-actions");
    await selectCurrentQuote(page);
    await page.keyboard.press("Escape");
    await expect(qa).toHaveCount(0);
    await selectCurrentQuote(page);
    await page.keyboard.press("ArrowDown");
    await expectPage(page, 1);
    await expect(qa).toHaveCount(0);
    await expect(page.locator(".slot.sel")).toHaveCount(0);
  });

  test("the attribution line shows book, folder, chapter, date and markers", async ({ page }) => {
    await seed(page);
    await page.fill("#search", "EDITED");
    await expect(page.locator(".page[data-pi]")).toHaveCount(1);
    const attr = page.locator(".slot[data-id='bA-3'] .attr");
    await expect(attr.locator(".bk")).toHaveText("峰與谷");
    await expect(attr).toContainText("自我成長");
    await expect(attr).toContainText("Ch. 19");
    await expect(attr).toContainText("2025-01-10");
    await expect(attr).toContainText("edited");
    await page.fill("#search", "my note on A2");
    await expect(page.locator(".slot[data-id='bA-2'] .attr .has-note")).toBeVisible();
  });
});

test.describe("empty results", () => {
  test("a search that matches nothing says so, Esc goes back", async ({ page }) => {
    await seed(page);
    await page.fill("#search", "zzzqqq");
    const msg = page.locator(".empty-msg");
    await expect(msg).toContainText("No highlights match “zzzqqq”");
    await expect(msg).toContainText("Press Esc to go back.");
    await expect(page.locator(".page[data-pi]")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(msg).toHaveCount(0);
    await expect(page.locator(".page[data-pi]")).toHaveCount(63);
  });
});

import { test, expect, type Page } from "@playwright/test";
import { dialog, expectPage, modeLabel, open, openLibrary, openRuler, rulerLabel, rulerLabels, seed, state, toast } from "./helpers";

const RANDOM = "🎲 隨機 Random", ALL = "全部 All";
const ruler = (page: Page) => page.locator("#ruler");
const isOpen = (page: Page) => expect(ruler(page)).toHaveClass(/open/);
const isClosed = (page: Page) => expect(ruler(page)).not.toHaveClass(/open/);

/** Counts every time the app loads another mode, so "only once" can be checked. */
async function recordModes(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __modes: string[]; __highlights: { subscribe(fn: (s: { mode: { type: string; id: string | null } }, p: { mode: unknown }) => void): void } };
    w.__modes = [];
    w.__highlights.subscribe((s, p) => { if (s.mode !== p.mode) w.__modes.push(s.mode.type + ":" + s.mode.id); });
  });
}
const modes = (page: Page) => page.evaluate(() => (window as unknown as { __modes: string[] }).__modes);
/** One notch of the mouse wheel over the ruler. */
const wheel = (page: Page, notches = 1) => page.mouse.wheel(0, 60 * notches);

test.describe("ruler contents", () => {
  test("lists Random, All, folders with their books, loose books and tags, with counts", async ({ page }) => {
    await seed(page);
    await openRuler(page);
    const labels = await rulerLabels(page);
    expect(labels.slice(0, 2)).toEqual([RANDOM, ALL]);
    expect(labels.slice(-3)).toEqual(["Book C", "#x", "#y"]);
    expect(labels).toHaveLength(9);
    // each folder is followed by its book
    expect(labels[labels.indexOf("自我成長") + 1]).toBe("峰與谷");
    expect(labels[labels.indexOf("商業與媒體") + 1]).toBe("串流媒體");
    const count = (label: string) => page.locator("#tape .tick", { has: page.locator(".lb", { hasText: label }) }).first().locator(".ct").innerText();
    expect(await count(RANDOM)).toBe("63");
    expect(await count("峰與谷")).toBe("35");
    expect(await count("商業與媒體")).toBe("25");
    expect(await count("Book C")).toBe("3");
    expect(await count("#x")).toBe("3");
    expect(await count("#y")).toBe("1");
  });

  test("the needle sits on the current mode, also after it changes elsewhere", async ({ page }) => {
    await seed(page);
    await openRuler(page);
    expect(await rulerLabel(page)).toBe(RANDOM);
    await page.mouse.move(700, 300);
    await isClosed(page);
    await page.click("#allBtn");
    await page.hover("#bm", { position: { x: 30, y: 30 } }); // a different spot from where the mouse left the tab
    await isOpen(page);
    expect(await rulerLabel(page)).toBe(ALL);
    await expect(page.locator("#tape .tick.cur")).toHaveCount(1);
  });
});

test.describe("opening and closing", () => {
  test("hovering the bookmark tab opens it; the book title hides", async ({ page }) => {
    await seed(page);
    await isClosed(page);
    await page.hover("#bm");
    await isOpen(page);
    await expect(ruler(page)).toHaveClass(/engaged/);
    await expect(page.locator("#bar")).toHaveClass(/open/);
  });

  test("B opens it from the keyboard, Esc closes it", async ({ page }) => {
    await seed(page);
    await page.keyboard.press("b");
    await isOpen(page);
    await page.keyboard.press("Escape");
    await isClosed(page);
    await page.keyboard.press("Shift+B");
    await isOpen(page);
  });

  test("B does nothing on an empty library or while a drawer is open", async ({ page }) => {
    await open(page);
    await page.keyboard.press("b");
    await isClosed(page);
    await page.setInputFiles("#jsonInput", (await import("./helpers")).SAMPLE);
    await expect(page.locator(".page[data-pi]")).toHaveCount(63);
    await openLibrary(page);
    await page.keyboard.press("b");
    await isClosed(page);
  });

  test("Esc closes it and the tab sliding back under the mouse does not reopen it", async ({ page }) => {
    await seed(page);
    await recordModes(page);
    await openRuler(page);
    await page.keyboard.press("Escape");
    await isClosed(page);
    await page.waitForTimeout(700); // the tab has slid back under the pointer by now
    await isClosed(page);
    expect(await modes(page)).toEqual([]);
    // really moving the mouse back onto the tab opens it again
    await page.mouse.move(700, 300);
    await page.hover("#bm", { position: { x: 30, y: 30 } });
    await isOpen(page);
  });

  test("a click outside closes it", async ({ page }) => {
    await seed(page);
    await page.keyboard.press("b");
    await isOpen(page);
    await page.mouse.click(300, 300);
    await isClosed(page);
  });
});

test.describe("choosing", () => {
  test("wheel steps move the needle and load the selection once, after it settles", async ({ page }) => {
    await seed(page);
    await recordModes(page);
    await openRuler(page);
    const labels = await rulerLabels(page);
    await wheel(page);
    await expect(page.locator("#tape .tick.cur .lb")).toHaveText(labels[1]);
    await page.waitForTimeout(150);
    await wheel(page);
    await page.waitForTimeout(150);
    await wheel(page);
    await expect(page.locator("#tape .tick.cur .lb")).toHaveText(labels[3]);
    // three steps, but only the place where the needle came to rest is loaded
    await expect.poll(() => modes(page)).toHaveLength(1);
    expect(await modeLabel(page)).toBe(labels[3]);
    await page.waitForTimeout(700);
    expect(await modes(page)).toHaveLength(1);
    await isOpen(page); // still open: the mouse is still on it
    await expectPage(page, 0);
  });

  test("scrolling back to where you started loads nothing", async ({ page }) => {
    await seed(page);
    await recordModes(page);
    await openRuler(page);
    await wheel(page, 2);
    await page.mouse.wheel(0, -120);
    await expect(page.locator("#tape .tick.cur .lb")).toHaveText(RANDOM);
    await page.waitForTimeout(700);
    expect(await modes(page)).toEqual([]);
  });

  test("moving the mouse away selects at once and closes", async ({ page }) => {
    await seed(page);
    await recordModes(page);
    await openRuler(page);
    await wheel(page);
    await page.mouse.move(700, 300, { steps: 5 });
    await isClosed(page);
    expect(await modes(page)).toEqual(["all:null"]); // no need to wait for the settle delay
    await expect(page.locator("#allBtn")).toHaveClass(/on/);
    await page.waitForTimeout(700);
    expect(await modes(page)).toEqual(["all:null"]);
  });

  test("arrow keys move the needle (not the feed) and Enter selects", async ({ page }) => {
    await seed(page);
    await recordModes(page);
    await page.keyboard.press("b");
    await isOpen(page);
    const labels = await rulerLabels(page);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#tape .tick.cur .lb")).toHaveText(labels[2]);
    await page.keyboard.press("Enter");
    await isClosed(page);
    expect(await modes(page)).toHaveLength(1);
    expect(await modeLabel(page)).toBe(labels[2]);
    await expectPage(page, 0);
  });

  test("Esc after moving the needle keeps the choice", async ({ page }) => {
    await seed(page);
    await page.keyboard.press("b");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Escape");
    await isClosed(page);
    expect(await state<string>(page, "s => s.mode.type")).toBe("all");
  });

  test("clicking another tick moves to it; clicking the current tick opens it and closes the ruler", async ({ page }) => {
    await seed(page);
    await recordModes(page);
    await openRuler(page);
    const labels = await rulerLabels(page);
    await page.locator("#tape .tick.cur + .tick + .tick .lb").click();
    await expect(page.locator("#tape .tick.cur .lb")).toHaveText(labels[2]);
    await expect.poll(() => modes(page)).toHaveLength(1);
    expect(await modeLabel(page)).toBe(labels[2]);
    await isOpen(page);
    await page.locator("#tape .tick.cur .lb").click();
    await isClosed(page);
    expect(await modes(page)).toHaveLength(1);
  });

  test("clicking the current tick right after moving selects without waiting", async ({ page }) => {
    await seed(page);
    await recordModes(page);
    await openRuler(page);
    await wheel(page);
    await expect(page.locator("#tape .tick.cur .lb")).toHaveText(ALL);
    await page.locator("#tape .tick.cur").click({ position: { x: 80, y: 100 } });
    await isClosed(page);
    expect(await modes(page)).toEqual(["all:null"]);
  });

  test("the ruler is endless: it loops past both ends", async ({ page }) => {
    await seed(page);
    await page.keyboard.press("b");
    const labels = await rulerLabels(page);
    const cur = page.locator("#tape .tick.cur .lb");
    await page.keyboard.press("ArrowLeft"); // left of the first item is the last one
    await expect(cur).toHaveText(labels[labels.length - 1]);
    await page.keyboard.press("ArrowRight");
    await expect(cur).toHaveText(labels[0]);
    for (let lap = 0; lap < 3; lap++) {
      for (let i = 1; i <= labels.length; i++) {
        await page.keyboard.press("ArrowRight");
        await expect(cur).toHaveText(labels[i % labels.length]);
      }
    }
    for (let i = labels.length - 1; i >= -labels.length; i--) {
      await page.keyboard.press("ArrowLeft");
      await expect(cur).toHaveText(labels[((i % labels.length) + labels.length) % labels.length]);
    }
    // there is always a tick on both sides of the needle
    await expect(page.locator("#tape .tick.cur + .tick")).toHaveCount(1);
    expect(await page.locator("#tape .tick.cur").evaluate((el) => !!el.previousElementSibling)).toBe(true);
  });

  test("an empty folder can't be opened", async ({ page }) => {
    await seed(page);
    await openLibrary(page);
    await page.click("[data-lib=new-folder]");
    await page.fill("#rn", "Empty one");
    await dialog(page).locator("[data-ok]").click();
    await page.locator("#library [data-close]").click();
    await expect(page.locator("#library")).not.toHaveClass(/open/);
    await recordModes(page);
    await page.keyboard.press("b");
    const labels = await rulerLabels(page);
    expect(labels).toContain("Empty one");
    for (let i = 0; i < labels.indexOf("Empty one"); i++) await page.keyboard.press("ArrowRight");
    await expect(page.locator("#tape .tick.cur")).toHaveClass(/empty/);
    await page.keyboard.press("Enter");
    await expect(toast(page)).toHaveText("“Empty one” has no highlights yet");
    await isOpen(page);
    await page.waitForTimeout(700);
    expect(await modes(page)).toEqual([]);
  });
});

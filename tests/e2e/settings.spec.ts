import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeDrawer, currentIds, expectPage, feedIds, fixture, goTo, openSettings, SAMPLE, seed, state, storedSettings, toast } from "./helpers";

type Sample = { highlights: { id: string; bookId: string; chapter: string; date: string; text: string }[] };
const sample = JSON.parse(readFileSync(SAMPLE, "utf8")) as Sample;
const byId = new Map(sample.highlights.map((h) => [h.id, h]));
const pages = (page: Page) => page.locator(".page[data-pi]");
const setting = <T>(page: Page, key: string) => state<T>(page, `s => s.settings[${JSON.stringify(key)}]`);
const quoteFont = (page: Page, id: string) => page.locator(`.slot[data-id='${id}'] .quote`).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
const bgImage = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundImage);

test.describe("settings drawer", () => {
  test("opens from the gear and closes with ×, the scrim and Esc", async ({ page }) => {
    await seed(page);
    const drawer = page.locator("#settings");
    await expect(drawer).toHaveAttribute("aria-hidden", "true");
    await openSettings(page);
    await expect(drawer).toHaveAttribute("aria-hidden", "false");
    await expect(page.locator("#scrim")).toHaveClass(/open/);
    await drawer.locator("[data-close]").click();
    await expect(drawer).not.toHaveClass(/open/);
    await expect(page.locator("#scrim")).not.toHaveClass(/open/);

    await openSettings(page);
    await page.locator("#scrim").click({ position: { x: 100, y: 400 } });
    await expect(drawer).not.toHaveClass(/open/);

    await openSettings(page);
    await page.keyboard.press("Escape");
    await expect(drawer).not.toHaveClass(/open/);
  });

  test("lists the keyboard shortcuts", async ({ page }) => {
    await seed(page);
    await openSettings(page);
    await expect(page.locator("#setBody .keys")).toContainText("next page");
    await expect(page.locator("#setBody .keys kbd")).toHaveText(["↓", "Space", "↑", "/", "B", "←", "→", "Enter", "Esc"]);
  });
});

test.describe("quotes per scroll", () => {
  test("1 to 4 quotes share a page", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bA"); // 35 quotes
    await openSettings(page);
    for (const [n, count, label] of [[2, 18, "2 quotes stacked"], [3, 12, "3 quotes stacked"], [4, 9, "4 quotes stacked"], [1, 35, "1 quote fills the screen"]] as const) {
      await page.click(`#segN [data-v='${n}']`);
      await expect(page.locator(`#segN [data-v='${n}']`)).toHaveClass(/on/);
      await expect(page.locator(`#segN [data-v='${n}']`)).toHaveAttribute("aria-checked", "true");
      await expect(page.locator("#segN .on")).toHaveCount(1);
      await expect(page.locator("#setBody .field").first()).toContainText(label);
      await expect(pages(page)).toHaveCount(count);
      const ids = await feedIds(page);
      expect(ids.slice(0, -1).every((p) => p.length === n)).toBe(true);
      expect(ids.at(-1)!.length).toBe(35 - n * (count - 1));
      expect(ids.flat()).toHaveLength(35);
      // a page that isn't full keeps the same number of slots, so quotes keep their size
      await expect(pages(page).last().locator(".slot")).toHaveCount(n);
      await expect(page.locator("#mini .ms")).toHaveCount(n);
      expect(await setting(page, "perScroll")).toBe(n);
    }
  });

  test("the reader stays on the same quote when the page size changes", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bA");
    for (let i = 1; i <= 4; i++) { await page.keyboard.press("ArrowDown"); await expectPage(page, i); }
    const [here] = await currentIds(page);
    await openSettings(page);
    await page.click("#segN [data-v='3']");
    await expect(pages(page)).toHaveCount(12);
    await expect.poll(() => currentIds(page)).toContain(here);
  });

  test("in All, every book starts on a fresh page", async ({ page }) => {
    await seed(page);
    await page.click("#allBtn");
    await openSettings(page);
    await page.click("#segN [data-v='4']");
    await expect(pages(page)).toHaveCount(9 + 7 + 1); // 35, 25 and 3 quotes
    for (const ids of await feedIds(page)) expect(new Set(ids.map((id) => id.split("-")[0])).size).toBe(1);
  });
});

test.describe("font size", () => {
  test("the slider sets the largest quote size", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC"); // short quotes: they use the full size
    await openSettings(page);
    const fs = page.locator("#fs");
    await expect(fs).toHaveValue("72");
    await expect(page.locator("#fsLbl")).toHaveText("72px");
    expect(await quoteFont(page, "bC-2")).toBe(72);
    await fs.focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#fsLbl")).toHaveText("66px");
    await expect.poll(() => quoteFont(page, "bC-2")).toBe(66);
    await page.keyboard.press("End");
    await expect(page.locator("#fsLbl")).toHaveText("120px");
    await expect.poll(() => quoteFont(page, "bC-2")).toBe(120);
    await page.keyboard.press("Home");
    await expect(page.locator("#fsLbl")).toHaveText("28px");
    await expect.poll(() => quoteFont(page, "bC-2")).toBe(28);
    expect(await setting(page, "fontSize")).toBe(28);
    // quotes that haven't been on screen yet get the new size too
    await closeDrawer(page);
    await page.keyboard.press("End");
    await expectPage(page, 2);
    await expect.poll(() => quoteFont(page, "bC-0")).toBe(28);
  });

  test("the mini preview's text grows and shrinks with it", async ({ page }) => {
    await seed(page);
    await openSettings(page);
    const size = () => page.locator("#mini .mq").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const at72 = await size();
    await page.locator("#fs").focus();
    await page.keyboard.press("End");
    await expect.poll(size).toBeGreaterThan(at72);
    await page.keyboard.press("Home");
    await expect.poll(size).toBeLessThan(at72);
  });
});

test.describe("quote position", () => {
  test("left, middle and right align every quote; random gives each quote its own place", async ({ page }) => {
    await seed(page);
    await page.click("#allBtn");
    await openSettings(page);
    const slots = page.locator(".slot[data-id]");
    for (const [v, label] of [["left", "Left"], ["center", "Middle"], ["right", "Right"]] as const) {
      await page.click(`#segP [data-v='${v}']`);
      await expect(page.locator("#segP .on")).toHaveText(label);
      await expect(page.locator(`.slot[data-id].${v}`)).toHaveCount(63);
      await expect(page.locator("#mini .ms").first()).toHaveClass(new RegExp(v));
      expect(await setting(page, "position")).toBe(v);
      const [id] = await currentIds(page);
      const align = await page.locator(`.slot[data-id='${id}']`).evaluate((el) => getComputedStyle(el).textAlign);
      expect(align).toBe(v);
    }
    await page.click("#segP [data-v='random']");
    const classes = await slots.evaluateAll((els) => els.map((el) => ["left", "center", "right"].filter((c) => el.classList.contains(c))));
    expect(classes.every((c) => c.length === 1)).toBe(true);
    expect(new Set(classes.map((c) => c[0])).size).toBe(3); // all three places are used
    // and a quote keeps its place: the same again after switching away and back
    await page.click("#segP [data-v='left']");
    await page.click("#segP [data-v='random']");
    expect(await slots.evaluateAll((els) => els.map((el) => ["left", "center", "right"].filter((c) => el.classList.contains(c))))).toEqual(classes);
  });
});

test.describe("order inside a book", () => {
  test("reading order goes by chapter, newest first goes by date", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bA");
    const chapters = async () => (await feedIds(page)).flat().map((id) => parseFloat(byId.get(id)!.chapter));
    const dates = async () => (await feedIds(page)).flat().map((id) => byId.get(id)!.date);
    const sorted = <T,>(a: T[], cmp: (x: T, y: T) => number) => a.every((v, i) => i === 0 || cmp(a[i - 1], v) <= 0);

    expect(sorted(await chapters(), (x, y) => x - y)).toBe(true); // default
    expect(new Set(await chapters()).size).toBeGreaterThan(3);
    const reading = (await feedIds(page)).flat();

    await openSettings(page);
    await expect(page.locator("#segO .on")).toHaveText("Reading order");
    await page.click("#segO [data-v='newest']");
    await expect(page.locator("#segO .on")).toHaveText("Newest first");
    expect(await setting(page, "withinBook")).toBe("newest");
    await expect.poll(async () => sorted(await dates(), (x, y) => y.localeCompare(x))).toBe(true);
    expect((await feedIds(page)).flat()).not.toEqual(reading);
    expect(sorted(await chapters(), (x, y) => x - y)).toBe(false);

    await page.click("#segO [data-v='chapter']");
    await expect.poll(async () => (await feedIds(page)).flat()).toEqual(reading);
  });
});

test.describe("blur switch", () => {
  test("turns the setting on and off", async ({ page }) => {
    await seed(page);
    await openSettings(page);
    await expect(page.locator("#blurT")).toBeChecked();
    await page.locator("#blurT").uncheck();
    expect(await setting(page, "blur")).toBe(false);
    await page.locator("label.toggle").click(); // the label works as well
    await expect(page.locator("#blurT")).toBeChecked();
    expect(await setting(page, "blur")).toBe(true);
  });
});

test.describe("backgrounds", () => {
  const row = (page: Page, kind: "b" | "f") => page.locator(`#setBody .bgrow[data-kind='${kind}']`);
  const upload = async (page: Page, kind: "b" | "f", file: string | { name: string; mimeType: string; buffer: Buffer }) => {
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), row(page, kind).locator("[data-bg=upload]").click()]);
    await chooser.setFiles(file);
  };

  test("a book in a folder offers both the book and the folder; a loose book only itself", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bA");
    await openSettings(page);
    await expect(row(page, "b").locator(".who")).toHaveText("Book · 峰與谷");
    await expect(row(page, "f").locator(".who")).toContainText("Folder · 自我成長");
    await closeDrawer(page);
    await goTo(page, "book", "bC");
    await openSettings(page);
    await expect(row(page, "b").locator(".who")).toHaveText("Book · Book C");
    await expect(row(page, "f")).toHaveCount(0);
  });

  test("New colour gives the book another gradient", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    await openSettings(page);
    const before = await bgImage(page, ".page.bgb-bC");
    expect(before).toContain("gradient");
    expect(await bgImage(page, "#setBody .bgrow[data-kind='b'] .bgsw")).toBe(before);
    expect(await bgImage(page, "#mini")).toBe(before);
    await row(page, "b").locator("[data-bg=reroll]").click();
    await expect.poll(() => bgImage(page, ".page.bgb-bC")).not.toBe(before);
    const after = await bgImage(page, ".page.bgb-bC");
    expect(after).toContain("gradient");
    expect(await bgImage(page, "#setBody .bgrow[data-kind='b'] .bgsw")).toBe(after);
    expect(await state<string>(page, "s => s.lib.books.find(b => b.id === 'bC').bgSeed")).toMatch(/^[a-z0-9]+$/);
  });

  test("New colour for the folder leaves the book's own gradient alone", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bA");
    await openSettings(page);
    const book = await bgImage(page, ".page.bgb-bA");
    const folder = await bgImage(page, "#setBody .bgrow[data-kind='f'] .bgsw");
    await row(page, "f").locator("[data-bg=reroll]").click();
    await expect.poll(() => bgImage(page, "#setBody .bgrow[data-kind='f'] .bgsw")).not.toBe(folder);
    expect(await bgImage(page, ".page.bgb-bA")).toBe(book);
    expect(await state<string>(page, "s => s.lib.folders.find(f => f.id === 'fA').bgSeed")).toBeTruthy();
  });

  test("upload, change and remove a book's image", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    await openSettings(page);
    await expect(row(page, "b").locator("[data-bg=upload]")).toContainText("Upload image");
    await expect(row(page, "b").locator("[data-bg=remove]")).toHaveCount(0);
    await upload(page, "b", fixture("bg.jpg"));
    await expect(toast(page)).toHaveText("Background image set");
    const img = await state<string>(page, "s => s.lib.books.find(b => b.id === 'bC').bgImage");
    expect(img).toMatch(/^data:image\/jpeg;base64,/);
    expect(await bgImage(page, ".page.bgb-bC")).toContain("data:image/jpeg");
    await expect(pages(page).first()).toHaveClass(/img/); // darkened so the text stays readable
    await expect(page.locator("#mini")).toHaveClass(/img/);
    await expect(row(page, "b").locator("[data-bg=upload]")).toContainText("Change image");

    await upload(page, "b", fixture("bg.jpg")); // “Change image” works the same way
    await expect(toast(page)).toHaveText("Background image set");

    await row(page, "b").locator("[data-bg=remove]").click();
    await expect(toast(page)).toHaveText("Image removed");
    expect(await state<boolean>(page, "s => 'bgImage' in s.lib.books.find(b => b.id === 'bC')")).toBe(false);
    await expect.poll(() => bgImage(page, ".page.bgb-bC")).toContain("gradient");
    await expect(pages(page).first()).not.toHaveClass(/img/);
    await expect(row(page, "b").locator("[data-bg=remove]")).toHaveCount(0);
  });

  test("a folder's image shows behind its books until a book has its own", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bA");
    await openSettings(page);
    await upload(page, "f", fixture("bg.jpg"));
    await expect(toast(page)).toHaveText("Background image set");
    expect(await state<string>(page, "s => s.lib.folders.find(f => f.id === 'fA').bgImage")).toMatch(/^data:image\/jpeg/);
    expect(await state<boolean>(page, "s => 'bgImage' in s.lib.books.find(b => b.id === 'bA')")).toBe(false);
    expect(await bgImage(page, ".page.bgb-bA")).toContain("data:image/jpeg");
    await expect(pages(page).first()).toHaveClass(/img/);
    await expect(row(page, "f").locator("[data-bg=upload]")).toContainText("Change image");
    await expect(row(page, "b").locator("[data-bg=upload]")).toContainText("Upload image");

    await row(page, "f").locator("[data-bg=remove]").click();
    await expect(toast(page)).toHaveText("Image removed");
    await expect.poll(() => bgImage(page, ".page.bgb-bA")).toContain("gradient");
    await expect(pages(page).first()).not.toHaveClass(/img/);
  });

  test("a file that isn't a picture is refused", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    await openSettings(page);
    await upload(page, "b", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a picture") });
    await expect(toast(page)).toHaveText("Please choose an image file.");
    await upload(page, "b", { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not really a png") });
    await expect(toast(page)).toHaveText("Couldn't read that image.");
    expect(await state<boolean>(page, "s => 'bgImage' in s.lib.books.find(b => b.id === 'bC')")).toBe(false);
  });
});

test.describe("cursor", () => {
  const NAMES = ["Mint Classic", "Peach Blush", "Lavender Bow", "Lemon Drop", "Sky Bubble", "Rainbow Shift", "Sleepy Leon", "Blep", "Leaf Sprout", "Starry Eyes"];
  const cursorOf = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).cursor);

  test("all ten chameleons and the system arrow can be chosen", async ({ page }) => {
    await seed(page);
    await openSettings(page);
    await expect(page.locator(".curgrid .curopt")).toHaveCount(11);
    await expect(page.locator(".curgrid [data-cur='1']")).toHaveClass(/on/); // the default
    const seen = new Set<string>();
    for (let i = 10; i >= 1; i--) {
      const opt = page.locator(`.curgrid [data-cur='${i}']`);
      await expect(opt).toHaveText(NAMES[i - 1]);
      await opt.click();
      await expect(opt).toHaveClass(/on/);
      await expect(page.locator(".curgrid .curopt.on")).toHaveCount(1);
      expect(await setting(page, "cursor")).toBe(String(i));
      await expect(page.locator("html")).toHaveClass(/chamcursor/);
      const cur = await cursorOf(page, "#feed");
      expect(cur).toContain('url("data:image/svg+xml;base64,');
      expect(cur).toContain(" 3 3"); // the hotspot is the snout
      expect(await cursorOf(page, "#setBtn")).toBe(cur); // buttons use it too
      seen.add(cur);
    }
    expect(seen.size).toBe(10); // ten different pictures
    expect(await cursorOf(page, "#search")).toBe("text"); // text boxes keep the text cursor

    await page.click(".curgrid [data-cur='system']");
    await expect(page.locator(".curgrid [data-cur='system']")).toHaveClass(/on/);
    await expect(page.locator(".curgrid .curopt.on")).toHaveCount(1);
    expect(await setting(page, "cursor")).toBe("system");
    await expect(page.locator("html")).not.toHaveClass(/chamcursor/);
    expect(await cursorOf(page, "#feed")).toBe("auto");
    expect(await cursorOf(page, "#setBtn")).toBe("pointer");
  });

  test("the chameleon licks what you click; the system arrow doesn't", async ({ page }) => {
    await seed(page);
    await openSettings(page);
    const target = page.locator("#segP [data-v='left']");
    await target.hover();
    await page.mouse.down();
    await expect(page.locator(".lick")).toHaveCount(1);
    await expect(page.locator("body")).toHaveClass(/licking/);
    await page.mouse.up();
    await expect(page.locator(".lick")).toHaveCount(0); // gone after the lick
    await expect(page.locator("body")).not.toHaveClass(/licking/);

    await page.click(".curgrid [data-cur='system']");
    await expect(page.locator(".lick")).toHaveCount(0);
    await target.hover();
    await page.mouse.down();
    await page.waitForTimeout(100);
    await expect(page.locator(".lick")).toHaveCount(0);
    await page.mouse.up();
  });
});

test.describe("mini preview", () => {
  test("mirrors the page on screen", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    await openSettings(page);
    const mini = page.getByTestId("mini-preview");
    await expect(mini).toHaveClass(/bgb-bC/);
    await expect(mini.locator(".mq")).toHaveText(["“第三本書的句子 2”"]);
    await expect(mini.locator(".ma")).toHaveText(["—— Book C · Ch. 1"]);
    await page.click("#segN [data-v='2']");
    await expect(mini.locator(".mq")).toHaveText(["“第三本書的句子 2”", "“第三本書的句子 1”"]);
    await closeDrawer(page);
    await page.keyboard.press("ArrowDown");
    await expectPage(page, 1);
    await openSettings(page);
    await expect(mini.locator(".mq")).toHaveText(["“第三本書的句子 0”"]);
  });
});

test.describe("saving", () => {
  test("every setting is written to the browser's storage", async ({ page }) => {
    await seed(page);
    await openSettings(page);
    await page.click("#segN [data-v='3']");
    await page.locator("#fs").focus();
    await page.keyboard.press("ArrowRight");
    await page.click("#segP [data-v='center']");
    await page.click("#segO [data-v='newest']");
    await page.locator("#blurT").uncheck();
    await page.click(".curgrid [data-cur='7']");
    await expect.poll(() => storedSettings(page)).toEqual({ perScroll: 3, fontSize: 74, position: "center", withinBook: "newest", blur: false, cursor: "7" });
  });
});

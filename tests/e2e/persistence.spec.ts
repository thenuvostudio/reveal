import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeDrawer, dialog, expectPage, feedIds, fileButton, fixture, goTo, libRow, open, openLibrary, openSettings, rowMenu, SAMPLE, seed, selectCurrentQuote, state, storedLibrary, toast } from "./helpers";

type Hl = { id: string; bookId: string; text: string; html?: string; plain?: string; note: string; tags: string[]; readmooNote: string; chapter: string; date: string };
type Lib = { books: { id: string; title: string; folderId: string | null; bgImage?: string; bgSeed?: string }[]; highlights: Hl[]; folders: { id: string; name: string; parentId: string | null; collapsed?: boolean }[] };
const pages = (page: Page) => page.locator(".page[data-pi]");
const mode = (page: Page) => state<string>(page, "s => s.mode.type + ':' + s.mode.id");
const lib = (page: Page) => state<Lib>(page, "s => JSON.parse(JSON.stringify(s.lib))");
const stored = (page: Page) => storedLibrary<Lib>(page);
const reload = async (page: Page) => { await page.reload(); await expect(page.locator("#top")).toBeVisible(); await expect.poll(() => state<boolean>(page, "s => s.ready")).toBe(true); };

/** A backup exactly as the single-file HTML version writes it (same keys, no folders in use). */
const HTML_BACKUP = {
  app: "readmoo-highlights", version: 1, exportedAt: "2026-11-07T06:35:00.000Z", folders: [],
  books: [
    { id: "mh1abc", title: "原子習慣", createdAt: "2026-11-01T01:00:00.000Z", lastImported: "2026-11-01T01:00:00.000Z", folderId: null, bgSeed: "k3x9a2" },
    { id: "mh2def", title: "Deep Work", createdAt: "2026-11-02T01:00:00.000Z", lastImported: "2026-11-02T01:00:00.000Z", folderId: null },
  ],
  highlights: [
    { id: "mh1abc1", bookId: "mh1abc", chapter: "2", date: "2026-10-02", text: "每天進步百分之一。", readmooNote: "", note: "複利", tags: ["習慣"], order: 1762000000001, importedAt: "2026-11-01T01:00:00.000Z" },
    { id: "mh1abc2", bookId: "mh1abc", chapter: "1", date: "2026-10-01", text: "習慣是自我改善的複利。", readmooNote: "Readmoo 的註記", note: "", tags: [], order: 1762000000002, importedAt: "2026-11-01T01:00:00.000Z" },
    { id: "mh2def1", bookId: "mh2def", chapter: "3", date: "2026-10-05", text: "Clarity about what matters provides clarity about what does not.", readmooNote: "", note: "", tags: ["focus", "習慣"], order: 1762000000003, importedAt: "2026-11-02T01:00:00.000Z" },
  ],
};

test.describe("reloading", () => {
  test("keeps the library, and the app opens in the random mix at the top", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    await page.keyboard.press("End");
    await expectPage(page, 2);
    await expect.poll(async () => (await stored(page))?.highlights.length).toBe(63);
    await reload(page);
    await expect(pages(page)).toHaveCount(63);
    await expect(page.locator("#welcome")).toBeHidden();
    expect(await mode(page)).toBe("random:null");
    await expect(page.locator("#diceBtn")).toHaveClass(/on/);
    await expectPage(page, 0);
    const l = await lib(page);
    expect(l.books.map((b) => b.id).sort()).toEqual(["bA", "bB", "bC"]);
    expect(l.folders.map((f) => f.id).sort()).toEqual(["fA", "fB"]);
    expect(l.highlights.find((h) => h.id === "bA-3")!.html).toBe("<b>EDITED</b> text");
  });

  test("each reload deals a new random mix", async ({ page }) => {
    await seed(page);
    await expect.poll(async () => (await stored(page))?.highlights.length).toBe(63);
    const first = (await feedIds(page)).flat();
    await reload(page);
    await expect(pages(page)).toHaveCount(63);
    const second = (await feedIds(page)).flat();
    expect(second).not.toEqual(first);
    expect([...second].sort()).toEqual([...first].sort());
  });

  test("keeps text edits, notes, tags and deletions", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    await selectCurrentQuote(page); // bC-2
    await page.click("[data-qa=edit]");
    await page.keyboard.press("ControlOrMeta+A");
    await page.click(".rte-bar [data-cmd=bold]");
    await page.keyboard.press("ControlOrMeta+Enter");
    await page.click("[data-qa=note]");
    await page.fill("#noteTa", "remember this");
    await dialog(page).locator("[data-ok]").click();
    await page.click("[data-qa=tag]");
    await page.keyboard.type("keeper");
    await dialog(page).locator("[data-ok]").click();
    await page.keyboard.press("End");
    await expectPage(page, 2);
    await selectCurrentQuote(page); // bC-0
    await page.click("[data-qa=del]");
    await dialog(page).locator("[data-ok]").click();
    await expect(toast(page)).toHaveText("Highlight deleted");
    await expect.poll(async () => (await stored(page))?.highlights.length).toBe(62);

    await reload(page);
    await expect(pages(page)).toHaveCount(62);
    const h = (await lib(page)).highlights.find((x) => x.id === "bC-2")!;
    expect(h.html).toBe("<b>第三本書的句子 2</b>");
    expect(h.plain).toBe("第三本書的句子 2");
    expect(h.note).toBe("remember this");
    expect(h.tags).toEqual(["keeper"]);
    expect((await lib(page)).highlights.some((x) => x.id === "bC-0")).toBe(false);
    // and it shows
    await goTo(page, "book", "bC");
    await expect(pages(page)).toHaveCount(2);
    await expect(page.locator(".slot[data-id='bC-2'] .quote b")).toHaveText("第三本書的句子 2");
    await expect(page.locator(".slot[data-id='bC-2'] .has-note")).toBeVisible();
    await selectCurrentQuote(page);
    await expect(page.locator("[data-qa=note-view]")).toContainText("remember this");
    await expect(page.locator(".qa-tags [data-qa=gotag]")).toHaveText(["#keeper"]);
  });

  test("keeps folders, moves, renames, folded folders and background images", async ({ page }) => {
    await seed(page);
    await openLibrary(page);
    await page.click("[data-lib=new-folder]");
    await page.fill("#rn", "Shelf");
    await dialog(page).locator("[data-ok]").click();
    const shelf = await state<string>(page, "s => s.lib.folders.find(f => f.name === 'Shelf').id");
    await libRow(page, "book", "bC").dragTo(libRow(page, "folder", shelf));
    await expect(toast(page)).toHaveText("Moved “Book C” to “Shelf”");
    await rowMenu(page, "book", "bC", /Rename/);
    await page.fill("#rn", "Book C, renamed");
    await dialog(page).locator("[data-ok]").click();
    await rowMenu(page, "tag", "x", /Rename tag/);
    await page.fill("#rn", "star");
    await dialog(page).locator("[data-ok]").click();
    await libRow(page, "folder", "fA").locator("[data-caret]").click();
    await closeDrawer(page);
    await goTo(page, "book", "bC");
    await openSettings(page);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator("#setBody .bgrow[data-kind='b'] [data-bg=upload]").click()]);
    await chooser.setFiles(fixture("bg.jpg"));
    await expect(toast(page)).toHaveText("Background image set");
    await expect.poll(async () => !!(await stored(page))?.books.find((b) => b.id === "bC")?.bgImage).toBe(true);

    await reload(page);
    const l = await lib(page);
    expect(l.folders.find((f) => f.id === shelf)).toMatchObject({ name: "Shelf", parentId: null });
    expect(l.folders.find((f) => f.id === "fA")!.collapsed).toBe(true);
    const bC = l.books.find((b) => b.id === "bC")!;
    expect(bC.title).toBe("Book C, renamed");
    expect(bC.folderId).toBe(shelf);
    expect(bC.bgImage).toMatch(/^data:image\/jpeg/);
    expect(l.highlights.find((h) => h.id === "bB-0")!.tags).toEqual(["star", "y"]);
    await openLibrary(page);
    await expect(libRow(page, "book", "bA")).toHaveCount(0); // its folder is still folded
    await expect(libRow(page, "book", "bC").locator(".t")).toHaveText("Book C, renamed");
    await expect(libRow(page, "tag", "star")).toBeVisible();
    await libRow(page, "book", "bC").locator(".t").click();
    await expect(pages(page).first()).toHaveClass(/img/);
  });

  test("a change made right before leaving the page is still saved", async ({ page }) => {
    await seed(page);
    await expect.poll(async () => (await stored(page))?.highlights.length).toBe(63);
    await openLibrary(page);
    await page.click("[data-lib=new-folder]");
    await page.fill("#rn", "Last second");
    await dialog(page).locator("[data-ok]").click();
    await page.reload(); // no waiting: sooner than the app's save delay
    await expect(page.locator("#top")).toBeVisible();
    await expect.poll(() => state<string[]>(page, "s => s.lib.folders.map(f => f.name)")).toContain("Last second");
  });

  test("keeps every setting", async ({ page }) => {
    await seed(page);
    await openSettings(page);
    await page.click("#segN [data-v='3']");
    await page.locator("#fs").focus();
    await page.keyboard.press("ArrowRight");
    await page.click("#segP [data-v='center']");
    await page.click("#segO [data-v='newest']");
    await page.locator("#blurT").uncheck();
    await page.click(".curgrid [data-cur='7']");
    await expect.poll(async () => (await stored(page))?.highlights.length).toBe(63);
    await expect.poll(() => state<string>(page, "s => s.settings.cursor")).toBe("7");

    await reload(page);
    await expect(pages(page)).toHaveCount(21); // 63 quotes, three to a page
    await expect(page.locator(".slot[data-id].center")).toHaveCount(63);
    await expect(page.locator("html")).toHaveClass(/chamcursor/);
    await openSettings(page);
    await expect(page.locator("#segN .on")).toHaveText("3");
    await expect(page.locator("#fsLbl")).toHaveText("74px");
    await expect(page.locator("#fs")).toHaveValue("74");
    await expect(page.locator("#segP .on")).toHaveText("Middle");
    await expect(page.locator("#segO .on")).toHaveText("Newest first");
    await expect(page.locator("#blurT")).not.toBeChecked();
    await expect(page.locator(".curgrid .curopt.on")).toHaveAttribute("data-cur", "7");
  });

  test("the search and the filter are not kept: a fresh start shows everything", async ({ page }) => {
    await seed(page);
    await page.click("#filterBtn");
    await page.getByTestId("filter-panel").locator("[data-ff=fA]").check();
    await page.getByTestId("filter-panel").locator("[data-fdone]").click();
    await page.fill("#search", "順境");
    await expect(pages(page)).toHaveCount(4);
    await expect.poll(async () => (await stored(page))?.highlights.length).toBe(63);
    await reload(page);
    await expect(pages(page)).toHaveCount(63);
    await expect(page.locator("#search")).toHaveValue("");
    await expect(page.locator("#filterBtn")).not.toHaveClass(/on/);
    expect(await mode(page)).toBe("random:null");
  });

  test("an emptied library stays empty", async ({ page }) => {
    await seed(page);
    await openLibrary(page);
    await fileButton(page, "Delete entire library").click();
    await dialog(page).locator("[data-ok]").click();
    await expect.poll(async () => (await stored(page))?.highlights.length).toBe(0);
    await reload(page);
    await expect(page.locator("#welcome")).toBeVisible();
    expect((await lib(page)).books).toEqual([]);
  });
});

test.describe("moving data from the HTML version", () => {
  test("a backup made by the HTML version restores, and backs up again unchanged", async ({ page }) => {
    await open(page);
    await page.setInputFiles("#jsonInput", { name: "highlights-backup-2026-11-07.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(HTML_BACKUP, null, 2)) });
    await expect(toast(page)).toHaveText("Library restored.");
    await expect(pages(page)).toHaveCount(3);
    const l = await lib(page);
    expect(l.books).toEqual(HTML_BACKUP.books);
    expect(l.highlights).toEqual(HTML_BACKUP.highlights);
    expect(l.folders).toEqual([]);

    // it reads like any other library: reading order, notes and tags
    await goTo(page, "book", "mh1abc");
    expect((await feedIds(page)).flat()).toEqual(["mh1abc2", "mh1abc1"]); // chapter 1 before chapter 2
    await expect(page.getByTestId("progress")).toHaveText("原子習慣");
    await selectCurrentQuote(page);
    await expect(page.locator(".qa-note").first()).toContainText("Readmoo 的註記");
    await openLibrary(page);
    await expect(libRow(page, "tag", "習慣").locator(".c")).toHaveText("2");

    // and a backup from this app has the same shape, so it goes back into the HTML version too
    const [d] = await Promise.all([page.waitForEvent("download"), fileButton(page, "Download backup").click()]);
    const out = JSON.parse(readFileSync(await d.path(), "utf8"));
    expect(Object.keys(out)).toEqual(["app", "version", "exportedAt", "folders", "books", "highlights"]);
    expect({ ...out, exportedAt: HTML_BACKUP.exportedAt }).toEqual(HTML_BACKUP);
  });

  test("older or damaged files are repaired, and unsafe HTML is made harmless", async ({ page }) => {
    await open(page);
    const old = {
      books: [{ id: "o1", title: "Old book", folderId: "folder-that-no-longer-exists" }],
      highlights: [
        { id: "o1a", bookId: "o1", chapter: "1", date: "2020-01-01", text: "no tags, no notes" }, // fields missing
        { id: "o1b", bookId: "o1", chapter: "2", date: "2020-01-02", text: "orig", tags: ["t"], note: "n", readmooNote: "",
          html: '<b>bold</b><img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script><mark class="hl-green">ok</mark>', plain: "boldok" },
      ],
    };
    await page.setInputFiles("#jsonInput", { name: "old.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(old)) });
    await expect(toast(page)).toHaveText("Library restored.");
    await expect(pages(page)).toHaveCount(2);
    const l = await lib(page);
    expect(l.folders).toEqual([]);
    expect(l.books[0].folderId).toBeNull();
    expect(l.highlights[0]).toMatchObject({ tags: [], note: "", readmooNote: "" });
    await goTo(page, "book", "o1");
    await page.keyboard.press("End");
    await expectPage(page, 1);
    const quote = page.locator(".slot[data-id='o1b'] .quote");
    await expect(quote.locator("b")).toHaveText("bold");
    await expect(quote.locator("mark.hl-green")).toHaveText("ok");
    await expect(quote.locator("img, script")).toHaveCount(0);
    await expect(quote).toContainText("<img src=x"); // shown as plain text instead
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  });

  test("a backup from this app restores into an empty browser exactly", async ({ page, browser }) => {
    await seed(page);
    await openLibrary(page);
    const [d] = await Promise.all([page.waitForEvent("download"), fileButton(page, "Download backup").click()]);
    const file = await d.path();
    const before = await lib(page);

    const other = await browser.newContext({ viewport: { width: 1440, height: 900 } }); // a different browser profile
    const p2 = await other.newPage();
    await p2.goto(page.url());
    await expect(p2.locator("#welcome")).toBeVisible();
    await p2.setInputFiles("#jsonInput", file);
    await expect(p2.locator(".page[data-pi]")).toHaveCount(63);
    expect(await lib(p2)).toEqual(before);
    await other.close();
  });

  test("a library the HTML version left in this browser's storage is picked up as it is", async ({ page }) => {
    // The HTML version keeps its data in the same IndexedDB database, with fewer settings.
    await open(page);
    await page.evaluate(({ library, settings }) => new Promise<void>((resolve, reject) => {
      const r = indexedDB.open("readmoo-highlights", 1);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => {
        const t = r.result.transaction("kv", "readwrite");
        t.objectStore("kv").put(library, "library");
        t.objectStore("kv").put(settings, "settings");
        t.oncomplete = () => { r.result.close(); resolve(); };
        t.onerror = () => reject(t.error);
      };
    }), { library: { books: HTML_BACKUP.books, highlights: HTML_BACKUP.highlights, folders: [] }, settings: { perScroll: 2, fontSize: 60, cursor: "no-such-cursor" } });
    await reload(page);
    await expect(page.locator("#welcome")).toBeHidden();
    await expect(pages(page)).toHaveCount(2); // 3 quotes, two to a page
    expect(await state<unknown>(page, "s => s.settings")).toEqual({ perScroll: 2, fontSize: 60, position: "random", blur: true, cursor: "1", withinBook: "chapter", theme: "original", customPalettes: [] });
    expect((await lib(page)).highlights).toHaveLength(3);
  });

  test("restoring the sample file twice by merging adds nothing", async ({ page }) => {
    await seed(page);
    await page.setInputFiles("#jsonInput", SAMPLE);
    await dialog(page).getByRole("button", { name: "Merge into current" }).click();
    await expect(toast(page)).toHaveText("Library restored.");
    const l = await lib(page);
    expect(l.highlights).toHaveLength(63);
    expect(l.books).toHaveLength(3);
    expect(l.folders).toHaveLength(2);
  });
});

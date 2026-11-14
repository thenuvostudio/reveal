import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeDrawer, dialog, feedIds, fileButton, fsWrites, goTo, installFakeFs, libRow, open, openLibrary, rowMenu, SAMPLE, seed, state, toast } from "./helpers";

const pages = (page: Page) => page.locator(".page[data-pi]");
const mode = (page: Page) => state<string>(page, "s => s.mode.type + ':' + s.mode.id");
const total = (page: Page) => state<number>(page, "s => s.lib.highlights.length");
const book = (page: Page, id: string) => state<{ title: string; folderId: string | null } | null>(page, `s => { const b = s.lib.books.find(b => b.id === '${id}'); return b ? { title: b.title, folderId: b.folderId ?? null } : null; }`);
const folder = (page: Page, id: string) => state<{ name: string; parentId: string | null; collapsed: boolean } | null>(page, `s => { const f = s.lib.folders.find(f => f.id === '${id}'); return f ? { name: f.name, parentId: f.parentId ?? null, collapsed: !!f.collapsed } : null; }`);
const tagsOf = (page: Page, id: string) => state<string[]>(page, `s => s.lib.highlights.find(h => h.id === '${id}').tags`);
const prompt = async (page: Page, value: string) => { await page.fill("#rn", value); await dialog(page).locator("[data-ok]").click(); await expect(page.locator(".overlay")).toHaveCount(0); };
const download = async (page: Page, trigger: () => Promise<unknown>) => {
  const [d] = await Promise.all([page.waitForEvent("download"), trigger()]);
  return { name: d.suggestedFilename(), text: readFileSync(await d.path(), "utf8") };
};
async function seeded(page: Page) { await seed(page); await openLibrary(page); }

test.describe("library drawer", () => {
  test("lists folders with their books, loose books and tags", async ({ page }) => {
    await seeded(page);
    const lib = page.locator("#library");
    await expect(lib.locator(".lsec").first()).toContainText("Books · 3");
    expect((await lib.locator(".lrow.folder .t").allTextContents()).sort()).toEqual(["自我成長", "商業與媒體"].sort());
    await expect(libRow(page, "folder", "fA").locator(".c")).toHaveText("1 📖");
    await expect(libRow(page, "book", "bA").locator(".c")).toHaveText("35");
    await expect(libRow(page, "book", "bB").locator(".c")).toHaveText("25");
    await expect(libRow(page, "book", "bC").locator(".c")).toHaveText("3");
    // a book sits right under its folder, the loose book after all folders
    const order = await lib.locator(".lrow[data-kind='book'], .lrow[data-kind='folder']").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id));
    expect(order[order.indexOf("fA") + 1]).toBe("bA");
    expect(order[order.indexOf("fB") + 1]).toBe("bB");
    expect(order.at(-1)).toBe("bC");
    await expect(lib.locator(".lsec", { hasText: "Tags" })).toContainText("Tags · 2");
    await expect(libRow(page, "tag", "x")).toContainText("# x");
    await expect(libRow(page, "tag", "x").locator(".c")).toHaveText("3");
    await expect(libRow(page, "tag", "y").locator(".c")).toHaveText("1");
    await expect(lib.locator(".fstat")).toHaveText("Saved in this browser");
  });

  test("closes with ×, the scrim and Esc", async ({ page }) => {
    await seeded(page);
    await closeDrawer(page);
    await openLibrary(page);
    await page.locator("#scrim").click({ position: { x: 1000, y: 400 } });
    await expect(page.locator("#library")).not.toHaveClass(/open/);
    await openLibrary(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("#library")).not.toHaveClass(/open/);
  });

  test("clicking a book, a folder or a tag opens it and marks the row", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bB");
    await expect(pages(page)).toHaveCount(25);
    await expect(page.getByTestId("progress")).toHaveText("串流媒體");
    await openLibrary(page);
    await expect(libRow(page, "book", "bB")).toHaveClass(/active/);
    await expect(page.locator("#library .lrow.active")).toHaveCount(1);
    await closeDrawer(page);

    await goTo(page, "folder", "fA");
    await expect(pages(page)).toHaveCount(35);
    await openLibrary(page);
    await expect(libRow(page, "folder", "fA")).toHaveClass(/active/);
    await closeDrawer(page);

    await goTo(page, "tag", "x");
    await expect(pages(page)).toHaveCount(3);
    expect((await feedIds(page)).flat().sort()).toEqual(["bA-0", "bA-1", "bB-0"]);
    await openLibrary(page);
    await expect(libRow(page, "tag", "x")).toHaveClass(/active/);
  });

  test("the caret folds and unfolds a folder without opening it", async ({ page }) => {
    await seeded(page);
    const caret = libRow(page, "folder", "fA").locator("[data-caret]");
    await expect(caret).toHaveClass(/open/);
    await caret.click();
    await expect(libRow(page, "book", "bA")).toHaveCount(0);
    await expect(caret).not.toHaveClass(/open/);
    await expect(caret).toHaveAttribute("aria-label", "Expand");
    expect((await folder(page, "fA"))!.collapsed).toBe(true);
    await expect(page.locator("#library")).toHaveClass(/open/);
    expect(await mode(page)).toBe("random:null");
    await caret.click();
    await expect(libRow(page, "book", "bA")).toBeVisible();
    expect((await folder(page, "fA"))!.collapsed).toBe(false);
  });

  test("+ Folder creates a folder; an empty name is not accepted", async ({ page }) => {
    await seeded(page);
    await page.click("[data-lib=new-folder]");
    await expect(dialog(page).locator("h3")).toHaveText("New folder");
    await expect(page.locator("#rn")).toBeFocused();
    await dialog(page).locator("[data-ok]").click(); // nothing typed
    await expect(page.locator(".overlay")).toHaveCount(1);
    await page.fill("#rn", "   ");
    await page.keyboard.press("Enter");
    await expect(page.locator(".overlay")).toHaveCount(1);
    await page.fill("#rn", "  Novels ");
    await page.keyboard.press("Enter"); // Enter works like the button
    await expect(page.locator(".overlay")).toHaveCount(0);
    await expect(toast(page)).toHaveText("Folder “Novels” created. Drag books onto it.");
    await expect(page.locator("#library .lrow.folder", { hasText: "Novels" }).locator(".c")).toHaveText("0 📖");
    expect(await state<number>(page, "s => s.lib.folders.length")).toBe(3);

    await page.click("[data-lib=new-folder]");
    await page.fill("#rn", "Never made");
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    expect(await state<number>(page, "s => s.lib.folders.length")).toBe(3);
  });

  test("+ Import opens the file chooser", async ({ page }) => {
    await seeded(page);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("[data-lib=import]")]);
    expect(chooser.isMultiple()).toBe(true);
  });
});

test.describe("drag and drop", () => {
  test("a book can be dragged into a folder and back to the top level", async ({ page }) => {
    await seeded(page);
    await libRow(page, "book", "bC").dragTo(libRow(page, "folder", "fB"));
    await expect(toast(page)).toHaveText("Moved “Book C” to “商業與媒體”");
    expect((await book(page, "bC"))!.folderId).toBe("fB");
    await expect(libRow(page, "folder", "fB").locator(".c")).toHaveText("2 📖");

    await libRow(page, "book", "bC").dragTo(libRow(page, "folder", "fA")); // straight from one folder to another
    await expect(toast(page)).toHaveText("Moved “Book C” to “自我成長”");
    expect((await book(page, "bC"))!.folderId).toBe("fA");

    await libRow(page, "book", "bC").dragTo(page.locator("#library .lsec").first());
    await expect(toast(page)).toHaveText("Moved “Book C” to the top level");
    expect((await book(page, "bC"))!.folderId).toBeNull();
    expect(await total(page)).toBe(63);
  });

  test("a folder can go inside another, but never inside itself or its own subfolders", async ({ page }) => {
    await seeded(page);
    await libRow(page, "folder", "fA").dragTo(libRow(page, "folder", "fB"));
    await expect(toast(page)).toHaveText("Moved folder “自我成長”");
    expect((await folder(page, "fA"))!.parentId).toBe("fB");
    await expect(libRow(page, "folder", "fB").locator(".c")).toHaveText("2 📖"); // counts include subfolders

    await libRow(page, "folder", "fB").dragTo(libRow(page, "folder", "fA")); // fA is now inside fB
    await expect(toast(page)).toHaveText("A folder can't go inside itself.");
    expect((await folder(page, "fB"))!.parentId).toBeNull();
    expect((await folder(page, "fA"))!.parentId).toBe("fB");

    await libRow(page, "folder", "fA").dragTo(page.locator("#library .lsec").first());
    await expect(toast(page)).toHaveText("Moved folder “自我成長”");
    expect((await folder(page, "fA"))!.parentId).toBeNull();
  });

  test("dropping something where it already is changes nothing", async ({ page }) => {
    await seeded(page);
    await libRow(page, "book", "bA").dragTo(libRow(page, "folder", "fA"));
    await page.waitForTimeout(300);
    await expect(toast(page)).toHaveCount(0);
    expect((await book(page, "bA"))!.folderId).toBe("fA");
  });
});

test.describe("book menu (⋯)", () => {
  test("the menu closes with Esc or a click elsewhere, leaving the drawer open", async ({ page }) => {
    await seeded(page);
    const menu = page.getByTestId("row-menu");
    await libRow(page, "book", "bC").locator("[data-more]").click();
    await expect(menu.getByRole("menuitem")).toHaveCount(6);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(page.locator("#library")).toHaveClass(/open/);
    await libRow(page, "book", "bC").locator("[data-more]").click();
    await expect(menu).toBeVisible();
    await page.locator("#library h2").click();
    await expect(menu).toHaveCount(0);
    await expect(page.locator("#library")).toHaveClass(/open/);
    expect(await mode(page)).toBe("random:null"); // opening the menu didn't open the book
  });

  test("Show its quotes", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "book", "bC", /Show its quotes/);
    await expect(page.locator("#library")).not.toHaveClass(/open/);
    expect(await mode(page)).toBe("book:bC");
    await expect(pages(page)).toHaveCount(3);
  });

  test("Rename", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "book", "bC", /Rename/);
    await expect(dialog(page).locator("h3")).toHaveText("Rename book");
    await expect(page.locator("#rn")).toHaveValue("Book C");
    await prompt(page, "Book Z");
    expect((await book(page, "bC"))!.title).toBe("Book Z");
    await expect(libRow(page, "book", "bC").locator(".t")).toHaveText("Book Z");
  });

  test("Rename to an existing title merges the two books", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    await openLibrary(page);
    await rowMenu(page, "book", "bC", /Rename/);
    await prompt(page, "峰與谷");
    await expect(toast(page)).toHaveText("Merged into the existing book “峰與谷”");
    expect(await book(page, "bC")).toBeNull();
    expect(await state<number>(page, "s => s.lib.books.length")).toBe(2);
    expect(await state<number>(page, "s => s.lib.highlights.filter(h => h.bookId === 'bA').length")).toBe(38);
    expect(await total(page)).toBe(63);
    await expect(libRow(page, "book", "bA").locator(".c")).toHaveText("38");
    expect(await mode(page)).toBe("book:bA"); // the reader follows the book
    await expect(pages(page)).toHaveCount(38);
  });

  test("Move to folder", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "book", "bC", /Move to folder/);
    await expect(dialog(page).locator("h3")).toHaveText("Move book");
    await expect(page.locator("#mvSel")).toHaveValue("");
    await expect(page.locator("#mvSel option")).toHaveCount(3);
    await page.selectOption("#mvSel", "fB");
    await dialog(page).locator("[data-ok]").click();
    await expect(toast(page)).toHaveText("Moved “Book C” to “商業與媒體”");
    expect((await book(page, "bC"))!.folderId).toBe("fB");

    await rowMenu(page, "book", "bC", /Move to folder/);
    await expect(page.locator("#mvSel")).toHaveValue("fB");
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    expect((await book(page, "bC"))!.folderId).toBe("fB");

    await rowMenu(page, "book", "bC", /Move to folder/);
    await page.selectOption("#mvSel", "");
    await dialog(page).locator("[data-ok]").click();
    await expect(toast(page)).toHaveText("Moved “Book C” to the top level");
    expect((await book(page, "bC"))!.folderId).toBeNull();
  });

  test("Export Markdown", async ({ page }) => {
    await seeded(page);
    const md = await download(page, () => rowMenu(page, "book", "bA", /Export Markdown/));
    await expect(toast(page)).toHaveText("Exported Markdown, including edits and colours");
    expect(md.name).toBe("峰與谷.md");
    expect(md.text.startsWith("# 峰與谷\n")).toBe(true);
    expect(md.text).toContain("## Chapter 19");
    expect(md.text).toContain("> 幫助別人：\n> 樂於與別人分享！");
    expect(md.text).toContain("> <b>EDITED</b> text"); // the edit, with its formatting
    expect(md.text).toContain("· edited</small>");
    expect(md.text).toContain("**My note:** my note on A2");
    expect(md.text).toContain("**Readmoo note:** 工作順境時得過且過");
    expect(md.text).toContain("Tags: #x");
    expect(md.text.match(/\n---\n/g)).toHaveLength(35);
    expect(md.text).not.toContain("串流");
  });

  test("Export web page", async ({ page }) => {
    await seeded(page);
    const html = await download(page, () => rowMenu(page, "book", "bA", /Export web page/));
    await expect(toast(page)).toHaveText("Exported web page. Open it and print to PDF if you like.");
    expect(html.name).toBe("峰與谷.html");
    expect(html.text.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html.text).toContain("<title>峰與谷</title>");
    expect(html.text).toContain("35 highlights · exported");
    expect(html.text).toContain("<h2>Chapter 19</h2>");
    expect(html.text).toContain('<div class="tx"><b>EDITED</b> text</div>');
    expect(html.text).toContain("<span>My note</span>my note on A2");
    expect(html.text).toContain("#x");
    expect(html.text.match(/<div class="hl">/g)).toHaveLength(35);
    // the exported page opens and shows the book
    await page.setContent(html.text);
    await expect(page.locator("h1")).toHaveText("峰與谷");
    await expect(page.locator(".hl")).toHaveCount(35);
  });

  test("Delete book: cancel keeps it, confirm removes it with its highlights", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    await openLibrary(page);
    await rowMenu(page, "book", "bC", /Delete book/);
    await expect(dialog(page)).toContainText("“Book C” and its 3 highlights, with your notes and tags, are removed.");
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    expect(await total(page)).toBe(63);
    await rowMenu(page, "book", "bC", /Delete book/);
    await dialog(page).locator("[data-ok]").click();
    await expect(toast(page)).toHaveText("Book deleted");
    expect(await book(page, "bC")).toBeNull();
    expect(await total(page)).toBe(60);
    await expect(libRow(page, "book", "bC")).toHaveCount(0);
    await expect(page.locator("#library .lsec").first()).toContainText("Books · 2");
    expect(await mode(page)).toBe("random:null"); // the open book is gone
    await expect(pages(page)).toHaveCount(60);
  });
});

test.describe("folder menu (⋯)", () => {
  test("Show its quotes and Rename", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "folder", "fA", /Rename/);
    await expect(dialog(page).locator("h3")).toHaveText("Rename folder");
    await expect(page.locator("#rn")).toHaveValue("自我成長");
    await prompt(page, "Growth");
    expect((await folder(page, "fA"))!.name).toBe("Growth");
    await expect(libRow(page, "folder", "fA").locator(".t")).toHaveText("Growth");
    await rowMenu(page, "folder", "fA", /Show its quotes/);
    expect(await mode(page)).toBe("folder:fA");
    await expect(pages(page)).toHaveCount(35);
    await expect(page.locator(".slot[data-id] .attr").first()).toContainText("Growth");
  });

  test("New subfolder, and a folder shows what its subfolders hold", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "folder", "fA", /New subfolder/);
    await expect(dialog(page).locator("h3")).toHaveText("New subfolder in “自我成長”");
    await prompt(page, "Classics");
    const sub = await state<{ id: string; parentId: string }>(page, "s => { const f = s.lib.folders.find(f => f.name === 'Classics'); return { id: f.id, parentId: f.parentId }; }");
    expect(sub.parentId).toBe("fA");
    await libRow(page, "book", "bC").dragTo(libRow(page, "folder", sub.id));
    await expect(toast(page)).toHaveText("Moved “Book C” to “Classics”");
    await expect(libRow(page, "folder", "fA").locator(".c")).toHaveText("2 📖");
    await libRow(page, "folder", "fA").locator(".t").click();
    expect(await mode(page)).toBe("folder:fA");
    await expect(pages(page)).toHaveCount(38); // 35 + the 3 in the subfolder
  });

  test("Move to: a folder can't be moved into itself", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "folder", "fA", /Move to/);
    await expect(dialog(page).locator("h3")).toHaveText("Move folder");
    const options = await page.locator("#mvSel option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(options).toEqual(["", "fB"]); // itself is not offered
    await page.selectOption("#mvSel", "fB");
    await dialog(page).locator("[data-ok]").click();
    await expect(toast(page)).toHaveText("Moved folder “自我成長”");
    expect((await folder(page, "fA"))!.parentId).toBe("fB");
    // and now fB can't go into fA, its own subfolder
    await rowMenu(page, "folder", "fB", /Move to/);
    expect(await page.locator("#mvSel option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).toEqual([""]);
  });

  test("Delete folder moves its books up and deletes no highlights", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "folder", "fA", /Delete folder/);
    await expect(dialog(page)).toContainText("“自我成長” is removed. Its 1 book move to the top level. No highlights are deleted.");
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    expect(await folder(page, "fA")).not.toBeNull();
    await rowMenu(page, "folder", "fA", /Delete folder/);
    await dialog(page).locator("[data-ok]").click();
    await expect(libRow(page, "folder", "fA")).toHaveCount(0);
    expect(await folder(page, "fA")).toBeNull();
    expect((await book(page, "bA"))!.folderId).toBeNull();
    expect(await total(page)).toBe(63);
    await expect(libRow(page, "book", "bA")).toBeVisible();
  });
});

test.describe("tag menu (⋯)", () => {
  test("Show its quotes", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "tag", "y", /Show its quotes/);
    expect(await mode(page)).toBe("tag:y");
    await expect(pages(page)).toHaveCount(1);
  });

  test("Rename tag, also while that tag is open", async ({ page }) => {
    await seed(page);
    await goTo(page, "tag", "x");
    await openLibrary(page);
    await rowMenu(page, "tag", "x", /Rename tag/);
    await expect(page.locator("#rn")).toHaveValue("x");
    await prompt(page, "#important"); // a typed # is dropped
    expect(await tagsOf(page, "bA-0")).toEqual(["important"]);
    expect(await tagsOf(page, "bB-0")).toEqual(["important", "y"]);
    await expect(libRow(page, "tag", "important").locator(".c")).toHaveText("3");
    await expect(libRow(page, "tag", "x")).toHaveCount(0);
    expect(await mode(page)).toBe("tag:important");
    await expect(pages(page)).toHaveCount(3);
  });

  test("renaming a tag to an existing one merges them", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "tag", "x", /Rename tag/);
    await prompt(page, "y");
    expect(await tagsOf(page, "bB-0")).toEqual(["y"]); // had both: no duplicate
    expect(await tagsOf(page, "bA-1")).toEqual(["y"]);
    await expect(page.locator("#library .lsec", { hasText: "Tags" })).toContainText("Tags · 1");
    await expect(libRow(page, "tag", "y").locator(".c")).toHaveText("3");
  });

  test("Remove from all highlights", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "tag", "x", /Remove from all/);
    await expect(dialog(page)).toContainText("“#x” is removed from every highlight. The highlights stay.");
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    expect(await tagsOf(page, "bA-0")).toEqual(["x"]);
    await rowMenu(page, "tag", "x", /Remove from all/);
    await dialog(page).locator("[data-ok]").click();
    await expect(libRow(page, "tag", "x")).toHaveCount(0);
    expect(await tagsOf(page, "bA-0")).toEqual([]);
    expect(await tagsOf(page, "bB-0")).toEqual(["y"]);
    expect(await total(page)).toBe(63);
  });
});

test.describe("backup and restore", () => {
  test("Download backup saves the whole library as JSON", async ({ page }) => {
    await seeded(page);
    const b = await download(page, () => fileButton(page, "Download backup").click());
    expect(b.name).toMatch(/^highlights-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(b.text);
    expect(data.app).toBe("readmoo-highlights");
    expect(data.version).toBe(1);
    expect(new Date(data.exportedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(data.folders).toHaveLength(2);
    expect(data.books).toHaveLength(3);
    expect(data.highlights).toHaveLength(63);
    const a3 = data.highlights.find((h: { id: string }) => h.id === "bA-3");
    expect(a3.html).toBe("<b>EDITED</b> text");
    expect(data.highlights.find((h: { id: string }) => h.id === "bA-2").note).toBe("my note on A2");
    expect(data.highlights.find((h: { id: string }) => h.id === "bB-0").tags).toEqual(["x", "y"]);
  });

  test("Restore: merge brings back what is missing and keeps what is new", async ({ page }) => {
    await seeded(page);
    // lose a book and a tag, and add a folder of our own
    await rowMenu(page, "book", "bC", /Delete book/);
    await dialog(page).locator("[data-ok]").click();
    await rowMenu(page, "tag", "x", /Remove from all/);
    await dialog(page).locator("[data-ok]").click();
    await page.click("[data-lib=new-folder]");
    await prompt(page, "Mine");
    expect(await total(page)).toBe(60);

    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), fileButton(page, "Restore or merge").click()]);
    await chooser.setFiles(SAMPLE);
    await expect(dialog(page).locator("h3")).toHaveText("Restore backup");
    await expect(dialog(page)).toContainText("Backup has 63 highlights in 3 books. You currently have 60.");
    await dialog(page).getByRole("button", { name: "Merge into current" }).click();
    await expect(toast(page)).toHaveText("Library restored.");
    expect(await total(page)).toBe(63); // no duplicates
    expect(await book(page, "bC")).not.toBeNull();
    expect(await tagsOf(page, "bA-0")).toEqual(["x"]);
    expect(await state<string[]>(page, "s => s.lib.folders.map(f => f.name).sort()")).toEqual(["Mine", "商業與媒體", "自我成長"].sort());
    await expect(pages(page)).toHaveCount(63);
  });

  test("Restore: replace swaps the library; Cancel leaves it alone", async ({ page }) => {
    await seeded(page);
    await rowMenu(page, "book", "bA", /Delete book/);
    await dialog(page).locator("[data-ok]").click();
    await page.click("[data-lib=new-folder]");
    await prompt(page, "Mine");
    expect(await total(page)).toBe(28);

    let [chooser] = await Promise.all([page.waitForEvent("filechooser"), fileButton(page, "Restore or merge").click()]);
    await chooser.setFiles(SAMPLE);
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".overlay")).toHaveCount(0);
    expect(await total(page)).toBe(28);

    [chooser] = await Promise.all([page.waitForEvent("filechooser"), fileButton(page, "Restore or merge").click()]);
    await chooser.setFiles(SAMPLE);
    await dialog(page).getByRole("button", { name: "Replace everything" }).click();
    await expect(toast(page)).toHaveText("Library restored.");
    expect(await total(page)).toBe(63);
    expect(await state<string[]>(page, "s => s.lib.folders.map(f => f.id).sort()")).toEqual(["fA", "fB"]); // “Mine” is gone
  });

  test("a file that isn't a library is refused with a clear message", async ({ page }) => {
    await seeded(page);
    let [chooser] = await Promise.all([page.waitForEvent("filechooser"), fileButton(page, "Restore or merge").click()]);
    await chooser.setFiles({ name: "other.json", mimeType: "application/json", buffer: Buffer.from('{"hello":"world"}') });
    await expect(toast(page)).toHaveText("Couldn't restore: This is not a highlights library file.");
    [chooser] = await Promise.all([page.waitForEvent("filechooser"), fileButton(page, "Restore or merge").click()]);
    await chooser.setFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{not json") });
    await expect(toast(page)).toContainText("Couldn't restore:");
    expect(await total(page)).toBe(63);
  });

  test("dropping a backup file onto the window restores it", async ({ page }) => {
    await open(page);
    const dt = await page.evaluateHandle((t) => { const d = new DataTransfer(); d.items.add(new File([t], "backup.json", { type: "application/json" })); return d; }, readFileSync(SAMPLE, "utf8"));
    await page.dispatchEvent("body", "drop", { dataTransfer: dt });
    await expect(toast(page)).toHaveText("Library restored.");
    await expect(pages(page)).toHaveCount(63);
  });

  test("Delete entire library goes back to the welcome screen", async ({ page }) => {
    await seeded(page);
    await fileButton(page, "Delete entire library").click();
    await expect(dialog(page).locator("h3")).toHaveText("Delete the entire library?");
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    expect(await total(page)).toBe(63);
    await fileButton(page, "Delete entire library").click();
    await dialog(page).locator("[data-ok]").click();
    expect(await total(page)).toBe(0);
    expect(await state<number>(page, "s => s.lib.books.length + s.lib.folders.length")).toBe(0);
    await expect(page.locator("#library .lempty").first()).toHaveText("No books yet. Import a Readmoo CSV to start.");
    await page.keyboard.press("Escape");
    await expect(page.locator("#welcome")).toBeVisible();
    await expect(page.locator("body")).toHaveClass(/empty/);
    await expect(page.locator("#bar")).toBeHidden();
  });
});

test.describe("library file (auto-save)", () => {
  const dot = (page: Page) => page.getByTestId("file-dot");
  const lastWrite = async (page: Page) => { const w = await fsWrites(page); return { n: w.length, name: w.at(-1)?.name, data: w.length ? JSON.parse(w.at(-1)!.data) : null }; };
  const FILE_LIB = JSON.stringify({ app: "readmoo-highlights", version: 1, folders: [], books: [{ id: "n1", title: "From file", folderId: null }],
    highlights: [{ id: "n1-0", bookId: "n1", chapter: "1", date: "2026-02-02", text: "hello from the file", readmooNote: "", note: "", tags: ["filed"] }] });

  test("linking a file writes the library to it and every later change too", async ({ page }) => {
    await installFakeFs(page);
    await seeded(page);
    await expect(dot(page)).not.toHaveClass(/on|warn/);
    await expect(fileButton(page, "Stop auto-saving")).toHaveCount(0);
    await fileButton(page, "Save library to a file").click();
    await expect(toast(page)).toHaveText("Library linked. Changes now save to highlights-library.json");
    await expect(dot(page)).toHaveClass(/on/);
    await expect(page.locator("#library .fstat")).toHaveText("Auto-saving");
    await expect(page.locator("#library .fstat")).toHaveClass(/on/);
    await expect(page.locator("#library .fhint")).toContainText("Linked to “highlights-library.json”. Every change is written to it automatically. Last saved");
    await expect(page.locator("#brandBtn")).toHaveAttribute("title", /auto-saving to highlights-library\.json/);
    let w = await lastWrite(page);
    expect(w.n).toBe(1);
    expect(w.name).toBe("highlights-library.json");
    expect(w.data.app).toBe("readmoo-highlights");
    expect(w.data.highlights).toHaveLength(63);

    await page.click("[data-lib=new-folder]");
    await prompt(page, "Saved too");
    await expect.poll(async () => (await lastWrite(page)).n).toBe(2);
    w = await lastWrite(page);
    expect(w.data.folders.map((f: { name: string }) => f.name)).toContain("Saved too");
  });

  test("Stop auto-saving unlinks the file", async ({ page }) => {
    await installFakeFs(page);
    await seeded(page);
    await fileButton(page, "Save library to a file").click();
    await expect(dot(page)).toHaveClass(/on/);
    await fileButton(page, "Stop auto-saving").click();
    await expect(toast(page)).toHaveText("Stopped auto-saving. The file itself is untouched.");
    await expect(dot(page)).not.toHaveClass(/on|warn/);
    await expect(page.locator("#library .fstat")).toHaveText("Saved in this browser");
    await expect(fileButton(page, "Stop auto-saving")).toHaveCount(0);
    await page.click("[data-lib=new-folder]");
    await prompt(page, "Not written");
    await page.waitForTimeout(800); // longer than the save delay
    expect((await lastWrite(page)).n).toBe(1);
  });

  test("when writing fails the dot warns, and Reconnect brings it back", async ({ page }) => {
    await installFakeFs(page);
    await seeded(page);
    await fileButton(page, "Save library to a file").click();
    await expect(dot(page)).toHaveClass(/on/);
    await expect(fileButton(page, "Reconnect")).toHaveCount(0);
    await page.evaluate(() => { (window as unknown as { __fs: { failWrites: boolean } }).__fs.failWrites = true; });
    await page.click("[data-lib=new-folder]");
    await prompt(page, "While offline");
    await expect(dot(page)).toHaveClass(/warn/);
    await expect(page.locator("#library .fstat")).toHaveText("Needs permission");
    await expect(page.locator("#library .fhint")).toContainText("the browser needs your permission again");
    await expect(page.locator("#brandBtn")).toHaveAttribute("title", /click to reconnect highlights-library\.json/);
    expect((await lastWrite(page)).n).toBe(1);

    await page.evaluate(() => { (window as unknown as { __fs: { failWrites: boolean } }).__fs.failWrites = false; });
    await fileButton(page, "Reconnect to highlights-library.json").click();
    await expect(toast(page)).toHaveText("Reconnected");
    await expect(dot(page)).toHaveClass(/on/);
    await expect(fileButton(page, "Reconnect")).toHaveCount(0);
    const w = await lastWrite(page);
    expect(w.n).toBe(2);
    expect(w.data.folders.map((f: { name: string }) => f.name)).toContain("While offline"); // nothing was lost
  });

  test("Open library file: replace", async ({ page }) => {
    await installFakeFs(page);
    await seeded(page);
    await page.evaluate((c) => { (window as unknown as { __fs: { openContent: string } }).__fs.openContent = c; }, FILE_LIB);
    await fileButton(page, "Open library file").click();
    await expect(dialog(page).locator("h3")).toHaveText("Open library file");
    await expect(dialog(page)).toContainText("This browser already has 63 highlights.");
    await dialog(page).getByRole("button", { name: "Replace with file" }).click();
    await expect(toast(page)).toHaveText("Opened library file — 1 highlights");
    expect(await total(page)).toBe(1);
    await expect(pages(page)).toHaveCount(1);
    await expect(page.locator(".quote")).toContainText("hello from the file");
    await expect(dot(page)).toHaveClass(/on/); // and it now auto-saves to that file
    await expect(page.locator("#library .fhint")).toContainText("Linked to “mylib.json”");
    await expect.poll(async () => (await lastWrite(page)).name).toBe("mylib.json");
  });

  test("Open library file: merge and cancel", async ({ page }) => {
    await installFakeFs(page);
    await seeded(page);
    await page.evaluate((c) => { (window as unknown as { __fs: { openContent: string } }).__fs.openContent = c; }, FILE_LIB);
    await fileButton(page, "Open library file").click();
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await page.waitForTimeout(300);
    expect(await total(page)).toBe(63);
    await expect(dot(page)).not.toHaveClass(/on|warn/);

    await fileButton(page, "Open library file").click();
    await dialog(page).getByRole("button", { name: "Merge both" }).click();
    await expect(toast(page)).toHaveText("Opened library file — 64 highlights");
    expect(await total(page)).toBe(64);
    expect(await state<number>(page, "s => s.lib.books.length")).toBe(4);
    await expect.poll(async () => (await lastWrite(page)).data?.highlights.length).toBe(64); // the merged library is saved back
  });

  test("a library file that isn't one is refused", async ({ page }) => {
    await installFakeFs(page);
    await seeded(page);
    await page.evaluate(() => { (window as unknown as { __fs: { openContent: string } }).__fs.openContent = '{"nope":1}'; });
    await fileButton(page, "Open library file").click();
    await expect(toast(page)).toHaveText("Couldn't open: This is not a highlights library file.");
    expect(await total(page)).toBe(63);
  });

  test("browsers without file access offer backup and restore only", async ({ page }) => {
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      delete w.showSaveFilePicker; delete w.showOpenFilePicker;
      delete Object.getPrototypeOf(w).showSaveFilePicker; delete Object.getPrototypeOf(w).showOpenFilePicker;
    });
    await open(page);
    expect(await page.evaluate(() => "showSaveFilePicker" in window)).toBe(false);
    // the welcome link falls back to the ordinary file chooser
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("#welcome [data-act=open-or-restore]")]);
    await chooser.setFiles(SAMPLE);
    await expect(pages(page)).toHaveCount(63);
    await openLibrary(page);
    await expect(fileButton(page, "Save library to a file")).toHaveCount(0);
    await expect(fileButton(page, "Open library file")).toHaveCount(0);
    await expect(fileButton(page, "Download backup")).toBeVisible();
    await expect(fileButton(page, "Restore or merge")).toBeVisible();
    await expect(page.locator("#library .fhint")).toHaveText("Download a backup to move your library to another computer. Auto-saving to a file needs Chrome or Edge.");
  });
});

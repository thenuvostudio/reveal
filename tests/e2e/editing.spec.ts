import { test, expect, type Page } from "@playwright/test";
import { currentIds, dialog, expectPage, feedIds, goTo, seed, selectCurrentQuote, state, toast } from "./helpers";

/** bC-2 is the first quote of “Book C” in reading order. */
const ID = "bC-2";
const TEXT = "第三本書的句子 2";
type H = { html?: string; plain?: string; editedAt?: string; text: string; note: string; tags: string[] };
const hl = (page: Page, id = ID) => state<H>(page, `s => { const h = s.lib.highlights.find(x => x.id === ${JSON.stringify(id)}); return h && JSON.parse(JSON.stringify(h)); }`);
const total = (page: Page) => state<number>(page, "s => s.lib.highlights.length");

/** Opens Book C with its first quote selected. */
async function selectFirst(page: Page) {
  await seed(page);
  await goTo(page, "book", "bC");
  await selectCurrentQuote(page);
  await expect(page.locator(".slot.sel")).toHaveAttribute("data-id", ID);
}
async function openEditor(page: Page) {
  await selectFirst(page);
  await page.click("[data-qa=edit]");
  const ed = page.locator(".rte-body");
  await expect(ed).toBeFocused();
  await expect(ed).toHaveText(TEXT);
  return ed;
}
const selectAll = (page: Page) => page.keyboard.press("ControlOrMeta+A");
const save = async (page: Page) => { await dialog(page).locator("[data-ok]").click(); await expect(page.locator(".overlay")).toHaveCount(0); };

test.describe("rich text editor", () => {
  test("opens with the quote's text, its book and chapter", async ({ page }) => {
    await openEditor(page);
    await expect(dialog(page).locator("h3")).toHaveText("Edit highlight");
    await expect(dialog(page).locator("p").first()).toHaveText("Book C · Ch. 1 · 2026-01-03");
    await expect(dialog(page).locator("[data-revert]")).toHaveCount(0); // nothing to revert yet
  });

  for (const [cmd, tag] of [["bold", "b"], ["italic", "i"], ["underline", "u"], ["strikeThrough", "s"]] as const) {
    test(`toolbar: ${cmd} wraps the selection in <${tag}>`, async ({ page }) => {
      await openEditor(page);
      await selectAll(page);
      await page.click(`.rte-bar [data-cmd=${cmd}]`);
      await save(page);
      await expect(toast(page)).toHaveText("Highlight updated");
      const h = await hl(page);
      expect(h.html).toBe(`<${tag}>${TEXT}</${tag}>`);
      expect(h.plain).toBe(TEXT);
      expect(h.text).toBe(TEXT); // Readmoo's original is never changed
      expect(h.editedAt).toBeTruthy();
      await expect(page.locator(`.slot[data-id='${ID}'] .quote ${tag}`)).toHaveText(TEXT);
      await expect(page.locator(`.slot[data-id='${ID}'] .attr`)).toContainText("edited");
    });
  }

  for (const color of ["yellow", "green", "blue", "pink"]) {
    test(`toolbar: the ${color} swatch highlights the selection`, async ({ page }) => {
      await openEditor(page);
      await selectAll(page);
      await page.click(`.rte-bar [data-cmd=hilite][data-color=${color}]`);
      await save(page);
      expect((await hl(page)).html).toBe(`<mark class="hl-${color}">${TEXT}</mark>`);
      await expect(page.locator(`.slot[data-id='${ID}'] .quote mark.hl-${color}`)).toHaveText(TEXT);
    });
  }

  test("toolbar: styles apply to the selected part only and can be combined", async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press("Shift+ArrowLeft"); // the last character, "2"
    await page.click(".rte-bar [data-cmd=bold]");
    await page.click(".rte-bar [data-cmd=italic]");
    await page.click(".rte-bar [data-cmd=hilite][data-color=pink]");
    await save(page);
    expect((await hl(page)).html).toBe('第三本書的句子 <mark class="hl-pink"><b><i>2</i></b></mark>');
  });

  test("toolbar: a colour needs a selection", async ({ page }) => {
    await openEditor(page);
    await page.click(".rte-bar [data-cmd=hilite][data-color=yellow]");
    await expect(toast(page)).toHaveText("Select some text first, then pick a colour.");
  });

  test("toolbar: the crossed-out swatch removes the highlight colour", async ({ page }) => {
    await openEditor(page);
    await selectAll(page);
    await page.click(".rte-bar [data-cmd=hilite][data-color=green]");
    await page.click(".rte-bar [data-cmd=bold]");
    await page.click(".rte-bar [data-cmd=hilite][data-color='']");
    await save(page);
    expect((await hl(page)).html).toBe(`<b>${TEXT}</b>`);
  });

  test("toolbar: Clear removes all formatting, which makes the quote unedited again", async ({ page }) => {
    const ed = await openEditor(page);
    await selectAll(page);
    for (const c of ["bold", "italic", "underline", "strikeThrough"]) await page.click(`.rte-bar [data-cmd=${c}]`);
    await page.click(".rte-bar [data-cmd=hilite][data-color=blue]");
    await expect(ed.locator("b, i, u, s, strike")).not.toHaveCount(0);
    await page.click(".rte-bar [data-cmd=removeFormat]");
    await save(page);
    const h = await hl(page);
    expect(h.html).toBeUndefined();
    expect(h.plain).toBeUndefined();
    expect(h.editedAt).toBeUndefined();
    await expect(page.locator(`.slot[data-id='${ID}'] .attr`)).not.toContainText("edited");
  });

  test("toolbar: undo and redo", async ({ page }) => {
    const ed = await openEditor(page);
    await selectAll(page);
    await page.click(".rte-bar [data-cmd=bold]");
    await expect(ed.locator("b")).toHaveCount(1);
    await page.click(".rte-bar [data-cmd=undo]");
    await expect(ed.locator("b")).toHaveCount(0);
    await page.click(".rte-bar [data-cmd=redo]");
    await expect(ed.locator("b")).toHaveCount(1);
    await save(page);
    expect((await hl(page)).html).toBe(`<b>${TEXT}</b>`);
  });

  test("typing changes the text; Ctrl+Enter saves", async ({ page }) => {
    await openEditor(page);
    await page.keyboard.type(" — extra");
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(page.locator(".overlay")).toHaveCount(0);
    const h = await hl(page);
    expect(h.html).toBe(TEXT + " — extra");
    expect(h.plain).toBe(TEXT + " — extra");
    await expect(page.locator(`.slot[data-id='${ID}'] .quote`)).toContainText(TEXT + " — extra");
    // the quote stays selected after the edit
    await expect(page.locator(".slot.sel")).toHaveAttribute("data-id", ID);
    await expect(page.getByTestId("quote-actions")).toBeVisible();
  });

  test("line breaks typed with Enter are kept", async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press("Enter");
    await page.keyboard.type("second line");
    await save(page);
    expect((await hl(page)).plain).toBe(TEXT + "\nsecond line");
  });

  test("Cancel, Esc and a click outside all discard the changes", async ({ page }) => {
    await openEditor(page);
    await page.keyboard.type("XXX");
    await dialog(page).locator("[data-x]").click();
    await expect(page.locator(".overlay")).toHaveCount(0);
    expect((await hl(page)).html).toBeUndefined();

    await page.click("[data-qa=edit]");
    await expect(page.locator(".rte-body")).toHaveText(TEXT);
    await page.keyboard.type("YYY");
    await page.keyboard.press("Escape");
    await expect(page.locator(".overlay")).toHaveCount(0);
    expect((await hl(page)).html).toBeUndefined();

    await page.click("[data-qa=edit]");
    await page.keyboard.type("ZZZ");
    await page.getByTestId("overlay").click({ position: { x: 10, y: 10 } });
    await expect(page.locator(".overlay")).toHaveCount(0);
    expect((await hl(page)).html).toBeUndefined();
    await expect(page.locator(`.slot[data-id='${ID}'] .quote`)).toContainText(TEXT);
  });

  test("an empty quote can't be saved", async ({ page }) => {
    await openEditor(page);
    await selectAll(page);
    await page.keyboard.press("Delete");
    await dialog(page).locator("[data-ok]").click();
    await expect(toast(page)).toHaveText("A highlight can't be empty. Use 🗑 Delete instead.");
    await expect(page.locator(".overlay")).toHaveCount(1); // still open
    expect((await hl(page)).html).toBeUndefined();
  });

  test("pasted text arrives as plain text", async ({ page }) => {
    const ed = await openEditor(page);
    await ed.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", " PASTED");
      dt.setData("text/html", "<b style='color:red'>PASTED</b><script>window.__x=1</script>");
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect(ed).toHaveText(TEXT + " PASTED");
    await expect(ed.locator("b, script")).toHaveCount(0);
    await save(page);
    expect((await hl(page)).html).toBe(TEXT + " PASTED");
  });

  test("pasting with the real clipboard also drops formatting", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const ed = await openEditor(page);
    await page.evaluate(() => navigator.clipboard.write([new ClipboardItem({
      "text/plain": new Blob([" from clipboard"], { type: "text/plain" }),
      "text/html": new Blob(["<i>from</i> <u>clipboard</u>"], { type: "text/html" }),
    })]));
    await ed.focus();
    await page.keyboard.press("ControlOrMeta+V");
    await expect(ed).toHaveText(TEXT + " from clipboard");
    await expect(ed.locator("i, u")).toHaveCount(0);
  });

  test("Revert to original: cancel keeps the edit, confirm restores Readmoo's text", async ({ page }) => {
    await seed(page);
    await page.fill("#search", "EDITED");
    await expect(page.locator(".page[data-pi]")).toHaveCount(1);
    await selectCurrentQuote(page);
    await page.click("[data-qa=edit]");
    await expect(page.locator(".rte-body b")).toHaveText("EDITED");
    const revert = dialog(page).locator("[data-revert]");
    await expect(revert).toBeVisible();
    await revert.click();
    await expect(dialog(page).locator("h3")).toHaveText("Revert to original?");
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".overlay")).toHaveCount(1); // back in the editor
    expect((await hl(page, "bA-3")).html).toBe("<b>EDITED</b> text");

    await page.locator(".modal [data-revert]").click();
    await dialog(page).locator("[data-ok]").click();
    await expect(page.locator(".overlay")).toHaveCount(0);
    await expect(toast(page)).toHaveText("Restored the original text");
    const h = await hl(page, "bA-3");
    expect(h.html).toBeUndefined();
    expect(h.plain).toBeUndefined();
    expect(h.editedAt).toBeUndefined();
    expect(h.text).toContain("面對順境與逆境");
  });
});

test.describe("notes", () => {
  test("add, edit and remove a note", async ({ page }) => {
    await selectFirst(page);
    await page.click("[data-qa=note]");
    await expect(dialog(page).locator("h3")).toHaveText("Add a note");
    await expect(dialog(page).locator("[data-clear]")).toHaveCount(0);
    await expect(page.locator("#noteTa")).toBeFocused();
    await page.fill("#noteTa", "  first thought  ");
    await dialog(page).locator("[data-ok]").click();
    await expect(toast(page)).toHaveText("Note saved");
    expect((await hl(page)).note).toBe("first thought");
    const view = page.locator("[data-qa=note-view]");
    await expect(view).toContainText("first thought");
    await expect(page.locator(`.slot[data-id='${ID}'] .has-note`)).toBeVisible();

    // clicking the note opens it for editing; Ctrl+Enter saves
    await view.click();
    await expect(dialog(page).locator("h3")).toHaveText("Edit note");
    await expect(page.locator("#noteTa")).toHaveValue("first thought");
    await page.fill("#noteTa", "second thought\nline two");
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(page.locator(".overlay")).toHaveCount(0);
    expect((await hl(page)).note).toBe("second thought\nline two");

    // the Note button opens the same dialog; “Remove note” clears it
    await page.click("[data-qa=note]");
    await dialog(page).locator("[data-clear]").click();
    await expect(toast(page)).toHaveText("Note removed");
    expect((await hl(page)).note).toBe("");
    await expect(view).toHaveCount(0);
    await expect(page.locator(`.slot[data-id='${ID}'] .has-note`)).toHaveCount(0);
  });

  test("saving an empty note removes it; Cancel and Esc change nothing", async ({ page }) => {
    await selectFirst(page);
    await page.click("[data-qa=note]");
    await page.fill("#noteTa", "keep me");
    await dialog(page).locator("[data-x]").click();
    await expect(page.locator(".overlay")).toHaveCount(0);
    expect((await hl(page)).note).toBe("");

    await page.click("[data-qa=note]");
    await page.fill("#noteTa", "keep me");
    await page.keyboard.press("Escape");
    await expect(page.locator(".overlay")).toHaveCount(0);
    expect((await hl(page)).note).toBe("");

    await page.click("[data-qa=note]");
    await page.fill("#noteTa", "keep me");
    await dialog(page).locator("[data-ok]").click();
    expect((await hl(page)).note).toBe("keep me");
    await page.click("[data-qa=note]");
    await page.fill("#noteTa", "   ");
    await dialog(page).locator("[data-ok]").click();
    await expect(toast(page)).toHaveText("Note removed");
    expect((await hl(page)).note).toBe("");
  });

  test("a Readmoo note is shown with the quote and in the note dialog", async ({ page }) => {
    await seed(page);
    await page.fill("#search", "得過且過");
    await expect(page.locator(".page[data-pi]")).toHaveCount(1);
    await selectCurrentQuote(page);
    await expect(page.locator(".qa-note").first()).toContainText("Readmoo note");
    await expect(page.locator(".qa-note").first()).toContainText("工作順境時得過且過");
    await page.click("[data-qa=note]");
    await expect(dialog(page)).toContainText("Readmoo note:");
  });
});

test.describe("tags", () => {
  const chips = (page: Page) => page.locator("#tagChips .tg");

  test("add with Enter, several with commas, remove with ×, save with Done", async ({ page }) => {
    await selectFirst(page);
    await page.click("[data-qa=tag]");
    await expect(page.locator("#tagIn")).toBeFocused();
    await expect(page.locator("#tagChips")).toHaveText("No tags yet");
    await page.keyboard.type("alpha");
    await page.keyboard.press("Enter");
    await expect(chips(page)).toHaveText(["#alpha×"]);
    await expect(page.locator("#tagIn")).toHaveValue("");
    await page.keyboard.type("beta, #gamma，delta");
    await page.keyboard.press("Enter");
    await expect(chips(page)).toHaveText(["#alpha×", "#beta×", "#gamma×", "#delta×"]);
    await page.keyboard.type("alpha"); // already there: ignored
    await page.keyboard.press("Enter");
    await expect(chips(page)).toHaveCount(4);
    await page.click("#tagChips [data-rm=beta]");
    await expect(chips(page)).toHaveText(["#alpha×", "#gamma×", "#delta×"]);
    await dialog(page).locator("[data-ok]").click();
    await expect(page.locator(".overlay")).toHaveCount(0);
    expect((await hl(page)).tags).toEqual(["alpha", "gamma", "delta"]);
    await expect(page.locator(".qa-tags [data-qa=gotag]")).toHaveText(["#alpha", "#gamma", "#delta"]);
  });

  test("suggestions offer the library's other tags", async ({ page }) => {
    await selectFirst(page);
    await page.click("[data-qa=tag]");
    await expect(page.locator("#tagSugg button")).toHaveText(["+ x", "+ y"]);
    await page.click("#tagSugg [data-add=x]");
    await expect(chips(page)).toHaveText(["#x×"]);
    await expect(page.locator("#tagSugg button")).toHaveText(["+ y"]); // x is no longer offered
    await dialog(page).locator("[data-ok]").click();
    expect((await hl(page)).tags).toEqual(["x"]);
  });

  test("Done also keeps what is still typed in the box; Enter on an empty box finishes", async ({ page }) => {
    await selectFirst(page);
    await page.click("[data-qa=tag]");
    await page.keyboard.type("typed, more");
    await dialog(page).locator("[data-ok]").click();
    await expect(page.locator(".overlay")).toHaveCount(0);
    expect((await hl(page)).tags).toEqual(["typed", "more"]);

    await page.click("[data-qa=tag]");
    await expect(chips(page)).toHaveCount(2);
    await page.keyboard.type("third");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(page.locator(".overlay")).toHaveCount(0);
    expect((await hl(page)).tags).toEqual(["typed", "more", "third"]);
  });

  test("closing with Esc keeps the tags added so far", async ({ page }) => {
    await selectFirst(page);
    await page.click("[data-qa=tag]");
    await page.keyboard.type("kept");
    await page.keyboard.press("Enter");
    await expect(chips(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".overlay")).toHaveCount(0);
    expect((await hl(page)).tags).toEqual(["kept"]);
    await expect(page.locator(".qa-tags [data-qa=gotag]")).toHaveText(["#kept"]);
  });

  test("a tag chip under a quote opens that tag", async ({ page }) => {
    await seed(page);
    await page.fill("#search", "重新捆綁"); // bB-0, tagged x and y
    await expect(page.locator(".page[data-pi]")).toHaveCount(1);
    await selectCurrentQuote(page);
    await expect(page.locator(".qa-tags [data-qa=gotag]")).toHaveText(["#x", "#y"]);
    await page.locator(".qa-tags [data-qa=gotag]", { hasText: "#x" }).click();
    expect(await state<string>(page, "s => s.mode.type + ':' + s.mode.id")).toBe("tag:x");
    await expect(page.locator(".page[data-pi]")).toHaveCount(3);
    expect((await feedIds(page)).flat().sort()).toEqual(["bA-0", "bA-1", "bB-0"]);
    await expect(page.locator("#search")).toHaveValue(""); // leaving the search clears it
  });
});

test.describe("copy", () => {
  test("copies the quote with its book and chapter", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await selectFirst(page);
    await page.click("[data-qa=copy]");
    await expect(toast(page)).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${TEXT}\n—— Book C, Ch. 1`);
  });

  test("copies the edited text, not the original", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seed(page);
    await page.fill("#search", "EDITED");
    await expect(page.locator(".page[data-pi]")).toHaveCount(1);
    await selectCurrentQuote(page);
    await page.click("[data-qa=copy]");
    await expect(toast(page)).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("EDITED text\n—— 峰與谷, Ch. 19");
  });
});

test.describe("delete", () => {
  test("Cancel keeps the highlight", async ({ page }) => {
    await selectFirst(page);
    await page.click("[data-qa=del]");
    await expect(dialog(page).locator("h3")).toHaveText("Delete this highlight?");
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".overlay")).toHaveCount(0);
    expect(await total(page)).toBe(63);
    await expect(page.locator(".page[data-pi]")).toHaveCount(3);
  });

  test("confirming removes it and moves on to the next quote", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    await page.keyboard.press("ArrowDown");
    await expectPage(page, 1);
    expect(await currentIds(page)).toEqual(["bC-1"]);
    await selectCurrentQuote(page);
    await page.click("[data-qa=del]");
    await dialog(page).locator("[data-ok]").click();
    await expect(toast(page)).toHaveText("Highlight deleted");
    expect(await total(page)).toBe(62);
    expect(await hl(page, "bC-1")).toBeUndefined();
    await expect(page.locator(".page[data-pi]")).toHaveCount(2);
    await expect.poll(() => currentIds(page)).toEqual(["bC-0"]); // the one that followed it
    await expect(page.getByTestId("quote-actions")).toHaveCount(0);
  });

  test("deleting a book's last quote returns to the random mix", async ({ page }) => {
    await seed(page);
    await goTo(page, "book", "bC");
    for (let left = 3; left > 0; left--) {
      await expect(page.locator(".page[data-pi]")).toHaveCount(left);
      await selectCurrentQuote(page);
      await page.click("[data-qa=del]");
      await dialog(page).locator("[data-ok]").click();
      await expect(page.locator(".overlay")).toHaveCount(0);
    }
    expect(await total(page)).toBe(60);
    expect(await state<string>(page, "s => s.mode.type")).toBe("random");
    await expect(page.locator(".page[data-pi]")).toHaveCount(60);
  });
});

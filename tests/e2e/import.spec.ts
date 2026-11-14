import { test, expect } from "@playwright/test";
import { CSV_A, CSV_B, dismissHop, fixture, hopMessages, importBoth, open, pageCount, recordHop, seed, state } from "./helpers";
import { readFileSync } from "node:fs";

test.describe("welcome screen", () => {
  test("shows on an empty library, hides the bar and ruler", async ({ page }) => {
    await open(page);
    await expect(page.locator("#welcome")).toBeVisible();
    await expect(page.locator("body")).toHaveClass(/empty/);
    await expect(page.locator("#bar")).toBeHidden();
    await expect(page.locator("#centerBar")).toBeHidden();
  });
  test("“Choose CSV files” opens the file chooser", async ({ page }) => {
    await open(page);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("#welcome [data-act=import]")]);
    expect(chooser.isMultiple()).toBe(true);
  });
  test("“open an existing library file” loads a library file", async ({ page }) => {
    await page.addInitScript((content) => {
      const w = window as unknown as Record<string, unknown>;
      w.showSaveFilePicker = async () => ({});
      w.showOpenFilePicker = async () => [{ name: "mylib.json", async getFile() { return new File([content], "mylib.json"); }, async requestPermission() { return "granted"; }, async queryPermission() { return "granted"; }, async createWritable() { return { async write() {}, async close() {} }; } }];
    }, readFileSync(fixture("library-sample.json"), "utf8"));
    await open(page);
    await page.click("#welcome [data-act=open-or-restore]");
    await expect(page.locator(".page[data-pi]")).toHaveCount(63);
  });
});

test.describe("import dialog", () => {
  test("shows counts per file, lets you rename, imports with the jumping chameleon", async ({ page }) => {
    await open(page);
    await page.setInputFiles("#csvInput", [CSV_A, CSV_B]);
    await expect(page.locator(".imp-row [data-info='0']")).toHaveText("35 highlights · 35 new · new book");
    await expect(page.locator(".imp-row [data-info='1']")).toHaveText("25 highlights · 25 new · new book");
    await page.fill("input[data-i='0']", "峰與谷");
    await page.fill("input[data-i='1']", "串流媒體");
    await recordHop(page);
    await page.click(".modal [data-ok]");
    await expect.poll(() => hopMessages(page), { timeout: 5000 }).toEqual(["Importing your highlights…", "+60 new highlights 🎉"]);
    await expect(page.getByTestId("hop")).toBeHidden({ timeout: 5000 }); // goes away by itself
    expect(await state<number>(page, "s => s.lib.highlights.length")).toBe(60);
    // opens the last imported book
    await expect(page.getByTestId("progress")).toHaveText("串流媒體");
    expect(await pageCount(page)).toBe(25);
  });
  test("Cancel imports nothing", async ({ page }) => {
    await open(page);
    await page.setInputFiles("#csvInput", [CSV_A]);
    await page.click(".modal [data-x]");
    await expect(page.locator(".overlay")).toHaveCount(0);
    expect(await state<number>(page, "s => s.lib.highlights.length")).toBe(0);
    await expect(page.locator("#welcome")).toBeVisible();
  });
  test("a file that isn't a Readmoo export is reported, the rest still imports", async ({ page }) => {
    await open(page);
    await page.setInputFiles("#csvInput", [{ name: "other.csv", mimeType: "text/csv", buffer: Buffer.from("name,age\nA,1\n") }, { name: "peaks.csv", mimeType: "text/csv", buffer: readFileSync(CSV_A) }]);
    await expect(page.locator(".imp-row.err")).toContainText("Doesn't look like a Readmoo export");
    await page.click(".modal [data-ok]");
    await dismissHop(page);
    expect(await state<number>(page, "s => s.lib.highlights.length")).toBe(35);
  });
  test("only non-CSV files: friendly message", async ({ page }) => {
    await open(page);
    await page.setInputFiles("#csvInput", [{ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") }]);
    await expect(page.getByTestId("toast")).toHaveText("Please choose .csv files exported from Readmoo.");
  });
  test("re-importing the same file adds nothing and says so", async ({ page }) => {
    await open(page);
    await importBoth(page);
    await page.setInputFiles("#csvInput", [CSV_A]);
    await page.fill("input[data-i='0']", "峰與谷");
    await expect(page.locator("[data-info='0']")).toHaveText("35 highlights · 0 new · 35 already in library · adds to existing book");
    await recordHop(page);
    await page.click(".modal [data-ok]");
    await expect.poll(() => hopMessages(page), { timeout: 5000 }).toContain("Already up to date");
    await expect.poll(() => page.evaluate(() => document.querySelector(".hop .sub")?.textContent ?? "(gone)"), { timeout: 5000 })
      .toMatch(/35 already in your library were skipped|\(gone\)/);
    expect(await state<number>(page, "s => s.lib.highlights.length")).toBe(60);
  });
  test("new books can go straight into a folder", async ({ page }) => {
    await seed(page);
    await page.setInputFiles("#csvInput", [{ name: "new.csv", mimeType: "text/csv", buffer: readFileSync(CSV_A) }]);
    await page.fill("input[data-i='0']", "A brand new book");
    await page.selectOption("#impFolder", "fB");
    await page.click(".modal [data-ok]");
    await dismissHop(page);
    expect(await state<string>(page, "s => s.lib.books.find(b => b.title === 'A brand new book').folderId")).toBe("fB");
  });
  test("dropping a CSV onto the window opens the import dialog", async ({ page }) => {
    await open(page);
    const text = readFileSync(CSV_A, "utf8");
    const dt = await page.evaluateHandle((t) => { const d = new DataTransfer(); d.items.add(new File([t], "dropped.csv", { type: "text/csv" })); return d; }, text);
    await page.dispatchEvent("body", "dragenter", { dataTransfer: dt });
    await expect(page.locator("body")).toHaveClass(/dragging/);
    await page.dispatchEvent("body", "drop", { dataTransfer: dt });
    await expect(page.locator(".imp-row [data-info='0']")).toHaveText("35 highlights · 35 new · new book");
    await expect(page.locator("body")).not.toHaveClass(/dragging/);
  });
  test("the Import button opens the file chooser", async ({ page }) => {
    await seed(page);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("#importBtn")]);
    expect(chooser.isMultiple()).toBe(true);
  });
});

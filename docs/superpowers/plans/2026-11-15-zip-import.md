# ZIP Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people import a `.zip` of Readmoo CSVs anywhere they can import CSVs. Only the CSVs inside get imported. Skipped files are logged and reported in the import dialog with an in-app error code.

**Architecture:** A new pure module `lib/zip.ts` turns the uploaded files into a list of CSV byte buffers plus a list of issues (error code, message, file names), using fflate's `unzipSync`. `handleCSVFiles` in `components/ImportDialog.tsx` calls it, logs each issue with `console.warn`, and passes the issues to the import dialog, which shows them as notices above the book rows.

**Tech Stack:** Next.js 16 (static export, client-only), React 19, TypeScript strict, fflate, Vitest (node env), Playwright, bun.

**Spec:** `docs/superpowers/specs/2026-11-15-zip-import-design.md`

## Global Constraints

- No server and no HTTP status codes. Error codes are app-defined strings.
- Error codes, exactly: `UNSUPPORTED_FILES`, `NO_CSV_FOUND`, `ZIP_UNREADABLE`.
- Messages, exactly (`<…>` filled in):
  - `UNSUPPORTED_FILES`: `<n> file was skipped. Only .csv files can be imported: <names>` (`files were` when n > 1)
  - `NO_CSV_FOUND`: `No .csv files found. Choose Readmoo CSV exports or a .zip that contains them.`
  - `ZIP_UNREADABLE`: `Couldn't open <zip name>. It may be damaged or password-protected.`
- `<names>` lists at most 5 names joined by `, `, then ` and <k> more` (builder's call from the spec, fixed here).
- A skipped entry inside a zip is named `<zip name> › <path inside zip>`. Loose files use their own name.
- Ignored silently (never reported): directory entries, anything under `__MACOSX/`, and any entry whose base name starts with `.`.
- A zip inside a zip is skipped (reported), not opened.
- Logging: one `console.warn("[import]", code, files)` per issue.
- Name, extension and MIME checks are case-insensitive. Zip = name ends `.zip` or type is `application/zip` or `application/x-zip-compressed`. Loose CSV = name ends `.csv` or type contains `csv` (today's rule). CSV inside a zip = name ends `.csv`.
- File inputs accept `.csv,text/csv,.zip,application/zip`. Welcome button text: `Choose CSV or ZIP files`.
- New dependency: `fflate` only.

## Review Focus

1. **Big5 file names from older Windows zips.** Readmoo users are mostly in Taiwan, and older Windows zips store names in Big5 without the UTF-8 flag, which fflate then reads as Latin-1. The suggested book title must come out as readable Chinese, not mojibake. Test in Task 1: `repairs Big5 and unflagged UTF-8 entry names`.
2. **Mac-made zips.** A zip with `__MACOSX/._a.csv` and `.DS_Store` next to a real CSV shows no notice at all. Test in Task 1: `ignores __MACOSX and dotfiles silently`.
3. **Same CSV name in two folders inside one zip.** Both files become separate rows; neither overwrites the other. Test in Task 1: `keeps CSVs with the same base name from different folders`.
4. **Upper-case names (`BOOK.CSV`, `EXPORT.ZIP`).** Handled the same as lower-case. Test in Task 1: `treats extensions case-insensitively`.
5. **A zip plus loose CSVs and a loose .txt in one drop.** All CSVs share one dialog, with one `UNSUPPORTED_FILES` notice listing every skipped name. Test in Task 2: `mixed drop: zip, loose CSV and a txt share one dialog`.

---

### Task 1: `lib/zip.ts` — expand uploads into CSVs and issues

**Files:**
- Create: `lib/zip.ts`
- Modify: `package.json`, `bun.lock` (via `bun add fflate`)
- Test: `tests/unit/zip.test.ts`

**Interfaces:**
- Consumes: `decodeBuffer(buf: ArrayBuffer): string` from `lib/csv.ts` (UTF-8 first, then Big5).
- Produces:
  ```ts
  export type ImportCode = "UNSUPPORTED_FILES" | "NO_CSV_FOUND" | "ZIP_UNREADABLE";
  export interface ImportIssue { code: ImportCode; message: string; files: string[] }
  export interface UploadFile { name: string; type: string; bytes: Uint8Array }
  export interface CsvUpload { name: string; bytes: Uint8Array }   // name = base file name
  export interface Expanded { csvs: CsvUpload[]; issues: ImportIssue[] }
  export function expandUploads(files: UploadFile[]): Expanded;
  export function repairEntryName(name: string): string;
  ```
  Issue order in `issues`: every `ZIP_UNREADABLE` (one per bad zip, `files: [zipName]`), then at most one `UNSUPPORTED_FILES` (all skipped names), then `NO_CSV_FOUND` (`files: []`) when `csvs` is empty. `NO_CSV_FOUND` and `UNSUPPORTED_FILES` never both appear: when there are no CSVs, the skipped names go into `NO_CSV_FOUND.files` instead. CSVs keep upload order, and zip entry order within a zip.

- [ ] **Step 1: Add the dependency**

Run: `bun add fflate`
Expected: `package.json` lists `fflate` under `dependencies`; `bun.lock` updated.

- [ ] **Step 2: Write the failing tests** in `tests/unit/zip.test.ts`

Build zips in-test with `zipSync` from fflate. Helpers: `const u = (s: string) => new TextEncoder().encode(s)`; `const file = (name, bytes, type = "") => ({ name, type, bytes })`.

```ts
it("keeps CSVs from a zip, in entry order, by base name", () => {
  const z = zipSync({ "a.csv": u("x"), "sub/b.csv": u("y") });
  const r = expandUploads([file("books.zip", z)]);
  expect(r.csvs.map((c) => c.name)).toEqual(["a.csv", "b.csv"]);
  expect(new TextDecoder().decode(r.csvs[1].bytes)).toBe("y");
  expect(r.issues).toEqual([]);
});
it("skips non-CSV entries with UNSUPPORTED_FILES", () => {
  const z = zipSync({ "a.csv": u("x"), "notes.txt": u("n"), "img/cover.jpg": u("j") });
  const r = expandUploads([file("books.zip", z)]);
  expect(r.issues).toEqual([{ code: "UNSUPPORTED_FILES",
    files: ["books.zip › notes.txt", "books.zip › img/cover.jpg"],
    message: "2 files were skipped. Only .csv files can be imported: books.zip › notes.txt, books.zip › img/cover.jpg" }]);
});
it("uses singular wording and shortens long lists", () => {
  // 1 skipped (loose x.txt) → message is exactly "1 file was skipped. Only .csv files can be imported: x.txt"
  // 7 skipped (f1.txt…f7.txt, plus one CSV) → message ends "f1.txt, f2.txt, f3.txt, f4.txt, f5.txt and 2 more"; files has all 7
});
it("ignores __MACOSX and dotfiles silently", () => {
  const z = zipSync({ "a.csv": u("x"), "__MACOSX/._a.csv": u("m"), ".DS_Store": u("d"), "sub/.hidden": u("h") });
  expect(expandUploads([file("mac.zip", z)]).issues).toEqual([]);
});
it("skips a zip inside a zip", () => {
  const inner = zipSync({ "c.csv": u("z") });
  const r = expandUploads([file("outer.zip", zipSync({ "a.csv": u("x"), "inner.zip": inner }))]);
  expect(r.csvs).toHaveLength(1);
  expect(r.issues[0].files).toEqual(["outer.zip › inner.zip"]);
});
it("reports ZIP_UNREADABLE and keeps going", () => {
  const r = expandUploads([file("bad.zip", u("not a zip")), file("ok.csv", u("x"))]);
  expect(r.csvs.map((c) => c.name)).toEqual(["ok.csv"]);
  expect(r.issues).toEqual([{ code: "ZIP_UNREADABLE", files: ["bad.zip"],
    message: "Couldn't open bad.zip. It may be damaged or password-protected." }]);
});
it("reports NO_CSV_FOUND for an empty zip or only unsupported files", () => {
  const r = expandUploads([file("empty.zip", zipSync({})), file("notes.txt", u("n"))]);
  expect(r.csvs).toEqual([]);
  expect(r.issues).toEqual([{ code: "NO_CSV_FOUND", files: ["notes.txt"],
    message: "No .csv files found. Choose Readmoo CSV exports or a .zip that contains them." }]);
});
it("keeps CSVs with the same base name from different folders", () => {
  const r = expandUploads([file("b.zip", zipSync({ "2024/book.csv": u("1"), "2025/book.csv": u("2") }))]);
  expect(r.csvs.map((c) => new TextDecoder().decode(c.bytes))).toEqual(["1", "2"]);
});
it("treats extensions case-insensitively", () => {
  const r = expandUploads([file("EXPORT.ZIP", zipSync({ "BOOK.CSV": u("x") })), file("Loose.Csv", u("y"))]);
  expect(r.csvs.map((c) => c.name)).toEqual(["BOOK.CSV", "Loose.Csv"]);
});
it("detects a zip by MIME type and a CSV by MIME type", () => {
  // name "download" + type "application/x-zip-compressed" → unzipped
  // name "export" + type "text/csv" → kept as CSV
});
it("repairs Big5 and unflagged UTF-8 entry names", () => {
  const latin1 = (b: Uint8Array) => String.fromCharCode(...b);
  const big5 = Uint8Array.from([0xae, 0xd1, 0xa6, 0x57, 0x2e, 0x63, 0x73, 0x76]); // "書名.csv" in Big5
  expect(repairEntryName(latin1(big5))).toBe("書名.csv");
  expect(repairEntryName(latin1(u("書名.csv")))).toBe("書名.csv");
  expect(repairEntryName("café.csv")).toBe("café.csv");
  expect(repairEntryName("plain.csv")).toBe("plain.csv");
});
```

Turn the two comment-only tests into real assertions as their comments say. The MIME test asserts `csvs` names `["a.csv", "export"]` for a zip named `download`, type `application/x-zip-compressed`, containing `a.csv`, plus a loose `export`, type `text/csv`.

- [ ] **Step 3: Run the tests and make sure they fail**

Run: `bun run test tests/unit/zip.test.ts`
Expected: FAIL (cannot resolve `@/lib/zip`).

- [ ] **Step 4: Implement `expandUploads` and `repairEntryName` in `lib/zip.ts`**

- Use `unzipSync(bytes)` in a `try/catch`; a throw means `ZIP_UNREADABLE`.
- Directory entries are keys ending in `/`.
- Apply `repairEntryName` to every entry key before classifying it or showing it.
- `repairEntryName`: only acts when every char code is ≤ 0xFF and at least one is > 0x7F. Turn the chars back into bytes, then:
  1. If the bytes are valid UTF-8 (`TextDecoder("utf-8", { fatal: true })`), return that.
  2. Otherwise decode as Big5. Return the result only if it has no U+FFFD and contains at least one CJK char (`/[㐀-鿿]/`).
  3. Otherwise return the name unchanged.

  (`decodeBuffer` from `lib/csv.ts` silently falls back, so it can't drive this check; use `TextDecoder` directly.)

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `bun run test tests/unit/zip.test.ts && bun run typecheck`
Expected: all zip tests PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/zip.ts tests/unit/zip.test.ts package.json bun.lock
git commit -m "feat: expand zip uploads into CSVs with import error codes"
```

---

### Task 2: Wire zips into the import flow and show the error codes

**Files:**
- Modify: `components/ImportDialog.tsx` (`handleCSVFiles` at line 71, `ImportBody` props and markup)
- Modify: `components/App.tsx:127` (`#csvInput` accept attribute)
- Modify: `components/Extras.tsx:16-17` (welcome copy and button)
- Modify: `app/globals.css` (after `.imp-row.err`, line 316)
- Test: `tests/e2e/import.spec.ts`

**Interfaces:**
- Consumes: `expandUploads`, `ImportIssue`, `UploadFile` from `lib/zip.ts` (Task 1); `decodeBuffer`, `readmooRows`, `titleFromFilename` from `lib/csv.ts`.
- Produces:
  - `handleCSVFiles(fileList: FileList | File[]): Promise<void>` (same signature as today)
  - `ImportBody({ items, issues, close }: { items: Item[]; issues: ImportIssue[]; close: () => void })`
  - DOM, for tests: each notice is `<div class="imp-notice" data-code="<CODE>"><code>CODE</code> <span>message</span></div>`, rendered right after the `<h3>`.

- [ ] **Step 1: Write the failing e2e tests** in `tests/e2e/import.spec.ts`

Build zips on the Node side with `zipSync` from fflate. Upload through `page.setInputFiles("#csvInput", [{ name, mimeType: "application/zip", buffer: Buffer.from(zipBytes) }])`. Use the existing fixtures via `readFileSync(CSV_A)` / `readFileSync(CSV_B)`.

```ts
test("zip with two CSVs and a txt: two rows, UNSUPPORTED_FILES notice, imports", async ({ page }) => {
  // zip = { "peaks.csv": CSV_A, "stream.csv": CSV_B, "readme.txt": "hi" }
  await expect(page.locator(".imp-row input[data-i]")).toHaveCount(2);
  await expect(page.locator('.imp-notice[data-code="UNSUPPORTED_FILES"]'))
    .toContainText("1 file was skipped. Only .csv files can be imported: books.zip › readme.txt");
  // click [data-ok]; expect two books in state (same assertion style as the existing two-file import test)
});
test("zip with no CSVs: NO_CSV_FOUND notice and no Import button", async ({ page }) => {
  await expect(page.locator('.imp-notice[data-code="NO_CSV_FOUND"]')).toBeVisible();
  await expect(page.locator("[data-ok]")).toHaveCount(0);
});
test("damaged zip: ZIP_UNREADABLE notice", async ({ page }) => { /* buffer "nope", name bad.zip */ });
test("logs skipped files to the console", async ({ page }) => {
  // collect page.on("console") warnings; expect one whose text contains "[import]" and "UNSUPPORTED_FILES"
});
test("mixed drop: zip, loose CSV and a txt share one dialog", async ({ page }) => {
  // dispatch a drop on document with a DataTransfer holding books.zip ({ "peaks.csv": CSV_A, "a.txt" }),
  // a loose stream.csv (CSV_B) and notes.txt. Build the DataTransfer in page.evaluateHandle from base64 strings.
  // expect 2 input rows and one UNSUPPORTED_FILES notice listing "books.zip › a.txt, notes.txt"
});
```

Also change two existing tests:
- `"only non-CSV files: friendly message"` (line 63): expect `.imp-notice[data-code="NO_CSV_FOUND"]` instead of the toast.
- `"“Choose CSV files” opens the file chooser"` (line 13): rename the title to `“Choose CSV or ZIP files”` and also assert `#welcome [data-act=import]` has text `Choose CSV or ZIP files`.

- [ ] **Step 2: Build, run them and make sure they fail**

Run: `bun run build && bunx playwright test import`
Expected: the new tests and the two changed tests FAIL; the other import tests pass.

- [ ] **Step 3: Rewrite `handleCSVFiles`**

- Read every file into an `UploadFile` (`new Uint8Array(await f.arrayBuffer())`) and call `expandUploads`.
- For each issue, call `console.warn("[import]", issue.code, issue.files)`.
- Build `items` from `csvs` with today's per-file `try/catch` (`readmooRows(decodeBuffer(bytes.buffer…))`, `titleFromFilename(name)`). Pass a correctly sliced `ArrayBuffer`, not a shared one.
- Always open the dialog with `items` and `issues`. Remove the toast; drop the `toast` import if nothing else uses it.

- [ ] **Step 4: Render the notices in `ImportBody`**

- Add the `issues` prop and render the notices after the `<h3>`, using the DOM shape from Interfaces.
- When `items` is empty, change the heading to `Nothing to import`, hide the explanatory `<p>` and the folder picker, and label the foot button `Close` instead of `Cancel`.
- The Import button already hides when no item is ok.

- [ ] **Step 5: Update the accept attribute, welcome copy and styles**

- `#csvInput` gets `accept=".csv,text/csv,.zip,application/zip"`.
- `Extras.tsx`: the button reads `Choose CSV or ZIP files`; the line above it reads `Drop one or more CSV exports, or a .zip of them, here, or choose files.`
- CSS:
  - `.imp-notice`: same box as `.imp-row`, border `#b3261e`, text `#b3261e`, font-size 13px.
  - `.imp-notice code`: monospace, 11px, padding 1px 6px, radius 4px, background `rgba(179,38,30,.1)`, margin-right 6px.

- [ ] **Step 6: Run everything and make sure it passes**

Run: `bun run test:all`
Expected: typecheck clean, all unit tests pass, build succeeds, all Playwright tests pass (desktop and phone).

- [ ] **Step 7: Commit**

```bash
git add components/ImportDialog.tsx components/App.tsx components/Extras.tsx app/globals.css tests/e2e/import.spec.ts
git commit -m "feat: import CSVs from zip files and show skipped-file error codes"
```

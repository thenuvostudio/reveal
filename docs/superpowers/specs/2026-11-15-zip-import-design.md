# ZIP import for Readmoo CSVs — design

Status: approved · 2026-11-15 · small change

## Intent

Let people import a `.zip` of Readmoo CSV exports wherever they can import CSVs today (welcome screen button, drag-and-drop anywhere, Library → ＋ Import). The app unzips it in the browser, imports only the `.csv` files, skips everything else, logs what was skipped, and shows an error code plus a message in the app.

## Goals

- `.zip` accepted next to `.csv` in all three import paths (they all go through `handleCSVFiles` in `components/ImportDialog.tsx`).
- CSVs inside the zip go into the existing import dialog exactly like loose CSVs (title suggested from the file name, editable).
- Non-CSV files are skipped, listed by name, logged to the console, and reported with an in-app error code.

## Non-goals

- No server, no HTTP status codes: the app is a static, client-only build. "Status code" means an app-defined error code.
- No other archive formats (.rar, .7z, .tar.gz).
- No change to CSV parsing or to how rows are imported.

## Anti-goals

- A normal zip made on a Mac must not show an error just because macOS added `__MACOSX/` or `.DS_Store` entries.
- Skipped files must never block importing the valid CSVs in the same upload.

## Approaches considered

1. **fflate library (chosen).** Small (~8 KB), no dependencies, widely used, handles deflate and stored entries, works in the browser. Trade-off: one new dependency.
2. **Hand-written zip reader on the browser's `DecompressionStream("deflate-raw")`.** No dependency, but we'd own parsing of the zip directory, ZIP64, and odd encoders, which is easy to get subtly wrong.
3. **JSZip.** Mature and familiar, but ~100 KB, more than this needs.

## Design

**`lib/zip.ts` (new, pure, unit-tested).** `expandUploads(files: File[]) → { csvs: {name, bytes}[], skipped: string[], errors: ImportIssue[] }`:
- A file is a zip if its name ends in `.zip` or its type is `application/zip` / `application/x-zip-compressed`.
- Each zip is unzipped with fflate. Directory entries are ignored. `__MACOSX/…` and dotfiles (`.DS_Store`) are ignored silently.
- Entries ending in `.csv` (any folder depth) are kept; the name used is the base file name, so title suggestion still works.
- Every other entry, including a zip inside the zip, goes into `skipped` as `archive.zip › path/inside.txt`.
- Loose non-CSV, non-zip files are skipped the same way.
- A zip that can't be read (corrupt, encrypted) adds an `ImportIssue` and the rest of the upload continues.

**Error codes** (`ImportIssue = { code, message, files }`):

| Code | When | Message (example) |
|---|---|---|
| `UNSUPPORTED_FILES` | Some files skipped, at least one CSV found | 2 files were skipped. Only .csv files can be imported: notes.txt, cover.jpg |
| `NO_CSV_FOUND` | Nothing importable in the whole upload | No .csv files found. Choose Readmoo CSV exports or a .zip that contains them. |
| `ZIP_UNREADABLE` | A zip failed to open | Couldn't open books.zip. It may be damaged or password-protected. |

**Logging.** Each issue is written once with `console.warn("[import]", code, files)`.

**UI.**
- The import dialog gets a notice at the top for each issue: the code in a small monospace tag, then the message. CSV rows below it work as today.
- When nothing is importable, the dialog opens showing only the notice and a Close button. This replaces today's toast "Please choose .csv files exported from Readmoo." (the existing e2e test for that toast is updated).
- File inputs accept `.csv,text/csv,.zip,application/zip`. Welcome text and button read "Choose CSV or ZIP files".

**Tests.**
- Unit (`tests/unit/zip.test.ts`): zips built in-test with fflate's `zipSync` — CSV only; mixed; nested folders; `__MACOSX` ignored; zip in zip skipped; corrupt bytes → `ZIP_UNREADABLE`; empty zip → `NO_CSV_FOUND`.
- E2E (`tests/e2e/import.spec.ts`): upload a zip with two CSVs and a .txt → dialog shows two book rows and the `UNSUPPORTED_FILES` notice; import works. Zip with no CSVs → `NO_CSV_FOUND`. Drag-and-drop a zip once.

## Left to the builder

Exact notice styling (reuse the dialog's existing error red), and how long the skipped-file list gets before it's shortened to "and N more".

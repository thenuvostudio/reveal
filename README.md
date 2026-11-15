# Reveal

A reader for your [Readmoo](https://readmoo.com) book highlights. Import Readmoo's CSV exports and review your quotes one screen at a time: a random mix, a whole book, a folder or a tag. You can edit quotes with rich text, add notes and tags, organise books into folders, and give each book its own background.

Everything runs in the browser. Your library is stored on your own computer (IndexedDB), with optional auto-saving to a JSON file. Nothing is uploaded anywhere.

Reveal is the Next.js port of the single-file `highlights.html` app (it was called "Highlights" until the rename). Apart from the differences listed at the end, it looks and behaves the same, and both read the same backup files.

## Requirements

- Node.js 20 or newer (developed on Node 22)
- For the browser tests: Playwright's Chromium, or an installed Chrome / Chromium

## Install

```bash
npm install
```

## Run it

Development server with hot reload, on http://localhost:3000:

```bash
npm run dev
```

Production build. The app is exported as plain static files in `out/`, which `npm start` serves on http://localhost:3000:

```bash
npm run build
```

```bash
npm start
```

Any static web server can host the `out/` folder. Serve it over `http://localhost` or `https://`: opening `out/index.html` straight from disk does not work.

## Tests

| Command | What it runs |
|---|---|
| `npm run typecheck` | TypeScript, strict mode |
| `npm test` | Unit tests for the logic in `lib/` (Vitest) |
| `npm run test:e2e` | Browser tests against the static build in `out/` (Playwright) |
| `npm run test:all` | Type check, unit tests, build, then browser tests |

The browser tests need a browser once:

```bash
npx playwright install chromium
```

To use a Chrome you already have instead, point `CHROME_PATH` at it:

```bash
CHROME_PATH=/usr/bin/google-chrome npm run test:e2e
```

Things to know:

- `npm run test:e2e` tests whatever is in `out/`, so build first. `npm run test:all` does both.
- Playwright starts a static server on port 4173 and reuses one that is already running. If a build fails, the old `out/` stays in place and you would be testing stale code. When in doubt, stop the old server before rebuilding: `pkill -f "[s]erve out"`.
- Run one file with `npx playwright test ruler`, or one test with `-g "part of its name"`.
- A failing test leaves a trace in `test-results/`. Open it with `npx playwright show-trace <path to trace.zip>`.

### What the browser tests cover

| Spec | Covers |
|---|---|
| `import.spec.ts` | Welcome screen, CSV import dialog, duplicates, drag-and-drop of files |
| `feed.spec.ts` | Random mix, quote fitting, paging keys, blur, progress label, selecting quotes |
| `editing.spec.ts` | Every editor toolbar button, save / cancel / revert, paste, notes, tags, copy, delete |
| `ruler.spec.ts` | Opening and closing, wheel, keys, clicks, the settle delay, looping, empty items |
| `topbar-filter.spec.ts` | Search, dice, All, the filter panel, layout at 1440 / 1024 / 600 / 390 px |
| `settings.spec.ts` | Quotes per scroll, font size, position, order, blur, backgrounds, cursors, preview |
| `library.spec.ts` | Drawer, folders, drag-and-drop, every ⋯ menu item, backup / restore, linked file |
| `persistence.spec.ts` | What survives a reload, and moving data to and from the HTML version |
| `phone.spec.ts` | Pixel 7: layout, logo, search, ruler tap and swipe, the docked quote actions |

`phone.spec.ts` runs in the `phone` project; all other specs run in the `desktop` project (1440×900).

The tests use fixtures in `tests/fixtures/`: two Readmoo CSV exports, a sample library (`library-sample.json`: 63 highlights, 3 books, 2 folders) and a background image. File pickers are replaced by a fake File System Access API (`installFakeFs` in `tests/e2e/helpers.ts`), so linking and auto-saving to a file can be tested without a native dialog.

## Moving your data from the HTML version

The backup format is the same in both versions, so data moves in either direction.

1. In `highlights.html`, open the Library (click the app icon) and choose **Download backup (.json)**.
2. In this app, drop that `.json` file onto the window. Or open the Library and choose **Restore or merge from backup…**, then pick the file.
3. If this app already has highlights, choose **Merge into current** (adds what is missing, never duplicates) or **Replace everything**.

To go back, do the same the other way round: **Download backup** here, **Restore** there.

Notes:

- Both versions use the same IndexedDB database name (`readmoo-highlights`), but browser storage is separate for each address. `http://localhost:3000` cannot see what a `file://` page stored, so the backup file is the way to move.
- Settings (font size, cursor and so on) are not part of the backup. Set them again in Settings.
- A library file linked for auto-saving has to be linked again in this app: **Library → Open library file…** (Chrome or Edge). The same goes for **…or open an existing library file** on the welcome screen: it opens the file *and* keeps saving to it, so don't use it on a backup you want to keep unchanged.

## Where your data lives

- **Library** (books, highlights, folders, notes, tags, edits, background images): IndexedDB database `readmoo-highlights`, store `kv`, key `library`. Saved 0.3 s after each change, and immediately when the tab is closed or hidden.
- **Settings**: same store, key `settings`.
- **Linked file** (optional, Chrome and Edge): the same JSON as a backup, rewritten after every change. The dot on the app icon is green while it is saving and orange when the browser needs your permission again.
- **Backup file**: `{ app: "readmoo-highlights", version: 1, exportedAt, folders, books, highlights }`.

The search, the filter and the mode you were in are not saved. The app always opens with a fresh random mix.

## Project layout

```
app/          Next.js App Router shell and the global stylesheet
components/   The UI: App, Feed, Ruler, TopBar, FilterPanel, drawers, dialogs, editors
lib/          Pure logic, unit-tested: CSV parsing, library operations, feed order, exporters, rich text
store/        zustand stores: app state (store/app.ts) and the reader's position (store/feedPos.ts)
tests/unit/   Vitest tests for lib/
tests/e2e/    Playwright specs and helpers
tests/fixtures/  Sample CSVs, a sample library and an image
```

The app is client-only (`dynamic(() => import("./App"), { ssr: false })`) and builds with `output: "export"`. Stack: Next.js 16, React 19, TypeScript (strict), zustand.

For debugging, the zustand store is available in the browser console as `window.__reveal`.

## Known limits

- **Very long quotes at 4 per scroll.** A quote shrinks to fit its space, but never below 14 px. With 4 quotes per scroll on a short window, a quote of five or more lines can still overflow its slot. Use fewer quotes per scroll, or a taller window.
- **Reopening the ruler from the same spot.** After the ruler closes, moving the mouse back onto the tab within 6 px of where it left does not reopen it (this guard stops the tab from reopening itself as it slides back under the pointer). Move the mouse a little more, or press <kbd>B</kbd>.
- **Readmoo truncates long highlights** in its CSV export. Those quotes are marked "truncated by Readmoo".
- **Auto-saving to a file** needs the File System Access API (Chrome, Edge). Other browsers can still download and restore backups.

The first two behave the same in the HTML version.

## Differences from the HTML version

- **Name.** The app is called Reveal. Backups download as `reveal-backup-<date>.json` and a newly linked file is suggested as `reveal-library.json`. Two internal names are kept on purpose so existing data keeps working: the IndexedDB database `readmoo-highlights` and the `app: "readmoo-highlights"` field inside backup files.
- **The ruler lists only folders, books and tags.** Random and All are not on it; use the dice and the All button in the top bar. While the random mix, All or a search is showing, the needle rests on an item without loading it; scroll to another item, or click the one under the needle, to open it.

- **Touch screens: tapping the bookmark tab opens the ruler.** In the HTML version a tap opened the ruler and closed it again at once, because the browser reports a tap as "mouse enters, click, mouse leaves". Here only a real mouse opens the ruler by hovering; a finger's tap toggles it.

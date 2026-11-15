import { expect, type Page } from "@playwright/test";
import path from "node:path";

export const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);
export const CSV_A = fixture("peaks-and-valleys.csv");
export const CSV_B = fixture("streaming.csv");
export const SAMPLE = fixture("library-sample.json"); // 2 folders, 3 books, tags x/y, one note, one edit (63 highlights)

/** Fake File System Access API so linking / auto-saving to a file can be tested without a native picker.
 *  `__fs.writes` records every completed write; set `__fs.failWrites = true` to make writing fail
 *  (as when the browser's permission has lapsed) and `__fs.openContent` to choose what "Open" returns. */
export async function installFakeFs(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & { __fs: { writes: { name: string; data: string }[]; perm: PermissionState; openContent: string; failWrites: boolean } };
    w.__fs = { writes: [], perm: "granted", openContent: "", failWrites: false };
    const make = (name: string, initial: string) => {
      let content = initial;
      return {
        name, kind: "file",
        async queryPermission() { return w.__fs.perm; },
        async requestPermission() { w.__fs.perm = "granted"; return "granted"; },
        async createWritable() {
          if (w.__fs.failWrites) throw new DOMException("Permission lapsed", "NotAllowedError");
          let buf = "";
          return { async write(d: string) { buf += d; }, async close() { content = buf; w.__fs.writes.push({ name, data: buf }); } };
        },
        async getFile() { return new File([content], name, { type: "application/json" }); },
      };
    };
    w.showSaveFilePicker = async () => make("reveal-library.json", "");
    w.showOpenFilePicker = async () => [make("mylib.json", w.__fs.openContent)];
  });
}
export const fsWrites = (page: Page) => page.evaluate(() => (window as unknown as { __fs: { writes: { name: string; data: string }[] } }).__fs.writes);

export async function open(page: Page) {
  await page.goto("/");
  await expect(page.locator("#top")).toBeVisible();
}

/** Starts with the sample library restored through the real Restore button. */
export async function seed(page: Page) {
  await open(page);
  await expect(page.locator("#welcome")).toBeVisible();
  await page.setInputFiles("#jsonInput", SAMPLE);
  await expect(page.locator(".page[data-pi]").first()).toBeVisible();
  await expect(page.locator(".page[data-pi]")).toHaveCount(63);
}

/** Imports both sample CSVs with proper titles through the import dialog. */
export async function importBoth(page: Page) {
  await page.setInputFiles("#csvInput", [CSV_A, CSV_B]);
  await page.fill("input[data-i='0']", "峰與谷");
  await page.fill("input[data-i='1']", "串流媒體");
  await page.click(".modal [data-ok]");
  await dismissHop(page);
}

/** Records every message the import animation shows (so slow machines can't miss it). Call before importing. */
export async function recordHop(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __hop: string[] };
    w.__hop = [];
    new MutationObserver(() => {
      const m = document.querySelector("[data-testid=hop-msg]")?.textContent;
      if (m && w.__hop.at(-1) !== m) w.__hop.push(m);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}
export const hopMessages = (page: Page) => page.evaluate(() => (window as unknown as { __hop: string[] }).__hop);

export async function dismissHop(page: Page) {
  const hop = page.getByTestId("hop");
  await expect(hop).toBeVisible();
  await hop.click();
  await expect(hop).toBeHidden();
}

/** Read the app state (read-only debugging handle the app exposes). */
export function state<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate(`(() => { const s = window.__reveal.getState(); return (${fn})(s); })()`) as Promise<T>;
}

export const pageCount = (page: Page) => page.locator(".page[data-pi]").count();
export const currentPageIndex = (page: Page) => page.evaluate(() => { const f = document.getElementById("feed")!; return Math.round(f.scrollTop / f.clientHeight); });

/** Clicks the first visible quote's text (selects it and shows its actions). */
export async function selectCurrentQuote(page: Page) {
  const i = await currentPageIndex(page);
  const q = page.locator(`.page[data-pi='${i}'] .quote`).first();
  await q.click();
  const qa = page.getByTestId("quote-actions");
  await expect(qa).toBeVisible();
  // Let the fade-in finish. Playwright retries a click on a moving element by scrolling it to the
  // viewport's edge, which would drag the snap-scrolling feed to another page and drop the selection.
  await qa.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
}

/** Opens the ruler by hovering the bookmark tab and returns the label under the needle. */
export async function openRuler(page: Page) {
  await page.hover("#bm");
  await expect(page.locator("#ruler")).toHaveClass(/open/);
}
export const rulerLabel = (page: Page) => page.locator("#tape .tick.cur .lb").textContent(); // textContent: some labels are shown in capitals by CSS
export const rulerLabels = (page: Page) => page.evaluate(() => {
  const ls = [...document.querySelectorAll("#tape .tick .lb")].map((e) => e.textContent || "");
  return [...new Set(ls)];
});

/* ---------- helpers shared by the feature specs ---------- */

/** Where the feed is, in pages. A whole number once scrolling has settled, a fraction while it is still moving. */
export const feedPosition = (page: Page) => page.evaluate(() => {
  const f = document.getElementById("feed")!;
  const r = f.scrollTop / f.clientHeight;
  return Math.abs(r - Math.round(r)) < 0.02 ? Math.round(r) : r;
});
/** Waits until the feed rests on page `i`. */
export async function expectPage(page: Page, i: number) {
  await expect.poll(() => feedPosition(page)).toBe(i);
}
/** Highlight ids on every page, in feed order (one array per page). */
export const feedIds = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll(".page[data-pi]")].map((p) => [...p.querySelectorAll<HTMLElement>(".slot[data-id]")].map((s) => s.dataset.id!)));
/** Highlight ids on the page the reader is on. */
export const currentIds = (page: Page) => page.evaluate(() => {
  const f = document.getElementById("feed")!;
  const p = f.children[Math.round(f.scrollTop / f.clientHeight)];
  return [...p.querySelectorAll<HTMLElement>(".slot[data-id]")].map((s) => s.dataset.id!);
});

export const toast = (page: Page) => page.getByTestId("toast");
export const dialog = (page: Page) => page.locator(".overlay .modal").last();

export async function openLibrary(page: Page) {
  await page.click("#brandBtn");
  await expect(page.locator("#library")).toHaveClass(/open/);
}
export async function openSettings(page: Page) {
  await page.click("#setBtn");
  await expect(page.locator("#settings")).toHaveClass(/open/);
}
export async function closeDrawer(page: Page) {
  await page.locator(".drawer.open [data-close]").click();
  await expect(page.locator(".drawer.open")).toHaveCount(0);
}
export const libRow = (page: Page, kind: "book" | "folder" | "tag", id: string) => page.locator(`#library .lrow[data-kind='${kind}'][data-id='${id}']`);

/** Opens one book / folder / tag through the Library drawer, as a reader would. */
export async function goTo(page: Page, kind: "book" | "folder" | "tag", id: string) {
  await openLibrary(page);
  await libRow(page, kind, id).locator(".t").click();
  await expect(page.locator("#library")).not.toHaveClass(/open/);
  expect(await state<string>(page, "s => s.mode.type + ':' + s.mode.id")).toBe(`${kind}:${id}`);
}
/** Clicks one item of a library row's ⋯ menu. */
export async function rowMenu(page: Page, kind: "book" | "folder" | "tag", id: string, label: string | RegExp) {
  await libRow(page, kind, id).locator("[data-more]").click();
  await page.getByTestId("row-menu").getByRole("menuitem", { name: label }).click();
}
/** A button in the Library drawer's "Library file & backup" section. */
export const fileButton = (page: Page, label: string | RegExp) => page.locator("#fileSec .fbtns button").filter({ hasText: label });

/** The ruler label that matches the mode the app is in. */
export const modeLabel = (page: Page) => state<string>(page, `s => {
  const m = s.mode;
  if (m.type === "random") return "🎲 隨機 Random";
  if (m.type === "all") return "全部 All";
  if (m.type === "book") return s.lib.books.find(b => b.id === m.id).title;
  if (m.type === "folder") return s.lib.folders.find(f => f.id === m.id).name;
  if (m.type === "tag") return "#" + m.id;
  return "search";
}`);

/** The library as it is stored in IndexedDB right now (undefined before the first save). */
export const storedLibrary = <T = { books: unknown[]; highlights: unknown[]; folders: unknown[] }>(page: Page) => page.evaluate(() => new Promise<unknown>((resolve, reject) => {
  const r = indexedDB.open("readmoo-highlights", 1);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("kv")) r.result.createObjectStore("kv"); };
  r.onerror = () => reject(r.error);
  r.onsuccess = () => {
    const q = r.result.transaction("kv").objectStore("kv").get("library");
    q.onsuccess = () => { r.result.close(); resolve(q.result); };
    q.onerror = () => { r.result.close(); reject(q.error); };
  };
})) as Promise<T | undefined>;
export const storedSettings = (page: Page) => page.evaluate(() => new Promise<unknown>((resolve, reject) => {
  const r = indexedDB.open("readmoo-highlights", 1);
  r.onerror = () => reject(r.error);
  r.onsuccess = () => {
    const q = r.result.transaction("kv").objectStore("kv").get("settings");
    q.onsuccess = () => { r.result.close(); resolve(q.result); };
    q.onerror = () => { r.result.close(); reject(q.error); };
  };
})) as Promise<Record<string, unknown> | undefined>;

import type { Filter, Highlight, Library, Mode, Page, Position, Settings } from "./types";
import { allTags, bookById, booksIn, booksUnder, childFolders, descendantIds, folderById, hlsOf, sortHls, zh } from "./library";
import { hash, rng, cls } from "./colors";
import { matches, terms } from "./text";

export const newSeed = () => Math.floor(Math.random() * 1e9);
export const filterActive = (f: Filter) => f.folders.length > 0 || f.tags.length > 0;

/** Books in library order: depth-first through folders, then top-level books. */
export function orderedBooks(lib: Library) {
  const out: ReturnType<typeof booksIn> = [];
  (function walk(pid: string | null) {
    childFolders(lib, pid).forEach((f) => walk(f.id));
    booksIn(lib, pid).forEach((b) => out.push(b));
  })(null);
  return out;
}

/** Predicate for "inside the current filter" (folders include subfolders; folders AND tags). */
export function scopeTest(lib: Library, filter: Filter): (h: Highlight) => boolean {
  let books: Set<string> | null = null;
  if (filter.folders.length) {
    books = new Set();
    filter.folders.forEach((fid) => { if (folderById(lib, fid)) booksUnder(lib, fid).forEach((b) => books!.add(b.id)); });
  }
  const tags = new Set(filter.tags);
  return (h) => (!books || books.has(h.bookId)) && (!tags.size || h.tags.some((t) => tags.has(t)));
}
export function scopedHighlights(lib: Library, filter: Filter): Highlight[] {
  if (!filterActive(filter)) return lib.highlights;
  const ok = scopeTest(lib, filter);
  return lib.highlights.filter(ok);
}

function shuffled<T>(arr: T[], seed: number): T[] {
  const r = rng(seed), a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export interface FeedInput { lib: Library; mode: Mode; filter: Filter; settings: Settings; query: string }

/** Every highlight the current mode shows, in feed order. */
export function modeHighlights({ lib, mode, filter, settings, query }: FeedInput): Highlight[] {
  const ob = orderedBooks(lib);
  const list: Highlight[] = [];
  const inScope = filterActive(filter) ? scopeTest(lib, filter) : null;
  const order = settings.withinBook === "newest" ? "date-new" : "chapter-asc";
  const add = (books: typeof ob, extra?: (h: Highlight) => boolean) => books.forEach((b) => {
    let qs = sortHls(hlsOf(lib, b.id), order);
    if (inScope) qs = qs.filter(inScope);
    if (extra) qs = qs.filter(extra);
    qs.forEach((h) => list.push(h));
  });
  switch (mode.type) {
    case "book": add(ob.filter((b) => b.id === mode.id)); break;
    case "folder": { const ids = descendantIds(lib, mode.id || ""); add(ob.filter((b) => b.folderId != null && ids.has(b.folderId))); break; }
    case "tag": add(ob, (h) => h.tags.includes(mode.id || "")); break;
    case "search": { const ts = terms(query); add(ob, (h) => matches(lib, h, ts)); break; }
    case "all": add(ob); break;
    default: {
      // random: shuffle inside each category (folder; an unfiled book is its own), then take turns
      const cats = new Map<string, Highlight[]>();
      scopedHighlights(lib, filter).forEach((h) => {
        const b = bookById(lib, h.bookId);
        if (!b) return;
        const c = b.folderId || "book:" + b.id;
        if (!cats.has(c)) cats.set(c, []);
        cats.get(c)!.push(h);
      });
      const decks = shuffled([...cats.values()].map((qs, i) => shuffled(qs, mode.seed + (i + 1) * 7919)), mode.seed);
      while (decks.some((d) => d.length)) decks.forEach((d) => { if (d.length) list.push(d.shift()!); });
    }
  }
  return list;
}

/** Splits the list into scroll pages. Except in Random, each book starts on a fresh page. */
export function buildPages(list: Highlight[], mode: Mode, perScroll: number): Page[] {
  const pages: Page[] = [];
  if (mode.type === "random") {
    for (let i = 0; i < list.length; i += perScroll) { const it = list.slice(i, i + perScroll); pages.push({ bookId: it[0].bookId, items: it }); }
    return pages;
  }
  let cur: Page | null = null;
  list.forEach((h) => {
    if (!cur || cur.bookId !== h.bookId || cur.items.length >= perScroll) { cur = { bookId: h.bookId, items: [] }; pages.push(cur); }
    cur.items.push(h);
  });
  return pages;
}

export function positionOf(h: Highlight, pos: Position): Exclude<Position, "random"> {
  if (pos !== "random") return pos;
  return (["left", "center", "right"] as const)[hash(h.id + "pos") % 3];
}

/** Is this mode still showable (its book/folder/tag exists and has highlights inside the filter)? */
export function modeValid(lib: Library, m: Mode, filter: Filter): boolean {
  const hs = scopedHighlights(lib, filter);
  if (m.type === "book") return !!bookById(lib, m.id) && hs.some((h) => h.bookId === m.id);
  if (m.type === "folder") {
    if (!folderById(lib, m.id)) return false;
    const ids = new Set(booksUnder(lib, m.id!).map((b) => b.id));
    return hs.some((h) => ids.has(h.bookId));
  }
  if (m.type === "tag") return hs.some((h) => h.tags.includes(m.id || ""));
  return true;
}

export interface RulerItem { type: "random" | "all" | "folder" | "book" | "tag"; id: string | null; label: string; count: number; depth?: number; cls?: string; sw?: string }

/** Ruler entries: Random, All, folders with their books (tree order), top-level books, tags — all within the filter. */
export function rulerItems(lib: Library, filter: Filter): RulerItem[] {
  const hs = scopedHighlights(lib, filter), on = filterActive(filter);
  const counts = new Map<string, number>();
  hs.forEach((h) => counts.set(h.bookId, (counts.get(h.bookId) || 0) + 1));
  const keep = (n: number) => !on || n > 0;
  const items: RulerItem[] = [
    { type: "random", id: null, label: "🎲 隨機 Random", count: hs.length, sw: "linear-gradient(90deg,#ff8fb1,#ffd36e,#7ee081,#6ec3ff,#b48cff)" },
    { type: "all", id: null, label: "全部 All", count: hs.length, sw: "linear-gradient(90deg,#fff,#fff)" },
  ];
  (function walk(pid: string | null, d: number) {
    childFolders(lib, pid).forEach((f) => {
      const fc = booksUnder(lib, f.id).reduce((n, b) => n + (counts.get(b.id) || 0), 0);
      if (keep(fc)) items.push({ type: "folder", id: f.id, label: f.name, depth: d, count: fc, cls: "bgf-" + cls(f.id) });
      walk(f.id, d + 1);
      booksIn(lib, f.id).forEach((b) => { const c = counts.get(b.id) || 0; if (keep(c)) items.push({ type: "book", id: b.id, label: b.title, count: c, cls: "bgb-" + cls(b.id) }); });
    });
  })(null, 0);
  booksIn(lib, null).forEach((b) => { const c = counts.get(b.id) || 0; if (keep(c)) items.push({ type: "book", id: b.id, label: b.title, count: c, cls: "bgb-" + cls(b.id) }); });
  allTags(lib, hs).forEach(([t, c]) => items.push({ type: "tag", id: t, label: "#" + t, count: c, sw: "linear-gradient(90deg,#d9d2c5,#9a9086)" }));
  return items;
}

export function sortedTagCounts(lib: Library): [string, number][] {
  return allTags(lib).sort((a, b) => zh(a[0], b[0]));
}

import type { Book, CsvRow, Folder, Highlight, Library } from "./types";
import { cleanStoredHtml } from "./text";

export const emptyLib = (): Library => ({ books: [], highlights: [], folders: [] });

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/** Identity of a highlight inside a book: re-importing the same CSV must not duplicate it. */
export const hlKey = (bookId: string, h: Pick<Highlight, "chapter" | "date" | "text">): string =>
  bookId + "\u0001" + h.chapter + "\u0001" + h.date + "\u0001" + h.text;

/** Accepts anything that looks like a library (including files from the HTML version) and repairs it. */
export function validateLib(o: unknown): Library {
  const v = o as Partial<Library> | null;
  if (!v || !Array.isArray(v.books) || !Array.isArray(v.highlights)) {
    throw new Error("This is not a highlights library file.");
  }
  const folders: Folder[] = Array.isArray(v.folders) ? v.folders : [];
  const fids = new Set(folders.map((f) => f.id));
  folders.forEach((f) => { if (!fids.has(f.parentId as string)) f.parentId = null; });
  v.books.forEach((b) => { if (!fids.has(b.folderId as string)) b.folderId = null; });
  v.highlights.forEach((h) => {
    h.tags = Array.isArray(h.tags) ? h.tags : [];
    h.note = h.note || "";
    h.readmooNote = h.readmooNote || "";
    h.chapter = h.chapter ?? "";
    h.date = h.date ?? "";
    if (typeof h.html === "string") h.html = cleanStoredHtml(h.html); else delete h.html;
  });
  return { books: v.books, highlights: v.highlights, folders };
}

/** Backup / library-file format. Same shape as the HTML version so files move between both. */
export function serialize(lib: Library): string {
  return JSON.stringify({ app: "readmoo-highlights", version: 1, exportedAt: new Date().toISOString(), folders: lib.folders, books: lib.books, highlights: lib.highlights }, null, 2);
}

/* ---------- lookups ---------- */
export const bookById = (lib: Library, id: string | null | undefined) => lib.books.find((b) => b.id === id);
export const folderById = (lib: Library, id: string | null | undefined) => lib.folders.find((f) => f.id === id);
export const hlById = (lib: Library, id: string) => lib.highlights.find((h) => h.id === id);
export const hlsOf = (lib: Library, bookId: string) => lib.highlights.filter((h) => h.bookId === bookId);
export const zh = (a: string, b: string) => a.localeCompare(b, "zh-Hant");

export const childFolders = (lib: Library, pid: string | null) =>
  lib.folders.filter((f) => (f.parentId || null) === (pid || null)).sort((a, b) => zh(a.name, b.name));
export const booksIn = (lib: Library, fid: string | null) =>
  lib.books.filter((b) => (b.folderId || null) === (fid || null)).sort((a, b) => zh(a.title, b.title));

export function folderPath(lib: Library, fid: string | null | undefined): Folder[] {
  const out: Folder[] = [];
  let f = folderById(lib, fid);
  let guard = 0;
  while (f && guard++ < 50) { out.unshift(f); f = folderById(lib, f.parentId); }
  return out;
}
export function descendantIds(lib: Library, fid: string): Set<string> {
  const set = new Set([fid]);
  let grew = true;
  while (grew) {
    grew = false;
    lib.folders.forEach((f) => { if (f.parentId && set.has(f.parentId) && !set.has(f.id)) { set.add(f.id); grew = true; } });
  }
  return set;
}
export function booksUnder(lib: Library, fid: string): Book[] {
  const ids = descendantIds(lib, fid);
  return lib.books.filter((b) => b.folderId != null && ids.has(b.folderId));
}
export function expandTo(lib: Library, fid: string | null): void {
  folderPath(lib, fid).forEach((f) => { f.collapsed = false; });
}
/** Folder tree as a flat list for <select>s: [id, label with indentation]. */
export function folderOptionList(lib: Library, exclude: Set<string> = new Set()): [string, string][] {
  const out: [string, string][] = [];
  (function walk(pid: string | null, depth: number) {
    childFolders(lib, pid).forEach((f) => {
      if (exclude.has(f.id)) return;
      out.push([f.id, "   ".repeat(depth) + "📁 " + f.name]);
      walk(f.id, depth + 1);
    });
  })(null, 0);
  return out;
}

export function allTags(lib: Library, list: Highlight[] = lib.highlights): [string, number][] {
  const m = new Map<string, number>();
  list.forEach((h) => h.tags.forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
  return [...m.entries()].sort((a, b) => zh(a[0], b[0]));
}

/* ---------- ordering ---------- */
const chNum = (h: Highlight) => { const n = parseFloat(h.chapter); return isNaN(n) ? 1e9 : n; };
export type SortMode = "chapter-asc" | "date-new";
export function sortHls(arr: Highlight[], mode: SortMode): Highlight[] {
  const a = [...arr];
  const byDate = (x: Highlight, y: Highlight) => (x.date || "").localeCompare(y.date || "") || (x.order ?? 0) - (y.order ?? 0);
  // Readmoo lists newest first, so within a chapter a larger `order` means earlier in the book.
  if (mode === "chapter-asc") return a.sort((x, y) => chNum(x) - chNum(y) || (y.order ?? 0) - (x.order ?? 0));
  return a.sort((x, y) => -byDate(x, y));
}

/* ---------- import ---------- */
export function newCount(lib: Library, title: string, rows: CsvRow[]): number {
  const b = lib.books.find((x) => x.title === title.trim());
  if (!b) return rows.length;
  const keys = new Set(hlsOf(lib, b.id).map((h) => hlKey(b.id, h)));
  return rows.filter((r) => !keys.has(hlKey(b.id, r))).length;
}

/** Adds rows to the book with this title (creating it, in `folderId`, if needed). Mutates `lib`. */
export function importRows(lib: Library, title: string, rows: CsvRow[], folderId: string | null = null) {
  let b = lib.books.find((x) => x.title === title);
  const now = new Date().toISOString();
  if (!b) {
    b = { id: uid(), title, createdAt: now, folderId: folderId && folderById(lib, folderId) ? folderId : null };
    lib.books.push(b);
    if (b.folderId) expandTo(lib, b.folderId);
  }
  b.lastImported = now;
  const existing = new Map(hlsOf(lib, b.id).map((h) => [hlKey(b!.id, h), h] as const));
  let added = 0, dup = 0;
  const base = Date.now();
  rows.forEach((r, idx) => {
    const k = hlKey(b!.id, r);
    const ex = existing.get(k);
    if (ex) {
      // refresh Readmoo's own note if it changed; never touch the user's note, tags or edits
      if (r.readmooNote && ex.readmooNote !== r.readmooNote) ex.readmooNote = r.readmooNote;
      dup++;
      return;
    }
    const h: Highlight = { id: uid(), bookId: b!.id, chapter: r.chapter, date: r.date, text: r.text, readmooNote: r.readmooNote, note: "", tags: [], order: base + idx, importedAt: now };
    lib.highlights.push(h);
    existing.set(k, h);
    added++;
  });
  return { added, dup, bookId: b.id };
}

/* ---------- edits that touch several records ---------- */
/** Renames a book; renaming onto an existing title merges the two (dropping duplicates). Returns the surviving id. */
export function renameBook(lib: Library, id: string, title: string): string {
  const b = bookById(lib, id);
  if (!b) return id;
  const other = lib.books.find((x) => x.title === title && x.id !== id);
  if (!other) { b.title = title; return id; }
  const keys = new Set(hlsOf(lib, other.id).map((h) => hlKey(other.id, h)));
  lib.highlights = lib.highlights.filter((h) => {
    if (h.bookId !== id) return true;
    h.bookId = other.id;
    const k = hlKey(other.id, h);
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });
  lib.books = lib.books.filter((x) => x.id !== id);
  return other.id;
}
export function renameTag(lib: Library, from: string, to: string): void {
  if (!to || to === from) return;
  lib.highlights.forEach((h) => { if (h.tags.includes(from)) h.tags = [...new Set(h.tags.map((x) => (x === from ? to : x)))]; });
}
export function removeTag(lib: Library, tag: string): void {
  lib.highlights.forEach((h) => { h.tags = h.tags.filter((t) => t !== tag); });
}
export function deleteBook(lib: Library, id: string): void {
  lib.highlights = lib.highlights.filter((h) => h.bookId !== id);
  lib.books = lib.books.filter((b) => b.id !== id);
}
/** Deletes a folder; its books and subfolders move up to its parent. No highlights are lost. */
export function deleteFolder(lib: Library, fid: string): void {
  const f = folderById(lib, fid);
  if (!f) return;
  lib.folders.forEach((x) => { if (x.parentId === fid) x.parentId = f.parentId || null; });
  lib.books.forEach((b) => { if (b.folderId === fid) b.folderId = f.parentId || null; });
  lib.folders = lib.folders.filter((x) => x.id !== fid);
}
/** Moves a book or folder. Returns false (and changes nothing) for impossible moves. */
export function moveItem(lib: Library, type: "book" | "folder", id: string, target: string | null): boolean {
  const t = target || null;
  if (t && !folderById(lib, t)) return false;
  if (type === "book") {
    const b = bookById(lib, id);
    if (!b || (b.folderId || null) === t) return false;
    b.folderId = t;
  } else {
    const f = folderById(lib, id);
    if (!f || (f.parentId || null) === t) return false;
    if (t && descendantIds(lib, id).has(t)) return false; // can't go inside itself
    f.parentId = t;
  }
  if (t) expandTo(lib, t);
  return true;
}

/** Merges another library into `lib` without duplicates (folders matched by name+parent, books by title). */
export function mergeLib(lib: Library, data: Library): void {
  const fMap = new Map<string, string>();
  const pending = [...(data.folders || [])];
  let guard = pending.length * pending.length + 5;
  while (pending.length && guard--) {
    const f = pending.shift()!;
    if (f.parentId && !fMap.has(f.parentId)) { pending.push(f); continue; }
    const pid = f.parentId ? fMap.get(f.parentId)! : null;
    let ex = lib.folders.find((x) => x.name === f.name && (x.parentId || null) === pid);
    if (!ex) {
      ex = { id: lib.folders.some((x) => x.id === f.id) ? uid() : f.id, name: f.name, parentId: pid, collapsed: !!f.collapsed, bgSeed: f.bgSeed, bgImage: f.bgImage };
      lib.folders.push(ex);
    }
    fMap.set(f.id, ex.id);
  }
  const idMap = new Map<string, string>();
  data.books.forEach((b) => {
    let ex = lib.books.find((x) => x.title === b.title);
    const fid = b.folderId ? fMap.get(b.folderId) || null : null;
    if (!ex) {
      ex = { ...b, folderId: fid, id: lib.books.some((x) => x.id === b.id) ? uid() : b.id };
      lib.books.push(ex);
    } else {
      if (!ex.folderId && fid) ex.folderId = fid;
      if (!ex.bgImage && b.bgImage) ex.bgImage = b.bgImage;
      if (!ex.bgSeed && b.bgSeed) ex.bgSeed = b.bgSeed;
    }
    idMap.set(b.id, ex.id);
  });
  data.highlights.forEach((h) => {
    const bookId = idMap.get(h.bookId);
    if (!bookId) return;
    const k = hlKey(bookId, h);
    const ex = lib.highlights.find((x) => x.bookId === bookId && hlKey(bookId, x) === k);
    if (ex) {
      ex.tags = [...new Set([...ex.tags, ...h.tags])];
      if (h.note && !ex.note.includes(h.note)) ex.note = ex.note ? ex.note + "\n\n" + h.note : h.note;
      if (h.html && (!ex.html || (h.editedAt || "") > (ex.editedAt || ""))) { ex.html = h.html; ex.plain = h.plain; ex.editedAt = h.editedAt; }
    } else {
      lib.highlights.push({ ...h, id: lib.highlights.some((x) => x.id === h.id) ? uid() : h.id, bookId });
    }
  });
}

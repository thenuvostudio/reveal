import { describe, expect, it } from "vitest";
import { buildPages, modeHighlights, modeValid, positionOf, rulerItems, scopedHighlights } from "@/lib/feed";
import { emptyLib, importRows } from "@/lib/library";
import type { CsvRow, Filter, Mode, Settings } from "@/lib/types";

const S: Settings = { perScroll: 1, fontSize: 72, position: "random", blur: true, cursor: "1", withinBook: "chapter", theme: "original", customPalettes: [] };
const none: Filter = { folders: [], tags: [] };
const rows = (n: number, p: string): CsvRow[] => Array.from({ length: n }, (_, i) => ({ chapter: String(i + 1), date: "2025-01-01", text: `${p}${i}`, readmooNote: "" }));
function sample() {
  const lib = emptyLib();
  lib.folders.push({ id: "fA", name: "A", parentId: null }, { id: "fB", name: "B", parentId: null });
  importRows(lib, "Book A", rows(6, "a"), "fA");
  importRows(lib, "Book B", rows(4, "b"), "fB");
  importRows(lib, "Loose", rows(2, "c"));
  lib.highlights[0].tags = ["x"];
  lib.highlights[7].tags = ["x"];
  return lib;
}
const m = (type: Mode["type"], id: string | null = null, seed = 1): Mode => ({ type, id, seed });

describe("modeHighlights", () => {
  it("random takes turns between categories and includes everything once", () => {
    const lib = sample();
    const list = modeHighlights({ lib, mode: m("random", null, 42), filter: none, settings: S, query: "" });
    expect(list).toHaveLength(12);
    expect(new Set(list.map((h) => h.id)).size).toBe(12);
    const cat = (bookId: string) => lib.books.find((b) => b.id === bookId)!.folderId || "loose";
    const firstThree = new Set(list.slice(0, 3).map((h) => cat(h.bookId)));
    expect(firstThree.size).toBe(3);
  });
  it("same seed gives the same order; a new seed reshuffles", () => {
    const lib = sample();
    const a = modeHighlights({ lib, mode: m("random", null, 7), filter: none, settings: S, query: "" }).map((h) => h.id);
    const b = modeHighlights({ lib, mode: m("random", null, 7), filter: none, settings: S, query: "" }).map((h) => h.id);
    const c = modeHighlights({ lib, mode: m("random", null, 8), filter: none, settings: S, query: "" }).map((h) => h.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it("book, folder, tag and search modes", () => {
    const lib = sample();
    const bookA = lib.books.find((b) => b.title === "Book A")!.id;
    expect(modeHighlights({ lib, mode: m("book", bookA), filter: none, settings: S, query: "" })).toHaveLength(6);
    expect(modeHighlights({ lib, mode: m("folder", "fB"), filter: none, settings: S, query: "" })).toHaveLength(4);
    expect(modeHighlights({ lib, mode: m("tag", "x"), filter: none, settings: S, query: "" })).toHaveLength(2);
    expect(modeHighlights({ lib, mode: m("search"), filter: none, settings: S, query: "b1" })).toHaveLength(1);
  });
  it("reading order within a book follows chapters", () => {
    const lib = sample();
    const bookA = lib.books.find((b) => b.title === "Book A")!.id;
    const ch = modeHighlights({ lib, mode: m("book", bookA), filter: none, settings: S, query: "" }).map((h) => +h.chapter);
    expect(ch).toEqual([...ch].sort((x, y) => x - y));
  });
});

describe("filter", () => {
  it("folders AND tags; ruler only lists what's inside", () => {
    const lib = sample();
    const f: Filter = { folders: ["fA"], tags: [] };
    expect(scopedHighlights(lib, f)).toHaveLength(6);
    expect(scopedHighlights(lib, { folders: ["fA"], tags: ["x"] })).toHaveLength(1);
    expect(scopedHighlights(lib, { folders: [], tags: ["x"] })).toHaveLength(2);
    const labels = rulerItems(lib, f).map((i) => i.label);
    expect(labels).toContain("Book A");
    expect(labels).not.toContain("Book B");
    expect(labels).not.toContain("Loose");
    expect(rulerItems(lib, none).map((i) => i.type)).toEqual(["folder", "book", "folder", "book", "book", "tag"]);
  });
  it("modes outside the filter are invalid", () => {
    const lib = sample();
    const bookB = lib.books.find((b) => b.title === "Book B")!.id;
    expect(modeValid(lib, m("book", bookB), none)).toBe(true);
    expect(modeValid(lib, m("book", bookB), { folders: ["fA"], tags: [] })).toBe(false);
    expect(modeValid(lib, m("tag", "nope"), none)).toBe(false);
  });
});

describe("pages & positions", () => {
  it("non-random feeds start each book on a fresh page", () => {
    const lib = sample();
    const list = modeHighlights({ lib, mode: m("all"), filter: none, settings: S, query: "" });
    const pages = buildPages(list, m("all"), 4);
    expect(pages.map((p) => p.items.length)).toEqual([4, 2, 4, 2]);
    expect(pages.every((p) => p.items.every((h) => h.bookId === p.bookId))).toBe(true);
  });
  it("a quote always gets the same random position", () => {
    const lib = sample();
    const h = lib.highlights[3];
    expect(positionOf(h, "random")).toBe(positionOf(h, "random"));
    expect(positionOf(h, "left")).toBe("left");
  });
});

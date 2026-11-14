import { describe, expect, it } from "vitest";
import { deleteFolder, emptyLib, importRows, mergeLib, moveItem, newCount, renameBook, renameTag, removeTag, validateLib, booksUnder } from "@/lib/library";
import type { CsvRow, Library } from "@/lib/types";

const rows = (n: number, prefix = "q"): CsvRow[] => Array.from({ length: n }, (_, i) => ({ chapter: String(1 + (i % 3)), date: `2025-01-0${1 + (i % 9)}`, text: `${prefix} ${i}`, readmooNote: "" }));

describe("importRows", () => {
  it("creates the book, then skips duplicates on re-import", () => {
    const lib = emptyLib();
    expect(importRows(lib, "Book", rows(5))).toMatchObject({ added: 5, dup: 0 });
    expect(newCount(lib, "Book", rows(7))).toBe(2);
    expect(importRows(lib, "Book", rows(7))).toMatchObject({ added: 2, dup: 5 });
    expect(lib.books).toHaveLength(1);
    expect(lib.highlights).toHaveLength(7);
  });
  it("never touches the user's edits, notes or tags, but refreshes Readmoo's note", () => {
    const lib = emptyLib();
    importRows(lib, "B", rows(1));
    Object.assign(lib.highlights[0], { note: "mine", tags: ["t"], html: "<b>x</b>", plain: "x" });
    importRows(lib, "B", [{ ...rows(1)[0], readmooNote: "new readmoo note" }]);
    expect(lib.highlights[0]).toMatchObject({ note: "mine", tags: ["t"], html: "<b>x</b>", readmooNote: "new readmoo note" });
  });
  it("puts new books into the chosen folder", () => {
    const lib = emptyLib();
    lib.folders.push({ id: "f", name: "F", parentId: null });
    importRows(lib, "B", rows(1), "f");
    expect(lib.books[0].folderId).toBe("f");
  });
});

describe("book, tag and folder edits", () => {
  it("renaming onto an existing title merges without duplicates", () => {
    const lib = emptyLib();
    importRows(lib, "A", rows(3));
    const b = importRows(lib, "B", rows(4)).bookId;
    const survivor = renameBook(lib, b, "A");
    expect(lib.books).toHaveLength(1);
    expect(survivor).toBe(lib.books[0].id);
    expect(lib.highlights).toHaveLength(4);
  });
  it("renames and removes tags", () => {
    const lib = emptyLib();
    importRows(lib, "A", rows(2));
    lib.highlights[0].tags = ["a", "b"]; lib.highlights[1].tags = ["b"];
    renameTag(lib, "b", "a");
    expect(lib.highlights[0].tags).toEqual(["a"]);
    removeTag(lib, "a");
    expect(lib.highlights.every((h) => h.tags.length === 0)).toBe(true);
  });
  it("blocks moving a folder inside itself and moves contents up on delete", () => {
    const lib: Library = emptyLib();
    lib.folders.push({ id: "p", name: "P", parentId: null }, { id: "c", name: "C", parentId: "p" });
    importRows(lib, "B", rows(2), "c");
    expect(moveItem(lib, "folder", "p", "c")).toBe(false);
    expect(moveItem(lib, "folder", "c", null)).toBe(true);
    expect(moveItem(lib, "folder", "c", "p")).toBe(true);
    expect(booksUnder(lib, "p")).toHaveLength(1);
    deleteFolder(lib, "c");
    expect(lib.books[0].folderId).toBe("p");
    expect(lib.highlights).toHaveLength(2);
  });
});

describe("validateLib & merge", () => {
  it("repairs missing fields, broken references and strips unsafe html", () => {
    const lib = validateLib({
      books: [{ id: "b", title: "B", folderId: "missing" }],
      folders: [{ id: "f", name: "F", parentId: "gone" }],
      highlights: [{ id: "h", bookId: "b", text: "t", html: '<b>ok</b><img src=x onerror=alert(1)><script>x</script><mark class="hl-pink">p</mark>' }],
    });
    expect(lib.books[0].folderId).toBeNull();
    expect(lib.folders[0].parentId).toBeNull();
    expect(lib.highlights[0]).toMatchObject({ tags: [], note: "", readmooNote: "" });
    expect(lib.highlights[0].html).toBe('<b>ok</b>&lt;img src=x onerror=alert(1)&gt;&lt;script&gt;x&lt;/script&gt;<mark class="hl-pink">p</mark>');
  });
  it("rejects files that aren't libraries", () => {
    expect(() => validateLib({ hello: 1 })).toThrow();
  });
  it("merging the same backup twice adds nothing", () => {
    const lib = emptyLib();
    lib.folders.push({ id: "f", name: "F", parentId: null });
    importRows(lib, "A", rows(3), "f");
    lib.highlights[0].tags = ["x"];
    const copy = JSON.parse(JSON.stringify(lib));
    mergeLib(lib, copy);
    mergeLib(lib, JSON.parse(JSON.stringify(copy)));
    expect(lib.highlights).toHaveLength(3);
    expect(lib.books).toHaveLength(1);
    expect(lib.folders).toHaveLength(1);
    expect(lib.highlights[0].tags).toEqual(["x"]);
  });
});

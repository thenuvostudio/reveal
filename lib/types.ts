import type { Palette } from "./palettes";

/** One highlighted passage. `text` is Readmoo's original and never changes (it is used to spot
 *  duplicates on re-import); edits live in `html` (sanitised rich text) and `plain`. */
export interface Highlight {
  id: string;
  bookId: string;
  chapter: string;
  date: string;
  text: string;
  readmooNote: string;
  note: string;
  tags: string[];
  order?: number;
  importedAt?: string;
  html?: string;
  plain?: string;
  editedAt?: string;
}

export interface Book {
  id: string;
  title: string;
  folderId: string | null;
  createdAt?: string;
  lastImported?: string;
  bgSeed?: string;
  bgImage?: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  collapsed?: boolean;
  bgSeed?: string;
  bgImage?: string;
}

export interface Library {
  books: Book[];
  highlights: Highlight[];
  folders: Folder[];
}

export type ModeType = "random" | "all" | "book" | "folder" | "tag" | "search";
export interface Mode {
  type: ModeType;
  id: string | null;
  seed: number;
}

export type Position = "random" | "left" | "center" | "right";
export interface Settings {
  perScroll: 1 | 2 | 3 | 4;
  fontSize: number;
  position: Position;
  blur: boolean;
  cursor: string; // a cursor id, or "system"
  withinBook: "chapter" | "newest";
  theme: string; // a colour set's id, or "original" for the app's own random gradients
  customPalettes: Palette[]; // the reader's own colour sets
}

export interface Filter {
  folders: string[];
  tags: string[];
}

/** One row of a Readmoo CSV export. */
export interface CsvRow {
  chapter: string;
  date: string;
  text: string;
  readmooNote: string;
}

export interface Page {
  bookId: string;
  items: Highlight[];
}

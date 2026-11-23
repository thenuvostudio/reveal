"use client";
import { create } from "zustand";
import type { Filter, Library, Mode, Settings } from "@/lib/types";
import { emptyLib, folderById, serialize, validateLib, mergeLib } from "@/lib/library";
import { kvDel, kvGet, kvSet } from "@/lib/storage";
import { modeValid, newSeed } from "@/lib/feed";
import { CURSORS } from "@/lib/cursors";
import { ORIGINAL_ID, findPalette, validPalettes } from "@/lib/palettes";

export const DEFAULT_SETTINGS: Settings = { perScroll: 1, fontSize: 72, position: "random", blur: true, cursor: "1", withinBook: "chapter", theme: ORIGINAL_ID, customPalettes: [] };
/** Phones (the same 760 px breakpoint as the CSS) start with smaller quote text, two quotes per scroll. */
export const MOBILE_FONT_SIZE = 32;
export const MOBILE_PER_SCROLL = 2;
export const MOBILE_QUERY = "(max-width: 760px)";
export const defaultSettings = (): Settings => {
  const mobile = typeof window !== "undefined" && window.matchMedia?.(MOBILE_QUERY).matches;
  return { ...DEFAULT_SETTINGS, ...(mobile ? { fontSize: MOBILE_FONT_SIZE, perScroll: MOBILE_PER_SCROLL } : {}) };
};
const EMPTY_FILTER: Filter = { folders: [], tags: [] };

/** What the feed should do with the reader's place after the next change. */
export type Nav = { kind: "top" } | { kind: "keep" } | { kind: "keepId"; id: string | undefined };

/** Chromium's File System Access API (not in TS's DOM lib yet). */
export interface FsHandle {
  name: string;
  queryPermission(o: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(o: { mode: "readwrite" }): Promise<PermissionState>;
  createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>;
  getFile(): Promise<File>;
}
type PickerWindow = Window & {
  showSaveFilePicker?: (o: unknown) => Promise<FsHandle>;
  showOpenFilePicker?: (o: unknown) => Promise<FsHandle[]>;
};
export const fsSupported = () => typeof window !== "undefined" && "showSaveFilePicker" in window;
const pickerTypes = [{ description: "Reveal library", accept: { "application/json": [".json"] } }];

export interface AppState {
  ready: boolean;
  storageError: string | null;
  lib: Library;
  /** Bumped after every change to `lib` (which is mutated in place, like the HTML version). */
  version: number;
  settings: Settings;
  mode: Mode;
  query: string;
  modeBeforeSearch: Mode | null;
  filter: Filter;
  nav: Nav;
  navSeq: number;
  drawer: null | "settings" | "library";
  file: { handle: FsHandle | null; ok: boolean; lastSave: Date | null };
  celebrate: { added: number; dup: number; seq: number } | null;

  init(): Promise<void>;
  commit(nav?: Nav): void;
  setMode(m: { type: Mode["type"]; id?: string | null; seed?: number }): void;
  setQuery(q: string): void;
  clearSearch(): void;
  setSettings(p: Partial<Settings>): void;
  setFilter(f: Filter): void;
  setDrawer(d: AppState["drawer"]): void;
  replaceLib(lib: Library): void;
  celebrateImport(added: number, dup: number): void;
  flush(): void;
  linkNewFile(): Promise<string | null>;
  openLibraryFile(merge: (count: number) => Promise<"merge" | "replace" | null>): Promise<string | null>;
  reconnectFile(): Promise<boolean>;
  unlinkFile(): Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let dirtyForFile = false;

export const useApp = create<AppState>()((set, get) => {
  /** Keeps the current mode/filter valid after the library changed. */
  const repair = () => {
    const { lib, mode, filter } = get();
    const tagSet = new Set(lib.highlights.flatMap((h) => h.tags));
    const f: Filter = { folders: filter.folders.filter((id) => !!folderById(lib, id)), tags: filter.tags.filter((t) => tagSet.has(t)) };
    const changed = f.folders.length !== filter.folders.length || f.tags.length !== filter.tags.length;
    const m = modeValid(lib, mode, f) ? mode : { type: "random" as const, id: null, seed: newSeed() };
    if (changed || m !== mode) set({ filter: f, mode: m });
  };

  const writeFile = async () => {
    const { file, lib } = get();
    if (!file.handle || !file.ok || !dirtyForFile) return;
    try {
      const w = await file.handle.createWritable();
      await w.write(serialize(lib));
      await w.close();
      dirtyForFile = false;
      set({ file: { ...get().file, lastSave: new Date() } });
    } catch {
      set({ file: { ...get().file, ok: false } });
    }
  };

  const persist = () => {
    dirtyForFile = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      try { await kvSet("library", get().lib); } catch (e) { set({ storageError: (e as Error).message }); }
      await writeFile();
    }, 300);
  };

  return {
    ready: false,
    storageError: null,
    lib: emptyLib(),
    version: 0,
    settings: defaultSettings(),
    mode: { type: "random", id: null, seed: newSeed() },
    query: "",
    modeBeforeSearch: null,
    filter: EMPTY_FILTER,
    nav: { kind: "top" },
    navSeq: 0,
    drawer: null,
    file: { handle: null, ok: false, lastSave: null },
    celebrate: null,

    async init() {
      try {
        const st = await kvGet<Partial<Settings>>("settings");
        const settings = { ...defaultSettings(), ...(st || {}) } as Settings;
        if (!CURSORS.some((c) => c.id === settings.cursor) && settings.cursor !== "system") settings.cursor = DEFAULT_SETTINGS.cursor;
        settings.customPalettes = validPalettes(settings.customPalettes);
        if (typeof settings.theme !== "string" || !findPalette(settings.theme, settings.customPalettes)) settings.theme = ORIGINAL_ID;
        const stored = await kvGet("library");
        const lib = stored ? validateLib(stored) : emptyLib();
        let handle: FsHandle | null = null, ok = false;
        if (fsSupported()) {
          handle = (await kvGet<FsHandle>("fileHandle")) || null;
          if (handle) { try { ok = (await handle.queryPermission({ mode: "readwrite" })) === "granted"; } catch { ok = false; } }
        }
        set({ lib, settings, file: { handle, ok, lastSave: null }, ready: true, version: get().version + 1, nav: { kind: "top" }, navSeq: get().navSeq + 1 });
      } catch (e) {
        set({ ready: true, storageError: (e as Error).message });
      }
    },

    commit(nav = { kind: "keep" }) {
      repair();
      set({ version: get().version + 1, nav, navSeq: get().navSeq + 1 });
      persist();
    },

    setMode(m) {
      const s = get();
      let mode: Mode = { type: m.type, id: m.id ?? null, seed: m.type === "random" ? m.seed || newSeed() : 0 };
      if (!modeValid(s.lib, mode, s.filter)) mode = { type: "random", id: null, seed: newSeed() };
      const leavingSearch = s.mode.type === "search" && mode.type !== "search";
      set({ mode, nav: { kind: "top" }, navSeq: s.navSeq + 1, ...(leavingSearch ? { query: "", modeBeforeSearch: null } : {}) });
    },

    setQuery(q) {
      const s = get();
      const query = q.trim();
      if (query) {
        set({
          query,
          modeBeforeSearch: s.mode.type === "search" ? s.modeBeforeSearch : s.mode,
          mode: { type: "search", id: null, seed: 0 },
          nav: { kind: "top" }, navSeq: s.navSeq + 1,
        });
      } else if (s.mode.type === "search") get().clearSearch();
      else set({ query: "" });
    },

    clearSearch() {
      const s = get();
      if (s.mode.type !== "search") { if (s.query) set({ query: "" }); return; }
      const back = s.modeBeforeSearch && modeValid(s.lib, s.modeBeforeSearch, s.filter) ? s.modeBeforeSearch : { type: "random" as const, id: null, seed: newSeed() };
      set({ query: "", modeBeforeSearch: null, mode: back, nav: { kind: "top" }, navSeq: s.navSeq + 1 });
    },

    setSettings(p) {
      const settings = { ...get().settings, ...p };
      set({ settings });
      kvSet("settings", settings).catch(() => {});
    },

    setFilter(f) {
      set({ filter: { folders: [...f.folders], tags: [...f.tags] } });
      const s = get();
      const mode = modeValid(s.lib, s.mode, s.filter) ? s.mode : { type: "random" as const, id: null, seed: newSeed() };
      set({ mode, nav: { kind: "top" }, navSeq: s.navSeq + 1 });
    },

    setDrawer(d) { set({ drawer: d }); },

    replaceLib(lib) {
      set({ lib, mode: { type: "random", id: null, seed: newSeed() }, query: "", modeBeforeSearch: null, filter: EMPTY_FILTER });
      get().commit({ kind: "top" });
    },

    celebrateImport(added, dup) { set({ celebrate: { added, dup, seq: (get().celebrate?.seq || 0) + 1 } }); },

    flush() {
      if (!saveTimer) return;
      clearTimeout(saveTimer);
      saveTimer = null;
      kvSet("library", get().lib).catch(() => {});
      writeFile();
    },

    async linkNewFile() {
      const w = window as PickerWindow;
      if (!w.showSaveFilePicker) return "Auto-saving to a file needs Chrome or Edge.";
      try {
        const handle = await w.showSaveFilePicker({ suggestedName: "reveal-library.json", types: pickerTypes });
        set({ file: { handle, ok: true, lastSave: null } });
        await kvSet("fileHandle", handle).catch(() => {}); // remembering it for next time is best-effort
        dirtyForFile = true;
        await writeFile();
        return null;
      } catch (e) {
        return (e as Error).name === "AbortError" ? "" : "Couldn't link file: " + (e as Error).message;
      }
    },

    async openLibraryFile(ask) {
      const w = window as PickerWindow;
      if (!w.showOpenFilePicker) return "Opening a library file needs Chrome or Edge. Use Restore instead.";
      try {
        const [h] = await w.showOpenFilePicker({ types: pickerTypes });
        const data = validateLib(JSON.parse(await (await h.getFile()).text()));
        const cur = get().lib;
        let lib = data;
        if (cur.highlights.length) {
          const how = await ask(cur.highlights.length);
          if (!how) return "";
          if (how === "merge") { mergeLib(cur, data); lib = cur; }
        }
        let ok = false;
        try { ok = (await h.requestPermission({ mode: "readwrite" })) === "granted"; } catch { ok = false; }
        set({ file: { handle: h, ok, lastSave: null } });
        await kvSet("fileHandle", h).catch(() => {});
        get().replaceLib(lib);
        return null;
      } catch (e) {
        return (e as Error).name === "AbortError" ? "" : "Couldn't open: " + (e as Error).message;
      }
    },

    async reconnectFile() {
      const { handle } = get().file;
      if (!handle) return false;
      try {
        const ok = (await handle.requestPermission({ mode: "readwrite" })) === "granted";
        set({ file: { ...get().file, ok } });
        if (ok) { dirtyForFile = true; await writeFile(); }
        return ok;
      } catch { return false; }
    },

    async unlinkFile() {
      set({ file: { handle: null, ok: false, lastSave: null } });
      await kvDel("fileHandle").catch(() => {});
    },
  };
});


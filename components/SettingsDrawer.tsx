"use client";
import { useMemo, useRef } from "react";
import { useApp } from "@/store/app";
import { useFeedPos } from "@/store/feedPos";
import { bookById, folderById, hlById } from "@/lib/library";
import { cls, effectiveImage, rerollSeed } from "@/lib/colors";
import { BUILTIN_PALETTES, ORIGINAL_ID, drawerVars, findPalette } from "@/lib/palettes";
import { modeHighlights, positionOf } from "@/lib/feed";
import { disp } from "@/lib/text";
import { CURSORS } from "@/lib/cursors";
import type { Book, Folder, Settings } from "@/lib/types";
import { bus } from "./bus";
import { toast } from "./toast";
import { deletePaletteFlow, openPaletteDialog } from "./PaletteDialog";
import { useDrawerFocus } from "./useDrawerFocus";

/** On phones the full-screen Settings drawer is tinted with the "Stone" set (see the phone block in globals.css). */
const PHONE_COLORS = drawerVars("stone");

function Seg<T extends string | number>({ id, value, options, onPick }: { id: string; value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="seg" id={id} role="radiogroup">
      {options.map(([v, l]) => <button key={String(v)} data-v={v} role="radio" aria-checked={v === value} className={v === value ? "on" : ""} onClick={() => onPick(v)}>{l}</button>)}
    </div>
  );
}

export default function SettingsDrawer() {
  const open = useApp((s) => s.drawer === "settings");
  const asideRef = useRef<HTMLElement>(null);
  useDrawerFocus(open, asideRef, "#setBtn");
  const settings = useApp((s) => s.settings);
  const lib = useApp((s) => s.lib);
  const version = useApp((s) => s.version);
  const mode = useApp((s) => s.mode);
  const filter = useApp((s) => s.filter);
  const query = useApp((s) => s.query);
  const pageIds = useFeedPos((s) => s.pageIds);
  const bookId = useFeedPos((s) => s.bookId);
  const set = (p: Partial<Settings>) => useApp.getState().setSettings(p);
  const b = bookById(lib, bookId);
  const f = b ? folderById(lib, b.folderId) : undefined;

  // mini preview: the quotes of the current scroll (or the next ones if the page size changes)
  const miniQuotes = useMemo(() => {
    if (!pageIds.length) return [];
    const list = modeHighlights({ lib, mode, filter, settings, query });
    const at = list.findIndex((h) => h.id === pageIds[0]);
    return at >= 0 ? list.slice(at, at + settings.perScroll) : pageIds.map((id) => hlById(lib, id)).filter(Boolean);
  }, [pageIds, lib, version, mode, filter, settings, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const scale = 356 / Math.max(1, typeof window !== "undefined" ? window.innerWidth : 1440);
  const bgRow = (kind: "b" | "f", ent: Book | Folder, who: React.ReactNode) => {
    const c = kind === "b" ? "bgb-" + cls(ent.id) : "bgf-" + cls(ent.id);
    const reroll = () => { ent.bgSeed = rerollSeed(kind, ent, findPalette(settings.theme, settings.customPalettes)); useApp.getState().commit(); };
    const remove = () => { delete ent.bgImage; useApp.getState().commit(); toast("Image removed"); };
    return (
      <div className="bgrow" data-kind={kind}>
        <div className="who">{who}</div>
        <div className={`bgsw ${c}`} />
        <button className="dbtn" data-bg="reroll" data-kind={kind} onClick={reroll}>🎲 New colour</button>
        <button className="dbtn" data-bg="upload" data-kind={kind} onClick={() => bus.pickImage?.({ kind, id: ent.id })}>🖼 {ent.bgImage ? "Change image" : "Upload image"}</button>
        {ent.bgImage && <button className="dbtn" data-bg="remove" data-kind={kind} onClick={remove}>✕ Remove image</button>}
      </div>
    );
  };

  return (
    <aside className={`drawer right ${open ? "open" : ""}`} id="settings" ref={asideRef} inert={!open} style={PHONE_COLORS} aria-label="Settings" aria-hidden={!open} data-testid="settings">
      <div className="dh"><h2>Settings</h2><button className="x" data-close aria-label="Close settings" onClick={() => useApp.getState().setDrawer(null)}>×</button></div>
      {open && (
        <div className="db" id="setBody">
          <div className={`mini ${b ? "bgb-" + cls(b.id) : "bg-default"} ${effectiveImage(lib, b) ? "img" : ""}`} id="mini" data-testid="mini-preview">
            {miniQuotes.map((h) => {
              const hb = bookById(lib, h!.bookId);
              return (
                <div key={h!.id} className={`ms ${positionOf(h!, settings.position)}`}>
                  <div className="mq" style={{ fontSize: Math.max(5, settings.fontSize * scale * Math.min(1, 2.2 / settings.perScroll)) }}>“{disp(h!).split("\n")[0].slice(0, 28)}”</div>
                  <div className="ma">—— {hb?.title}{h!.chapter ? " · Ch. " + h!.chapter : ""}</div>
                </div>
              );
            })}
            <span className="mbar" />
          </div>
          <div className="mini-cap">Live preview of one scroll</div>

          <div className="field">
            <div className="lbl">Quotes per scroll <span>{settings.perScroll === 1 ? "1 quote fills the screen" : settings.perScroll + " quotes stacked"}</span></div>
            <Seg id="segN" value={settings.perScroll} options={[[1, "1"], [2, "2"], [3, "3"], [4, "4"]]} onPick={(v) => set({ perScroll: v as Settings["perScroll"] })} />
          </div>
          <div className="field">
            <div className="lbl">Quote font size <span id="fsLbl">{settings.fontSize}px</span></div>
            <input type="range" id="fs" min={28} max={120} step={2} value={settings.fontSize} aria-label="Quote font size" onChange={(e) => set({ fontSize: +e.target.value })} />
            <div className="help">This is the largest size. A long quote shrinks just enough to fit its space, so nothing gets cut off.</div>
          </div>
          <div className="field">
            <div className="lbl">Quote position</div>
            <Seg id="segP" value={settings.position} options={[["random", "Random"], ["left", "Left"], ["center", "Middle"], ["right", "Right"]]} onPick={(v) => set({ position: v })} />
          </div>
          <div className="field">
            <div className="lbl">Order inside a book <span>when viewing a book, folder or All</span></div>
            <Seg id="segO" value={settings.withinBook} options={[["chapter", "Reading order"], ["newest", "Newest first"]]} onPick={(v) => set({ withinBook: v })} />
          </div>
          <label className="field toggle"><span>Blur quotes between pages</span><input type="checkbox" id="blurT" checked={settings.blur} onChange={(e) => set({ blur: e.target.checked })} /></label>
          <div className="field">
            <div className="lbl">Colour theme <span>{settings.theme === ORIGINAL_ID ? "a random gradient for every book" : "each book gets one colour of the set"}</span></div>
            <div className="themegrid" id="themes">
              <div className="themecard">
                <button className={`themeopt ${settings.theme === ORIGINAL_ID ? "on" : ""}`} data-theme={ORIGINAL_ID} aria-pressed={settings.theme === ORIGINAL_ID} onClick={() => set({ theme: ORIGINAL_ID })}>
                  <span className="strip"><i style={{ background: "linear-gradient(90deg,#b0406f,#7a4bb0,#2f6f9f,#1f7a6a,#a8632e)" }} /></span><span className="tn">Original</span>
                </button>
              </div>
              {[...BUILTIN_PALETTES.map((p) => ({ p, custom: false })), ...settings.customPalettes.map((p) => ({ p, custom: true }))].map(({ p, custom }) => (
                <div className="themecard" key={p.id}>
                  <button className={`themeopt ${settings.theme === p.id ? "on" : ""}`} data-theme={p.id} aria-pressed={settings.theme === p.id} title={p.colors.join("  ")} onClick={() => set({ theme: p.id })}>
                    <span className="strip">{p.colors.map((c, i) => <i key={i} style={{ background: c }} />)}</span><span className="tn">{p.name}</span>
                  </button>
                  {custom && (
                    <span className="themeacts">
                      <button data-theme-edit={p.id} title="Edit this set" aria-label={`Edit ${p.name}`} onClick={() => openPaletteDialog(p)}>✎</button>
                      <button data-theme-del={p.id} title="Delete this set" aria-label={`Delete ${p.name}`} onClick={() => deletePaletteFlow(p)}>✕</button>
                    </span>
                  )}
                </div>
              ))}
            </div>
            <button className="dbtn" data-theme-new style={{ marginTop: 8 }} onClick={() => openPaletteDialog()}>＋ New colour set</button>
            <div className="help">A theme colours every book and folder that has no image of its own. “🎲 New colour” below moves a book to another colour of the set.</div>
          </div>
          <div className="field">
            <div className="lbl">Background</div>
            {b ? bgRow("b", b, <>Book · <b>{b.title}</b></>) : <div className="help">Import a book to set backgrounds.</div>}
            {f && bgRow("f", f, <>Folder · <b>{f.name}</b> <span style={{ color: "var(--ink-3)" }}>(its image shows for books in it that have no image of their own)</span></>)}
            <div className="help">Each book and folder gets its own gradient. Uploaded images are shrunk to about 1920px and saved in your library.</div>
          </div>
          <div className="field">
            <div className="lbl">Cursor</div>
            <div className="curgrid">
              {CURSORS.map((c) => (
                <button key={c.id} className={`curopt ${settings.cursor === c.id ? "on" : ""}`} data-cur={c.id} title={c.name} onClick={() => set({ cursor: c.id })}>
                  <img src={c.c32} alt="" /><span>{c.name}</span>
                </button>
              ))}
              <button className={`curopt ${settings.cursor === "system" ? "on" : ""}`} data-cur="system" onClick={() => set({ cursor: "system" })}><span className="sys">↖</span><span>System arrow</span></button>
            </div>
          </div>
          <div className="field">
            <div className="lbl">Shortcuts</div>
            <div className="keys">
              <kbd>↓</kbd> <kbd>Space</kbd> next page · <kbd>↑</kbd> previous · <kbd>/</kbd> search · <kbd>B</kbd> open the ruler<br />
              In the ruler: scroll or <kbd>←</kbd> <kbd>→</kbd> to move, <kbd>Enter</kbd> to open, <kbd>Esc</kbd> to close
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

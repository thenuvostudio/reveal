"use client";
import { useMemo } from "react";
import { useApp } from "@/store/app";
import { useFeedPos } from "@/store/feedPos";
import { bookById, folderById, hlById } from "@/lib/library";
import { cls, effectiveImage } from "@/lib/colors";
import { modeHighlights, positionOf } from "@/lib/feed";
import { disp } from "@/lib/text";
import { CURSORS } from "@/lib/cursors";
import type { Book, Folder, Settings } from "@/lib/types";
import { bus } from "./bus";
import { toast } from "./toast";

function Seg<T extends string | number>({ id, value, options, onPick }: { id: string; value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="seg" id={id} role="radiogroup">
      {options.map(([v, l]) => <button key={String(v)} data-v={v} role="radio" aria-checked={v === value} className={v === value ? "on" : ""} onClick={() => onPick(v)}>{l}</button>)}
    </div>
  );
}

export default function SettingsDrawer() {
  const open = useApp((s) => s.drawer === "settings");
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
    const reroll = () => { ent.bgSeed = Math.random().toString(36).slice(2, 8); useApp.getState().commit(); };
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
    <aside className={`drawer right ${open ? "open" : ""}`} id="settings" aria-label="Settings" aria-hidden={!open} data-testid="settings">
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
            <div className="lbl">Background</div>
            {b ? bgRow("b", b, <>Book · <b>{b.title}</b></>) : <div className="help">Import a book to set backgrounds.</div>}
            {f && bgRow("f", f, <>Folder · <b>{f.name}</b> <span style={{ color: "var(--ink-3)" }}>(its image shows for books in it that have no image of their own)</span></>)}
            <div className="help">Each book and folder gets its own random gradient. Uploaded images are shrunk to about 1920px and saved in your library.</div>
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

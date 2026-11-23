"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApp } from "@/store/app";
import { folderById } from "@/lib/library";
import { bus } from "./bus";
import { toast } from "./toast";
import FilterPanel from "./FilterPanel";

const ICON = "./icon.svg";

export default function TopBar() {
  const mode = useApp((s) => s.mode);
  const query = useApp((s) => s.query);
  const filter = useApp((s) => s.filter);
  const lib = useApp((s) => s.lib);
  const version = useApp((s) => s.version);
  const file = useApp((s) => s.file);
  const drawer = useApp((s) => s.drawer);
  const [text, setText] = useState(query);
  const [sopen, setSopen] = useState(false);
  const [layout, setLayout] = useState<{ compact: boolean; tiny: boolean; w: number }>({ compact: false, tiny: false, w: 512 });
  const [filterOpen, setFilterOpen] = useState(false);
  const topRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLButtonElement>(null);
  const diceRef = useRef<SVGSVGElement>(null);
  const searchT = useRef<ReturnType<typeof setTimeout> | null>(null);

  // the store can clear the search (dice, All, ruler…): mirror it
  useEffect(() => { if (!query) setText(""); }, [query]);

  /* keep the centred bar clear of the buttons on both sides */
  const measure = useCallback(() => {
    const top = topRef.current; if (!top) return;
    const extra = 3 * 40 + 3 * 8; // filter, dice, All
    const calc = () => {
      const left = (brandRef.current?.getBoundingClientRect().right ?? 0) + 14;
      const right = innerWidth - (importRef.current?.getBoundingClientRect().left ?? innerWidth) + 14;
      return innerWidth - 2 * Math.max(left, right);
    };
    top.classList.remove("compact", "tiny");
    let avail = calc(), compact = false, tiny = false;
    if (avail - extra < 280) { compact = true; top.classList.add("compact"); avail = calc(); }
    if (avail - extra < 180) tiny = true;
    // leave the classes exactly as React will render them
    top.classList.toggle("compact", compact || tiny);
    top.classList.toggle("tiny", tiny);
    setLayout({ compact, tiny, w: Math.min(440 + extra, avail) });
  }, []);
  useLayoutEffect(() => { measure(); }, [measure, lib.highlights.length]);
  useEffect(() => { addEventListener("resize", measure); return () => removeEventListener("resize", measure); }, [measure]);

  useEffect(() => {
    bus.focusSearch = () => { if (layout.tiny) setSopen(true); setTimeout(() => inputRef.current?.focus(), 0); };
    return () => { bus.focusSearch = undefined; };
  }, [layout.tiny]);

  const onInput = (v: string) => {
    setText(v);
    if (searchT.current) clearTimeout(searchT.current);
    searchT.current = setTimeout(() => useApp.getState().setQuery(v), 180);
  };
  const clear = () => { if (searchT.current) clearTimeout(searchT.current); setText(""); useApp.getState().clearSearch(); };

  const dice = () => {
    const again = useApp.getState().mode.type === "random";
    diceRef.current?.animate([{ transform: "rotate(0)" }, { transform: "rotate(-200deg) scale(.85)" }, { transform: "rotate(-360deg)" }], { duration: 480, easing: "cubic-bezier(.3,.9,.4,1)" });
    clear();
    useApp.getState().setMode({ type: "random" });
    toast(again ? "🎲 Reshuffled" : "🎲 Random mix from every category");
  };
  const all = () => { clear(); useApp.getState().setMode({ type: "all" }); };

  const nFilter = filter.folders.length + filter.tags.length;
  const filterTitle = nFilter
    ? "Filter on: " + [...filter.folders.map((id) => folderById(lib, id)?.name), ...filter.tags.map((t) => "#" + t)].filter(Boolean).join(", ")
    : "Filter by folder or tag";
  void version;
  const searching = !!text;
  const dot = file.handle ? (file.ok ? "on" : "warn") : "";
  const brandTitle = "Library: books, folders, tags, backup" + (file.handle ? (file.ok ? ` · auto-saving to ${file.handle.name}` : ` · click to reconnect ${file.handle.name}`) : "");
  const toggleLibrary = () => useApp.getState().setDrawer(drawer === "library" ? null : "library");
  const cls = ["top", layout.compact ? "compact" : "", layout.tiny ? "tiny compact" : "", searching ? "searching" : "", sopen ? "sopen" : ""].join(" ");

  return (
    <header className={cls} id="top" ref={topRef} style={{ ["--sw" as string]: layout.w + "px" }}>
      <div className="brand" id="brandBtn" ref={brandRef} role="button" tabIndex={0} title={brandTitle} aria-label="Reveal: open library"
        onClick={toggleLibrary} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleLibrary(); } }}>
        <span className="logowrap"><img src={ICON} alt="" className="logo" /><span className={`dot ${dot}`} id="fileDot" data-testid="file-dot" /></span>
        <span className="name">Reveal.</span>
      </div>
      <div className="centerbar" id="centerBar">
        <button className="bare" id="searchBtn" title="Search (/)" aria-label="Search" onClick={() => { setSopen(true); setTimeout(() => inputRef.current?.focus(), 0); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeLinecap="round"><circle cx="10.2" cy="10.2" r="6.9" strokeWidth="3.2" /><path d="m15.6 15.6 5.6 5.6" strokeWidth="3.6" /></svg>
        </button>
        <div className="searchwrap" id="searchWrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input className="searchbox" id="search" ref={inputRef} type="search" placeholder="Search highlights, notes, tags…  ( / )" autoComplete="off" aria-label="Search"
            value={text} onChange={(e) => onInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); clear(); inputRef.current?.blur(); } if (e.key === "Enter") inputRef.current?.blur(); }}
            onBlur={() => { if (!inputRef.current?.value.trim()) setSopen(false); }} />
          <button className="sclear" id="sclear" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => { clear(); inputRef.current?.focus(); }}>×</button>
        </div>
        <button className={`bare ${nFilter ? "on" : ""}`} id="filterBtn" title={filterTitle} aria-label="Filter" aria-expanded={filterOpen}
          onClick={() => setFilterOpen((o) => !o)}>
          <svg viewBox="0 0 24 24"><path d="M3.2 4.2h17.6c.9 0 1.4 1 .8 1.7l-6.4 7.6v5.6c0 .5-.3.9-.7 1.1l-3.2 1.6c-.7.3-1.5-.2-1.5-1v-7.3L3.4 5.9c-.6-.7-.1-1.7.8-1.7z" fill="#fff" /></svg>
          <span className="fbadge" id="filterBadge">{nFilter || ""}</span>
        </button>
        <button className={`bare ${mode.type === "random" ? "on" : ""}`} id="diceBtn" title="Random: a fresh mix from every category" aria-label="Random" onClick={dice}>
          <svg viewBox="0 0 24 24" ref={diceRef}><rect x="2" y="2" width="20" height="20" rx="5.5" fill="#fff" /><g fill="#2b2622"><circle cx="7.6" cy="7.6" r="1.9" /><circle cx="16.4" cy="7.6" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="7.6" cy="16.4" r="1.9" /><circle cx="16.4" cy="16.4" r="1.9" /></g></svg>
        </button>
        <button className={`bare ${mode.type === "all" ? "on" : ""}`} id="allBtn" title="All: every quote, book by book" aria-label="All quotes" onClick={all}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round"><rect x="3" y="4" width="4.2" height="16" rx="1" /><rect x="8.6" y="6.5" width="4.2" height="13.5" rx="1" /><path d="m14.6 7.4 3.9-1.1 3.4 12.9-3.9 1.1z" /><path d="M4.5 8h1.2M10.1 10.5h1.2" /></svg>
        </button>
      </div>
      <div className="sp" />
      <button className="bare" id="importBtn" ref={importRef} title="Import Readmoo CSV" aria-label="Import CSV" onClick={() => bus.pickCSV?.()}>
        <svg viewBox="0 0 24 24"><path d="M10.5 6v16M2.5 14h16" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" /><path className="spk1" d="M20 .6l.95 2.45L23.4 4l-2.45.95L20 7.4l-.95-2.45L16.6 4l2.45-.95z" fill="#fff" /><path className="spk2" d="M23 8.6l.45 1.05 1.05.45-1.05.45-.45 1.05-.45-1.05-1.05-.45 1.05-.45z" fill="#fff" /></svg>
      </button>
      <button className="bare" id="setBtn" title="Settings" aria-label="Settings" onClick={() => useApp.getState().setDrawer(drawer === "settings" ? null : "settings")}>
        <svg viewBox="0 0 24 24"><g fill="#fff">{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <rect key={a} x="9.9" y="0.9" width="4.2" height="5.4" rx="1.3" transform={`rotate(${a} 12 12)`} />)}<circle cx="12" cy="12" r="7.6" /></g><circle cx="12" cy="12" r="2.9" fill="#2b2622" /></svg>
      </button>
      {filterOpen && <FilterPanel onClose={() => setFilterOpen(false)} />}
    </header>
  );
}

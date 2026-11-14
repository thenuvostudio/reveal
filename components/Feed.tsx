"use client";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/store/app";
import { useFeedPos } from "@/store/feedPos";
import { buildPages, modeHighlights, positionOf } from "@/lib/feed";
import { bookById, folderById, hlById } from "@/lib/library";
import { cls, effectiveImage } from "@/lib/colors";
import { disp, hilite, terms } from "@/lib/text";
import { hiliteHTML } from "@/lib/richtext";
import type { Highlight } from "@/lib/types";
import { bus } from "./bus";
import { QuoteActions } from "./QuoteActions";

/** Shrinks a quote's font until it fits its slot (the setting is the maximum size). */
function fitSlot(slot: HTMLElement, max: number) {
  const q = slot.querySelector<HTMLElement>(".quote");
  const attr = slot.querySelector<HTMLElement>(".attr");
  if (!q || !attr) return;
  const cs = getComputedStyle(slot);
  const avail = slot.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - attr.offsetHeight - 24;
  let lo = 14, hi = max;
  q.style.fontSize = hi + "px";
  if (q.offsetHeight <= avail) return;
  for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; q.style.fontSize = mid + "px"; if (q.offsetHeight <= avail) lo = mid; else hi = mid; }
  q.style.fontSize = Math.floor(lo) + "px";
}

interface SlotProps { h: Highlight; title: string; folder: string; pos: string; selected: boolean; ts: string[]; contentKey: string }
const Slot = memo(function Slot({ h, title, folder, pos, selected, ts }: SlotProps) {
  const content = h.html ? hiliteHTML(h.html, ts) : hilite(h.text, ts);
  const trunc = /(\.\.\.|…)$/.test(disp(h));
  const Dot = () => <span className="dot">·</span>;
  return (
    <div className={`slot ${pos} ${selected ? "sel" : ""}`} data-id={h.id}>
      <div className="qwrap">
        <p className="quote" data-testid="quote"><span className="qm">“</span><span dangerouslySetInnerHTML={{ __html: content }} /><span className="qm">”</span></p>
        <div className="attr">
          <span className="dash">——</span><span className="bk">{title}</span>
          {folder && <><Dot /><span>{folder}</span></>}
          {h.chapter && <><Dot /><span>Ch. {h.chapter}</span></>}
          {h.date && <><Dot /><span>{h.date}</span></>}
          {h.html && <><Dot /><span>edited</span></>}
          {(h.note || h.readmooNote) && <span className="has-note" title="Has a note">✎</span>}
          {trunc && <span className="trunc" title="Readmoo cuts long highlights in its CSV export">truncated by Readmoo</span>}
        </div>
        {selected && <QuoteActions h={h} />}
      </div>
    </div>
  );
});

export default function Feed() {
  const version = useApp((s) => s.version);
  const lib = useApp((s) => s.lib);
  const mode = useApp((s) => s.mode);
  const filter = useApp((s) => s.filter);
  const settings = useApp((s) => s.settings);
  const query = useApp((s) => s.query);
  const feedRef = useRef<HTMLElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const cur = useRef(0);
  const lastNavSeq = useRef(-1);
  const forcePos = useRef(false);
  const visible = useRef(new Set<Element>());
  const fitIO = useRef<IntersectionObserver | null>(null);
  const visIO = useRef<IntersectionObserver | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo(() => modeHighlights({ lib, mode, filter, settings, query }), [version, mode, filter, settings.withinBook, query]);
  const pages = useMemo(() => buildPages(list, mode, settings.perScroll), [list, mode, settings.perScroll]);
  const ts = useMemo(() => (mode.type === "search" ? terms(query) : []), [mode.type, query]);

  const fitKey = useCallback(() => {
    const el = feedRef.current!;
    const st = useApp.getState();
    return `${st.settings.fontSize}|${st.settings.perScroll}|${st.settings.position}|${el.clientWidth}|${el.clientHeight}|${st.version}`;
  }, []);
  const fitPage = useCallback((page: Element) => {
    const el = page as HTMLElement, k = fitKey();
    if (el.dataset.fit === k) return;
    el.dataset.fit = k;
    const max = useApp.getState().settings.fontSize;
    el.querySelectorAll<HTMLElement>(".slot[data-id]").forEach((s) => fitSlot(s, max));
  }, [fitKey]);
  const fitAround = useCallback((i: number) => {
    const el = feedRef.current; if (!el) return;
    for (let k = i - 2; k <= i + 2; k++) { const p = el.children[k]; if (p && p.classList.contains("page")) fitPage(p); }
  }, [fitPage]);

  const onScroll = useCallback(() => {
    const el = feedRef.current; if (!el) return;
    const ph = el.clientHeight || 1;
    const n = el.querySelectorAll(".page[data-pi]").length;
    const i = Math.max(0, Math.min(n - 1, Math.round(el.scrollTop / ph)));
    const blur = useApp.getState().settings.blur;
    visible.current.forEach((pg) => pg.querySelectorAll<HTMLElement>(".slot").forEach((s) => {
      const r = s.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, Math.min(r.bottom, ph - 70) - Math.max(r.top, 60)) / Math.max(1, Math.min(r.height, ph - 130)));
      s.style.filter = blur && f < 0.98 ? `blur(${((1 - f) * 12).toFixed(1)}px)` : "";
      s.style.opacity = blur && f < 0.98 ? (0.35 + 0.65 * f).toFixed(2) : "";
    }));
    fitAround(i);
    const changed = i !== cur.current;
    if (changed || forcePos.current) {
      forcePos.current = false;
      if (changed) setSel(null);
      cur.current = i;
      const pageEl = el.children[i] as HTMLElement | undefined;
      const ids = pageEl ? [...pageEl.querySelectorAll<HTMLElement>(".slot[data-id]")].map((s) => s.dataset.id!) : [];
      const first = ids[0] ? hlById(useApp.getState().lib, ids[0]) : undefined;
      useFeedPos.setState({ page: i, bookId: first?.bookId ?? null, firstId: first?.id ?? null, pageIds: ids });
    }
  }, [fitAround]);

  // observers: fit pages as they come near, track which are visible for the blur
  useEffect(() => {
    const el = feedRef.current!;
    fitIO.current = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) fitPage(e.target); }), { root: el, rootMargin: "150% 0px" });
    visIO.current = new IntersectionObserver((es) => { es.forEach((e) => (e.isIntersecting ? visible.current.add(e.target) : visible.current.delete(e.target))); onScroll(); }, { root: el });
    const onS = () => requestAnimationFrame(onScroll);
    el.addEventListener("scroll", onS, { passive: true });
    return () => { el.removeEventListener("scroll", onS); fitIO.current?.disconnect(); visIO.current?.disconnect(); };
  }, [fitPage, onScroll]);

  // after the pages change: place the reader (top / keep / a given highlight), then fit and observe
  useLayoutEffect(() => {
    const el = feedRef.current; if (!el) return;
    document.documentElement.style.setProperty("--ph", el.clientHeight + "px");
    const { nav, navSeq } = useApp.getState();
    const fresh = navSeq !== lastNavSeq.current;
    lastNavSeq.current = navSeq;
    const find = (id: string | null | undefined) => (id ? pages.findIndex((p) => p.items.some((h) => h.id === id)) : -1);
    const old = cur.current;
    let target: number;
    if (fresh && nav.kind === "top") target = 0;
    else if (fresh && nav.kind === "keepId") { const i = find(nav.id); target = i >= 0 ? i : Math.min(old, pages.length - 1); }
    else { const i = find(useFeedPos.getState().firstId); target = i >= 0 ? i : Math.min(old, pages.length - 1); }
    target = Math.max(0, target);
    if (target !== old) setSel(null);
    cur.current = target;
    forcePos.current = true; // refresh the reader's position even if the page index is unchanged
    el.scrollTop = target * el.clientHeight;
    fitIO.current?.disconnect(); visIO.current?.disconnect(); visible.current.clear();
    el.querySelectorAll(".page").forEach((p) => { fitIO.current?.observe(p); visIO.current?.observe(p); });
    fitAround(target);
    onScroll();
  }, [pages, fitAround, onScroll]);

  // settings that change sizes but not the pages: refit what's on screen
  useLayoutEffect(() => { const el = feedRef.current; if (el) { fitAround(cur.current); onScroll(); } }, [settings.fontSize, settings.position, settings.blur, fitAround, onScroll]);

  // window size changes
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onR = () => { clearTimeout(t); t = setTimeout(() => {
      const el = feedRef.current; if (!el) return;
      const keep = cur.current;
      document.documentElement.style.setProperty("--ph", el.clientHeight + "px");
      el.scrollTop = keep * el.clientHeight;
      fitAround(keep); onScroll();
    }, 80); };
    addEventListener("resize", onR);
    return () => { removeEventListener("resize", onR); clearTimeout(t); };
  }, [fitAround, onScroll]);

  // handles for keyboard shortcuts
  useEffect(() => {
    bus.goPage = (d) => {
      const el = feedRef.current; if (!el) return;
      const n = el.querySelectorAll(".page[data-pi]").length; if (!n) return;
      const i = d === "first" ? 0 : d === "last" ? n - 1 : Math.max(0, Math.min(n - 1, cur.current + d));
      el.scrollTo({ top: i * el.clientHeight, behavior: "smooth" });
    };
    bus.deselect = () => setSel(null);
    return () => { bus.goPage = undefined; bus.deselect = undefined; };
  }, []);

  const onClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest(".qa")) return;
    const slot = t.closest<HTMLElement>(".slot[data-id]");
    const hit = slot && t.closest(".qwrap");
    if (hit) setSel((s) => (s === slot!.dataset.id ? null : slot!.dataset.id!));
    else setSel(null);
  };

  const emptyMsg = mode.type === "search"
    ? <>No highlights match “{query}”<small>Try fewer or different words. Press Esc to go back.</small></>
    : <>Nothing here yet<small>{mode.type === "tag" ? "No highlights carry this tag any more." : "This book or folder has no highlights."}</small></>;

  return (
    <main id="feed" ref={feedRef} tabIndex={-1} aria-label="Highlights" onClick={onClick}>
      {pages.length ? pages.map((p, pi) => {
        const b = bookById(lib, p.bookId);
        return (
          <section key={p.items.map((h) => h.id).join("|")} className={`page bgb-${cls(p.bookId)} ${effectiveImage(lib, b) ? "img" : ""}`} data-pi={pi}>
            {p.items.map((h) => {
              const hb = bookById(lib, h.bookId);
              const f = hb ? folderById(lib, hb.folderId) : undefined;
              return <Slot key={h.id} h={h} title={hb?.title ?? ""} folder={f?.name ?? ""} pos={positionOf(h, settings.position)} selected={sel === h.id} ts={ts}
                contentKey={`${version}`} />;
            })}
            {Array.from({ length: Math.max(0, settings.perScroll - p.items.length) }, (_, i) => <div key={"e" + i} className="slot" />)}
          </section>
        );
      }) : <section className="page bg-default"><div className="empty-msg">{emptyMsg}</div></section>}
    </main>
  );
}

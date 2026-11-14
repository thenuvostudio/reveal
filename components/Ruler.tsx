"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/store/app";
import { useFeedPos } from "@/store/feedPos";
import { rulerItems, type RulerItem } from "@/lib/feed";
import { bookById } from "@/lib/library";
import { bus } from "./bus";
import { toast } from "./toast";

const SETTLE_MS = 450; // after the last scroll step, wait this long before loading the new selection
const mod = (a: number, m: number) => ((a % m) + m) % m;

/** Bottom bar (book title + bookmark tab) and the endless, inverted ruler. */
export default function Ruler() {
  const version = useApp((s) => s.version);
  const lib = useApp((s) => s.lib);
  const filter = useApp((s) => s.filter);
  const mode = useApp((s) => s.mode);
  const bookId = useFeedPos((s) => s.bookId);
  const items: RulerItem[] = useMemo(() => rulerItems(lib, filter), [version, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const [W, setW] = useState(() => window.innerWidth);
  const [open, setOpen] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const rulerRef = useRef<HTMLDivElement>(null);
  const tapeRef = useRef<HTMLDivElement>(null);
  const tintRef = useRef<HTMLDivElement>(null);
  const bmRef = useRef<HTMLButtonElement>(null);
  const vp = useRef(0);
  const settleT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverLock = useRef(false);
  const lockPos = useRef({ x: -99, y: -99 });
  const lastPtr = useRef({ x: -99, y: -99 });
  const drag = useRef<{ x: number; acc: number; moved: boolean } | null>(null);
  const wheelAcc = useRef(0);
  const state = useRef({ open: false, engaged: false });
  state.current = { open, engaged };

  const n = Math.max(1, items.length);
  const itemW = Math.max(W < 600 ? 120 : 140, W / n);
  const side = Math.ceil((W / 2 + itemW * 8) / (n * itemW));
  const copies = side * 2 + 1;
  const geo = useRef({ n, itemW, copies, items });
  geo.current = { n, itemW, copies, items };

  const curIndex = () => mod(vp.current, geo.current.n);
  const modeIndex = useCallback(() => {
    const m = useApp.getState().mode;
    return geo.current.items.findIndex((it) => it.type === m.type && (it.id ?? null) === (m.id ?? null));
  }, []);

  const place = useCallback((anim: boolean) => {
    const tape = tapeRef.current; if (!tape) return;
    const { itemW: w, items: its } = geo.current;
    tape.classList.toggle("anim", anim);
    tape.style.transform = `translateX(${-(vp.current * w + w / 2)}px)`;
    tape.querySelector(".tick.cur")?.classList.remove("cur");
    tape.children[vp.current]?.classList.add("cur");
    const it = its[curIndex()], tint = tintRef.current;
    if (tint) { tint.className = "rtint " + (it?.cls || ""); tint.style.backgroundImage = it?.sw || ""; }
  }, []);
  const normalize = useCallback(() => {
    const { n: nn, copies: cc } = geo.current, ms = Math.floor(cc / 2) * nn;
    if (vp.current < ms || vp.current >= ms + nn) { vp.current = ms + mod(vp.current - ms, nn); place(false); void tapeRef.current?.offsetWidth; }
  }, [place]);
  const setIndex = useCallback((i: number, anim = true) => {
    if (i < 0) return;
    normalize();
    const nn = geo.current.n;
    let d = mod(i - curIndex(), nn); if (d > nn / 2) d -= nn;
    if (d) { vp.current += d; place(anim); } else place(false);
  }, [normalize, place]);
  const syncToMode = useCallback(() => { const i = modeIndex(); if (i >= 0) setIndex(i, false); }, [modeIndex, setIndex]);

  /** Loads whatever the needle is on (skips empty items). */
  const settle = useCallback(() => {
    if (settleT.current) clearTimeout(settleT.current);
    settleT.current = null;
    const it = geo.current.items[curIndex()];
    if (!it || !it.count) return;
    const m = useApp.getState().mode;
    if (it.type === m.type && (it.id ?? null) === (m.id ?? null)) return;
    useApp.getState().setMode({ type: it.type, id: it.id });
  }, []);
  const scheduleSettle = useCallback(() => { if (settleT.current) clearTimeout(settleT.current); settleT.current = setTimeout(settle, SETTLE_MS); }, [settle]);
  const step = useCallback((d: number) => { normalize(); vp.current += d; place(true); scheduleSettle(); }, [normalize, place, scheduleSettle]);

  const activate = useCallback(() => {
    if (!useApp.getState().lib.highlights.length) return;
    hoverLock.current = false; setOpen(true); setEngaged(true);
  }, []);
  const close = useCallback(() => {
    if (settleT.current) settle();
    setOpen(false); setEngaged(false);
    hoverLock.current = true; lockPos.current = { ...lastPtr.current };
    requestAnimationFrame(syncToMode);
  }, [settle, syncToMode]);
  const choose = useCallback(() => {
    const it = geo.current.items[curIndex()]; if (!it) return;
    if (!it.count) { toast(`“${it.label}” has no highlights yet`); return; }
    settle(); close();
  }, [settle, close]);

  // rebuild position when the items or the width change
  useLayoutEffect(() => { vp.current = side * n + Math.max(0, modeIndex()); place(false); }, [items, W, side, n, modeIndex, place]);
  // follow mode changes made elsewhere (dice, All, library, search…)
  useEffect(() => { if (!settleT.current) syncToMode(); }, [mode, syncToMode]);

  useEffect(() => {
    const onR = () => setW(window.innerWidth);
    const onMove = (e: PointerEvent) => { lastPtr.current = { x: e.clientX, y: e.clientY }; };
    const onDown = (e: MouseEvent) => {
      if (!state.current.open) return;
      const t = e.target as Node;
      if (rulerRef.current?.contains(t) || bmRef.current?.contains(t)) return;
      close();
    };
    const onUp = () => setTimeout(() => { drag.current = null; }, 0);
    addEventListener("resize", onR);
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerup", onUp);
    document.addEventListener("mousedown", onDown);
    const el = rulerRef.current!;
    const onWheel = (e: WheelEvent) => {
      if (!state.current.engaged) return;
      e.preventDefault();
      wheelAcc.current += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      while (Math.abs(wheelAcc.current) >= 60) { const d = Math.sign(wheelAcc.current); step(d); wheelAcc.current -= 60 * d; }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      removeEventListener("resize", onR); removeEventListener("pointermove", onMove); removeEventListener("pointerup", onUp);
      document.removeEventListener("mousedown", onDown); el.removeEventListener("wheel", onWheel);
    };
  }, [close, step]);

  useEffect(() => {
    bus.ruler = { activate, close, step, choose, isActive: () => state.current.open && state.current.engaged };
    return () => { bus.ruler = undefined; };
  }, [activate, close, step, choose]);

  const leave = (e: React.PointerEvent) => {
    // Only a real mouse can "leave". After a finger's tap the browser also reports a mouse leaving
    // (the tab slides away from under the touch point), which closed the ruler as soon as it opened.
    if (e.pointerType !== "mouse") return;
    const to = e.relatedTarget as Node | null;
    if (to && to instanceof Node && (rulerRef.current?.contains(to) || bmRef.current?.contains(to))) return; // moving between tab and ruler
    close();
  };

  const book = bookById(lib, bookId);
  const ticks: React.ReactNode[] = [];
  for (let c = 0; c < copies; c++) items.forEach((it, i) => {
    ticks.push(
      <div key={c * n + i} className={`tick ${it.type} ${it.depth ? "sub" : ""} ${it.count ? "" : "empty"}`} data-v={c * n + i} title={it.label}>
        <span className={`sw ${it.cls || ""}`} style={it.sw ? { background: it.sw } : undefined} />
        <span className="lb">{it.label}</span>
        <span className="ct">{it.count}</span>
      </div>,
    );
  });

  return (
    <>
      <div className={`bar ${open ? "open" : ""}`} id="bar">
        <span className="progress" id="prog" data-testid="progress">{book?.title ?? ""}</span>
        <button className="bm" id="bm" ref={bmRef} aria-label="Choose a book, folder or tag"
          onPointerEnter={(e) => {
            // Only a real mouse hovers. A finger's tap also reports "entering" just before its click,
            // which used to open the ruler and let the click close it again straight away.
            if (e.pointerType !== "mouse") return;
            if (hoverLock.current && Math.hypot(e.clientX - lockPos.current.x, e.clientY - lockPos.current.y) < 6) return; // the tab moved, not the mouse
            activate();
          }}
          onPointerLeave={leave}
          onClick={(e) => {
            // keyboard, finger and pen toggle; a mouse click only opens (hovering has opened it already)
            const pt = (e.nativeEvent as PointerEvent).pointerType;
            const toggles = e.detail === 0 || (!!pt && pt !== "mouse") || matchMedia("(hover: none)").matches;
            if (toggles && state.current.open) close(); else activate();
          }}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h12a1 1 0 0 1 1 1v19l-7-4.5L5 22V3a1 1 0 0 1 1-1z" /></svg>
        </button>
      </div>
      <div className={`ruler ${open ? "open" : ""} ${engaged ? "engaged" : ""}`} id="ruler" ref={rulerRef} data-testid="ruler"
        style={{ ["--w" as string]: itemW + "px" }}
        onPointerLeave={leave}
        onClick={(e) => {
          if (drag.current?.moved) return;
          const t = (e.target as HTMLElement).closest<HTMLElement>(".tick");
          if (!state.current.engaged) setEngaged(true);
          if (!t) return;
          if (+t.dataset.v! !== vp.current) { normalize(); setIndex(mod(+t.dataset.v!, geo.current.n)); scheduleSettle(); return; }
          choose();
        }}>
        <div className="rbg" /><div className="rtint" ref={tintRef} />
        <div className="track" id="track"
          onPointerDown={(e) => { if (e.pointerType !== "mouse") drag.current = { x: e.clientX, acc: 0, moved: false }; }}
          onPointerMove={(e) => {
            const d0 = drag.current; if (!d0) return;
            d0.acc += e.clientX - d0.x; d0.x = e.clientX;
            const unit = geo.current.itemW * 0.6;
            while (Math.abs(d0.acc) >= unit) { const d = d0.acc > 0 ? -1 : 1; step(d); d0.acc += d * unit; d0.moved = true; }
          }}>
          <div className="needle" />
          <div className="tape" id="tape" ref={tapeRef}>{ticks}</div>
        </div>
      </div>
    </>
  );
}

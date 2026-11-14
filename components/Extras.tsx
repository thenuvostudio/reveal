"use client";
import { useEffect, useState } from "react";
import { useApp, fsSupported } from "@/store/app";
import { CURSORS } from "@/lib/cursors";
import { bus } from "./bus";
import { openLibraryFileFlow } from "./libraryActions";

/** First-run screen. */
export function Welcome() {
  const [over, setOver] = useState(false);
  return (
    <div id="welcome">
      <div className={`wcard ${over ? "over" : ""}`} id="wcard" onDragEnter={() => setOver(true)} onDragLeave={() => setOver(false)} onDrop={() => setOver(false)}>
        <img src="./icon.svg" alt="" />
        <h1>Bring in your Readmoo highlights</h1>
        <p>Drop one or more CSV exports here, or choose files.<br />Everything stays on this computer.</p>
        <button className="wbtn" data-act="import" onClick={() => bus.pickCSV?.()}>Choose CSV files</button><br />
        <button className="wlink" data-act="open-or-restore" onClick={() => (fsSupported() ? openLibraryFileFlow() : bus.pickJSON?.())}>…or open an existing library file</button>
        <div className="wtip">Readmoo&apos;s CSV has no book title, so the app suggests one from the file name. You can edit it while importing.<br />Re-importing a file later only adds highlights you don&apos;t already have.</div>
      </div>
    </div>
  );
}

/** The jumping chameleon after an import. */
export function Hop() {
  const celebrate = useApp((s) => s.celebrate);
  const [phase, setPhase] = useState<"off" | "hop" | "done" | "out">("off");
  useEffect(() => {
    if (!celebrate) return;
    setPhase("hop");
    const t1 = setTimeout(() => setPhase("done"), 1250);
    const t2 = setTimeout(() => setPhase("out"), 2900);
    const t3 = setTimeout(() => setPhase("off"), 3260);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [celebrate]);
  if (phase === "off" || !celebrate) return null;
  const { added, dup } = celebrate;
  const sparks = [[12, 30, 0], [82, 22, 0.08], [6, 62, 0.16], [90, 58, 0.05], [30, 6, 0.12], [68, 8, 0.2]];
  const done = phase === "done" || phase === "out";
  return (
    <div className={`hop ${done ? "done" : ""} ${phase === "out" ? "out" : ""}`} role="status" data-testid="hop" onClick={() => { setPhase("out"); setTimeout(() => setPhase("off"), 360); }}>
      <div className="stage">
        <div className="shadow" />
        <img className="cham" src="./chameleon-solo.svg" alt="" />
        {sparks.map(([x, y, d], i) => <span key={i} className="spark" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} />)}
      </div>
      <div className="msg" data-testid="hop-msg">{done ? (added ? `+${added} new highlight${added === 1 ? "" : "s"} 🎉` : "Already up to date") : "Importing your highlights…"}</div>
      <div className="sub">{done ? (dup ? `${dup} already in your library ${dup === 1 ? "was" : "were"} skipped` : added ? "Happy reading!" : "") : ""}</div>
    </div>
  );
}

/** Chameleon cursor + the lick when you click something. */
export function CursorFx() {
  const cursor = useApp((s) => s.settings.cursor);
  useEffect(() => {
    const c = CURSORS.find((x) => x.id === cursor);
    const root = document.documentElement;
    if (c) { root.style.setProperty("--cur", `url("${c.c32}")`); root.classList.add("chamcursor"); }
    else root.classList.remove("chamcursor");
    if (!c) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = e.target as HTMLElement;
      if (!el.closest?.("button, .tick, .qwrap, .lrow, [role=button], select, label, summary, input[type=checkbox], input[type=range]")) return;
      document.querySelectorAll(".lick").forEach((x) => x.remove());
      const l = document.createElement("div");
      l.className = "lick";
      l.style.left = e.clientX + "px"; l.style.top = e.clientY + "px";
      l.style.setProperty("--tg", c.tongue);
      l.innerHTML = `<div class="tg"></div><span class="spk"></span><img src="${c.c32}" alt="">`;
      document.body.appendChild(l);
      document.body.classList.add("licking");
      if (t) clearTimeout(t);
      t = setTimeout(() => { l.remove(); document.body.classList.remove("licking"); }, 470);
    };
    const onMove = (e: PointerEvent) => { const l = document.querySelector<HTMLElement>(".lick"); if (l) { l.style.left = e.clientX + "px"; l.style.top = e.clientY + "px"; } };
    document.addEventListener("pointerdown", onDown, true);
    addEventListener("pointermove", onMove, { passive: true });
    return () => { document.removeEventListener("pointerdown", onDown, true); removeEventListener("pointermove", onMove); if (t) clearTimeout(t); document.body.classList.remove("licking"); document.querySelectorAll(".lick").forEach((x) => x.remove()); };
  }, [cursor]);
  return null;
}

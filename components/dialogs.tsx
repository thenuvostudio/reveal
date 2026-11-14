"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";

/** A dialog is any React node; it gets a `close` function. Dialogs stack; Esc / backdrop closes the top one. */
interface DialogEntry { id: number; node: () => ReactNode; close: () => void; wide?: boolean }
const useDialogs = create<{ list: DialogEntry[] }>(() => ({ list: [] }));
let nextId = 1;

export function openDialog(render: (close: () => void) => ReactNode, opts: { onClose?: () => void; wide?: boolean } = {}): () => void {
  const id = nextId++;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    useDialogs.setState((s) => ({ list: s.list.filter((d) => d.id !== id) }));
    opts.onClose?.();
  };
  useDialogs.setState((s) => ({ list: [...s.list, { id, node: () => render(close), close, wide: opts.wide }] }));
  return close;
}
export const anyDialogOpen = () => useDialogs.getState().list.length > 0;

export function DialogHost() {
  const list = useDialogs((s) => s.list);
  useEffect(() => {
    if (!list.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation(); e.preventDefault();
      useDialogs.getState().list.at(-1)?.close();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [list.length]);
  return (
    <>
      {list.map((d) => (
        <div key={d.id} className="overlay" data-testid="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) d.close(); }}>
          <div className={`modal ${d.wide ? "wide" : ""}`} role="dialog" aria-modal="true">{d.node()}</div>
        </div>
      ))}
    </>
  );
}

export function confirmBox(title: string, body: ReactNode, okLabel = "OK", danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v: boolean) => { if (!done) { done = true; resolve(v); } };
    openDialog((close) => (
      <>
        <h3>{title}</h3><p>{body}</p>
        <div className="foot">
          <button className="btn" onClick={() => { fin(false); close(); }}>Cancel</button>
          <AutoFocusButton className={`btn primary ${danger ? "danger" : ""}`} onClick={() => { fin(true); close(); }} data-ok>{okLabel}</AutoFocusButton>
        </div>
      </>
    ), { onClose: () => fin(false) });
  });
}

export function choiceBox<T>(title: string, body: ReactNode, choices: { label: string; value: T; primary?: boolean; danger?: boolean }[]): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v: T | null) => { if (!done) { done = true; resolve(v); } };
    openDialog((close) => (
      <>
        <h3>{title}</h3><p>{body}</p>
        <div className="foot">
          <button className="btn" onClick={() => { fin(null); close(); }}>Cancel</button>
          {choices.map((c, i) => (
            <button key={i} className={`btn ${c.primary ? "primary" : ""} ${c.danger ? "danger" : ""}`} onClick={() => { fin(c.value); close(); }}>{c.label}</button>
          ))}
        </div>
      </>
    ), { onClose: () => fin(null) });
  });
}

function PromptBody({ title, value, okLabel, placeholder, onOk, close }: { title: string; value: string; okLabel: string; placeholder: string; onOk: (v: string) => void; close: () => void }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const go = () => { const t = v.trim(); if (!t) return; close(); onOk(t); };
  return (
    <>
      <h3>{title}</h3>
      <div className="imp-row" style={{ border: 0, padding: 0, background: "none" }}>
        <input id="rn" ref={ref} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} />
      </div>
      <div className="foot"><button className="btn" onClick={close}>Cancel</button><button className="btn primary" data-ok onClick={go}>{okLabel}</button></div>
    </>
  );
}
export function promptName(title: string, value: string, okLabel: string, onOk: (v: string) => void, placeholder = "Name") {
  openDialog((close) => <PromptBody title={title} value={value} okLabel={okLabel} placeholder={placeholder} onOk={onOk} close={close} />);
}

function AutoFocusButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { "data-ok"?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return <button ref={ref} {...props} />;
}

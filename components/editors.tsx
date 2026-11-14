"use client";
import { useEffect, useRef, useState } from "react";
import type { Highlight } from "@/lib/types";
import { useApp } from "@/store/app";
import { allTags, bookById } from "@/lib/library";
import { disp, esc } from "@/lib/text";
import { applyFormat, HL_COLORS, htmlForEditor, rgba, sanitizeEditor, type HlColor } from "@/lib/richtext";
import { confirmBox, openDialog } from "./dialogs";
import { toast } from "./toast";

/** True while an edit/note dialog is open (used to warn before closing the tab). */
export let editorOpen = false;

/** Saves the editor's content into `h`. Returns false if the text is empty. */
function applyTextEdit(h: Highlight, ed: HTMLElement): boolean {
  const { html, plain } = sanitizeEditor(ed);
  if (!plain.trim()) return false;
  if (html === esc(h.text)) { delete h.html; delete h.plain; delete h.editedAt; }
  else if (html !== h.html) { h.html = html; h.plain = plain; h.editedAt = new Date().toISOString(); }
  return true;
}

function EditBody({ h, close }: { h: Highlight; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const b = bookById(useApp.getState().lib, h.bookId);
  useEffect(() => {
    const ed = ref.current!;
    ed.innerHTML = htmlForEditor(h);
    ed.focus();
    const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false);
    const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
  }, [h]);
  const save = () => {
    if (!applyTextEdit(h, ref.current!)) { toast("A highlight can't be empty. Use 🗑 Delete instead."); return; }
    close(); useApp.getState().commit(); toast("Highlight updated");
  };
  const revert = async () => {
    if (!(await confirmBox("Revert to original?", "All text changes and formatting on this highlight are discarded and Readmoo's text comes back. Your note and tags stay.", "Revert", true))) return;
    delete h.html; delete h.plain; delete h.editedAt;
    close(); useApp.getState().commit(); toast("Restored the original text");
  };
  const fmt = (cmd: string, color?: HlColor | "") => { const m = applyFormat(ref.current!, cmd, color); if (m) toast(m); };
  const keep = (e: React.MouseEvent) => e.preventDefault(); // keep the text selection when clicking the toolbar
  return (
    <>
      <h3>Edit highlight</h3>
      <p>{b?.title}{h.chapter ? ` · Ch. ${h.chapter}` : ""}{h.date ? ` · ${h.date}` : ""}</p>
      <div className="rte">
        <div className="rte-bar" onMouseDown={keep}>
          <button data-cmd="bold" title="Bold (Ctrl/⌘+B)" onClick={() => fmt("bold")}><b>B</b></button>
          <button data-cmd="italic" title="Italic (Ctrl/⌘+I)" onClick={() => fmt("italic")}><i style={{ fontFamily: "Georgia,serif" }}>I</i></button>
          <button data-cmd="underline" title="Underline (Ctrl/⌘+U)" onClick={() => fmt("underline")}><u>U</u></button>
          <button data-cmd="strikeThrough" title="Strikethrough" onClick={() => fmt("strikeThrough")}><s>S</s></button>
          <span className="sep" />
          {(Object.keys(HL_COLORS) as HlColor[]).map((k) => {
            const c = HL_COLORS[k];
            return <button key={k} className="sw" data-cmd="hilite" data-color={k} title={`Highlight ${k}`} style={{ background: rgba([c[0], c[1], c[2], 0.9]) }} onClick={() => fmt("hilite", k)} />;
          })}
          <button className="sw none" data-cmd="hilite" data-color="" title="Remove highlight colour" onClick={() => fmt("hilite", "")} />
          <span className="sep" />
          <button data-cmd="removeFormat" title="Clear formatting on the selection" onClick={() => fmt("removeFormat")}>⌫ Clear</button>
          <button data-cmd="undo" title="Undo (Ctrl/⌘+Z)" onClick={() => fmt("undo")}>↶</button>
          <button data-cmd="redo" title="Redo" onClick={() => fmt("redo")}>↷</button>
        </div>
        <div className="rte-body" ref={ref} contentEditable suppressContentEditableWarning spellCheck={false} data-rte={h.id}
          onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" && (e.ctrlKey || e.metaKey)) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s")) { e.preventDefault(); save(); }
          }} />
        <div className="rte-foot">Select text, then pick a style · Ctrl/⌘ + Enter to save · pasted text arrives as plain text</div>
      </div>
      <div className="foot">
        {h.html && <button className="btn ghost danger" data-revert onClick={revert} title="Discard edits and restore Readmoo's text">Revert to original</button>}
        <span className="spacer" />
        <button className="btn" data-x onClick={close}>Cancel</button>
        <button className="btn primary" data-ok onClick={save}>Save</button>
      </div>
    </>
  );
}
export function openEditor(h: Highlight) {
  editorOpen = true;
  openDialog((close) => <EditBody h={h} close={close} />, { wide: true, onClose: () => { editorOpen = false; } });
}

function NoteBody({ h, close }: { h: Highlight; close: () => void }) {
  const [v, setV] = useState(h.note);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const t = ref.current!; t.focus(); t.setSelectionRange(t.value.length, t.value.length); }, []);
  const save = (val = v) => { h.note = val.trim(); close(); useApp.getState().commit(); toast(h.note ? "Note saved" : "Note removed"); };
  const text = disp(h);
  return (
    <>
      <h3>{h.note ? "Edit note" : "Add a note"}</h3>
      <p style={{ fontFamily: "var(--serif)" }}>“{text.slice(0, 90)}{text.length > 90 ? "…" : ""}”</p>
      {h.readmooNote && <p><b>Readmoo note:</b> {h.readmooNote}</p>}
      <textarea id="noteTa" ref={ref} value={v} placeholder="Your thoughts on this highlight…" onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } }} />
      <div className="foot">
        {h.note && <button className="btn ghost danger" data-clear onClick={() => save("")}>Remove note</button>}
        <span className="spacer" />
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Ctrl/⌘ + Enter to save</span>
        <button className="btn" data-x onClick={close}>Cancel</button>
        <button className="btn primary" data-ok onClick={() => save()}>Save</button>
      </div>
    </>
  );
}
export function openNoteEditor(h: Highlight) {
  editorOpen = true;
  openDialog((close) => <NoteBody h={h} close={close} />, { onClose: () => { editorOpen = false; } });
}

function TagBody({ h, close }: { h: Highlight; close: () => void }) {
  const [tags, setTags] = useState<string[]>(h.tags);
  const [v, setV] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  // write through to the highlight as tags change; the dialog's onClose commits
  useEffect(() => { h.tags = tags; }, [tags, h]);
  const merged = (cur: string[], s: string) => {
    const vals = s.split(/[,，]/).map((x) => x.trim().replace(/^#/, "")).filter(Boolean);
    return [...cur, ...vals.filter((x, i) => !cur.includes(x) && vals.indexOf(x) === i)];
  };
  const add = (s: string) => setTags((cur) => merged(cur, s));
  const finish = () => { h.tags = v.trim() ? merged(tags, v) : tags; close(); };
  const lib = useApp.getState().lib;
  const others = allTags(lib).map(([t]) => t).filter((t) => !tags.includes(t)).slice(0, 14);
  return (
    <>
      <h3>Tags</h3>
      <p>Press Enter to add a tag. Separate several with commas.</p>
      <div className="tagchips" id="tagChips">
        {tags.length ? tags.map((t) => (
          <span key={t} className="tg">#{t}<button data-rm={t} title="Remove" aria-label={`Remove tag ${t}`} onClick={() => setTags((c) => c.filter((x) => x !== t))}>×</button></span>
        )) : <span style={{ fontSize: 13, color: "var(--ink-3)" }}>No tags yet</span>}
      </div>
      <div className="imp-row" style={{ padding: 0, border: 0, background: "none" }}>
        <input id="tagIn" ref={ref} list="tagList" value={v} placeholder="Add a tag…" style={{ fontFamily: "var(--sans)" }} onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (v.trim()) { add(v); setV(""); } else finish(); } }} />
      </div>
      <datalist id="tagList">{allTags(lib).map(([t]) => <option key={t} value={t} />)}</datalist>
      {others.length > 0 && <div className="tagsugg" id="tagSugg">{others.map((t) => <button key={t} data-add={t} onClick={() => add(t)}>+ {t}</button>)}</div>}
      <div className="foot"><button className="btn primary" data-ok onClick={finish}>Done</button></div>
    </>
  );
}
export function openTagEditor(h: Highlight) {
  const before = h.tags.join("\u0001");
  openDialog((close) => <TagBody h={h} close={close} />, {
    onClose: () => { if (h.tags.join("\u0001") !== before) useApp.getState().commit(); },
  });
}

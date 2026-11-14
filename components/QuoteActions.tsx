"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { Highlight } from "@/lib/types";
import { useApp } from "@/store/app";
import { bookById } from "@/lib/library";
import { disp } from "@/lib/text";
import { modeHighlights } from "@/lib/feed";
import { confirmBox } from "./dialogs";
import { toast } from "./toast";
import { openEditor, openNoteEditor, openTagEditor } from "./editors";

/** Buttons + notes + tags under a clicked quote. Placed below it, else above, else docked above the tab. */
export function QuoteActions({ h }: { h: Highlight }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<"" | "up" | "dock">("");
  useLayoutEffect(() => {
    const qa = ref.current; if (!qa) return;
    const page = qa.closest(".page"), wrap = qa.closest(".qwrap");
    if (!page || !wrap) return;
    const pr = page.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    const barH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--barH")) || 64;
    const hgt = qa.offsetHeight, room = 12, limit = pr.bottom - barH - 12;
    if (wr.bottom + room + hgt <= limit) setPlace("");
    else if (wr.top - room - hgt >= pr.top + 70) setPlace("up");
    else setPlace("dock");
  }, [h.note, h.readmooNote, h.tags.length]);

  const del = async () => {
    if (!(await confirmBox("Delete this highlight?", "It's removed from your library, along with your note and tags. Re-importing the CSV would bring the original back.", "Delete", true))) return;
    const st = useApp.getState();
    const list = modeHighlights({ lib: st.lib, mode: st.mode, filter: st.filter, settings: st.settings, query: st.query });
    const i = list.findIndex((x) => x.id === h.id);
    const next = (list[i + 1] || list[i - 1])?.id;
    st.lib.highlights = st.lib.highlights.filter((x) => x.id !== h.id);
    st.commit({ kind: "keepId", id: next });
    toast("Highlight deleted");
  };
  const copy = async () => {
    const b = bookById(useApp.getState().lib, h.bookId);
    const s = `${disp(h)}\n—— ${b ? b.title : ""}${h.chapter ? `, Ch. ${h.chapter}` : ""}`;
    try { await navigator.clipboard.writeText(s); }
    catch { const ta = document.createElement("textarea"); ta.value = s; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
    toast("Copied");
  };

  return (
    <div className={`qa ${place}`} ref={ref} data-testid="quote-actions">
      <div className="qa-row">
        <button data-qa="edit" onClick={() => openEditor(h)}>✏️ Edit</button>
        <button data-qa="note" onClick={() => openNoteEditor(h)}>✎ Note</button>
        <button data-qa="tag" onClick={() => openTagEditor(h)}># Tag</button>
        <button data-qa="copy" onClick={copy}>⧉ Copy</button>
        <button data-qa="del" title="Delete highlight" aria-label="Delete highlight" onClick={del}>🗑</button>
      </div>
      {h.readmooNote && <div className="qa-note"><span>Readmoo note</span>{h.readmooNote}</div>}
      {h.note && <div className="qa-note mine" data-qa="note-view" title="Edit note" onClick={() => openNoteEditor(h)}><span>My note</span>{h.note}</div>}
      {h.tags.length > 0 && (
        <div className="qa-tags">
          {h.tags.map((t) => <button key={t} data-qa="gotag" onClick={() => useApp.getState().setMode({ type: "tag", id: t })}>#{t}</button>)}
        </div>
      )}
    </div>
  );
}

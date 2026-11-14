"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/store/app";
import { decodeBuffer, readmooRows, titleFromFilename } from "@/lib/csv";
import { bookById, folderOptionList, importRows, newCount } from "@/lib/library";
import type { CsvRow } from "@/lib/types";
import { openDialog } from "./dialogs";
import { toast } from "./toast";

interface Item { name: string; rows?: CsvRow[]; title: string; error?: string }

function ImportBody({ items, close }: { items: Item[]; close: () => void }) {
  const lib = useApp.getState().lib;
  const mode = useApp.getState().mode;
  const defFolder = mode.type === "folder" ? mode.id : mode.type === "book" ? bookById(lib, mode.id)?.folderId ?? null : null;
  const [titles, setTitles] = useState(items.map((i) => i.title));
  const [folder, setFolder] = useState(defFolder || "");
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); first.current?.select(); }, []);
  const ok = items.some((i) => !i.error);

  const doImport = () => {
    const st = useApp.getState();
    let added = 0, dup = 0, lastBook: string | null = null;
    items.forEach((it, i) => {
      if (it.error || !it.rows) return;
      const r = importRows(st.lib, titles[i].trim() || it.title, it.rows, folder || null);
      added += r.added; dup += r.dup; lastBook = r.bookId;
    });
    close();
    st.clearSearch();
    if (lastBook) useApp.setState({ mode: { type: "book", id: lastBook, seed: 0 } });
    st.commit({ kind: "top" });
    st.celebrateImport(added, dup);
  };

  return (
    <>
      <h3>Import {items.length} file{items.length > 1 ? "s" : ""}</h3>
      <p>Readmoo&apos;s CSV doesn&apos;t include the book title. Check or type it below — choosing an existing title adds to that book.</p>
      {lib.folders.length > 0 && (
        <div className="imp-row" style={{ background: "var(--paper-2)" }}>
          <label htmlFor="impFolder">Put new books in folder</label>
          <select id="impFolder" value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">— Top level (no folder)</option>
            {folderOptionList(lib).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <div className="info">Books that already exist stay where they are.</div>
        </div>
      )}
      <datalist id="booklist">{lib.books.map((b) => <option key={b.id} value={b.title} />)}</datalist>
      {items.map((it, i) => {
        if (it.error) return <div key={i} className="imp-row err"><b>{it.name}</b><div className="info" style={{ color: "#b3261e" }}>{it.error}</div></div>;
        const t = titles[i];
        const n = newCount(lib, t, it.rows!), exists = lib.books.some((b) => b.title === t.trim());
        return (
          <div key={i} className="imp-row">
            <label htmlFor={`imp-${i}`}>Book title — from “{it.name}”</label>
            <input id={`imp-${i}`} data-i={i} ref={i === items.findIndex((x) => !x.error) ? first : undefined} list="booklist" value={t}
              onChange={(e) => setTitles((ts) => ts.map((x, j) => (j === i ? e.target.value : x)))} onKeyDown={(e) => { if (e.key === "Enter") doImport(); }} />
            <div className="info" data-info={i}>{it.rows!.length} highlights · <b>{n} new</b>{it.rows!.length - n ? ` · ${it.rows!.length - n} already in library` : ""}{exists ? " · adds to existing book" : " · new book"}</div>
            <div className="preview">“{it.rows![it.rows!.length - 1].text.split("\n")[0]}”</div>
          </div>
        );
      })}
      <div className="foot"><button className="btn" data-x onClick={close}>Cancel</button>{ok && <button className="btn primary" data-ok onClick={doImport}>Import</button>}</div>
    </>
  );
}

export async function handleCSVFiles(fileList: FileList | File[]) {
  const files = [...fileList].filter((f) => /\.csv$/i.test(f.name) || f.type.includes("csv"));
  if (!files.length) { toast("Please choose .csv files exported from Readmoo."); return; }
  const items: Item[] = [];
  for (const f of files) {
    try { items.push({ name: f.name, rows: readmooRows(decodeBuffer(await f.arrayBuffer())), title: titleFromFilename(f.name) }); }
    catch (e) { items.push({ name: f.name, title: "", error: (e as Error).message }); }
  }
  openDialog((close) => <ImportBody items={items} close={close} />);
}

"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/store/app";
import { allTags, booksUnder, childFolders } from "@/lib/library";
import { cls } from "@/lib/colors";
import { filterActive, scopedHighlights } from "@/lib/feed";
import type { Filter } from "@/lib/types";
import { toast } from "./toast";

/** Filter panel under the funnel: folders (with subfolders) and tags. Changes apply live. */
export default function FilterPanel({ onClose }: { onClose: () => void }) {
  const lib = useApp((s) => s.lib);
  const version = useApp((s) => s.version);
  const filter = useApp((s) => s.filter);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 8, top: 60, width: 340 });

  useLayoutEffect(() => {
    const place = () => {
      const b = document.getElementById("filterBtn")?.getBoundingClientRect();
      if (!b) return;
      const width = Math.min(340, innerWidth - 16);
      setPos({ width, top: b.bottom + 8, left: Math.max(8, Math.min(b.left + b.width / 2 - width / 2, innerWidth - width - 8)) });
    };
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, []);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest("#filterBtn")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [onClose]);

  const apply = (f: Filter) => {
    useApp.getState().setFilter(f);
    const st = useApp.getState();
    if (filterActive(f) && !scopedHighlights(st.lib, f).length) toast("Nothing matches this filter yet");
  };
  const toggleFolder = (id: string) => apply({ ...filter, folders: filter.folders.includes(id) ? filter.folders.filter((x) => x !== id) : [...filter.folders, id] });
  const toggleTag = (t: string) => apply({ ...filter, tags: filter.tags.includes(t) ? filter.tags.filter((x) => x !== t) : [...filter.tags, t] });

  const { counts, tags, hs } = useMemo(() => {
    const counts = new Map<string, number>();
    lib.folders.forEach((f) => { const ids = new Set(booksUnder(lib, f.id).map((b) => b.id)); counts.set(f.id, lib.highlights.filter((h) => ids.has(h.bookId)).length); });
    return { counts, tags: allTags(lib), hs: scopedHighlights(lib, filter) };
  }, [lib, version, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const books = new Set(hs.map((h) => h.bookId)).size;
  const on = filterActive(filter);

  const tree = (pid: string | null, d: number): React.ReactNode[] => childFolders(lib, pid).flatMap((f) => [
    <label key={f.id} className="frow" style={{ paddingLeft: 10 + d * 18 }}>
      <input type="checkbox" data-ff={f.id} checked={filter.folders.includes(f.id)} onChange={() => toggleFolder(f.id)} />
      <span className={`sw bgf-${cls(f.id)}`} /><span className="t">{f.name}</span><span className="c">{counts.get(f.id) ?? 0}</span>
    </label>,
    ...tree(f.id, d + 1),
  ]);

  return (
    <div className="fpanel" ref={ref} role="dialog" aria-label="Filter" data-testid="filter-panel" style={{ left: pos.left, top: pos.top, width: pos.width }}>
      <div className="fhead"><b>Filter</b>{on && <button className="flink" data-fclear onClick={() => apply({ folders: [], tags: [] })}>Clear all</button>}</div>
      <div className="fsec">Folders <span>includes subfolders</span></div>
      {lib.folders.length ? <div className="flist">{tree(null, 0)}</div> : <div className="fempty">No folders yet. Create them in the Library (click the app icon).</div>}
      <div className="fsec">Tags</div>
      {tags.length ? (
        <div className="ftags">{tags.map(([t, c]) => <button key={t} className={`ftag ${filter.tags.includes(t) ? "on" : ""}`} data-ft={t} onClick={() => toggleTag(t)}>#{t} <span>{c}</span></button>)}</div>
      ) : <div className="fempty">No tags yet. Click a quote, then “# Tag”.</div>}
      <div className="ffoot">
        <span data-testid="filter-summary">{on ? `${books} book${books === 1 ? "" : "s"} · ${hs.length} highlight${hs.length === 1 ? "" : "s"} match` : "Showing everything"}</span>
        <button className="btn primary" data-fdone onClick={onClose}>Done</button>
      </div>
      {on && filter.folders.length > 0 && filter.tags.length > 0 && <div className="fnote">Showing highlights that are in the chosen folders <b>and</b> carry one of the chosen tags.</div>}
    </div>
  );
}

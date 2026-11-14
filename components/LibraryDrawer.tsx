"use client";
import { useEffect, useRef, useState } from "react";
import { useApp, fsSupported } from "@/store/app";
import { allTags, booksIn, booksUnder, childFolders } from "@/lib/library";
import { cls } from "@/lib/colors";
import { bus } from "./bus";
import { toast } from "./toast";
import * as A from "./libraryActions";

interface MenuItem { label: string; run: () => void; danger?: boolean }
type Menu = { x: number; y: number; items: (MenuItem | "-")[] } | null;
const DND = "application/x-highlights-item";

export default function LibraryDrawer() {
  const open = useApp((s) => s.drawer === "library");
  const lib = useApp((s) => s.lib);
  const version = useApp((s) => s.version);
  const mode = useApp((s) => s.mode);
  const file = useApp((s) => s.file);
  const [menu, setMenu] = useState<Menu>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  void version;

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setMenu(null); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [menu]);
  useEffect(() => { if (!open) setMenu(null); }, [open]);

  const go = (type: "book" | "folder" | "tag", id: string) => { useApp.getState().setDrawer(null); useApp.getState().setMode({ type, id }); };
  const showMenu = (e: React.MouseEvent, items: (MenuItem | "-")[]) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: Math.max(8, Math.min(r.left, innerWidth - 250)), y: r.bottom + 6 > innerHeight - 320 ? Math.max(8, r.top - 320) : r.bottom + 6, items });
  };
  const bookMenu = (id: string): (MenuItem | "-")[] => [
    { label: "📖 Show its quotes", run: () => go("book", id) },
    { label: "✏️ Rename…", run: () => A.renameBookFlow(id) },
    { label: "📁 Move to folder…", run: () => A.moveDialog("book", id) },
    "-",
    { label: "⬇ Export Markdown (.md)", run: () => A.exportBook(id, "md") },
    { label: "⬇ Export web page (.html)", run: () => A.exportBook(id, "html") },
    "-",
    { label: "🗑 Delete book…", danger: true, run: () => A.deleteBookFlow(id) },
  ];
  const folderMenu = (id: string): (MenuItem | "-")[] => [
    { label: "📂 Show its quotes", run: () => go("folder", id) },
    { label: "✏️ Rename…", run: () => A.renameFolder(id) },
    { label: "＋ New subfolder…", run: () => A.newFolder(id) },
    { label: "📁 Move to…", run: () => A.moveDialog("folder", id) },
    "-",
    { label: "🗑 Delete folder…", danger: true, run: () => A.deleteFolderFlow(id) },
  ];
  const tagMenu = (t: string): (MenuItem | "-")[] => [
    { label: "# Show its quotes", run: () => go("tag", t) },
    { label: "✏️ Rename tag…", run: () => A.renameTagFlow(t) },
    { label: "🗑 Remove from all highlights…", danger: true, run: () => A.removeTagFlow(t) },
  ];

  /* drag & drop */
  const dragProps = (kind: "book" | "folder", id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(DND, JSON.stringify({ type: kind, id })); e.dataTransfer.effectAllowed = "move"; setDragging(kind + id); },
    onDragEnd: () => { setDragging(null); setDropTarget(null); },
  });
  const dropProps = (target: string) => ({
    onDragOver: (e: React.DragEvent) => { if (![...e.dataTransfer.types].includes(DND)) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropTarget(target); },
    onDragLeave: (e: React.DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropTarget((t) => (t === target ? null : t)); },
    onDrop: (e: React.DragEvent) => {
      if (![...e.dataTransfer.types].includes(DND)) return;
      e.preventDefault(); e.stopPropagation(); setDropTarget(null);
      try { const it = JSON.parse(e.dataTransfer.getData(DND)); A.moveItemFlow(it.type, it.id, target || null); } catch { /* ignore */ }
    },
  });

  const counts = new Map<string, number>();
  lib.highlights.forEach((h) => counts.set(h.bookId, (counts.get(h.bookId) || 0) + 1));
  const active = (t: string, id: string) => (mode.type === t && mode.id === id ? "active" : "");
  const pad = (d: number) => ({ paddingLeft: 8 + d * 18 });
  const More = ({ items }: { items: (MenuItem | "-")[] }) => <button className="more" data-more aria-label="More" onClick={(e) => showMenu(e, items)}>⋯</button>;
  const bookRow = (b: (typeof lib.books)[number], d: number) => (
    <div key={b.id} className={`lrow book ${active("book", b.id)} ${dragging === "book" + b.id ? "dragging-row" : ""}`} style={pad(d)} data-kind="book" data-id={b.id} title={b.title}
      onClick={() => go("book", b.id)} {...dragProps("book", b.id)}>
      <span className="caret-sp" /><span className={`sw bgb-${cls(b.id)}`} /><span className="t">{b.title}</span><span className="c">{counts.get(b.id) || 0}</span><More items={bookMenu(b.id)} />
    </div>
  );
  const tree = (pid: string | null, d: number): React.ReactNode[] => childFolders(lib, pid).flatMap((f) => {
    const kids = childFolders(lib, f.id).length + booksIn(lib, f.id).length;
    return [
      <div key={f.id} className={`lrow folder ${active("folder", f.id)} ${dropTarget === f.id ? "drop-target" : ""} ${dragging === "folder" + f.id ? "dragging-row" : ""}`} style={pad(d)}
        data-kind="folder" data-id={f.id} title={f.name} onClick={() => go("folder", f.id)} {...dragProps("folder", f.id)} {...dropProps(f.id)}>
        <span className={`caret ${f.collapsed ? "" : "open"} ${kids ? "" : "empty"}`} data-caret aria-label={f.collapsed ? "Expand" : "Collapse"}
          onClick={(e) => { e.stopPropagation(); f.collapsed = !f.collapsed; useApp.getState().commit(); }}>▸</span>
        <span className={`sw bgf-${cls(f.id)}`} /><span className="t">{f.name}</span><span className="c">{booksUnder(lib, f.id).length} 📖</span><More items={folderMenu(f.id)} />
      </div>,
      ...(f.collapsed ? [] : [...tree(f.id, d + 1), ...booksIn(lib, f.id).map((b) => bookRow(b, d + 1))]),
    ];
  });
  const tags = allTags(lib);

  /* library file & backup */
  const fileItems: (MenuItem | "-")[] = [];
  if (file.handle && !file.ok) fileItems.push({ label: "🔌 Reconnect to " + file.handle.name, run: async () => { if (await useApp.getState().reconnectFile()) toast("Reconnected"); } });
  if (fsSupported()) fileItems.push({ label: "💾 Save library to a file & auto-save…", run: A.linkFileFlow }, { label: "📂 Open library file…", run: A.openLibraryFileFlow });
  fileItems.push("-", { label: "⬇ Download backup (.json)", run: A.downloadBackup }, { label: "♻️ Restore or merge from backup…", run: () => bus.pickJSON?.() });
  if (file.handle) fileItems.push("-", { label: "Stop auto-saving to file", run: async () => { await useApp.getState().unlinkFile(); toast("Stopped auto-saving. The file itself is untouched."); } });
  fileItems.push("-", { label: "🗑 Delete entire library…", danger: true, run: A.wipeLibrary });
  const fst = file.handle ? (file.ok ? "on" : "warn") : "";
  const fhint = file.handle
    ? (file.ok ? `Linked to “${file.handle.name}”. Every change is written to it automatically.${file.lastSave ? " Last saved " + file.lastSave.toLocaleTimeString() + "." : ""}` : `Linked to “${file.handle.name}”, but the browser needs your permission again to write to it.`)
    : (fsSupported() ? "Link your library to a .json file (for example next to this app, or in Dropbox) to carry it anywhere." : "Download a backup to move your library to another computer. Auto-saving to a file needs Chrome or Edge.");

  return (
    <aside className={`drawer left ${open ? "open" : ""}`} id="library" aria-label="Library" aria-hidden={!open} data-testid="library">
      <div className="dh"><h2>Library</h2><button className="x" data-close aria-label="Close library" onClick={() => useApp.getState().setDrawer(null)}>×</button></div>
      {open && (
        <div className="db" id="libBody">
          <div className={`lsec ${dropTarget === "" ? "drop-target" : ""}`} title="Drop a book or folder here to move it to the top level" {...dropProps("")}>
            <span>Books · {lib.books.length}</span>
            <span className="acts"><button data-lib="new-folder" onClick={() => A.newFolder(null)}>＋ Folder</button><button data-lib="import" onClick={() => bus.pickCSV?.()}>＋ Import</button></span>
          </div>
          {lib.books.length || lib.folders.length ? [...tree(null, 0), ...booksIn(lib, null).map((b) => bookRow(b, 0))] : <div className="lempty">No books yet. Import a Readmoo CSV to start.</div>}
          {lib.folders.length > 0 && <div className="lempty" style={{ fontSize: 12 }}>Drag books onto folders to organise them. Drop on “Books” for the top level.</div>}
          <div className="lsec"><span>Tags · {tags.length}</span></div>
          {tags.length ? tags.map(([t, c]) => (
            <div key={t} className={`lrow tag ${active("tag", t)}`} data-kind="tag" data-id={t} onClick={() => go("tag", t)}>
              <span className="caret-sp" /><span className="t"># {t}</span><span className="c">{c}</span><More items={tagMenu(t)} />
            </div>
          )) : <div className="lempty">Click a quote, then “# Tag” to add tags.</div>}
          <div id="fileSec">
            <div className="lsec"><span>Library file &amp; backup</span><span className={`fstat ${fst}`}><i />{file.handle ? (file.ok ? "Auto-saving" : "Needs permission") : "Saved in this browser"}</span></div>
            <div className="fhint">{fhint}</div>
            <div className="fbtns">
              {fileItems.map((it, i) => it === "-" ? <hr key={i} /> : <button key={i} className={`dbtn ${it.danger ? "danger" : ""}`} data-file={i} onClick={it.run}>{it.label}</button>)}
            </div>
          </div>
        </div>
      )}
      {menu && (
        <div className="pop" role="menu" ref={menuRef} style={{ left: menu.x, top: menu.y }} data-testid="row-menu">
          {menu.items.map((it, i) => it === "-" ? <hr key={i} /> : (
            <button key={i} role="menuitem" className={it.danger ? "danger" : ""} onClick={() => { setMenu(null); it.run(); }}>{it.label}</button>
          ))}
        </div>
      )}
    </aside>
  );
}

"use client";
import { useState } from "react";
import { useApp } from "@/store/app";
import * as L from "@/lib/library";
import { downloadText, exportHTMLPage, exportMarkdown, bookFileName } from "@/lib/exporters";
import { serialize, validateLib, mergeLib } from "@/lib/library";
import { choiceBox, confirmBox, openDialog, promptName } from "./dialogs";
import { toast } from "./toast";

const st = () => useApp.getState();

export function newFolder(parentId: string | null) {
  const parent = parentId ? L.folderById(st().lib, parentId) : undefined;
  promptName(parent ? `New subfolder in “${parent.name}”` : "New folder", "", "Create", (name) => {
    const lib = st().lib;
    lib.folders.push({ id: L.uid(), name, parentId: parent ? parent.id : null, collapsed: false });
    if (parent) L.expandTo(lib, parent.id);
    st().commit();
    toast(`Folder “${name}” created. Drag books onto it.`);
  }, "Folder name");
}
export function renameFolder(id: string) {
  const f = L.folderById(st().lib, id); if (!f) return;
  promptName("Rename folder", f.name, "Save", (v) => { f.name = v; st().commit(); });
}
export async function deleteFolderFlow(id: string) {
  const lib = st().lib, f = L.folderById(lib, id); if (!f) return;
  const nb = L.booksUnder(lib, id).length, nf = L.descendantIds(lib, id).size - 1;
  const where = f.parentId ? `“${L.folderById(lib, f.parentId)?.name}”` : "the top level";
  const what = [nb ? `${nb} book${nb === 1 ? "" : "s"}` : "", nf ? `${nf} subfolder${nf === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
  if (!(await confirmBox("Delete this folder?", `“${f.name}” is removed. ${what ? `Its ${what} move to ${where}. No highlights are deleted.` : "It's empty."}`, "Delete folder", true))) return;
  L.deleteFolder(lib, id);
  st().commit();
}
export function renameBookFlow(id: string) {
  const b = L.bookById(st().lib, id); if (!b) return;
  promptName("Rename book", b.title, "Save", (v) => {
    const s = st();
    const merging = s.lib.books.some((x) => x.title === v && x.id !== id);
    const survivor = L.renameBook(s.lib, id, v);
    if (merging) {
      if (s.mode.type === "book" && s.mode.id === id) useApp.setState({ mode: { type: "book", id: survivor, seed: 0 } });
      toast(`Merged into the existing book “${v}”`);
    }
    s.commit();
  });
}
export async function deleteBookFlow(id: string) {
  const lib = st().lib, b = L.bookById(lib, id); if (!b) return;
  if (!(await confirmBox("Delete this book?", `“${b.title}” and its ${L.hlsOf(lib, id).length} highlights, with your notes and tags, are removed.`, "Delete book", true))) return;
  L.deleteBook(lib, id);
  st().commit();
  toast("Book deleted");
}
export function renameTagFlow(tag: string) {
  promptName("Rename tag", tag, "Save", (v) => {
    const to = v.replace(/^#/, "");
    const s = st();
    L.renameTag(s.lib, tag, to);
    if (s.mode.type === "tag" && s.mode.id === tag) useApp.setState({ mode: { type: "tag", id: to, seed: 0 } });
    s.commit();
  });
}
export async function removeTagFlow(tag: string) {
  if (!(await confirmBox("Remove this tag?", `“#${tag}” is removed from every highlight. The highlights stay.`, "Remove", true))) return;
  L.removeTag(st().lib, tag);
  st().commit();
}
export function exportBook(id: string, kind: "md" | "html") {
  const lib = st().lib, b = L.bookById(lib, id); if (!b) return;
  if (kind === "md") { downloadText(bookFileName(b, ".md"), exportMarkdown(lib, id), "text/markdown"); toast("Exported Markdown, including edits and colours"); }
  else { downloadText(bookFileName(b, ".html"), exportHTMLPage(lib, id), "text/html"); toast("Exported web page. Open it and print to PDF if you like."); }
}
export function moveItemFlow(type: "book" | "folder", id: string, target: string | null) {
  const lib = st().lib;
  if (type === "folder" && target && L.descendantIds(lib, id).has(target)) { toast("A folder can't go inside itself."); return; }
  if (!L.moveItem(lib, type, id, target)) return;
  const name = type === "book" ? L.bookById(lib, id)?.title : L.folderById(lib, id)?.name;
  toast(type === "book" ? `Moved “${name}” to ${target ? "“" + L.folderById(lib, target)?.name + "”" : "the top level"}` : `Moved folder “${name}”`);
  st().commit();
}

function MoveBody({ type, id, close }: { type: "book" | "folder"; id: string; close: () => void }) {
  const lib = st().lib;
  const cur = type === "book" ? L.bookById(lib, id)?.folderId : L.folderById(lib, id)?.parentId;
  const [v, setV] = useState(cur || "");
  const exclude = type === "folder" ? L.descendantIds(lib, id) : new Set<string>();
  return (
    <>
      <h3>Move {type}</h3>
      <p>{type === "book" ? L.bookById(lib, id)?.title : L.folderById(lib, id)?.name}</p>
      <select className="full" id="mvSel" value={v} onChange={(e) => setV(e.target.value)}>
        <option value="">Top level (no folder)</option>
        {L.folderOptionList(lib, exclude).map(([fid, label]) => <option key={fid} value={fid}>{label}</option>)}
      </select>
      <div className="foot"><button className="btn" onClick={close}>Cancel</button><button className="btn primary" data-ok onClick={() => { close(); moveItemFlow(type, id, v || null); }}>Move</button></div>
    </>
  );
}
export function moveDialog(type: "book" | "folder", id: string) {
  openDialog((close) => <MoveBody type={type} id={id} close={close} />);
}

/* ---------- backup / restore ---------- */
export function downloadBackup() {
  downloadText(`highlights-backup-${new Date().toISOString().slice(0, 10)}.json`, serialize(st().lib), "application/json");
}
export async function restoreFromJSON(file: File) {
  try {
    const data = validateLib(JSON.parse(await file.text()));
    const cur = st().lib;
    let how: "merge" | "replace" | null = "replace";
    if (cur.highlights.length) {
      how = await choiceBox("Restore backup", `Backup has ${data.highlights.length} highlights in ${data.books.length} books. You currently have ${cur.highlights.length}.`,
        [{ label: "Merge into current", value: "merge" as const, primary: true }, { label: "Replace everything", value: "replace" as const, danger: true }]);
      if (!how) return;
    }
    if (how === "merge") { mergeLib(cur, data); st().replaceLib(cur); } else st().replaceLib(data);
    toast("Library restored.");
  } catch (e) { toast("Couldn't restore: " + (e as Error).message); }
}
export async function openLibraryFileFlow() {
  const msg = await st().openLibraryFile((count) => choiceBox("Open library file", `This browser already has ${count} highlights. What should happen?`,
    [{ label: "Merge both", value: "merge" as const, primary: true }, { label: "Replace with file", value: "replace" as const, danger: true }]));
  if (msg) toast(msg); else if (msg === null) toast(`Opened library file — ${st().lib.highlights.length} highlights`);
}
export async function linkFileFlow() {
  const msg = await st().linkNewFile();
  if (msg) toast(msg); else if (msg === null) toast("Library linked. Changes now save to " + st().file.handle?.name);
}
export async function wipeLibrary() {
  if (!(await confirmBox("Delete the entire library?", "All books, highlights, notes, tags, folders and backgrounds in this browser are erased. Consider downloading a backup first.", "Delete everything", true))) return;
  st().replaceLib(L.emptyLib());
}

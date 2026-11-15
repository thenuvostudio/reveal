"use client";
import { useEffect, useRef } from "react";
import { useApp } from "@/store/app";
import { bgStyles } from "@/lib/colors";
import { bookById, folderById } from "@/lib/library";
import { resizeImage } from "@/lib/image";
import Feed from "./Feed";
import Ruler from "./Ruler";
import TopBar from "./TopBar";
import SettingsDrawer from "./SettingsDrawer";
import LibraryDrawer from "./LibraryDrawer";
import { DialogHost, anyDialogOpen } from "./dialogs";
import { Toast, toast } from "./toast";
import { CursorFx, Hop, Welcome } from "./Extras";
import { handleCSVFiles } from "./ImportDialog";
import { restoreFromJSON } from "./libraryActions";
import { editorOpen } from "./editors";
import { bus } from "./bus";

export default function App() {
  const ready = useApp((s) => s.ready);
  const version = useApp((s) => s.version);
  const lib = useApp((s) => s.lib);
  const drawer = useApp((s) => s.drawer);
  const storageError = useApp((s) => s.storageError);
  const csvRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const imgTarget = useRef<{ kind: "b" | "f"; id: string } | null>(null);

  useEffect(() => {
    // read-only debugging handle (also used by the browser tests for a few deep checks)
    (window as unknown as { __reveal: typeof useApp }).__reveal = useApp;
    useApp.getState().init();
  }, []);
  useEffect(() => { if (storageError) toast("Browser storage isn't available, so changes won't be kept. " + storageError, 6000); }, [storageError]);
  const empty = ready && !lib.highlights.length;
  useEffect(() => { document.body.classList.toggle("empty", empty); }, [empty]);

  // file pickers
  useEffect(() => {
    bus.pickCSV = () => csvRef.current?.click();
    bus.pickJSON = () => jsonRef.current?.click();
    bus.pickImage = (t) => { imgTarget.current = t; imgRef.current?.click(); };
  }, []);

  // keyboard shortcuts, drag & drop files, saving safety
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (anyDialogOpen()) return;
      const t = e.target as HTMLElement;
      const typing = t.matches?.("input,textarea,select") || t.isContentEditable;
      const r = bus.ruler;
      if (r?.isActive() && !typing) {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); r.step(1); return; }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); r.step(-1); return; }
        if (e.key === "Enter") { e.preventDefault(); r.choose(); return; }
        if (e.key === "Escape") { e.preventDefault(); r.close(); return; }
      }
      if (typing) return;
      const st = useApp.getState();
      if (e.key === "Escape") {
        if (st.drawer) st.setDrawer(null);
        else if (st.mode.type === "search") st.clearSearch();
        else bus.deselect?.();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); bus.focusSearch?.(); return; }
      if (st.drawer) return;
      if (e.key === "b" || e.key === "B") { e.preventDefault(); r?.activate(); return; }
      if (["ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); bus.goPage?.(1); }
      if (["ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); bus.goPage?.(-1); }
      if (e.key === "Home") { e.preventDefault(); bus.goPage?.("first"); }
      if (e.key === "End") { e.preventDefault(); bus.goPage?.("last"); }
    };
    let depth = 0;
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types || [])].includes("Files");
    const onEnter = (e: DragEvent) => { if (hasFiles(e)) { depth++; document.body.classList.add("dragging"); } };
    const onLeave = (e: DragEvent) => { if (hasFiles(e) && --depth <= 0) { depth = 0; document.body.classList.remove("dragging"); } };
    const onOver = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; document.body.classList.remove("dragging");
      const files = [...(e.dataTransfer?.files || [])];
      const json = files.find((f) => /\.json$/i.test(f.name));
      if (json) { restoreFromJSON(json); return; }
      if (files.length) handleCSVFiles(files);
    };
    const onUnload = (e: BeforeUnloadEvent) => { useApp.getState().flush(); if (editorOpen) { e.preventDefault(); e.returnValue = ""; } };
    const onHide = () => { if (document.visibilityState === "hidden") useApp.getState().flush(); };
    document.addEventListener("keydown", onKey);
    addEventListener("dragenter", onEnter); addEventListener("dragleave", onLeave); addEventListener("dragover", onOver); addEventListener("drop", onDrop);
    addEventListener("beforeunload", onUnload); document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("keydown", onKey);
      removeEventListener("dragenter", onEnter); removeEventListener("dragleave", onLeave); removeEventListener("dragover", onOver); removeEventListener("drop", onDrop);
      removeEventListener("beforeunload", onUnload); document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  const onImage = async (file: File | undefined) => {
    const target = imgTarget.current;
    if (!file || !target) return;
    try {
      const data = await resizeImage(file);
      const st = useApp.getState();
      const ent = target.kind === "b" ? bookById(st.lib, target.id) : folderById(st.lib, target.id);
      if (ent) { ent.bgImage = data; st.commit(); toast("Background image set"); }
    } catch (err) { toast((err as Error).message || "Couldn't use that image"); }
  };

  void version;
  return (
    <>
      <style id="bgStyles">{bgStyles(lib)}</style>
      {ready && <Feed />}
      {empty && <Welcome />}
      <TopBar />
      {ready && <Ruler />}
      <div className={`scrim ${drawer ? "open" : ""}`} id="scrim" data-testid="scrim" onClick={() => useApp.getState().setDrawer(null)} />
      <SettingsDrawer />
      <LibraryDrawer />
      <input type="file" id="csvInput" ref={csvRef} accept=".csv,text/csv" multiple hidden onChange={(e) => { if (e.target.files) handleCSVFiles(e.target.files); e.target.value = ""; }} />
      <input type="file" id="jsonInput" ref={jsonRef} accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restoreFromJSON(f); e.target.value = ""; }} />
      <input type="file" id="imgInput" ref={imgRef} accept="image/*" hidden onChange={(e) => { onImage(e.target.files?.[0]); e.target.value = ""; }} />
      <DialogHost />
      <Hop />
      <Toast />
      <CursorFx />
    </>
  );
}

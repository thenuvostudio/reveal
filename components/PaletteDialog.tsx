"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/store/app";
import { uid } from "@/lib/library";
import { MAX_COLORS, MIN_COLORS, ORIGINAL_ID, allPalettes, normalizeHex, type Palette } from "@/lib/palettes";
import { confirmBox, openDialog } from "./dialogs";
import { toast } from "./toast";

const START = ["#A65F45", "#6B4E3A"]; // terracotta, umber: a sensible first pair

function PaletteBody({ existing, close }: { existing?: Palette; close: () => void }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [rows, setRows] = useState<string[]>(existing ? [...existing.colors] : START);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); first.current?.select(); }, []);
  const setRow = (i: number, v: string) => setRows((rs) => rs.map((x, j) => (j === i ? v : x)));

  const save = () => {
    const st = useApp.getState();
    const custom = st.settings.customPalettes;
    const n = name.trim();
    if (!n) { toast("Give the colour set a name."); return; }
    if (allPalettes(custom).some((p) => p.id !== existing?.id && p.name.toLowerCase() === n.toLowerCase())) { toast(`There is already a colour set called “${n}”.`); return; }
    const bad = rows.find((r) => !normalizeHex(r));
    if (bad !== undefined) { toast(`“${bad}” is not a colour. Use a hex code like #A65F45.`); return; }
    const colors = rows.map((r) => normalizeHex(r)!);
    close();
    if (existing) {
      st.setSettings({ customPalettes: custom.map((p) => (p.id === existing.id ? { ...p, name: n, colors } : p)) });
    } else {
      const p: Palette = { id: "c" + uid(), name: n, colors };
      st.setSettings({ customPalettes: [...custom, p], theme: p.id }); // a new set is put to use straight away
    }
    toast(`Colour set “${n}” saved`);
  };

  return (
    <>
      <h3>{existing ? "Edit colour set" : "New colour set"}</h3>
      <p>Backgrounds are blended from these colours, and each book gets one of them as its own. Pale colours are deepened a little so the white text stays readable.</p>
      <div className="imp-row" style={{ border: 0, padding: 0, background: "none" }}>
        <label htmlFor="palName">Name</label>
        <input id="palName" ref={first} value={name} placeholder="For example: Autumn" style={{ fontFamily: "var(--sans)" }} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
      </div>
      <div className="palstrip" data-testid="pal-preview">{rows.map((r, i) => <i key={i} style={{ background: normalizeHex(r) || "transparent" }} />)}</div>
      <div id="palRows">
        {rows.map((r, i) => (
          <div className="palrow" key={i}>
            <input type="color" data-pc={i} aria-label={`Colour ${i + 1}`} value={normalizeHex(r) || "#000000"} onChange={(e) => setRow(i, e.target.value)} />
            <input type="text" data-ph={i} aria-label={`Hex code of colour ${i + 1}`} value={r} spellCheck={false} maxLength={7} onChange={(e) => setRow(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
            <button className="btn ghost" data-prm={i} aria-label={`Remove colour ${i + 1}`} title="Remove" disabled={rows.length <= MIN_COLORS} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
      </div>
      <button className="btn" data-padd disabled={rows.length >= MAX_COLORS} onClick={() => setRows((rs) => [...rs, rs[rs.length - 1]])}>＋ Add colour</button>
      <span className="palhint">{MIN_COLORS} to {MAX_COLORS} colours</span>
      <div className="foot"><button className="btn" data-x onClick={close}>Cancel</button><button className="btn primary" data-ok onClick={save}>Save</button></div>
    </>
  );
}

export function openPaletteDialog(existing?: Palette) {
  openDialog((close) => <PaletteBody existing={existing} close={close} />);
}

export async function deletePaletteFlow(p: Palette) {
  if (!(await confirmBox("Delete this colour set?", `“${p.name}” is removed from your themes. Books keep their highlights; their backgrounds go back to another theme.`, "Delete", true))) return;
  const st = useApp.getState();
  st.setSettings({
    customPalettes: st.settings.customPalettes.filter((x) => x.id !== p.id),
    ...(st.settings.theme === p.id ? { theme: ORIGINAL_ID } : {}),
  });
  toast("Colour set deleted");
}

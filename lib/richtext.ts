/** Rich-text helpers for edited highlights. These touch the DOM, so they run in the browser only. */
import type { Highlight } from "./types";
import { esc, hilite } from "./text";

export type HlColor = "yellow" | "green" | "blue" | "pink";
export const HL_COLORS: Record<HlColor, [number, number, number, number]> = {
  yellow: [250, 204, 21, 0.45], green: [74, 222, 128, 0.4], blue: [96, 165, 250, 0.4], pink: [244, 114, 182, 0.4],
};
export const rgba = (c: [number, number, number, number]) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})`;

export function mapColor(css: string | null | undefined): HlColor | null {
  if (!css || css === "transparent" || css === "initial" || css === "inherit") return null;
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if (a === 0) return null;
  let best: HlColor | null = null, bd = Infinity;
  (Object.entries(HL_COLORS) as [HlColor, number[]][]).forEach(([k, c]) => {
    const d = Math.hypot(r - c[0], g - c[1], b - c[2]);
    if (d < bd) { bd = d; best = k; }
  });
  return bd < 90 ? best : null;
}

interface Fmt { b?: boolean; i?: boolean; u?: boolean; s?: boolean; c?: HlColor | null }
interface Run { text: string; f: Fmt }

/** Reads whatever the contenteditable produced and rewrites it in our tiny format:
 *  <b> <i> <u> <s> <mark class="hl-…"> and "\n" line breaks. Returns html + plain text. */
export function sanitizeEditor(root: HTMLElement): { html: string; plain: string } {
  const runs: Run[] = [];
  const BLOCK = /^(DIV|P|LI|H\d|BLOCKQUOTE|PRE)$/;
  const nl = () => { const l = runs[runs.length - 1]; if (runs.length && !l.text.endsWith("\n")) runs.push({ text: "\n", f: {} }); };
  (function walk(node: Node, f: Fmt) {
    if (node.nodeType === 3) { if (node.nodeValue) runs.push({ text: node.nodeValue.replace(/ /g, " "), f }); return; }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === "BR") { runs.push({ text: "\n", f: {} }); return; }
    const g: Fmt = { ...f };
    const st = el.style;
    if (tag === "B" || tag === "STRONG") g.b = true;
    if (tag === "I" || tag === "EM") g.i = true;
    if (tag === "U") g.u = true;
    if (tag === "S" || tag === "STRIKE" || tag === "DEL") g.s = true;
    if (tag === "MARK") { const k = (el.className.match(/hl-(\w+)/) || [])[1] as HlColor | undefined; g.c = k && HL_COLORS[k] ? k : null; }
    if (st?.fontWeight) g.b = st.fontWeight === "bold" || st.fontWeight === "bolder" || +st.fontWeight >= 600;
    if (st?.fontStyle) g.i = st.fontStyle === "italic" || st.fontStyle === "oblique";
    const td = st?.textDecorationLine || st?.textDecoration;
    if (td) { g.u = td.includes("underline"); g.s = td.includes("line-through"); }
    if (st?.backgroundColor) g.c = mapColor(st.backgroundColor);
    const block = BLOCK.test(tag) && el !== root;
    if (block) nl();
    el.childNodes.forEach((ch) => walk(ch, g));
    if (block) nl();
  })(root, {});
  while (runs.length && !runs[0].text.trim()) runs.shift();
  while (runs.length && !runs[runs.length - 1].text.trim()) runs.pop();
  if (runs.length) { runs[0].text = runs[0].text.replace(/^\s+/, ""); const l = runs[runs.length - 1]; l.text = l.text.replace(/\s+$/, ""); }
  const key = (f: Fmt) => `${f.c || ""}|${f.b ? 1 : 0}${f.i ? 1 : 0}${f.u ? 1 : 0}${f.s ? 1 : 0}`;
  // line breaks never carry formatting, so a colour can't bleed across lines
  const split: Run[] = [];
  runs.forEach((r) => r.text.split(/(\n)/).forEach((p) => { if (p) split.push(p === "\n" ? { text: "\n", f: {} } : { text: p, f: r.f }); }));
  const merged: Run[] = [];
  split.forEach((r) => { const l = merged[merged.length - 1]; if (l && key(l.f) === key(r.f)) l.text += r.text; else merged.push({ ...r }); });
  let html = "", plain = "", open: HlColor | null = null;
  merged.forEach(({ text, f }) => {
    plain += text;
    let s = esc(text);
    if (f.s) s = `<s>${s}</s>`;
    if (f.u) s = `<u>${s}</u>`;
    if (f.i) s = `<i>${s}</i>`;
    if (f.b) s = `<b>${s}</b>`;
    const c = f.c || null;
    if (c !== open) { if (open) html += "</mark>"; if (c) html += `<mark class="hl-${c}">`; open = c; }
    html += s;
  });
  if (open) html += "</mark>";
  return { html, plain };
}

/** Editor input: colours become inline backgrounds so execCommand can work with them. */
export function htmlForEditor(h: Highlight): string {
  const src = h.html || esc(h.text);
  return src
    .replace(/<mark class="hl-(\w+)">/g, (_, k: string) => `<span style="background-color: ${rgba(HL_COLORS[k as HlColor] || HL_COLORS.yellow)}">`)
    .replace(/<\/mark>/g, "</span>");
}

/** Adds search marks inside already-formatted html, without breaking its tags. */
export function hiliteHTML(html: string, ts: string[]): string {
  const words = ts.map((t) => t.replace(/^#/, "")).filter(Boolean);
  if (!words.length) return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  nodes.forEach((n) => {
    const out = hilite(n.nodeValue || "", words);
    if (out.includes("<mark")) { const t = document.createElement("template"); t.innerHTML = out; n.replaceWith(t.content); }
  });
  const d = document.createElement("div");
  d.appendChild(tpl.content);
  return d.innerHTML;
}

/** Applies an editor toolbar command to the current selection inside `ed`. Returns a message if nothing could be done. */
export function applyFormat(ed: HTMLElement, cmd: string, color?: HlColor | ""): string | null {
  const sel = document.getSelection();
  if (!sel || !ed.contains(sel.anchorNode)) ed.focus();
  if (cmd === "hilite") {
    if (document.getSelection()?.isCollapsed) return "Select some text first, then pick a colour.";
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("hiliteColor", false, color ? rgba(HL_COLORS[color]) : "transparent");
    document.execCommand("styleWithCSS", false, "false");
  } else if (cmd === "removeFormat") {
    document.execCommand("removeFormat");
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("hiliteColor", false, "transparent");
    document.execCommand("styleWithCSS", false, "false");
  } else {
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(cmd);
  }
  return null;
}

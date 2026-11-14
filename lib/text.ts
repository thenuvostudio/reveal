import type { Highlight, Library } from "./types";

export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Text shown for a highlight: the edited version if there is one. */
export const disp = (h: Highlight): string => (h.html ? (h.plain ?? "") : h.text);

export const terms = (query: string): string[] => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

export function matches(lib: Library, h: Highlight, ts: string[]): boolean {
  if (!ts.length) return true;
  const b = lib.books.find((x) => x.id === h.bookId);
  const hay = (disp(h) + "\n" + h.note + "\n" + h.readmooNote + "\n" + h.tags.join(" ") + "\n" + (b ? b.title : "")).toLowerCase();
  return ts.every((t) => hay.includes(t.replace(/^#/, "")));
}

/** Escapes `text` and wraps every search-term occurrence in <mark class="q">. */
export function hilite(text: string, ts: string[]): string {
  const safe = esc(text);
  const words = ts.map((t) => t.replace(/^#/, "")).filter(Boolean);
  if (!words.length) return safe;
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  words.forEach((t) => { let i = 0; while ((i = lower.indexOf(t, i)) !== -1) { ranges.push([i, i + t.length]); i += t.length; } });
  if (!ranges.length) return safe;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [ranges[0]];
  for (const r of ranges.slice(1)) { const l = merged[merged.length - 1]; if (r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else merged.push(r); }
  let out = "", pos = 0;
  merged.forEach(([s, e]) => { out += esc(text.slice(pos, s)) + '<mark class="q">' + esc(text.slice(s, e)) + "</mark>"; pos = e; });
  return out + esc(text.slice(pos));
}

const ALLOWED_TAG = /(<\/?(?:b|i|u|s)>|<mark class="hl-(?:yellow|green|blue|pink)">|<\/mark>)/;
/** Re-cleans stored rich text (e.g. from an imported backup): only our own tags survive, anything else becomes text. */
export function cleanStoredHtml(html: string): string {
  return html.split(ALLOWED_TAG).map((part, i) => (i % 2 ? part : part.replace(/</g, "&lt;").replace(/>/g, "&gt;"))).join("");
}

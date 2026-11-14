import type { Book, Highlight, Library } from "./types";
import { bookById, hlsOf, sortHls } from "./library";
import { esc } from "./text";

const EXPORT_COLORS: Record<string, string> = { yellow: "#fde68a", green: "#bbf7d0", blue: "#bfdbfe", pink: "#fbcfe8" };

/** Inline HTML keeps colours (Markdown has none) and avoids ** breaking next to Chinese punctuation. */
export function richForExport(h: Highlight): string {
  if (!h.html) return esc(h.text);
  return h.html.replace(/<mark class="hl-(\w+)">/g, (_, k: string) => `<mark style="background:${EXPORT_COLORS[k] || EXPORT_COLORS.yellow};color:inherit">`);
}
export const bookFileName = (b: Book, ext: string) => b.title.replace(/[\\/:*?"<>|]/g, "_") + ext;

export function exportMarkdown(lib: Library, bookId: string): string {
  const b = bookById(lib, bookId);
  if (!b) return "";
  let md = `# ${b.title}\n\n`, last: string | null = null;
  sortHls(hlsOf(lib, bookId), "chapter-asc").forEach((h) => {
    if (h.chapter !== last) { md += `\n## Chapter ${h.chapter}\n\n`; last = h.chapter; }
    md += richForExport(h).split("\n").map((l) => "> " + (l || "&nbsp;")).join("\n") + "\n";
    if (h.readmooNote) md += `\n**Readmoo note:** ${h.readmooNote}\n`;
    if (h.note) md += `\n**My note:** ${h.note.replace(/\n/g, "  \n")}\n`;
    if (h.tags.length) md += `\nTags: ${h.tags.map((t) => "#" + t).join(" ")}\n`;
    md += `\n<small>${h.date}${h.html ? " · edited" : ""}</small>\n\n---\n\n`;
  });
  return md;
}

export function exportHTMLPage(lib: Library, bookId: string): string {
  const b = bookById(lib, bookId);
  if (!b) return "";
  const hls = sortHls(hlsOf(lib, bookId), "chapter-asc");
  let body = "", last: string | null = null;
  hls.forEach((h) => {
    if (h.chapter !== last) { body += `<h2>Chapter ${esc(h.chapter)}</h2>`; last = h.chapter; }
    body += `<div class="hl"><div class="tx">${richForExport(h)}</div>
      ${h.readmooNote ? `<div class="nt"><span>Readmoo note</span>${esc(h.readmooNote)}</div>` : ""}
      ${h.note ? `<div class="nt my"><span>My note</span>${esc(h.note)}</div>` : ""}
      <div class="mt">${esc(h.date)}${h.html ? " · edited" : ""}${h.tags.length ? " · " + h.tags.map((t) => "#" + esc(t)).join(" ") : ""}</div></div>`;
  });
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"><title>${esc(b.title)}</title><style>
    body{font-family:"Noto Serif TC","Songti TC","PMingLiU",Georgia,serif;max-width:720px;margin:40px auto;padding:0 20px;color:#2b2622;background:#fffdf8;line-height:1.85}
    h1{font-size:28px;margin-bottom:4px} .sub{color:#8a8178;font:13px -apple-system,"Segoe UI",sans-serif;margin-bottom:24px}
    h2{font:600 12px -apple-system,"Segoe UI",sans-serif;letter-spacing:.08em;color:#9a9086;text-transform:uppercase;border-bottom:1px solid #e2d9c8;padding-bottom:4px;margin-top:32px}
    .hl{margin:16px 0 22px;break-inside:avoid} .tx{white-space:pre-wrap;border-left:3px solid #b4532a;padding-left:14px;font-size:17px}
    .nt{white-space:pre-wrap;background:#efe8da;border-radius:8px;padding:8px 12px;margin-top:8px;font:14px/1.6 -apple-system,"Segoe UI",sans-serif} .nt.my{background:#f3dccf}
    .nt span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#9a9086}
    .mt{font:12px -apple-system,"Segoe UI",sans-serif;color:#9a9086;margin-top:6px} mark{border-radius:2px}
    @media print{body{margin:0;background:#fff}}
  </style></head><body><h1>${esc(b.title)}</h1><div class="sub">${hls.length} highlights · exported ${new Date().toLocaleDateString()}</div>${body}</body></html>`;
}

export function downloadText(name: string, text: string, type: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

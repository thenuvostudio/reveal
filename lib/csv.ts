import type { CsvRow } from "./types";

/** RFC 4180 parser: quoted fields, doubled quotes, multi-line fields, CRLF, BOM. */
export function parseCSV(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { f += '"'; i++; } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); rows.push(row); row = []; f = "";
    } else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** UTF-8 first; fall back to Big5 (older Traditional Chinese exports). */
export function decodeBuffer(buf: ArrayBuffer): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch {
    try { return new TextDecoder("big5").decode(buf); }
    catch { return new TextDecoder("utf-8").decode(buf); }
  }
}

const HEADERS = ["章節", "劃線時間", "劃線內容", "註記", "章节", "划线时间", "划线内容", "注记"];

/** Turns a Readmoo export into rows. Throws a friendly Error if it isn't one. */
export function readmooRows(text: string): CsvRow[] {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error("File is empty.");
  const head = rows[0].map((s) => s.trim());
  if (!head.some((h) => HEADERS.includes(h))) {
    throw new Error("Doesn't look like a Readmoo export (missing 章節 / 劃線內容 header).");
  }
  const find = (names: string[], fallback: number) => {
    for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; }
    return fallback;
  };
  const ci = find(["章節", "章节"], 0);
  const di = find(["劃線時間", "划线时间"], 1);
  const ti = find(["劃線內容", "划线内容"], 2);
  const ni = find(["註記", "注记"], 3);
  return rows.slice(1)
    .map((r) => ({
      chapter: (r[ci] || "").trim(),
      date: (r[di] || "").trim(),
      text: (r[ti] || "").replace(/\r\n/g, "\n").replace(/^\n+|\s+$/g, ""),
      readmooNote: (r[ni] || "").replace(/\r\n/g, "\n").trim(),
    }))
    .filter((h) => h.text);
}

export function titleFromFilename(name: string): string {
  return name.replace(/\.csv$/i, "").replace(/[_\s]+$/, "").trim() || "Untitled book";
}

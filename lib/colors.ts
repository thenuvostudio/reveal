import type { Book, Folder, Library } from "./types";
import { folderPath } from "./library";
import { mix, toHex, toned, type Palette } from "./palettes";

export function hash(s: string): number {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.codePointAt(0)!; h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Small seeded PRNG (mulberry32), so colours and shuffles are repeatable. */
export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export interface Gradient { c1: string; c2: string; css: string }
export function gradientFor(key: string): Gradient {
  const r = rng(hash(key));
  let h1 = Math.floor(r() * 360);
  if (h1 > 42 && h1 < 110) h1 = (h1 + 120) % 360; // skip muddy olive hues
  const h2 = (h1 + 25 + r() * 60) % 360, h3 = (h1 + 180 + r() * 60) % 360, ang = Math.floor(r() * 360);
  const c1 = `hsl(${h1} ${55 + r() * 20}% ${30 + r() * 10}%)`, c2 = `hsl(${h2} ${55 + r() * 20}% ${22 + r() * 12}%)`;
  return {
    c1, c2,
    css: `radial-gradient(circle at ${20 + r() * 60}% ${15 + r() * 50}%, hsl(${h3} 80% 60% / .45), transparent 55%), radial-gradient(circle at ${r() * 100}% 100%, hsl(${h2} 85% 55% / .35), transparent 50%), linear-gradient(${ang}deg, ${c1}, ${c2})`,
  };
}
/** Which colour of the set this key gets as its main colour. */
export const paletteIndex = (p: Palette, key: string) => hash(key) % p.colors.length;
/** A gradient built only from a colour set: the key's own colour, blended with its neighbours in the set.
 *  Every colour is toned down just enough for white text to stay readable. */
export function paletteGradient(p: Palette, key: string): Gradient {
  const n = p.colors.length, i = paletteIndex(p, key), r = rng(hash(key + "|theme"));
  const main = toned(p.colors[i]), second = toned(p.colors[(i + 1) % n]), third = toned(p.colors[(i + 2) % n]);
  const c1 = toHex(main), c2 = toHex(mix(mix(main, second, 0.35), [0, 0, 0], 0.22));
  const ang = Math.floor(r() * 360);
  return {
    c1, c2,
    css: `radial-gradient(circle at ${Math.round(20 + r() * 60)}% ${Math.round(15 + r() * 50)}%, ${toHex(second)}73, transparent 55%), radial-gradient(circle at ${Math.round(r() * 100)}% 100%, ${toHex(third)}59, transparent 50%), linear-gradient(${ang}deg, ${c1}, ${c2})`,
  };
}
const keyOf = (kind: "b" | "f", ent: Book | Folder) => kind + ent.id + (ent.bgSeed || "");
/** A book's or folder's gradient: from the colour set if a theme is on, else the app's own random one. */
export const gradOf = (kind: "b" | "f", ent: Book | Folder, palette: Palette | null = null) =>
  palette ? paletteGradient(palette, keyOf(kind, ent)) : gradientFor(keyOf(kind, ent));
/** A new background seed. With a theme on, one that lands on a different colour of the set. */
export function rerollSeed(kind: "b" | "f", ent: Book | Folder, palette: Palette | null): string {
  const fresh = () => Math.random().toString(36).slice(2, 8);
  if (!palette || palette.colors.length < 2) return fresh();
  const now = paletteIndex(palette, keyOf(kind, ent));
  for (let t = 0; t < 40; t++) { const s = fresh(); if (paletteIndex(palette, kind + ent.id + s) !== now) return s; }
  return fresh();
}

/** A book's own image, else the nearest folder image above it, else nothing. */
export function effectiveImage(lib: Library, b: Book | undefined): string | null {
  if (!b) return null;
  if (b.bgImage) return b.bgImage;
  const path = folderPath(lib, b.folderId);
  for (let i = path.length - 1; i >= 0; i--) if (path[i].bgImage) return path[i].bgImage!;
  return null;
}
/** CSS-safe class suffix for an id. */
export const cls = (id: string) => String(id).replace(/[^\w-]/g, "_");
const cssUrl = (u: string) => `url("${u.replace(/["\\\n]/g, "")}")`;
/** One rule per book/folder, so big image data-URLs live in a single <style> instead of on every page. */
export function bgStyles(lib: Library, palette: Palette | null = null): string {
  let css = "";
  lib.books.forEach((b) => { const img = effectiveImage(lib, b); css += `.bgb-${cls(b.id)}{background-image:${img ? cssUrl(img) : gradOf("b", b, palette).css}}\n`; });
  lib.folders.forEach((f) => { css += `.bgf-${cls(f.id)}{background-image:${f.bgImage ? cssUrl(f.bgImage) : gradOf("f", f, palette).css}}\n`; });
  return css;
}

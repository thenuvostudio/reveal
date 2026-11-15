/** Colour themes: named sets of colours that book and folder backgrounds are built from. */
export interface Palette {
  id: string;
  name: string;
  colors: string[]; // "#rrggbb", 2 to 6 of them
}

/** The theme that keeps the app's own random gradients (the default). */
export const ORIGINAL_ID = "original";
export const MIN_COLORS = 2;
export const MAX_COLORS = 6;

/** The natural colour list, grouped by where the colours come from. */
export const BUILTIN_PALETTES: Palette[] = [
  { id: "paper", name: "Paper and cloth", colors: ["#EFE9DC", "#E0D6C3", "#D3C7B2", "#B99B74"] }, // unbleached cotton, linen, oatmeal, kraft
  { id: "earth", name: "Earth", colors: ["#CDB891", "#B5795A", "#A65F45", "#6B4E3A"] },           // sand, clay, terracotta, umber
  { id: "wood", name: "Wood", colors: ["#D8C3A0", "#A98058", "#5E4433"] },                        // birch, oak, walnut
  { id: "stone", name: "Stone", colors: ["#B4AEA4", "#6C7278", "#3A3836"] },                      // pebble, slate, charcoal
  { id: "plants", name: "Plants", colors: ["#A9B09A", "#7C8562", "#6B6A45", "#3F5346"] },         // sage, moss, olive, pine
  { id: "water", name: "Water and sky", colors: ["#C9D2D3", "#9DB5AE", "#3F4E63"] },              // mist, sea glass, indigo
  { id: "accents", name: "Accents", colors: ["#C9703F", "#7B2F33", "#B9973F"] },                  // persimmon, azuki red, mustard seed
];

/** "#abc", "abc", "#AABBCC" → "#aabbcc"; anything else → null. */
export function normalizeHex(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const m = s.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(m)) return "#" + [...m].map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/.test(m) ? "#" + m : null;
}

/** Repairs custom sets read from storage: drops anything that is not a usable set. */
export function validPalettes(v: unknown): Palette[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>([ORIGINAL_ID, ...BUILTIN_PALETTES.map((p) => p.id)]);
  const out: Palette[] = [];
  for (const p of v as Partial<Palette>[]) {
    if (!p || typeof p.id !== "string" || !p.id || seen.has(p.id)) continue;
    const name = typeof p.name === "string" ? p.name.trim() : "";
    const colors = (Array.isArray(p.colors) ? p.colors : []).map(normalizeHex).filter((c): c is string => !!c).slice(0, MAX_COLORS);
    if (!name || colors.length < MIN_COLORS) continue;
    seen.add(p.id);
    out.push({ id: p.id, name, colors });
  }
  return out;
}

export const allPalettes = (custom: Palette[]): Palette[] => [...BUILTIN_PALETTES, ...custom];
/** The set with this id, or null for "original" (and for ids that no longer exist). */
export const findPalette = (id: string, custom: Palette[]): Palette | null => allPalettes(custom).find((p) => p.id === id) ?? null;
export const isBuiltin = (id: string) => id === ORIGINAL_ID || BUILTIN_PALETTES.some((p) => p.id === id);

/* ---------- colour maths ---------- */
export type RGB = [number, number, number];
export const toRgb = (hex: string): RGB => { const h = normalizeHex(hex) || "#000000"; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB; };
export const toHex = (c: RGB): string => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as RGB;
/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(c: RGB): number {
  const [r, g, b] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Quotes are set in white, so a background may not be brighter than this (4.5:1 contrast with white). */
export const MAX_LUMINANCE = 0.18;
/** Deepens a colour just enough for white text to stay readable on it. Dark colours come back unchanged. */
export function toned(hex: string): RGB {
  let c = toRgb(hex);
  if (luminance(c) <= MAX_LUMINANCE) return c;
  for (let i = 0; i < 60 && luminance(c) > MAX_LUMINANCE; i++) c = c.map((v) => v * 0.96) as RGB;
  return c.map(Math.floor) as RGB; // whole numbers, rounded down, so the colour as written in CSS is still under the limit
}

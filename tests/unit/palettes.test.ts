import { describe, expect, it } from "vitest";
import { BUILTIN_PALETTES, MAX_LUMINANCE, contrast, drawerColors, ORIGINAL_ID, allPalettes, findPalette, isBuiltin, luminance, normalizeHex, toHex, toRgb, toned, validPalettes } from "@/lib/palettes";
import { bgStyles, gradOf, paletteGradient, paletteIndex, rerollSeed } from "@/lib/colors";
import { emptyLib } from "@/lib/library";

const earth = BUILTIN_PALETTES.find((p) => p.id === "earth")!;

describe("the natural colour list", () => {
  it("has seven sets and 24 colours, all valid and all different", () => {
    expect(BUILTIN_PALETTES.map((p) => p.name)).toEqual(["Paper and cloth", "Earth", "Wood", "Stone", "Plants", "Water and sky", "Accents"]);
    const colors = BUILTIN_PALETTES.flatMap((p) => p.colors);
    expect(colors).toHaveLength(24);
    expect(new Set(colors.map((c) => c.toLowerCase())).size).toBe(24);
    expect(colors.every((c) => normalizeHex(c) === c.toLowerCase())).toBe(true);
    expect(new Set(BUILTIN_PALETTES.map((p) => p.id)).size).toBe(7);
    expect(earth.colors).toEqual(["#CDB891", "#B5795A", "#A65F45", "#6B4E3A"]);
  });
  it("finds sets by id; Original and unknown ids are no set", () => {
    const mine = { id: "c1", name: "Mine", colors: ["#111111", "#222222"] };
    expect(findPalette("earth", [])).toBe(earth);
    expect(findPalette("c1", [mine])).toBe(mine);
    expect(findPalette(ORIGINAL_ID, [mine])).toBeNull();
    expect(findPalette("gone", [mine])).toBeNull();
    expect(allPalettes([mine])).toHaveLength(8);
    expect(isBuiltin("earth")).toBe(true);
    expect(isBuiltin(ORIGINAL_ID)).toBe(true);
    expect(isBuiltin("c1")).toBe(false);
  });
});

describe("hex codes", () => {
  it("accepts 3 and 6 digits, with or without #, in any case", () => {
    expect(normalizeHex("#A65F45")).toBe("#a65f45");
    expect(normalizeHex("a65f45")).toBe("#a65f45");
    expect(normalizeHex(" #abc ")).toBe("#aabbcc");
    for (const bad of ["", "#12", "#12345", "#1234567", "red", "#gggggg", null, 5, undefined]) expect(normalizeHex(bad)).toBeNull();
  });
  it("converts to and from RGB", () => {
    expect(toRgb("#ff8000")).toEqual([255, 128, 0]);
    expect(toHex([255, 128, 0])).toBe("#ff8000");
    expect(toHex([300, -4, 15.6])).toBe("#ff0010");
  });
});

describe("toning for white text", () => {
  it("deepens every pale colour until white text is readable, keeping its hue", () => {
    for (const c of BUILTIN_PALETTES.flatMap((p) => p.colors)) {
      const t = toned(c);
      expect(luminance(t), c).toBeLessThanOrEqual(MAX_LUMINANCE);
      const [r, g, b] = toRgb(c);
      expect(t[0] / t[1]).toBeCloseTo(r / g, 1); // same proportions, so the same hue
      expect(t[2] / t[1]).toBeCloseTo(b / g, 1);
      expect(toRgb(toHex(t))).toEqual(t); // exactly what ends up in the stylesheet
    }
    expect(luminance(toRgb("#EFE9DC"))).toBeGreaterThan(0.8); // cotton really is pale to begin with
    expect(1.05 / (MAX_LUMINANCE + 0.05)).toBeGreaterThanOrEqual(4.5); // contrast with white
  });
  it("leaves colours that are dark enough exactly as they are", () => {
    expect(toHex(toned("#3A3836"))).toBe("#3a3836");
    expect(toHex(toned("#5E4433"))).toBe("#5e4433");
    expect(toHex(toned("#000000"))).toBe("#000000");
  });
});

describe("gradients from a set", () => {
  it("gives every book one colour of the set, always the same one", () => {
    const tones = earth.colors.map((c) => toHex(toned(c)));
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const g = paletteGradient(earth, "bbook" + i);
      expect(tones).toContain(g.c1);
      expect(g.c1).toBe(tones[paletteIndex(earth, "bbook" + i)]);
      expect(paletteGradient(earth, "bbook" + i)).toEqual(g);
      expect(g.css).not.toContain("hsl(");
      expect(g.css.match(/#[0-9a-f]{6}/g)!.every((h) => luminance(toRgb(h)) <= MAX_LUMINANCE + 1e-9)).toBe(true);
      seen.add(g.c1);
    }
    expect(seen.size).toBe(4); // all four colours get used
  });
  it("works with the smallest set", () => {
    const two = { id: "c2", name: "Two", colors: ["#112233", "#445566"] };
    const g = paletteGradient(two, "bx");
    expect(["#112233", "#445566"]).toContain(g.c1);
  });
  it("gradOf and bgStyles use the set when there is one, the original gradients when not", () => {
    const lib = emptyLib();
    lib.folders.push({ id: "f1", name: "F", parentId: null });
    lib.books.push({ id: "b1", title: "One", folderId: "f1" }, { id: "b2", title: "Two", folderId: null, bgImage: "data:image/jpeg;base64,AAAA" });
    expect(gradOf("b", lib.books[0]).css).toContain("hsl(");
    expect(gradOf("b", lib.books[0], earth)).toEqual(paletteGradient(earth, "bb1"));
    const plain = bgStyles(lib), themed = bgStyles(lib, earth);
    expect(plain).toContain("hsl(");
    expect(themed).not.toContain("hsl(");
    expect(themed).toContain(`.bgb-b1{background-image:${paletteGradient(earth, "bb1").css}}`);
    expect(themed).toContain(`.bgf-f1{background-image:${paletteGradient(earth, "ff1").css}}`);
    expect(themed).toContain('.bgb-b2{background-image:url("data:image/jpeg;base64,AAAA")}'); // an image still wins
  });
  it("“New colour” lands on a different colour of the set", () => {
    const book = { id: "b1", title: "One", folderId: null as string | null, bgSeed: "" };
    for (let i = 0; i < 25; i++) {
      const before = paletteIndex(earth, "b" + book.id + book.bgSeed);
      book.bgSeed = rerollSeed("b", book, earth);
      expect(paletteIndex(earth, "b" + book.id + book.bgSeed)).not.toBe(before);
    }
    expect(rerollSeed("b", book, null)).toMatch(/^[a-z0-9]+$/);
  });
});

describe("custom sets read from storage", () => {
  it("keeps good sets and repairs their colours", () => {
    expect(validPalettes([{ id: "c1", name: " Mine ", colors: ["#ABC", "112233", "nope"] }])).toEqual([{ id: "c1", name: "Mine", colors: ["#aabbcc", "#112233"] }]);
  });
  it("drops anything unusable", () => {
    expect(validPalettes(undefined)).toEqual([]);
    expect(validPalettes("x")).toEqual([]);
    expect(validPalettes([
      null, { id: "c1" }, { id: "c2", name: "", colors: ["#111111", "#222222"] }, { id: "c3", name: "One colour", colors: ["#111111"] },
      { id: "earth", name: "Clash with a built-in", colors: ["#111111", "#222222"] }, { id: ORIGINAL_ID, name: "Clash", colors: ["#111111", "#222222"] },
      { id: "ok", name: "Ok", colors: ["#111111", "#222222"] }, { id: "ok", name: "Same id again", colors: ["#111111", "#222222"] },
    ])).toEqual([{ id: "ok", name: "Ok", colors: ["#111111", "#222222"] }]);
  });
  it("never keeps more than six colours", () => {
    const many = Array.from({ length: 9 }, (_, i) => `#${i}${i}${i}${i}${i}${i}`);
    expect(validPalettes([{ id: "c1", name: "Many", colors: many }])[0].colors).toHaveLength(6);
  });
});

describe("drawer colours on phones", () => {
  it("are tinted from the set, and every text colour reads at 4.5:1 on every surface", () => {
    for (const id of ["plants", "stone"]) {
      const c = drawerColors(id);
      const surfaces = [c.card, c.paper, c.paperEnd, c.paper2, c.accentSoft].map(toRgb);
      for (const fg of [c.ink, c.ink2, c.ink3, c.accent]) for (const bg of surfaces) expect(contrast(toRgb(fg), bg), `${id} ${fg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(drawerColors("plants").ink2).toBe("#3f5346"); // pine, already dark enough, is used as it is
    expect(() => drawerColors("nope")).toThrow();
  });
});

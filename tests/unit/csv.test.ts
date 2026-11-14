import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeBuffer, parseCSV, readmooRows, titleFromFilename } from "@/lib/csv";

const fixture = (n: string) => readFileSync(`${__dirname}/../fixtures/${n}`);

describe("parseCSV", () => {
  it("handles quotes, doubled quotes, multi-line fields, CRLF and a BOM", () => {
    const rows = parseCSV('﻿a,b\r\n"x, y","he said ""hi"""\r\n"line1\nline2",z\n');
    expect(rows).toEqual([["a", "b"], ["x, y", 'he said "hi"'], ["line1\nline2", "z"]]);
  });
  it("drops blank lines", () => {
    expect(parseCSV("a\n\n\nb\n")).toEqual([["a"], ["b"]]);
  });
});

describe("readmooRows", () => {
  it("reads both sample exports", () => {
    const a = readmooRows(decodeBuffer(fixture("peaks-and-valleys.csv").buffer as ArrayBuffer));
    const b = readmooRows(decodeBuffer(fixture("streaming.csv").buffer as ArrayBuffer));
    expect(a).toHaveLength(35);
    expect(b).toHaveLength(25);
    expect(a[0]).toMatchObject({ chapter: "19", date: "2025-01-10" });
    expect(a[0].text).toContain("\n"); // multi-line highlight kept intact
    expect(a.some((r) => r.readmooNote.includes("工作順境"))).toBe(true);
  });
  it("rejects files that aren't Readmoo exports", () => {
    expect(() => readmooRows("name,age\nA,1")).toThrow(/Readmoo/);
    expect(() => readmooRows("")).toThrow(/empty/);
  });
  it("decodes Big5 when the file isn't UTF-8", () => {
    const big5 = new Uint8Array([0xb3, 0xb9, 0xb8, 0x60]); // 章節 in Big5
    expect(decodeBuffer(big5.buffer)).toBe("章節");
  });
});

describe("titleFromFilename", () => {
  it("strips .csv and trailing underscores", () => {
    expect(titleFromFilename("峰與谷__.csv")).toBe("峰與谷");
    expect(titleFromFilename(".csv")).toBe("Untitled book");
  });
});

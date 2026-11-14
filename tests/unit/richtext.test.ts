// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { hiliteHTML, htmlForEditor, mapColor, sanitizeEditor } from "@/lib/richtext";
import { hilite, cleanStoredHtml } from "@/lib/text";
import { exportMarkdown } from "@/lib/exporters";
import { emptyLib, importRows } from "@/lib/library";

const ed = (html: string) => { const d = document.createElement("div"); d.innerHTML = html; return d; };

describe("sanitizeEditor", () => {
  it("turns editor markup into our tiny format", () => {
    const r = sanitizeEditor(ed('<b>幫助</b>別人<div><span style="background-color: rgba(250, 204, 21, 0.45)">樂於<i>分享</i></span></div>'));
    expect(r.html).toBe('<b>幫助</b>別人\n<mark class="hl-yellow">樂於<i>分享</i></mark>');
    expect(r.plain).toBe("幫助別人\n樂於分享");
  });
  it("drops unknown tags and attributes, keeps text", () => {
    const r = sanitizeEditor(ed('<a href="x" onclick="evil()">link</a><script>bad()</script>'));
    expect(r.html).not.toMatch(/<a|onclick|<script/);
  });
  it("colour never spans a line break; transparent removes colour", () => {
    expect(sanitizeEditor(ed('<span style="background-color: rgba(244,114,182,.4)">a<br>b</span>')).html).toBe('<mark class="hl-pink">a</mark>\n<mark class="hl-pink">b</mark>');
    expect(mapColor("transparent")).toBeNull();
    expect(mapColor("rgba(96, 165, 250, 0.4)")).toBe("blue");
  });
  it("round-trips through the editor unchanged", () => {
    const html = '<b>x</b> <mark class="hl-green">y</mark>';
    expect(sanitizeEditor(ed(htmlForEditor({ html, text: "" } as never))).html).toBe(html);
  });
});

describe("search marks", () => {
  it("merges overlapping hits and escapes text", () => {
    expect(hilite("a<b>低谷低", ["低谷", "谷低"])).toBe('a&lt;b&gt;<mark class="q">低谷低</mark>');
    expect(hiliteHTML("<b>高峰</b>與低谷", ["低谷"])).toBe('<b>高峰</b>與<mark class="q">低谷</mark>');
  });
  it("stored html cleaner keeps only our tags", () => {
    expect(cleanStoredHtml('<b>a</b><u onclick=1>b</u>')).toBe("<b>a</b>&lt;u onclick=1&gt;b</u>");
  });
});

describe("markdown export", () => {
  it("keeps edits and colours as inline html", () => {
    const lib = emptyLib();
    importRows(lib, "B", [{ chapter: "1", date: "2025-01-01", text: "hello", readmooNote: "" }]);
    Object.assign(lib.highlights[0], { html: '<mark class="hl-yellow"><b>hello</b></mark>', plain: "hello", note: "n" });
    const md = exportMarkdown(lib, lib.books[0].id);
    expect(md).toContain('<mark style="background:#fde68a;color:inherit"><b>hello</b></mark>');
    expect(md).toContain("**My note:** n");
  });
});

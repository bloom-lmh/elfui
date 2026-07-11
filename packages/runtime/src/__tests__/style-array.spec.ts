// L3.10: :style 数组合并测试

import { useRef } from "@elfui/reactivity";
import { describe, expect, it } from "vitest";

import { sty } from "../bindings";

describe("sty — :style 数组形态", () => {
  it("数组合并多个 style 对象", () => {
    const el = document.createElement("div");
    sty(el, () => [{ color: "red" }, { fontSize: 14 }]);
    const style = el.getAttribute("style") ?? "";
    expect(style).toContain("color: red");
    expect(style).toContain("font-size: 14px");
  });

  it("数组 + 字符串 + 对象混合", () => {
    const el = document.createElement("div");
    sty(el, () => ["margin: 8px", { padding: 4, color: "blue" }]);
    const style = el.getAttribute("style") ?? "";
    expect(style).toContain("margin: 8px");
    expect(style).toContain("padding: 4px");
    expect(style).toContain("color: blue");
  });

  it("数组中嵌套数组（深度合并）", () => {
    const el = document.createElement("div");
    sty(el, () => [[{ color: "red" }, { background: "blue" }], { padding: 8 }]);
    const style = el.getAttribute("style") ?? "";
    expect(style).toContain("color: red");
    expect(style).toContain("background: blue");
    expect(style).toContain("padding: 8px");
  });

  it("响应式更新", () => {
    const fz = useRef(12);
    const el = document.createElement("div");
    sty(el, () => [{ color: "red" }, { fontSize: fz.value }]);
    expect(el.getAttribute("style")).toContain("font-size: 12px");

    fz.value = 18;
    expect(el.getAttribute("style")).toContain("font-size: 18px");
  });
});

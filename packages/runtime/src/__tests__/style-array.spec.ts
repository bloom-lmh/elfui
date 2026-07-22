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

  it("重复混合更新时正确复用声明缓冲区", () => {
    const value = useRef<Array<string | Record<string, string | number>>>([
      "color: red; margin: 4px",
      { padding: 2 }
    ]);
    const el = document.createElement("div");
    sty(el, () => value.value);

    value.value = ["color: blue", { padding: 8 }];
    expect(el.style.color).toBe("blue");
    expect(el.style.margin).toBe("");
    expect(el.style.padding).toBe("8px");

    value.value = ["margin: 6px", { color: "green" }];
    expect(el.style.color).toBe("green");
    expect(el.style.margin).toBe("6px");
    expect(el.style.padding).toBe("");
  });
});

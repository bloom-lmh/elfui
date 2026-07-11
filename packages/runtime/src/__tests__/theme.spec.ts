// K2 / K3: globalStyle / theme 单测

import { afterEach, describe, expect, it } from "vitest";

import { defineCustomElement } from "../element";
import { globalStyle, resetGlobalStyles, theme } from "../theme";

afterEach(() => {
  resetGlobalStyles();
});

describe("globalStyle", () => {
  it("注入到 document.head", () => {
    globalStyle(`body { background: red; }`);
    const el = document.head.querySelector("style#__elfui_global__");
    expect(el?.textContent ?? "").toContain("body { background: red; }");
  });

  it("多次调用累加到同一 <style>", () => {
    globalStyle(`a { color: blue; }`);
    globalStyle(`b { color: green; }`);
    const els = document.head.querySelectorAll("style#__elfui_global__");
    expect(els).toHaveLength(1);
    const text = els[0]!.textContent ?? "";
    expect(text).toContain("a { color: blue; }");
    expect(text).toContain("b { color: green; }");
  });

  it("无 id 调用返回的 disposer 只移除本次注入", () => {
    const disposeA = globalStyle(`a { color: blue; }`);
    globalStyle(`b { color: green; }`);
    disposeA();

    const el = document.head.querySelector("style#__elfui_global__");
    const text = el?.textContent ?? "";
    expect(text).not.toContain("a { color: blue; }");
    expect(text).toContain("b { color: green; }");
  });

  it("带 id 时重复调用覆盖旧内容，旧 disposer 不会删掉新内容", () => {
    const disposeOld = globalStyle(`body { color: red; }`, { id: "app" });
    const disposeNew = globalStyle(`body { color: blue; }`, { id: "app" });

    const el = document.head.querySelector("style#__elfui_global__app");
    expect(el?.textContent ?? "").not.toContain("color: red");
    expect(el?.textContent ?? "").toContain("color: blue");

    disposeOld();
    expect(document.head.querySelector("style#__elfui_global__app")).not.toBeNull();

    disposeNew();
    expect(document.head.querySelector("style#__elfui_global__app")).toBeNull();
  });
});

describe("theme", () => {
  it("接受字符串 tag", () => {
    theme("my-button", `padding: 8px 16px;`);
    const el = document.head.querySelector("style#__elfui_theme__my-button");
    expect(el?.textContent ?? "").toContain("my-button {");
    expect(el?.textContent ?? "").toContain("padding: 8px 16px;");
  });

  it("接受已注册的构造器", () => {
    const tag = `elf-test-theme-${Math.random().toString(36).slice(2, 8)}`;
    const Ctor = defineCustomElement({ tag, render: () => document.createElement("div") });
    theme(Ctor, `color: green;`);
    const el = document.head.querySelector(`style#__elfui_theme__${tag}`);
    expect(el?.textContent ?? "").toContain(`${tag} {`);
    expect(el?.textContent ?? "").toContain("color: green;");
  });

  it("不同 tag 各自一个 <style>", () => {
    theme("a-btn", `color: red;`);
    theme("b-btn", `color: blue;`);
    expect(document.head.querySelector("style#__elfui_theme__a-btn")).not.toBeNull();
    expect(document.head.querySelector("style#__elfui_theme__b-btn")).not.toBeNull();
  });

  it("带 id 的 theme 可覆盖和注销", () => {
    theme("elf-button", `color: red;`, { id: "brand" });
    const dispose = theme("elf-button", `color: blue;`, { id: "brand" });

    const el = document.head.querySelector("style#__elfui_theme__elf-button__brand");
    expect(el?.textContent ?? "").not.toContain("color: red");
    expect(el?.textContent ?? "").toContain("color: blue");

    dispose();
    expect(document.head.querySelector("style#__elfui_theme__elf-button__brand")).toBeNull();
  });

  it("resetGlobalStyles 清理所有全局样式和主题样式", () => {
    globalStyle(`body { color: red; }`);
    theme("elf-button", `color: blue;`);

    resetGlobalStyles();

    expect(document.head.querySelector('style[id^="__elfui_global__"]')).toBeNull();
    expect(document.head.querySelector('style[id^="__elfui_theme__"]')).toBeNull();
  });

  it("无效目标抛错", () => {
    expect(() => theme({}, `x: 1;`)).toThrow(/无效目标/);
  });
});

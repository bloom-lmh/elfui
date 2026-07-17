// C1 绑定原语 验收测试

import { describe, expect, it, vi } from "vitest";

import { effect, useRef } from "@elfui/reactivity";

import { attr, cls, on, prop, sty, text, type StyleValue } from "../bindings";

describe("text", () => {
  it("基础文本绑定", () => {
    const node = document.createTextNode("");
    const count = useRef(0);
    text(node, () => count.value);
    expect(node.data).toBe("0");
    count.value = 5;
    expect(node.data).toBe("5");
  });

  it("null/undefined 渲染为空字符串", () => {
    const node = document.createTextNode("x");
    const v = useRef<string | null>(null);
    text(node, () => v.value);
    expect(node.data).toBe("");
  });

  it("自动解包路径", () => {
    const node = document.createTextNode("");
    const name = useRef("hi");
    text(node, () => `hello ${name}`);
    expect(node.data).toBe("hello hi");
    name.value = "world";
    expect(node.data).toBe("hello world");
  });
});

describe("attr", () => {
  it("普通 attribute", () => {
    const el = document.createElement("div");
    const id = useRef("a");
    attr(el, "id", () => id.value);
    expect(el.getAttribute("id")).toBe("a");
    id.value = "b";
    expect(el.getAttribute("id")).toBe("b");
  });

  it("null / false 移除属性", () => {
    const el = document.createElement("div");
    el.setAttribute("id", "x");
    const v = useRef<string | null | false>("y");
    attr(el, "id", () => v.value);
    expect(el.getAttribute("id")).toBe("y");
    v.value = null;
    expect(el.hasAttribute("id")).toBe(false);
    v.value = false;
    expect(el.hasAttribute("id")).toBe(false);
  });

  it("true 渲染为空值（用于 disabled 等）", () => {
    const el = document.createElement("input");
    const v = useRef<true | false>(true);
    attr(el, "disabled", () => v.value);
    expect(el.hasAttribute("disabled")).toBe(true);
    expect(el.getAttribute("disabled")).toBe("");
  });

  it("复杂值绑定到自定义元素时把 kebab-case prop 转为 camelCase", () => {
    const el = document.createElement("x-dialog") as HTMLElement & {
      beforeClose?: () => boolean;
    };
    const guard = () => false;

    attr(el, "before-close", () => guard);

    expect(el.beforeClose).toBe(guard);
    expect((el as unknown as Record<string, unknown>)["before-close"]).toBeUndefined();
  });
});

describe("prop", () => {
  it("DOM property 直接赋值", () => {
    const el = document.createElement("input");
    const v = useRef("hello");
    prop(el, "value", () => v.value);
    expect(el.value).toBe("hello");
    v.value = "world";
    expect(el.value).toBe("world");
  });

  it("property 绑定到自定义元素时支持 kebab-case 参数", () => {
    const el = document.createElement("x-slider") as HTMLElement & { modelValue?: number[] };
    const value = [20, 80];

    prop(el, "model-value", () => value);

    expect(el.modelValue).toBe(value);
  });
});

describe("on", () => {
  it("绑定事件", () => {
    const btn = document.createElement("button");
    const handler = vi.fn();
    on(btn, "click", handler);
    btn.dispatchEvent(new Event("click"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("options - once", () => {
    const btn = document.createElement("button");
    const handler = vi.fn();
    on(btn, "click", handler, { once: true });
    btn.dispatchEvent(new Event("click"));
    btn.dispatchEvent(new Event("click"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("事件回调中的多次写入自动 batch", () => {
    const btn = document.createElement("button");
    const count = useRef(0);
    const values: number[] = [];
    effect(() => values.push(count.value));
    on(btn, "click", () => {
      count.value = 1;
      count.value = 2;
    });

    btn.dispatchEvent(new Event("click"));

    expect(values).toEqual([0, 2]);
  });

  it("返回 disposer 并保留 listener this", () => {
    const btn = document.createElement("button");
    let receivedThis: unknown;
    const dispose = on(btn, "click", function (this: Element) {
      receivedThis = this;
    });

    btn.dispatchEvent(new Event("click"));
    dispose();
    btn.dispatchEvent(new Event("click"));

    expect(receivedThis).toBe(btn);
  });
});

describe("cls", () => {
  it("字符串 class", () => {
    const el = document.createElement("div");
    const c = useRef("foo bar");
    cls(el, () => c.value);
    expect(el.getAttribute("class")).toBe("foo bar");
  });

  it("对象 class", () => {
    const el = document.createElement("div");
    const active = useRef(true);
    cls(el, () => ({ foo: true, active: active.value }));
    expect(el.getAttribute("class")).toBe("foo active");
    active.value = false;
    expect(el.getAttribute("class")).toBe("foo");
  });

  it("数组 class - 混合形态", () => {
    const el = document.createElement("div");
    cls(el, () => ["a", { b: true, c: false }, ["d"]]);
    expect(el.getAttribute("class")).toBe("a b d");
  });

  it("合并静态 class", () => {
    const el = document.createElement("div");
    el.setAttribute("class", "static-x");
    const dynamic = useRef("dyn-y");
    cls(el, () => dynamic.value);
    expect(el.getAttribute("class")).toBe("static-x dyn-y");
  });
});

describe("sty", () => {
  it("字符串 style", () => {
    const el = document.createElement("div");
    const s = useRef("color: red");
    sty(el, () => s.value);
    expect(el.style.color).toBe("red");
  });

  it("对象 style - camelCase 转 kebab", () => {
    const el = document.createElement("div");
    const fz = useRef(14);
    sty(el, () => ({ color: "red", fontSize: fz.value }));
    expect(el.style.color).toBe("red");
    expect(el.style.fontSize).toBe("14px");
    fz.value = 16;
    expect(el.style.color).toBe("red");
    expect(el.style.fontSize).toBe("16px");
  });

  it("空 style 移除属性", () => {
    const el = document.createElement("div");
    const s = useRef<string | null>("color: red");
    sty(el, () => s.value);
    expect(el.hasAttribute("style")).toBe(true);
    s.value = null;
    expect(el.hasAttribute("style")).toBe(false);
  });

  it("保留静态 style，并在动态属性撤销后恢复静态值", () => {
    const el = document.createElement("div");
    el.setAttribute("style", "color: red; padding: 4px");
    const dynamic = useRef<StyleValue>({ color: "blue", marginTop: 8 });

    sty(el, () => dynamic.value);
    expect(el.style.color).toBe("blue");
    expect(el.style.padding).toBe("4px");
    expect(el.style.marginTop).toBe("8px");

    dynamic.value = { opacity: 0.5 };
    expect(el.style.color).toBe("red");
    expect(el.style.padding).toBe("4px");
    expect(el.style.marginTop).toBe("");
    expect(el.style.opacity).toBe("0.5");
  });

  it("unitless number 与 CSS 自定义属性不追加 px", () => {
    const el = document.createElement("div");
    sty(el, () => ({
      opacity: 0.5,
      zIndex: 2,
      lineHeight: 1.4,
      WebkitLineClamp: 2,
      "--columns": 3
    }));

    expect(el.style.opacity).toBe("0.5");
    expect(el.style.zIndex).toBe("2");
    expect(el.style.lineHeight).toBe("1.4");
    expect(el.style.getPropertyValue("-webkit-line-clamp")).toBe("2");
    expect(el.style.getPropertyValue("--columns")).toBe("3");
  });

  it("只写入发生变化的动态属性", () => {
    const el = document.createElement("div");
    const size = useRef(12);
    sty(el, () => ({ color: "red", fontSize: size.value }));
    const setProperty = vi.spyOn(el.style, "setProperty");

    size.value = 18;

    expect(setProperty).toHaveBeenCalledTimes(1);
    expect(setProperty).toHaveBeenCalledWith("font-size", "18px", "");
  });

  it("支持 !important，并由后出现的数组项覆盖同名属性", () => {
    const el = document.createElement("div");
    sty(el, () => ["color: red", { color: "blue !important" }]);

    expect(el.style.color).toBe("blue");
    expect(el.style.getPropertyPriority("color")).toBe("important");
  });
});

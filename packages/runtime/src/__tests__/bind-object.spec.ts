// L3.9: bindObject / onObject 单测

import { effect, useReactive, useRef } from "@elfui/reactivity";
import { describe, expect, it, vi } from "vitest";

import { bindObject, onObject } from "../bindings";

describe("bindObject — v-bind='obj'", () => {
  it("初始展开 + 字段更新", () => {
    const data = useReactive({ id: "a", title: "hello", "data-x": 1 });
    const el = document.createElement("div");
    bindObject(el, () => ({ id: data.id, title: data.title, "data-x": data["data-x"] }));
    expect(el.getAttribute("id")).toBe("a");
    expect(el.getAttribute("title")).toBe("hello");
    expect(el.getAttribute("data-x")).toBe("1");

    data.title = "world";
    expect(el.getAttribute("title")).toBe("world");
  });

  it("字段移除：上一轮有的本轮没有 → 清掉 attribute", () => {
    const obj = useReactive<{ id?: string; title?: string }>({ id: "a", title: "t" });
    const el = document.createElement("div");
    bindObject(el, () => ({ ...obj }));
    expect(el.getAttribute("title")).toBe("t");

    delete obj.title;
    expect(el.hasAttribute("title")).toBe(false);
    expect(el.getAttribute("id")).toBe("a");
  });

  it("class / style 形态合并", () => {
    const data = useReactive({ class: { active: true, foo: false }, style: { color: "red" } });
    const el = document.createElement("div");
    bindObject(el, () => ({ class: data.class, style: data.style }));
    expect(el.getAttribute("class")).toBe("active");
    expect(el.getAttribute("style")).toContain("color: red");
  });

  it("函数 / 对象走 property 通道", () => {
    const fn = () => "x";
    const arr = [1, 2, 3];
    const el = document.createElement("div");
    bindObject(el, () => ({ onClick: fn, items: arr }));
    expect((el as unknown as { onClick: unknown }).onClick).toBe(fn);
    expect((el as unknown as { items: unknown }).items).toBe(arr);
  });
});

describe("onObject — v-on='obj'", () => {
  it("批量注册多个事件", () => {
    const click = vi.fn();
    const focus = vi.fn();
    const el = document.createElement("button");
    onObject(el, () => ({ click, focus }));
    el.dispatchEvent(new MouseEvent("click"));
    el.dispatchEvent(new FocusEvent("focus"));
    expect(click).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("处理器替换：旧的卸下，新的装上", () => {
    const handlers = useReactive<{ click: (e: Event) => void }>({ click: () => {} });
    const a = vi.fn();
    const b = vi.fn();
    const el = document.createElement("button");
    onObject(el, () => ({ ...handlers }));

    handlers.click = a;
    el.dispatchEvent(new MouseEvent("click"));
    expect(a).toHaveBeenCalledTimes(1);

    handlers.click = b;
    el.dispatchEvent(new MouseEvent("click"));
    // 旧 a 被卸下；只有 b 触发一次
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("非函数值忽略", () => {
    const el = document.createElement("button");
    expect(() => {
      onObject(el, () => ({ click: 42 as unknown as EventListener }));
    }).not.toThrow();
  });

  it("对象事件处理器同样自动 batch", () => {
    const count = useRef(0);
    const values: number[] = [];
    const el = document.createElement("button");
    effect(() => values.push(count.value));
    onObject(el, () => ({
      click: () => {
        count.value = 1;
        count.value = 2;
      }
    }));

    el.dispatchEvent(new MouseEvent("click"));

    expect(values).toEqual([0, 2]);
  });
});

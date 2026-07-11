// L3.9: 编译器 v-bind="obj" / v-on="obj" 集成测试

import { useReactive } from "@elfui/reactivity";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compile } from "../index";

const setupCtx = (state: Record<string, unknown> = {}) => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return {
    state,
    props: {},
    emit: () => {},
    host,
    shadow: null,
    cleanup: () => document.body.removeChild(host)
  };
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe('v-bind="obj"', () => {
  it("展开对象到 attribute", () => {
    const attrs = useReactive({ id: "x", title: "hi" });
    const render = compile('<div v-bind="attrs" />');
    const ctx = setupCtx({ attrs });
    ctx.host.appendChild(render(ctx));
    const div = ctx.host.querySelector("div");
    expect(div?.getAttribute("id")).toBe("x");
    expect(div?.getAttribute("title")).toBe("hi");
    ctx.cleanup();
  });

  it("响应式更新：字段值变化", () => {
    const attrs = useReactive({ id: "a", title: "first" });
    const render = compile('<div v-bind="attrs" />');
    const ctx = setupCtx({ attrs });
    ctx.host.appendChild(render(ctx));
    const div = ctx.host.querySelector("div") as HTMLElement;
    expect(div.getAttribute("title")).toBe("first");

    attrs.title = "second";
    expect(div.getAttribute("title")).toBe("second");
    ctx.cleanup();
  });
});

describe('v-on="obj"', () => {
  it("批量注册事件", () => {
    const click = vi.fn();
    const focus = vi.fn();
    const render = compile('<button v-on="handlers">x</button>');
    const ctx = setupCtx({ handlers: { click, focus } });
    ctx.host.appendChild(render(ctx));
    const btn = ctx.host.querySelector("button") as HTMLButtonElement;
    btn.dispatchEvent(new MouseEvent("click"));
    btn.dispatchEvent(new FocusEvent("focus"));
    expect(click).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    ctx.cleanup();
  });
});

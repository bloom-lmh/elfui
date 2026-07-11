// E5 自定义指令 验收测试

import { afterEach, describe, expect, it, vi } from "vitest";

import { useRef } from "@elfui/reactivity";

import { applyCustomDirective, directive, resetDirectives, resolveDirective } from "../directive";

afterEach(() => {
  document.body.innerHTML = "";
  resetDirectives();
});

const tick = (): Promise<void> => new Promise((r) => queueMicrotask(r));

describe("directive 注册与查找", () => {
  it("全局注册", () => {
    const def = { mounted: vi.fn() };
    directive("foo", def);
    expect(resolveDirective("foo")).toBe(def);
  });

  it("全局注册返回 unregister", () => {
    const def = { mounted: vi.fn() };
    const unregister = directive("temp", def);
    expect(resolveDirective("temp")).toBe(def);

    unregister();
    expect(resolveDirective("temp")).toBeUndefined();
  });

  it("旧 unregister 不会删除同名新指令", () => {
    const oldDef = { mounted: vi.fn() };
    const newDef = { mounted: vi.fn() };
    const unregisterOld = directive("replace", oldDef);
    directive("replace", newDef);

    unregisterOld();

    expect(resolveDirective("replace")).toBe(newDef);
  });

  it("resetDirectives 清空全局指令", () => {
    directive("foo", { mounted: vi.fn() });
    resetDirectives();
    expect(resolveDirective("foo")).toBeUndefined();
  });

  it("局部优先于全局", () => {
    const g = { mounted: vi.fn() };
    const l = { mounted: vi.fn() };
    directive("dup", g);
    expect(resolveDirective("dup", { dup: l })).toBe(l);
  });

  it("不存在返回 undefined", () => {
    expect(resolveDirective("never-registered")).toBeUndefined();
  });
});

describe("applyCustomDirective", () => {
  it("hooks 形式 — mounted 在挂载后调用", async () => {
    const mounted = vi.fn();
    const el = document.createElement("div");
    document.body.appendChild(el);
    applyCustomDirective(el, { mounted }, () => "value", "arg", { mod1: true });
    await tick();
    expect(mounted).toHaveBeenCalledTimes(1);
    const binding = mounted.mock.calls[0]![1];
    expect(binding.value).toBe("value");
    expect(binding.arg).toBe("arg");
    expect(binding.modifiers.mod1).toBe(true);
  });

  it("函数简写 — 等价于 mounted+updated 都用同一函数", async () => {
    const fn = vi.fn();
    const el = document.createElement("div");
    document.body.appendChild(el);
    const v = useRef("a");
    applyCustomDirective(el, fn, () => v.value);
    await tick();
    expect(fn).toHaveBeenCalledTimes(1);
    v.value = "b";
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[1]![1].value).toBe("b");
  });

  it("updated 在值变化时调用", async () => {
    const mounted = vi.fn();
    const updated = vi.fn();
    const el = document.createElement("div");
    document.body.appendChild(el);
    const v = useRef(1);
    applyCustomDirective(el, { mounted, updated }, () => v.value);
    await tick();
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(updated).toHaveBeenCalledTimes(0);

    v.value = 2;
    expect(updated).toHaveBeenCalledTimes(1);
    expect(updated.mock.calls[0]![1].value).toBe(2);
    expect(updated.mock.calls[0]![1].oldValue).toBe(1);
  });

  it("unmounted 在元素移除后调用", async () => {
    const unmounted = vi.fn();
    const el = document.createElement("div");
    document.body.appendChild(el);
    applyCustomDirective(el, { unmounted }, () => "x");
    await tick();

    document.body.removeChild(el);
    // MutationObserver 是异步的，等几个 microtask
    await tick();
    await tick();
    expect(unmounted).toHaveBeenCalled();
  });

  it("hooks 抛错被隔离", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const el = document.createElement("div");
    document.body.appendChild(el);
    applyCustomDirective(
      el,
      {
        mounted: () => {
          throw new Error("boom");
        }
      },
      () => 1
    );
    await tick();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

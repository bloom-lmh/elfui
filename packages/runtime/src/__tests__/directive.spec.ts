// E5 自定义指令 验收测试

// cspell:ignore unstub

import { afterEach, describe, expect, it, vi } from "vitest";

import { effectScope, useRef } from "@elfui/reactivity";

import { applyCustomDirective, directive, resetDirectives, resolveDirective } from "../directive";

afterEach(() => {
  document.body.innerHTML = "";
  resetDirectives();
  vi.unstubAllGlobals();
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
    const dispose = applyCustomDirective(el, { mounted }, () => "value", "arg", { mod1: true });
    await tick();
    expect(mounted).toHaveBeenCalledTimes(1);
    const binding = mounted.mock.calls[0]![1];
    expect(binding.value).toBe("value");
    expect(binding.arg).toBe("arg");
    expect(binding.modifiers.mod1).toBe(true);
    dispose();
  });

  it("函数简写 — 等价于 mounted+updated 都用同一函数", async () => {
    const fn = vi.fn();
    const el = document.createElement("div");
    document.body.appendChild(el);
    const v = useRef("a");
    const dispose = applyCustomDirective(el, fn, () => v.value);
    await tick();
    expect(fn).toHaveBeenCalledTimes(1);
    v.value = "b";
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[1]![1].value).toBe("b");
    dispose();
  });

  it("updated 在值变化时调用", async () => {
    const mounted = vi.fn();
    const updated = vi.fn();
    const el = document.createElement("div");
    document.body.appendChild(el);
    const v = useRef(1);
    const dispose = applyCustomDirective(el, { mounted, updated }, () => v.value);
    await tick();
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(updated).toHaveBeenCalledTimes(0);

    v.value = 2;
    expect(updated).toHaveBeenCalledTimes(1);
    expect(updated.mock.calls[0]![1].value).toBe(2);
    expect(updated.mock.calls[0]![1].oldValue).toBe(1);
    dispose();
  });

  it("父作用域停止时按顺序调用卸载钩子", async () => {
    const beforeUnmount = vi.fn();
    const unmounted = vi.fn();
    const el = document.createElement("div");
    document.body.appendChild(el);
    const scope = effectScope();
    scope.run(() => {
      applyCustomDirective(el, { beforeUnmount, unmounted }, () => "x");
    });
    await tick();

    scope.stop();
    expect(beforeUnmount).toHaveBeenCalledTimes(1);
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(beforeUnmount.mock.invocationCallOrder[0]).toBeLessThan(
      unmounted.mock.invocationCallOrder[0]!
    );
  });

  it("父作用域停止后不再响应更新", async () => {
    const updated = vi.fn();
    const unmounted = vi.fn();
    const value = useRef(1);
    const el = document.createElement("div");
    document.body.appendChild(el);
    const scope = effectScope();
    scope.run(() => {
      applyCustomDirective(el, { updated, unmounted }, () => value.value);
    });
    await tick();

    value.value = 2;
    expect(updated).toHaveBeenCalledTimes(1);
    scope.stop();
    value.value = 3;

    expect(updated).toHaveBeenCalledTimes(1);
    expect(unmounted).toHaveBeenCalledTimes(1);
  });

  it("不会为指令创建 MutationObserver", async () => {
    const observer = vi.fn();
    vi.stubGlobal("MutationObserver", observer);
    const el = document.createElement("div");
    document.body.appendChild(el);

    const dispose = applyCustomDirective(el, { unmounted: vi.fn() }, () => "x");
    await tick();

    expect(observer).not.toHaveBeenCalled();
    dispose();
  });

  it("hooks 抛错被隔离", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const el = document.createElement("div");
    document.body.appendChild(el);
    const dispose = applyCustomDirective(
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
    dispose();
    err.mockRestore();
  });
});

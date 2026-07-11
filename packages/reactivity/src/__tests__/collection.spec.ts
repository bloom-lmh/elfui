import { describe, expect, it, vi } from "vitest";

import { effect, isReadonly, markRaw, nextTick, readonly, useReactive, watch } from "../index";

describe("collection reactivity — Map", () => {
  it("追踪 get / set", () => {
    const map = useReactive(new Map<string, number>([["a", 1]]));
    const spy = vi.fn();

    effect(() => {
      spy(map.get("a"));
    });

    expect(spy).toHaveBeenLastCalledWith(1);
    map.set("a", 2);
    expect(spy).toHaveBeenLastCalledWith(2);
    map.set("a", 2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("追踪 has / delete", () => {
    const map = useReactive(new Map<string, number>());
    const spy = vi.fn();

    effect(() => {
      spy(map.has("a"));
    });

    expect(spy).toHaveBeenLastCalledWith(false);
    map.set("a", 1);
    expect(spy).toHaveBeenLastCalledWith(true);
    map.delete("a");
    expect(spy).toHaveBeenLastCalledWith(false);
  });

  it("size 只在新增、删除、清空时更新", () => {
    const map = useReactive(new Map<string, number>([["a", 1]]));
    const spy = vi.fn();

    effect(() => {
      spy(map.size);
    });

    map.set("a", 2);
    expect(spy).toHaveBeenCalledTimes(1);
    map.set("b", 3);
    expect(spy).toHaveBeenLastCalledWith(2);
    map.delete("a");
    expect(spy).toHaveBeenLastCalledWith(1);
    map.clear();
    expect(spy).toHaveBeenLastCalledWith(0);
  });

  it("forEach / values / entries 追踪 value 变化", () => {
    const map = useReactive(new Map<string, number>([["a", 1]]));
    const spy = vi.fn();

    effect(() => {
      const values: number[] = [];
      map.forEach((value) => values.push(value));
      spy(values.join(","));
    });

    expect(spy).toHaveBeenLastCalledWith("1");
    map.set("a", 2);
    expect(spy).toHaveBeenLastCalledWith("2");
    map.set("b", 3);
    expect(Array.from(map.entries())).toEqual([
      ["a", 2],
      ["b", 3]
    ]);
  });

  it("keys 不被已有 key 的 value 变化触发", () => {
    const map = useReactive(new Map<string, number>([["a", 1]]));
    const spy = vi.fn();

    effect(() => {
      spy(Array.from(map.keys()).join(","));
    });

    map.set("a", 2);
    expect(spy).toHaveBeenCalledTimes(1);
    map.set("b", 3);
    expect(spy).toHaveBeenLastCalledWith("a,b");
  });
});

describe("collection reactivity — Set", () => {
  it("追踪 has / add / delete", () => {
    const set = useReactive(new Set<string>());
    const spy = vi.fn();

    effect(() => {
      spy(set.has("a"));
    });

    expect(spy).toHaveBeenLastCalledWith(false);
    set.add("a");
    expect(spy).toHaveBeenLastCalledWith(true);
    set.delete("a");
    expect(spy).toHaveBeenLastCalledWith(false);
  });

  it("追踪 size / iterator / clear", () => {
    const set = useReactive(new Set(["a"]));
    const spy = vi.fn();

    effect(() => {
      spy(`${set.size}:${Array.from(set).join(",")}`);
    });

    expect(spy).toHaveBeenLastCalledWith("1:a");
    set.add("b");
    expect(spy).toHaveBeenLastCalledWith("2:a,b");
    set.add("b");
    expect(spy).toHaveBeenCalledTimes(2);
    set.clear();
    expect(spy).toHaveBeenLastCalledWith("0:");
  });
});

describe("collection reactivity — WeakMap / WeakSet", () => {
  it("WeakMap 追踪对象 key 的 get / set / delete", () => {
    const key = {};
    const weakMap = useReactive(new WeakMap<object, number>());
    const spy = vi.fn();

    effect(() => {
      spy(weakMap.get(key));
    });

    expect(spy).toHaveBeenLastCalledWith(undefined);
    weakMap.set(key, 1);
    expect(spy).toHaveBeenLastCalledWith(1);
    weakMap.delete(key);
    expect(spy).toHaveBeenLastCalledWith(undefined);
  });

  it("WeakSet 追踪对象 key 的 has / add / delete", () => {
    const key = {};
    const weakSet = useReactive(new WeakSet<object>());
    const spy = vi.fn();

    effect(() => {
      spy(weakSet.has(key));
    });

    expect(spy).toHaveBeenLastCalledWith(false);
    weakSet.add(key);
    expect(spy).toHaveBeenLastCalledWith(true);
    weakSet.delete(key);
    expect(spy).toHaveBeenLastCalledWith(false);
  });
});

describe("collection reactivity — boundaries", () => {
  it("markRaw 的 collection 不会被代理", () => {
    const raw = markRaw(new Map<string, number>());
    expect(useReactive(raw)).toBe(raw);
  });

  it("readonly collection 阻止写入并返回 readonly value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const map = useReactive(new Map<string, { count: number }>([["a", { count: 1 }]]));
    const ro = readonly(map);

    expect(isReadonly(ro.get("a"))).toBe(true);
    ro.set("b", { count: 2 });
    expect(map.has("b")).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("readonly collection 视图会响应原 collection 变化", () => {
    const map = useReactive(new Map<string, { count: number }>([["a", { count: 1 }]]));
    const ro = readonly(map);
    const spy = vi.fn();

    effect(() => {
      spy(ro.get("a")?.count);
    });

    expect(spy).toHaveBeenLastCalledWith(1);
    map.get("a")!.count = 2;
    expect(spy).toHaveBeenLastCalledWith(2);
  });

  it("deep watch 遍历 Map / Set", async () => {
    const map = useReactive(new Map<string, { count: number }>([["a", { count: 1 }]]));
    const set = useReactive(new Set([{ count: 1 }]));
    const mapCb = vi.fn();
    const setCb = vi.fn();

    watch(map, mapCb, { deep: true });
    watch(set, setCb, { deep: true });

    map.get("a")!.count = 2;
    Array.from(set)[0]!.count = 2;
    await nextTick();

    expect(mapCb).toHaveBeenCalledTimes(1);
    expect(setCb).toHaveBeenCalledTimes(1);
  });
});

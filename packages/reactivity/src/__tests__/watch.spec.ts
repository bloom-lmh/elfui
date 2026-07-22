// A4 watch 验收测试
//
// 覆盖：
// - watch(state, cb) / watch(getter, cb) / watch([a, b], cb)
// - immediate / deep
// - flush: sync / pre / post
// - cleanup：onCleanup 参数 / onWatcherCleanup
// - stop 卸载

import { describe, expect, it, vi } from "vitest";

import { flushSync, nextTick, onWatcherCleanup, useRef, useReactive, watch } from "../index";

describe("watch — 数据源形态", () => {
  it("state 直接传入", async () => {
    const count = useRef(0);
    const cb = vi.fn();
    watch(count, cb);
    count.value = 1;
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith(1, 0, expect.any(Function));
  });

  it("getter 函数", async () => {
    const user = useReactive({ name: "a" });
    const cb = vi.fn();
    watch(() => user.name, cb);
    user.name = "b";
    await nextTick();
    expect(cb).toHaveBeenLastCalledWith("b", "a", expect.any(Function));
  });

  it("数组源", async () => {
    const a = useRef(1);
    const b = useRef(2);
    const cb = vi.fn();
    watch([a, b], cb);
    a.value = 10;
    await nextTick();
    expect(cb).toHaveBeenLastCalledWith([10, 2], [1, 2], expect.any(Function));
    b.value = 20;
    await nextTick();
    expect(cb).toHaveBeenLastCalledWith([10, 20], [10, 2], expect.any(Function));
  });

  it("数组源 — getter 项", async () => {
    const obj = useReactive({ x: 1, y: 2 });
    const cb = vi.fn();
    watch([() => obj.x, () => obj.y], cb);
    obj.x = 5;
    await nextTick();
    expect(cb).toHaveBeenLastCalledWith([5, 2], [1, 2], expect.any(Function));
  });
});

describe("watch — immediate / deep", () => {
  it("immediate 首次也调用", async () => {
    const count = useRef(0);
    const cb = vi.fn();
    watch(count, cb, { immediate: true });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith(0, undefined, expect.any(Function));
  });

  it("deep 监听对象内部属性", async () => {
    const data = useReactive({ profile: { city: "sz" } });
    const cb = vi.fn();
    watch(data, cb, { deep: true });
    data.profile.city = "bj";
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("非 deep 时仅监听顶层 reference", async () => {
    const data = useReactive({ profile: { city: "sz" } });
    const cb = vi.fn();
    watch(data, cb);
    data.profile.city = "bj";
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(0);
  });
});

describe("watch — flush 时机", () => {
  it("默认 pre — 进 microtask 批量", async () => {
    const a = useRef(0);
    const cb = vi.fn();
    watch(a, cb);
    a.value = 1;
    a.value = 2;
    a.value = 3;
    expect(cb).toHaveBeenCalledTimes(0);
    await nextTick();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith(3, 0, expect.any(Function));
  });

  it("flush: sync — 立即触发", () => {
    const a = useRef(0);
    const cb = vi.fn();
    watch(a, cb, { flush: "sync" });
    a.value = 1;
    a.value = 2;
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("flushSync 包裹立即触发 pre 模式", () => {
    const a = useRef(0);
    const cb = vi.fn();
    watch(a, cb);
    flushSync(() => {
      a.value = 9;
    });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith(9, 0, expect.any(Function));
  });
});

describe("watch — cleanup", () => {
  it("第三个参数 onCleanup", async () => {
    const a = useRef(0);
    const cleanups: number[] = [];
    watch(a, (v, _ov, onCleanup) => {
      onCleanup(() => cleanups.push(v));
    });
    a.value = 1;
    await nextTick();
    a.value = 2;
    await nextTick();
    // 第二次触发前清理第一次
    expect(cleanups).toEqual([1]);
  });

  it("cb 返回值也作为 cleanup", async () => {
    const a = useRef(0);
    const cleanups: number[] = [];
    watch(a, (v) => {
      return () => cleanups.push(v);
    });
    a.value = 1;
    await nextTick();
    a.value = 2;
    await nextTick();
    expect(cleanups).toEqual([1]);
  });

  it("stop 时执行最后一次 cleanup", async () => {
    const a = useRef(0);
    const cleanups: number[] = [];
    const stop = watch(a, (v, _ov, onCleanup) => {
      onCleanup(() => cleanups.push(v));
    });
    a.value = 1;
    await nextTick();
    stop();
    expect(cleanups).toEqual([1]);
  });
});

describe("onWatcherCleanup 边界", () => {
  it("在 watch 之外调用打 warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    onWatcherCleanup(() => {});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

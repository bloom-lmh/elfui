// L6 依赖收集隔离 API 验收测试

import { describe, expect, it, vi } from "vitest";

import { effect, pauseTracking, resetTracking, untrack, useRef } from "../index";

describe("依赖收集隔离", () => {
  it("untrack 内读取 state 不会被当前 effect 收集", () => {
    const count = useRef(0);
    const spy = vi.fn();

    effect(() => {
      spy(untrack(() => count.value));
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith(0);

    count.value = 1;

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("untrack 结束后会恢复外层依赖收集", () => {
    const tracked = useRef(0);
    const ignored = useRef(0);
    const spy = vi.fn();

    effect(() => {
      untrack(() => ignored.value);
      spy(tracked.value);
    });

    expect(spy).toHaveBeenCalledTimes(1);

    ignored.value = 1;
    expect(spy).toHaveBeenCalledTimes(1);

    tracked.value = 1;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(1);
  });

  it("pauseTracking / resetTracking 支持嵌套恢复", () => {
    const count = useRef(0);
    const spy = vi.fn();

    effect(() => {
      pauseTracking();
      pauseTracking();
      void count.value;
      resetTracking();
      void count.value;
      resetTracking();
      spy(count.value);
    });

    expect(spy).toHaveBeenCalledTimes(1);

    count.value = 1;

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(1);
  });
});

// A2 useEffect 验收测试
//
// 覆盖：
// - 自动追踪：访问 state 即收集依赖
// - cleanup 返回值：每次重跑前清理上次副作用，stop 时清理最后一次
// - 调度策略：sync（默认）/ pre / post
// - flushSync 包裹的同步路径
// - nextTick 在批量模式下等待 flush
// - 嵌套 effect：内层跟随外层重跑
// - stop() 卸载，事后写入不再触发

import { afterEach, describe, expect, it, vi } from "vitest";

import { flushSync, nextTick, useEffect, useRef, useReactive } from "../index";

describe("useEffect 基础", () => {
  it("访问 state 即追踪", () => {
    const count = useRef(0);
    const spy = vi.fn();
    useEffect(() => {
      spy(count.value);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith(0);

    count.value = 1;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(1);
  });

  it("通过自动解包路径也能追踪", () => {
    const count = useRef(10);
    const spy = vi.fn();
    useEffect(() => {
      // 不用 .value，靠 valueOf
      spy(Number(count));
    });
    expect(spy).toHaveBeenLastCalledWith(10);
    count.value = 20;
    expect(spy).toHaveBeenLastCalledWith(20);
  });

  it("不访问的 state 不会触发", () => {
    const a = useRef(0);
    const b = useRef(0);
    const spy = vi.fn();
    useEffect(() => {
      spy(a.value);
    });
    b.value = 1;
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("cleanup 返回值", () => {
  it("每次重跑前调用上一次 cleanup", () => {
    const count = useRef(0);
    const cleanup = vi.fn();
    useEffect(() => {
      // 读 state 形成依赖
      void count.value;
      return cleanup;
    });

    expect(cleanup).toHaveBeenCalledTimes(0);
    count.value = 1;
    expect(cleanup).toHaveBeenCalledTimes(1);
    count.value = 2;
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("stop() 时调用最后一次 cleanup", () => {
    const count = useRef(0);
    const cleanup = vi.fn();
    const stop = useEffect(() => {
      void count.value;
      return cleanup;
    });
    stop();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("cleanup 抛错不影响后续 effect", () => {
    const count = useRef(0);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const runs: number[] = [];
    useEffect(() => {
      runs.push(count.value);
      return () => {
        throw new Error("boom");
      };
    });
    count.value = 1;
    count.value = 2;
    expect(runs).toEqual([0, 1, 2]);
    errSpy.mockRestore();
  });
});

describe("stop 卸载", () => {
  it("stop 后写入不再触发", () => {
    const count = useRef(0);
    const spy = vi.fn();
    const stop = useEffect(() => {
      spy(count.value);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    stop();
    count.value = 5;
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("stop 触发 onStop 回调", () => {
    const onStop = vi.fn();
    const stop = useEffect(() => {}, { onStop });
    stop();
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});

describe("调度策略", () => {
  it("默认 sync — 立即重跑", () => {
    const count = useRef(0);
    const spy = vi.fn();
    useEffect(() => {
      spy(count.value);
    });
    count.value = 1;
    count.value = 2;
    count.value = 3;
    // sync 模式：每次写入都重跑
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it("flush: pre — 批量到 microtask", async () => {
    const count = useRef(0);
    const spy = vi.fn();
    useEffect(
      () => {
        spy(count.value);
      },
      { flush: "pre" }
    );
    expect(spy).toHaveBeenCalledTimes(1); // 初次同步执行

    count.value = 1;
    count.value = 2;
    count.value = 3;
    // 还没 flush
    expect(spy).toHaveBeenCalledTimes(1);

    await nextTick();
    // 三次连续写入合并为一次 flush
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(3);
  });

  it("flushSync 包裹立即看到结果", () => {
    const count = useRef(0);
    const spy = vi.fn();
    useEffect(
      () => {
        spy(count.value);
      },
      { flush: "pre" }
    );
    expect(spy).toHaveBeenCalledTimes(1);

    flushSync(() => {
      count.value = 99;
    });
    // flushSync 让 pre 模式也立即重跑
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(99);
  });
});

describe("嵌套 effect", () => {
  it("内层 effect 跟随外层重跑", () => {
    const a = useRef(0);
    const b = useRef(0);
    const inner = vi.fn();
    const outer = vi.fn();
    useEffect(() => {
      outer(a.value);
      useEffect(() => {
        inner(b.value);
      });
    });
    expect(outer).toHaveBeenCalledTimes(1);
    expect(inner).toHaveBeenCalledTimes(1);

    // 改 b 只重跑内层
    b.value = 1;
    expect(outer).toHaveBeenCalledTimes(1);
    expect(inner).toHaveBeenCalledTimes(2);

    // 改 a 重跑外层，外层创建一个新的内层 effect
    a.value = 1;
    expect(outer).toHaveBeenCalledTimes(2);
    // 外层重跑会创建新内层 effect，所以 inner spy 又被调一次
    expect(inner).toHaveBeenCalledTimes(3);
  });
});

describe("nextTick", () => {
  it("nextTick(fn) 在 flush 后调用", async () => {
    const count = useRef(0);
    const spy = vi.fn();
    useEffect(
      () => {
        spy(count.value);
      },
      { flush: "pre" }
    );
    count.value = 5;
    expect(spy).toHaveBeenCalledTimes(1);
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("nextTick() 不传参返回 Promise", async () => {
    const p = nextTick();
    expect(p).toBeInstanceOf(Promise);
    await p;
  });
});

describe("对象 state 与 useEffect", () => {
  it("属性追踪", () => {
    const user = useReactive({ name: "a", age: 1 });
    const spy = vi.fn();
    useEffect(() => {
      spy(`${user.name}-${user.age}`);
    });
    expect(spy).toHaveBeenLastCalledWith("a-1");
    user.name = "b";
    expect(spy).toHaveBeenLastCalledWith("b-1");
    user.age = 2;
    expect(spy).toHaveBeenLastCalledWith("b-2");
  });
});

afterEach(async () => {
  // 让所有 microtask 队列清空，避免测试间互相影响
  await Promise.resolve();
});

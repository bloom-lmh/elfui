// A7 调度器 验收测试
//
// 覆盖：
// - queueJob / queuePostFlushJob：pre / post 队列
// - 执行顺序：pre 先于 post
// - Set 去重：同一 job 多次入队只跑一次
// - flush 期间新入队的 job 在本轮处理
// - flushSync 立即 flush
// - nextTick 等待 flush
// - job 抛错不阻塞其他

import { afterEach, describe, expect, it, vi } from "vitest";

import { __resetScheduler, flushSync, nextTick, queueJob, queuePostFlushJob } from "../scheduler";

afterEach(() => {
  __resetScheduler();
});

describe("queueJob 基础", () => {
  it("入队后 microtask 触发", async () => {
    const spy = vi.fn();
    queueJob(spy);
    expect(spy).toHaveBeenCalledTimes(0);
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("Set 去重：同一 job 多次入队只跑一次", async () => {
    const spy = vi.fn();
    queueJob(spy);
    queueJob(spy);
    queueJob(spy);
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("不同 job 都会跑且按入队顺序", async () => {
    const order: number[] = [];
    queueJob(() => order.push(1));
    queueJob(() => order.push(2));
    queueJob(() => order.push(3));
    await nextTick();
    expect(order).toEqual([1, 2, 3]);
  });
});

describe("pre / post 顺序", () => {
  it("先 pre 后 post", async () => {
    const order: string[] = [];
    queuePostFlushJob(() => order.push("post"));
    queueJob(() => order.push("pre"));
    await nextTick();
    expect(order).toEqual(["pre", "post"]);
  });

  it("post 内部又入队 pre 在本轮处理", async () => {
    const order: string[] = [];
    queuePostFlushJob(() => {
      order.push("post");
      queueJob(() => order.push("pre-from-post"));
    });
    await nextTick();
    expect(order).toEqual(["post", "pre-from-post"]);
  });

  it("pre 内部入队 post 在本轮处理", async () => {
    const order: string[] = [];
    queueJob(() => {
      order.push("pre");
      queuePostFlushJob(() => order.push("post-from-pre"));
    });
    await nextTick();
    expect(order).toEqual(["pre", "post-from-pre"]);
  });

  it("flush 期间新加入的 job 在本轮处理（pre 链）", async () => {
    const order: number[] = [];
    queueJob(() => {
      order.push(1);
      queueJob(() => order.push(2));
    });
    await nextTick();
    expect(order).toEqual([1, 2]);
  });
});

describe("flushSync", () => {
  it("立即 flush 入队 job", () => {
    const spy = vi.fn();
    flushSync(() => {
      queueJob(spy);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("flushSync 也按 pre -> post 顺序", () => {
    const order: string[] = [];
    flushSync(() => {
      queuePostFlushJob(() => order.push("post"));
      queueJob(() => order.push("pre"));
    });
    expect(order).toEqual(["pre", "post"]);
  });
});

describe("nextTick", () => {
  it("不传 fn 返回 Promise", async () => {
    const p = nextTick();
    expect(p).toBeInstanceOf(Promise);
    await p;
  });

  it("传 fn 在 flush 后调用并返回结果", async () => {
    queueJob(() => {});
    const result = await nextTick(() => 42);
    expect(result).toBe(42);
  });
});

describe("错误隔离", () => {
  it("job 抛错不阻塞其他", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const spy = vi.fn();
    queueJob(() => {
      throw new Error("boom");
    });
    queueJob(spy);
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

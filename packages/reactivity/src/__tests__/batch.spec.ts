import { describe, expect, it, vi } from "vitest";

import { batch, effect, flushSync, useComputed, useRef, watch } from "../index";

describe("batch", () => {
  it("多次同步写入只重跑一次 effect", () => {
    const first = useRef(0);
    const second = useRef(0);
    const values: string[] = [];
    effect(() => values.push(`${first.value}:${second.value}`));

    const result = batch(() => {
      first.value = 1;
      first.value = 2;
      second.value = 3;
      expect(values).toEqual(["0:0"]);
      return "done";
    });

    expect(result).toBe("done");
    expect(values).toEqual(["0:0", "2:3"]);
  });

  it("嵌套 batch 只在最外层结束时 flush", () => {
    const count = useRef(0);
    const spy = vi.fn(() => count.value);
    effect(spy);

    batch(() => {
      count.value = 1;
      batch(() => {
        count.value = 2;
      });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveLastReturnedWith(2);
  });

  it("computed 先失效，下游 effect 只读取最终值", () => {
    const count = useRef(1);
    const doubled = useComputed(() => count.value * 2);
    const values: number[] = [];
    effect(() => values.push(doubled.value));

    batch(() => {
      count.value = 2;
      count.value = 3;
    });

    expect(values).toEqual([2, 6]);
  });

  it("同时依赖 source 和 computed 的 effect 仍只执行一次", () => {
    const count = useRef(1);
    const doubled = useComputed(() => count.value * 2);
    const values: string[] = [];
    effect(() => values.push(`${count.value}:${doubled.value}`));

    batch(() => {
      count.value = 2;
      count.value = 3;
    });

    expect(values).toEqual(["1:2", "3:6"]);
  });

  it("sync watch 在 batch 结束时只观察最终值", () => {
    const count = useRef(0);
    const values: Array<[number, number | undefined]> = [];
    watch(
      count,
      (value, oldValue) => {
        values.push([value, oldValue]);
      },
      { flush: "sync" }
    );

    batch(() => {
      count.value = 1;
      count.value = 2;
    });

    expect(values).toEqual([[2, 0]]);
  });

  it("flushSync 可以在 batch 内显式排空", () => {
    const count = useRef(0);
    const values: number[] = [];
    effect(() => values.push(count.value));

    batch(() => {
      count.value = 1;
      flushSync(() => undefined);
      expect(values).toEqual([0, 1]);
      count.value = 2;
      expect(values).toEqual([0, 1]);
    });

    expect(values).toEqual([0, 1, 2]);
  });

  it("回调抛错时仍 flush 并恢复 batch 深度", () => {
    const count = useRef(0);
    const values: number[] = [];
    effect(() => values.push(count.value));

    expect(() =>
      batch(() => {
        count.value = 1;
        throw new Error("batch boom");
      })
    ).toThrow("batch boom");
    expect(values).toEqual([0, 1]);

    count.value = 2;
    expect(values).toEqual([0, 1, 2]);
  });

  it("flush 前停止的 effect 不会补跑", () => {
    const count = useRef(0);
    const spy = vi.fn(() => count.value);
    const runner = effect(spy);

    batch(() => {
      count.value = 1;
      runner.effect.stop();
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

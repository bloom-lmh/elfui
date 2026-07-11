import { describe, expect, it, vi } from "vitest";

import { readonly, useEffect, useReactive } from "../index";

interface CounterStore {
  state: Readonly<{
    count: number;
    label: string;
  }>;
  increment(): void;
  rename(label: string): void;
  reset(): void;
}

const createCounterStore = (initial = 0): CounterStore => {
  const state = useReactive({
    count: initial,
    label: "counter"
  });
  return {
    state: readonly(state),
    increment() {
      state.count += 1;
    },
    rename(label: string) {
      state.label = label;
    },
    reset() {
      state.count = initial;
      state.label = "counter";
    }
  };
};

const singletonCounter = createCounterStore();

describe("ordinary TS store pattern", () => {
  it("module singleton state can be exposed readonly and changed through actions", () => {
    const spy = vi.fn();
    useEffect(() => {
      spy(singletonCounter.state.count, singletonCounter.state.label);
    });

    expect(spy).toHaveBeenLastCalledWith(0, "counter");
    singletonCounter.increment();
    singletonCounter.rename("global");

    expect(spy).toHaveBeenLastCalledWith(1, "global");
    singletonCounter.reset();
    expect(spy).toHaveBeenLastCalledWith(0, "counter");
  });

  it("readonly store state prevents direct writes while keeping actions reactive", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = createCounterStore(3);

    (store.state as { count: number }).count = 99;
    expect(store.state.count).toBe(3);
    expect(warn).toHaveBeenCalled();

    store.increment();
    expect(store.state.count).toBe(4);
  });

  it("factory stores isolate tests and multi-instance/SSR style usage", () => {
    const a = createCounterStore(1);
    const b = createCounterStore(10);
    const spyA = vi.fn();
    const spyB = vi.fn();

    useEffect(() => spyA(a.state.count));
    useEffect(() => spyB(b.state.count));

    a.increment();
    expect(a.state.count).toBe(2);
    expect(b.state.count).toBe(10);
    expect(spyA).toHaveBeenLastCalledWith(2);
    expect(spyB).toHaveBeenLastCalledWith(10);

    b.increment();
    expect(a.state.count).toBe(2);
    expect(b.state.count).toBe(11);
    expect(spyA).toHaveBeenCalledTimes(2);
    expect(spyB).toHaveBeenLastCalledWith(11);
  });
});

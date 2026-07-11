// A3 useComputed 验收测试
//
// 覆盖：
// - lazy 求值：未读取不计算
// - 脏标记：依赖变后下次读取才重算
// - 缓存：依赖未变多次读取只算一次
// - 自动解包：valueOf / toString / Symbol.toPrimitive
// - 与 useEffect 集成：computed 变化驱动 effect 重跑
// - 默认只读：写入打 warn 不抛错
// - 可写 computed：{ get, set } 形式
// - 链式 computed：c2 依赖 c1

import { describe, expect, it, vi } from "vitest";

import { isReadonly, isState, useComputed, useEffect, useRef, type Computed } from "../index";

describe("useComputed 基础", () => {
  it("lazy — 未读取不计算", () => {
    const count = useRef(0);
    const compute = vi.fn(() => count.value * 2);
    const doubled = useComputed(compute);
    expect(compute).toHaveBeenCalledTimes(0);
    void doubled.value;
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("脏标记 — 依赖变化下次读取才重算", () => {
    const count = useRef(0);
    const compute = vi.fn(() => count.value * 2);
    const doubled = useComputed(compute);

    expect(doubled.value).toBe(0);
    expect(compute).toHaveBeenCalledTimes(1);

    count.value = 5;
    // 依赖变了但还没读，不应该立刻算
    expect(compute).toHaveBeenCalledTimes(1);

    expect(doubled.value).toBe(10);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("缓存 — 依赖不变多次读取只算一次", () => {
    const count = useRef(3);
    const compute = vi.fn(() => count.value * 2);
    const doubled = useComputed(compute);

    expect(doubled.value).toBe(6);
    expect(doubled.value).toBe(6);
    expect(doubled.value).toBe(6);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("isState 判定 / dirty 暴露", () => {
    const c = useComputed(() => 1);
    expect(isState(c)).toBe(true);
    expect(c.dirty).toBe(true); // 还没读
    void c.value;
    expect(c.dirty).toBe(false);
  });

  it("isReadonly — 默认只读", () => {
    expect(isReadonly(useComputed(() => 1))).toBe(true);
    expect(isReadonly(useComputed({ get: () => 1, set: () => {} }))).toBe(false);
  });
});

describe("自动解包", () => {
  it("valueOf 路径", () => {
    const a = useRef(2);
    const triple = useComputed(() => a.value * 3);
    expect(Number(triple)).toBe(6);
    a.value = 4;
    expect(Number(triple)).toBe(12);
  });

  it("toString 路径", () => {
    const name = useRef("alice");
    const greet = useComputed(() => `hello ${name.value}`);
    expect(`${greet}`).toBe("hello alice");
    name.value = "bob";
    expect(`${greet}`).toBe("hello bob");
  });

  it("Number / String 强制转换", () => {
    const flag = useRef(true);
    const not = useComputed(() => !flag.value);
    expect(Number(not)).toBe(0);
    expect(String(not)).toBe("false");
  });
});

describe("与 useEffect 集成", () => {
  it("computed 变化驱动 effect 重跑", () => {
    const count = useRef(0);
    const doubled = useComputed(() => count.value * 2);
    const spy = vi.fn();
    useEffect(() => {
      spy(doubled.value);
    });
    expect(spy).toHaveBeenLastCalledWith(0);

    count.value = 5;
    expect(spy).toHaveBeenLastCalledWith(10);

    count.value = 7;
    expect(spy).toHaveBeenLastCalledWith(14);
  });

  it("通过自动解包路径也能驱动 effect", () => {
    const count = useRef(1);
    const tripled = useComputed(() => count.value * 3);
    const spy = vi.fn();
    useEffect(() => {
      // 不用 .value
      spy(Number(tripled));
    });
    expect(spy).toHaveBeenLastCalledWith(3);
    count.value = 2;
    expect(spy).toHaveBeenLastCalledWith(6);
  });

  it("链式 computed — c2 依赖 c1", () => {
    const a = useRef(1);
    const c1 = useComputed(() => a.value + 1);
    const c2 = useComputed(() => c1.value * 10);
    const spy = vi.fn();
    useEffect(() => {
      spy(c2.value);
    });
    expect(spy).toHaveBeenLastCalledWith(20);

    a.value = 2;
    expect(spy).toHaveBeenLastCalledWith(30);
  });
});

describe("可写 computed", () => {
  it("{ get, set } 形式", () => {
    const first = useRef("a");
    const last = useRef("b");
    const full = useComputed({
      get: () => `${first.value} ${last.value}`,
      set: (v: string) => {
        const parts = v.split(" ");
        first.value = parts[0] ?? "";
        last.value = parts[1] ?? "";
      }
    });

    expect(full.value).toBe("a b");
    full.value = "c d";
    expect(first.value).toBe("c");
    expect(last.value).toBe("d");
    expect(full.value).toBe("c d");
  });

  it(".set() 等价于 .value =", () => {
    const x = useRef(0);
    const c = useComputed({
      get: () => x.value,
      set: (v: number) => {
        x.value = v;
      }
    });
    c.set(7);
    expect(x.value).toBe(7);
  });
});

describe("默认只读保护", () => {
  it("写入打 warn 不抛错", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = useComputed(() => 1) as unknown as Computed<number>;
    c.value = 99 as never;
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("peek", () => {
  it("peek 不 track 但仍按 dirty 重算", () => {
    const a = useRef(1);
    const c = useComputed(() => a.value * 10);
    const spy = vi.fn();
    useEffect(() => {
      // 用 peek 读不应该订阅
      spy(c.peek());
    });
    expect(spy).toHaveBeenCalledTimes(1);
    a.value = 2;
    // peek 没追踪，所以 effect 不重跑
    expect(spy).toHaveBeenCalledTimes(1);
    // 但下次主动 peek 仍能拿到最新值
    expect(c.peek()).toBe(20);
  });
});

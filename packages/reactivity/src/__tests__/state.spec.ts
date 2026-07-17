// A1 useRef 验收测试
//
// 覆盖：
// - 基本类型 state：number / string / boolean / null
// - 对象 state：plain object / 嵌套 / 数组
// - 自动解包：Symbol.toPrimitive / valueOf / toString
// - 写入入口：.value = / .set()
// - peek() 不触发追踪
// - effect 集成：读取触发追踪、写入触发重跑
// - 同一对象重复 useRef 复用代理（身份稳定）
// - markRaw 阻止代理

import { describe, expect, it, vi } from "vitest";

import { effect, isState, markRaw, toRaw, toValue, unref, useReactive, useRef } from "../index";

describe("useRef 基本类型", () => {
  it("number 读写", () => {
    const count = useRef(0);
    expect(count.value).toBe(0);
    count.value = 5;
    expect(count.value).toBe(5);
    count.set(10);
    expect(count.value).toBe(10);
  });

  it("string / boolean / null", () => {
    expect(useRef("hi").value).toBe("hi");
    expect(useRef(true).value).toBe(true);
    expect(useRef(null).value).toBe(null);
  });

  it("自动解包 — 算术运算（valueOf）", () => {
    const a = useRef(1);
    const b = useRef(2);
    // 字符串 + state 会调 valueOf；纯算术也走 valueOf
    expect(Number(a) + Number(b)).toBe(3);
    expect(+a).toBe(1);
  });

  it("自动解包 — 字符串模板（toString / toPrimitive string）", () => {
    const name = useRef("world");
    expect(`hello ${name}`).toBe("hello world");
    expect(String(name)).toBe("world");
  });

  it("自动解包 — Number / String 强制转换", () => {
    const flag = useRef(true);
    expect(Number(flag)).toBe(1);
    expect(String(flag)).toBe("true");
  });

  it("peek() 不触发追踪", () => {
    const count = useRef(0);
    const spy = vi.fn();
    effect(() => {
      spy(count.peek());
    });
    expect(spy).toHaveBeenCalledTimes(1);
    count.value = 1;
    // peek 没追踪，所以 effect 不应该重跑
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it(".set 等价于 .value = ", () => {
    const count = useRef(0);
    count.set(7);
    expect(count.value).toBe(7);
  });

  it("Object.is 相等不触发更新", () => {
    const count = useRef(0);
    const spy = vi.fn();
    effect(() => {
      spy(count.value);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    count.value = 0;
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("useRef 对象", () => {
  it("plain object 读写", () => {
    const user = useReactive({ name: "alice", age: 20 });
    expect(user.name).toBe("alice");
    user.name = "bob";
    expect(user.name).toBe("bob");
  });

  it("嵌套对象自动深度代理", () => {
    const data = useReactive({ profile: { city: "sz" } });
    const spy = vi.fn();
    effect(() => {
      spy(data.profile.city);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    data.profile.city = "bj";
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith("bj");
  });

  it("数组 — 索引读写、push、length", () => {
    const list = useReactive<number[]>([1, 2, 3]);
    const spy = vi.fn();
    effect(() => {
      spy(list.length);
    });
    expect(spy).toHaveBeenLastCalledWith(3);

    list.push(4);
    expect(list.length).toBe(4);
    expect(list[3]).toBe(4);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(4);
  });

  it.each([
    ["push", [1], (list: number[]) => list.push(2)],
    ["pop", [1, 2], (list: number[]) => list.pop()],
    ["shift", [1, 2], (list: number[]) => list.shift()],
    ["unshift", [1], (list: number[]) => list.unshift(0)],
    ["splice", [1, 2, 3], (list: number[]) => list.splice(1, 1, 4, 5)],
    ["sort", [3, 1, 2], (list: number[]) => list.sort()],
    ["reverse", [1, 2, 3], (list: number[]) => list.reverse()],
    ["fill", [1, 2, 3], (list: number[]) => list.fill(0, 1)],
    ["copyWithin", [1, 2, 3], (list: number[]) => list.copyWithin(1, 0, 1)]
  ])("数组原地方法 %s 每次只触发一轮 effect", (_name, initial, mutate) => {
    const list = useReactive([...initial]);
    const spy = vi.fn();
    effect(() => {
      spy(list.join(","));
    });

    mutate(list);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(list.join(","));
  });

  it("新增索引会合并索引与 length 的重复依赖", () => {
    const list = useReactive<number[]>([1]);
    const spy = vi.fn();
    effect(() => {
      spy(`${list.length}:${list[1] ?? "missing"}`);
    });

    list[1] = 2;

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith("2:2");
  });

  it("缩短 length 会通知 length 和被删除索引并去重", () => {
    const list = useReactive([1, 2, 3]);
    const removedIndex = vi.fn();
    const retainedIndex = vi.fn();
    effect(() => {
      removedIndex(`${list.length}:${list[2] ?? "missing"}`);
    });
    effect(() => {
      retainedIndex(list[0]);
    });

    list.length = 1;

    expect(removedIndex).toHaveBeenCalledTimes(2);
    expect(removedIndex).toHaveBeenLastCalledWith("1:missing");
    expect(retainedIndex).toHaveBeenCalledTimes(1);
  });

  it("数组的普通自定义属性不会触发 length 依赖", () => {
    const list = useReactive<number[]>([1]);
    const spy = vi.fn();
    effect(() => {
      spy(list.length);
    });

    (list as number[] & { meta?: string }).meta = "ready";

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("整体替换：useReactive 用 Object.assign", () => {
    const user = useReactive({ name: "a", age: 1 });
    const spy = vi.fn();
    effect(() => {
      spy(`${user.name}-${user.age}`);
    });
    expect(spy).toHaveBeenLastCalledWith("a-1");

    Object.assign(user, { name: "b", age: 2 });
    expect(spy).toHaveBeenLastCalledWith("b-2");
  });

  it("delete 触发更新", () => {
    const obj = useReactive<{ a?: number }>({ a: 1 });
    const spy = vi.fn();
    effect(() => {
      spy(obj.a);
    });
    delete obj.a;
    expect(spy).toHaveBeenLastCalledWith(undefined);
  });

  it("代理身份稳定：多次 useReactive(target) 返回同一代理", () => {
    const raw = { x: 1 };
    const a = useReactive(raw);
    const b = useReactive(raw);
    expect(a).toBe(b);
  });

  it("useReactive(state) 不重复包装", () => {
    const a = useReactive({ x: 1 });
    const b = useReactive(a);
    expect(b).toBe(a);
  });

  it("useReactive(ref) 直接报错，避免误以为和原 Ref 联动", () => {
    const source = useRef({ x: 1 });
    expect(() => useReactive(source)).toThrow("[useReactive]");
  });
});

describe("effect 与 useRef 集成", () => {
  it("基本类型 — 读取追踪、写入重跑", () => {
    const count = useRef(0);
    const spy = vi.fn();
    effect(() => {
      spy(count.value);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith(0);

    count.value = 1;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(1);

    count.value = 2;
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("通过自动解包读取也能追踪（valueOf 路径）", () => {
    const count = useRef(10);
    const spy = vi.fn();
    effect(() => {
      // 这里没用 .value，靠 valueOf 自动解包
      spy(Number(count));
    });
    expect(spy).toHaveBeenLastCalledWith(10);
    count.value = 20;
    expect(spy).toHaveBeenLastCalledWith(20);
  });

  it("通过模板字符串读取也能追踪（toString 路径）", () => {
    const name = useRef("a");
    const spy = vi.fn();
    effect(() => {
      spy(`x:${name}`);
    });
    expect(spy).toHaveBeenLastCalledWith("x:a");
    name.value = "b";
    expect(spy).toHaveBeenLastCalledWith("x:b");
  });

  it("effect 中只读了 a 不会被 b 的写入触发", () => {
    const a = useRef(0);
    const b = useRef(0);
    const spy = vi.fn();
    effect(() => {
      spy(a.value);
    });
    b.value = 1;
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("isState / toRaw / unref / toValue", () => {
  it("isState 判定", () => {
    expect(isState(useRef(0))).toBe(true);
    expect(isState(useReactive({}))).toBe(true);
    expect(isState(0)).toBe(false);
    expect(isState({})).toBe(false);
  });

  it("toRaw 解 state", () => {
    expect(toRaw(useRef(1))).toBe(1);
    const raw = { x: 1 };
    // 对象 state：toRaw 返回的是代理对象自身（与 Vue 不同：因为代理身份就是 state）
    expect(toRaw(useRef(raw))).toBeDefined();
  });

  it("unref 等价 toRaw", () => {
    expect(unref(useRef(2))).toBe(2);
    expect(unref(2)).toBe(2);
  });

  it("toValue：函数调用、state 解包、原值原样", () => {
    expect(toValue(() => 1)).toBe(1);
    expect(toValue(useRef(2))).toBe(2);
    expect(toValue(3)).toBe(3);
  });
});

describe("markRaw", () => {
  it("被 markRaw 的对象不会被代理", () => {
    const obj = markRaw({ x: 1 });
    const s = useReactive({ inner: obj });
    expect(isState(s.inner)).toBe(false);
    // 直接修改 raw 对象不会触发响应
    const spy = vi.fn();
    effect(() => {
      spy(s.inner.x);
    });
    s.inner.x = 99;
    expect(spy).toHaveBeenCalledTimes(1); // 不会重跑
  });
});

describe("别名", () => {
  it("useRef === useRef", () => {
    expect(useRef).toBe(useRef);
  });

  it("useReactive 对对象等价 useRef", () => {
    const a = useReactive({ x: 1 });
    expect(isState(a)).toBe(true);
  });
});

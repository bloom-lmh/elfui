// A6 进阶响应式工具 验收测试

import { describe, expect, it, vi } from "vitest";

import {
  isProxy,
  isReadonly,
  isState,
  readonly,
  useEffect,
  useReactive,
  useRef,
  useShallowReactive
} from "../index";

describe("readonly", () => {
  it("基础读取", () => {
    const data = useReactive({ a: 1, b: 2 });
    const ro = readonly(data);
    expect(ro.a).toBe(1);
    expect(ro.b).toBe(2);
  });

  it("写入 / 删除打 warn 不抛错", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ro = readonly(useReactive({ a: 1 }));
    ro.a = 2;
    expect(warn).toHaveBeenCalled();
    delete (ro as { a?: number }).a;
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("isReadonly 判定", () => {
    const ro = readonly(useReactive({ a: 1 }));
    expect(isReadonly(ro)).toBe(true);
    expect(isReadonly(useReactive({ a: 1 }))).toBe(false);
  });

  it("嵌套对象也是 readonly", () => {
    const data = useReactive({ profile: { city: "sz" } });
    const ro = readonly(data);
    expect(isReadonly(ro.profile)).toBe(true);
  });

  it("readonly 缓存：同一原对象多次包装返回同一代理", () => {
    const target = useReactive({ a: 1 });
    const r1 = readonly(target);
    const r2 = readonly(target);
    expect(r1).toBe(r2);
  });

  it("readonly(readonly_obj) 不再嵌套包装", () => {
    const ro = readonly(useReactive({ a: 1 }));
    expect(readonly(ro)).toBe(ro);
  });

  it("原对象变化驱动监听 readonly 视图的 effect", () => {
    const data = useReactive({ count: 0 });
    const ro = readonly(data);
    const spy = vi.fn();
    useEffect(() => {
      spy(ro.count);
    });
    expect(spy).toHaveBeenLastCalledWith(0);

    data.count = 5;
    expect(spy).toHaveBeenLastCalledWith(5);
  });
});

describe("useShallowReactive", () => {
  it("顶层属性追踪", () => {
    const data = useShallowReactive({ a: 1 });
    const spy = vi.fn();
    useEffect(() => {
      spy(data.a);
    });
    expect(spy).toHaveBeenLastCalledWith(1);

    data.a = 2;
    expect(spy).toHaveBeenLastCalledWith(2);
  });

  it("嵌套属性不追踪", () => {
    const data = useShallowReactive({ profile: { city: "sz" } });
    const spy = vi.fn();
    useEffect(() => {
      spy(data.profile.city);
    });
    expect(spy).toHaveBeenCalledTimes(1);

    data.profile.city = "bj"; // 嵌套不触发
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("替换顶层属性触发 effect", () => {
    const data = useShallowReactive<{ profile: { city: string } }>({ profile: { city: "sz" } });
    const spy = vi.fn();
    useEffect(() => {
      spy(data.profile);
    });
    expect(spy).toHaveBeenCalledTimes(1);

    data.profile = { city: "bj" };
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("delete 触发 effect", () => {
    const data = useShallowReactive<{ a?: number }>({ a: 1 });
    const spy = vi.fn();
    useEffect(() => {
      spy(data.a);
    });
    delete data.a;
    expect(spy).toHaveBeenLastCalledWith(undefined);
  });

  it("缓存：同一对象多次 useShallowReactive 返回同一代理", () => {
    const raw = { a: 1 };
    expect(useShallowReactive(raw)).toBe(useShallowReactive(raw));
  });
});

describe("isProxy", () => {
  it("state proxy 为 true", () => {
    expect(isProxy(useReactive({ a: 1 }))).toBe(true);
  });

  it("基本类型 state 也为 true", () => {
    expect(isProxy(useRef(0))).toBe(true);
  });

  it("readonly proxy 为 true", () => {
    expect(isProxy(readonly(useReactive({ a: 1 })))).toBe(true);
  });

  it("useShallowReactive proxy 为 true", () => {
    expect(isProxy(useShallowReactive({ a: 1 }))).toBe(true);
  });

  it("普通对象 / 基本类型 为 false", () => {
    expect(isProxy({})).toBe(false);
    expect(isProxy([])).toBe(false);
    expect(isProxy(null)).toBe(false);
    expect(isProxy(0)).toBe(false);
    expect(isProxy("a")).toBe(false);
  });
});

describe("isState 集成", () => {
  it("readonly proxy 也算 state（满足 STATE_FLAG）", () => {
    expect(isState(readonly(useReactive({ a: 1 })))).toBe(true);
  });
  it("useShallowReactive 也算 state", () => {
    expect(isState(useShallowReactive({ a: 1 }))).toBe(true);
  });
});

// A5 effectScope 验收测试
//
// 覆盖：
// - effectScope 创建与 run
// - scope.stop 一次性销毁内部 effect / watch / computed
// - getCurrentScope
// - onScopeDispose
// - 嵌套 scope（detached vs 非 detached）
// - 已停止 scope 不能 run

import { describe, expect, it, vi } from "vitest";

import {
  effectScope,
  getCurrentScope,
  onScopeDispose,
  useEffect,
  useRef,
  watch,
  watchEffect
} from "../index";

describe("effectScope 基础", () => {
  it("scope.run 内创建的 effect 会被 scope.stop 销毁", () => {
    const count = useRef(0);
    const spy = vi.fn();

    const scope = effectScope();
    scope.run(() => {
      useEffect(() => {
        spy(count.value);
      });
    });
    expect(spy).toHaveBeenCalledTimes(1);

    count.value = 1;
    expect(spy).toHaveBeenCalledTimes(2);

    scope.stop();
    count.value = 2;
    expect(spy).toHaveBeenCalledTimes(2); // 已停止，不再触发
  });

  it("scope 内多个 effect / watchEffect 一并销毁", async () => {
    const a = useRef(0);
    const b = useRef(0);
    const spyA = vi.fn();
    const spyB = vi.fn();

    const scope = effectScope();
    scope.run(() => {
      useEffect(() => {
        spyA(a.value);
      });
      watchEffect(() => {
        spyB(b.value);
      });
    });
    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).toHaveBeenCalledTimes(1);

    scope.stop();
    a.value = 1;
    b.value = 1;
    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).toHaveBeenCalledTimes(1);
  });

  it("watch 也被 scope 收编", async () => {
    const a = useRef(0);
    const cb = vi.fn();
    const scope = effectScope();
    scope.run(() => {
      watch(a, cb, { flush: "sync" });
    });
    a.value = 1;
    expect(cb).toHaveBeenCalledTimes(1);
    scope.stop();
    a.value = 2;
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe("getCurrentScope", () => {
  it("scope 外返回 undefined", () => {
    expect(getCurrentScope()).toBeUndefined();
  });

  it("scope.run 内返回该 scope", () => {
    const scope = effectScope();
    scope.run(() => {
      expect(getCurrentScope()).toBe(scope);
    });
    expect(getCurrentScope()).toBeUndefined();
  });
});

describe("onScopeDispose", () => {
  it("scope.stop 时调用注册的 cleanup", () => {
    const cleanup = vi.fn();
    const scope = effectScope();
    scope.run(() => {
      onScopeDispose(cleanup);
    });
    expect(cleanup).toHaveBeenCalledTimes(0);
    scope.stop();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("注册多个 cleanup 都会调用", () => {
    const c1 = vi.fn();
    const c2 = vi.fn();
    const scope = effectScope();
    scope.run(() => {
      onScopeDispose(c1);
      onScopeDispose(c2);
    });
    scope.stop();
    expect(c1).toHaveBeenCalledTimes(1);
    expect(c2).toHaveBeenCalledTimes(1);
  });

  it("scope 外调用打 warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    onScopeDispose(() => {});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("cleanup 抛错不阻塞其他", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const c2 = vi.fn();
    const scope = effectScope();
    scope.run(() => {
      onScopeDispose(() => {
        throw new Error("boom");
      });
      onScopeDispose(c2);
    });
    scope.stop();
    expect(c2).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});

describe("嵌套 scope", () => {
  it("内层 scope 自动被外层收编（默认）", () => {
    const a = useRef(0);
    const innerSpy = vi.fn();
    const outer = effectScope();
    let innerScope: ReturnType<typeof effectScope>;
    outer.run(() => {
      innerScope = effectScope();
      innerScope.run(() => {
        useEffect(() => {
          innerSpy(a.value);
        });
      });
    });
    expect(innerSpy).toHaveBeenCalledTimes(1);

    // 停外层 → 内层一起停
    outer.stop();
    expect(innerScope!.active).toBe(false);

    a.value = 1;
    expect(innerSpy).toHaveBeenCalledTimes(1);
  });

  it("detached scope 不被父收编", () => {
    const a = useRef(0);
    const spy = vi.fn();
    const outer = effectScope();
    let detached: ReturnType<typeof effectScope>;
    outer.run(() => {
      detached = effectScope(true);
      detached.run(() => {
        useEffect(() => {
          spy(a.value);
        });
      });
    });

    outer.stop();
    // detached 还活着
    expect(detached!.active).toBe(true);
    a.value = 1;
    expect(spy).toHaveBeenCalledTimes(2);

    detached!.stop();
    a.value = 2;
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("已停止 scope", () => {
  it("再次 run 打 warn 返回 undefined", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const scope = effectScope();
    scope.stop();
    const result = scope.run(() => 1);
    expect(result).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("stop 多次幂等", () => {
    const cleanup = vi.fn();
    const scope = effectScope();
    scope.run(() => {
      onScopeDispose(cleanup);
    });
    scope.stop();
    scope.stop();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

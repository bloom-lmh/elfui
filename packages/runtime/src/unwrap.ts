// 共享：state 自动解包 Proxy
//
// 模板里 `name` 本质是 ctx.state.name；setup 返回的 Ref / Reactive 走 unwrap proxy。
//
// 规则：
//   - Ref<T>（带 .value/.set/.peek 的 wrapper）→ 解包成 .value（无论 T 是基本类型还是数组/对象）
//   - Reactive 对象（透明代理）→ 返回 proxy 自身（用户字段直接访问，
//     避免与用户对象自己的 `.value` 字段冲突，例如 `{ value: "a", label: "..." }`）
//
// 暴露给 compiler 包的 compile / codegen 共用，避免重复实现。

import { isRef, isState } from "@elfui/reactivity";

const cache: WeakMap<object, Record<string, unknown>> = new WeakMap();

/** 把一个 state 容器对象包成"自动解包"代理 */
export const unwrapStateAccess = (raw: Record<string, unknown>): Record<string, unknown> => {
  const cached = cache.get(raw);
  if (cached) return cached;
  const proxy = new Proxy(raw, {
    get(t, key, receiver) {
      if (key === "value" && Reflect.get(t, key, receiver) === undefined) {
        return undefined;
      }
      const v = Reflect.get(t, key, receiver);
      if (!isState(v)) return v;
      // Ref：始终解包到 .value（基本类型直接返回原值；对象/数组返回内部 reactive 代理）
      if (isRef(v)) {
        return (v as { value: unknown }).value;
      }
      // Reactive 对象：返回 proxy 自身（直接 obj.foo 访问字段）
      return v;
    },
    set(t, key, val, receiver) {
      const v = Reflect.get(t, key);
      if (isRef(v)) {
        (v as { value: unknown }).value = val;
        return true;
      }
      return Reflect.set(t, key, val, receiver);
    },
    has(t, key) {
      return Reflect.has(t, key);
    }
  });
  cache.set(raw, proxy);
  return proxy;
};

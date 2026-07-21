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
const extendedStateMetadata = new WeakMap<
  object,
  { parent: Record<string, unknown>; localKeys: ReadonlySet<PropertyKey> }
>();

const hasKey = (source: Record<string, unknown>, key: PropertyKey): boolean =>
  Reflect.has(source, key);

const mergedKeys = (...sources: Record<string, unknown>[]): ArrayLike<string | symbol> => {
  const keys = new Set<string | symbol>();
  for (const source of sources) {
    for (const key of Reflect.ownKeys(source)) keys.add(key);
  }
  return Array.from(keys);
};

/** 创建 setup > props > 系统字段的实时模板作用域，避免在每个 binding 中展开对象。 */
export const createRenderState = (
  props: Record<string, unknown>,
  setupState: Record<string, unknown>,
  systemState: Record<string, unknown>
): Record<string, unknown> =>
  new Proxy(
    {},
    {
      get(_target, key) {
        if (hasKey(setupState, key)) return Reflect.get(setupState, key);
        if (hasKey(props, key)) return Reflect.get(props, key);
        return Reflect.get(systemState, key);
      },
      set(_target, key, value) {
        return Reflect.set(setupState, key, value);
      },
      has(_target, key) {
        return hasKey(setupState, key) || hasKey(props, key) || hasKey(systemState, key);
      },
      ownKeys() {
        return mergedKeys(systemState, props, setupState);
      },
      getOwnPropertyDescriptor(_target, key) {
        if (!hasKey(setupState, key) && !hasKey(props, key) && !hasKey(systemState, key)) {
          return undefined;
        }
        return { configurable: true, enumerable: true, writable: true };
      },
      deleteProperty(_target, key) {
        return Reflect.deleteProperty(setupState, key);
      },
      defineProperty(_target, key, descriptor) {
        return Reflect.defineProperty(setupState, key, descriptor);
      }
    }
  );

/** 为 v-for、slot 等分支增加局部变量，不复制父作用域中的所有字段。 */
export const extendRenderState = (
  parent: Record<string, unknown>,
  locals: Record<string, unknown>
): Record<string, unknown> => {
  const state = new Proxy(
    {},
    {
      get(_target, key) {
        return hasKey(locals, key) ? Reflect.get(locals, key) : Reflect.get(parent, key);
      },
      set(_target, key, value) {
        return hasKey(locals, key)
          ? Reflect.set(locals, key, value)
          : Reflect.set(parent, key, value);
      },
      has(_target, key) {
        return hasKey(locals, key) || hasKey(parent, key);
      },
      ownKeys() {
        return mergedKeys(parent, locals);
      },
      getOwnPropertyDescriptor(_target, key) {
        if (!hasKey(locals, key) && !hasKey(parent, key)) return undefined;
        return { configurable: true, enumerable: true, writable: true };
      },
      deleteProperty(_target, key) {
        return hasKey(locals, key)
          ? Reflect.deleteProperty(locals, key)
          : Reflect.deleteProperty(parent, key);
      },
      defineProperty(_target, key, descriptor) {
        return Reflect.defineProperty(locals, key, descriptor);
      }
    }
  );
  extendedStateMetadata.set(state, {
    parent,
    localKeys: new Set(Reflect.ownKeys(locals))
  });
  return state;
};

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

const resolveTemplateValueTarget = (
  state: Record<string, unknown>,
  key: string,
  fallback: unknown
): unknown => (Reflect.has(state, key) ? Reflect.get(state, key) : fallback);

const isTemplateLocalKey = (state: Record<string, unknown>, key: PropertyKey): boolean => {
  let current: Record<string, unknown> | undefined = state;
  while (current) {
    const metadata = extendedStateMetadata.get(current);
    if (!metadata) return false;
    if (metadata.localKeys.has(key)) return true;
    current = metadata.parent;
  }
  return false;
};

const resolveTemplateValueAccessTarget = (
  state: Record<string, unknown>,
  key: string,
  fallback: unknown
): unknown => {
  const target = resolveTemplateValueTarget(state, key, fallback);
  return isTemplateLocalKey(state, key) && isRef(target) ? target.value : target;
};

/** 编译产物读取根标识符 `.value`：Ref 解包，普通对象保留真实 value 字段。 */
export const readTemplateValue = (
  state: Record<string, unknown>,
  key: string,
  fallback: unknown,
  optional: boolean = false
): unknown => {
  const target = resolveTemplateValueAccessTarget(state, key, fallback);
  if (isRef(target)) return target.value;
  if (target === null || target === undefined) {
    if (optional) return undefined;
    throw new TypeError(`Cannot read properties of ${String(target)} (reading 'value')`);
  }
  return Reflect.get(Object(target), "value");
};

/** 编译产物写入根标识符 `.value`：Ref 写回自身，普通对象写入真实字段。 */
export const writeTemplateValue = (
  state: Record<string, unknown>,
  key: string,
  fallback: unknown,
  value: unknown
): unknown => {
  const target = resolveTemplateValueAccessTarget(state, key, fallback);
  if (isRef(target)) {
    target.value = value;
    return value;
  }
  if ((typeof target === "object" && target !== null) || typeof target === "function") {
    if (!Reflect.set(target, "value", value)) {
      throw new TypeError(`Cannot assign to read only property 'value' of ${key}`);
    }
    return value;
  }
  throw new TypeError(`Cannot create property 'value' on ${String(target)}`);
};

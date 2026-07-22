// 响应式 state — useRef / useReactive 双入口
//
// L4 重构：
// - useRef<T>(initial) — 永远返回 Ref<T>（包装 wrapper）。读 .value，写 .value=
//   或 .set()。基本类型支持自动解包（Symbol.toPrimitive / valueOf / toString）。
//   对象/数组合法：内部会被 reactive 包装，所以 ref.value.foo = 1 / arr.push(x)
//   会触发响应式（与 Vue 3 ref 行为一致）。
// - useReactive<T extends object>(initial) — 返回深度响应式代理对象。
//   直接 obj.foo = 1 读写；obj 自身没有 .value/.set/.peek 名（释放给用户字段）。
// 与 Vue 3 的对应：
// - useRef ↔ ref
// - useReactive ↔ reactive
// - useShallowRef ↔ shallowRef
// - useShallowReactive ↔ shallowReactive

import { isFunction, isObject } from "@elfui/shared";

import { DEV as __DEV__ } from "./dev";
import { triggerArrayLength, track, trigger, triggerAll, triggerMany } from "./dep";
import { setReactivityDebugName } from "./devtools";
import { batch } from "./effect";

// ---------- 标识 ----------

/** 标识 ElfUI 的 state 包装对象（同时覆盖 Ref 与 Reactive） */
export const STATE_FLAG: unique symbol = Symbol.for("elfui.state");

/** 仅 Ref 持有 — 区分 Ref vs Reactive */
export const REF_FLAG: unique symbol = Symbol.for("elfui.ref");

/** 仅 Reactive 持有 */
export const REACTIVE_FLAG: unique symbol = Symbol.for("elfui.reactive");

/** 表示一个 state 是只读的（来自 readonly() 或 useComputed 等） */
export const READONLY_FLAG: unique symbol = Symbol.for("elfui.readonly");

/** 标记不应被代理的对象（来自 markRaw） */
const RAW_FLAG: unique symbol = Symbol.for("elfui.raw");

/** Reactive 内部访问器（私有 Symbol，不进入用户命名空间） */
const REACTIVE_PEEK: unique symbol = Symbol.for("elfui.reactive.peek");
const REACTIVE_REPLACE: unique symbol = Symbol.for("elfui.reactive.replace");

// ---------- 类型 ----------

/** Ref 公共方法接口 */
export interface Ref<T> {
  /** 响应式读取（被 effect 追踪） */
  value: T;
  /** 不触发追踪的读取 */
  peek(): T;
  /** 写入 */
  set(value: T): void;
  /** 内部标识 */
  readonly [STATE_FLAG]: true;
  readonly [REF_FLAG]: true;
}

/** Reactive 类型 — 透明代理，与原对象类型一致；额外通过 Symbol 暴露内部方法（不污染用户字段） */
export type Reactive<T extends object> = T;

/** 兼容 Vue 命名 */
export type StateMethods<T> = Ref<T>;

// ---------- 共享存储 ----------

const reactiveProxyMap: WeakMap<object, object> = new WeakMap();
const rawObjectSet: WeakSet<object> = new WeakSet();

export const COLLECTION_SIZE_KEY: unique symbol = Symbol("elfui.collection.size");
export const COLLECTION_ITERATE_KEY: unique symbol = Symbol("elfui.collection.iterate");
export const MAP_KEY_ITERATE_KEY: unique symbol = Symbol("elfui.map.key.iterate");

type CollectionTarget =
  | Map<unknown, unknown>
  | Set<unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>;

type CollectionKind = "map" | "set" | "weakMap" | "weakSet";

// ---------- 工具 ----------

export const isRef = (v: unknown): v is Ref<unknown> =>
  isObject(v) && (v as Record<PropertyKey, unknown>)[REF_FLAG] === true;

export const isReactive = (v: unknown): v is object =>
  isObject(v) && (v as Record<PropertyKey, unknown>)[REACTIVE_FLAG] === true;

export const isState = (v: unknown): v is Ref<unknown> | object =>
  isObject(v) && (v as Record<PropertyKey, unknown>)[STATE_FLAG] === true;

export const isReadonly = (v: unknown): boolean =>
  isObject(v) && (v as Record<PropertyKey, unknown>)[READONLY_FLAG] === true;

export const markRaw = <T extends object>(value: T): T => {
  rawObjectSet.add(value);
  Object.defineProperty(value, RAW_FLAG, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
  return value;
};

const isMarkedRaw = (value: object): boolean => rawObjectSet.has(value);

/** 不需要代理的内置对象（Date / RegExp / 第三方实例） */
const isPlainTarget = (value: unknown): value is object => {
  if (!isObject(value)) return false;
  if (isMarkedRaw(value)) return false;
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const getCollectionKind = (value: unknown): CollectionKind | null => {
  if (!isObject(value) || isMarkedRaw(value)) return null;
  if (value instanceof Map) return "map";
  if (value instanceof Set) return "set";
  if (value instanceof WeakMap) return "weakMap";
  if (value instanceof WeakSet) return "weakSet";
  return null;
};

const arrayMutationMethods = new Set([
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift"
]);

const arrayMutationWrappers = new Map<string, (...args: unknown[]) => unknown>();

const getArrayMutationWrapper = (method: string): ((...args: unknown[]) => unknown) => {
  let wrapper = arrayMutationWrappers.get(method);
  if (!wrapper) {
    wrapper = function (this: unknown[], ...args: unknown[]): unknown {
      const mutation = Array.prototype[method as keyof typeof Array.prototype] as unknown as (
        this: unknown[],
        ...args: unknown[]
      ) => unknown;
      return batch(() => mutation.apply(this, args));
    };
    arrayMutationWrappers.set(method, wrapper);
  }
  return wrapper;
};

const isArrayIndexKey = (key: PropertyKey): key is string => {
  if (typeof key !== "string" || key === "") return false;
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < 4_294_967_295 && String(index) === key;
};

const isCollectionTarget = (value: unknown): value is CollectionTarget =>
  getCollectionKind(value) !== null;

const shouldProxyTarget = (value: unknown): value is object =>
  isPlainTarget(value) || isCollectionTarget(value);

/** 写入对象类型时，把内部已有的 Ref 解掉一层 */
const unwrapValue = <T>(value: T): T => {
  if (isRef(value)) {
    return (value as unknown as Ref<T>).peek();
  }
  return value;
};

// ---------- useRef ----------

/** 创建一个 Ref（永远走 wrapper 形态，不分类型）
 *
 *  @param initial 初始值
 *  @param name 可选调试名（便于 devtools / 错误日志识别；当前仅挂在 ref 上不影响行为）
 */
export function useRef<T>(initial: Ref<T>, name?: string): Ref<T>;
export function useRef<T>(initial: T, name?: string): Ref<T>;
export function useRef<T>(initial: T | Ref<T>, name?: string): Ref<T> {
  if (isRef(initial)) {
    return initial as Ref<T>;
  }
  const ref = createRef<T>(initial as T, name);
  if (__DEV__ && name) {
    Object.defineProperty(ref, "__elf_name", {
      value: name,
      enumerable: false,
      configurable: false,
      writable: false
    });
  }
  return ref;
}

const createRef = <T>(initialValue: T, debugName?: string): Ref<T> => {
  // Vue 3 风格：ref 内部对象会被深度 reactive 包装，这样
  // ref.value.foo = 1 / arr.push(x) 都会触发响应式
  let raw = shouldProxyTarget(initialValue)
    ? (createReactive(initialValue as object) as unknown as T)
    : initialValue;
  // 用稳定 token 作 (target, key)；不能用 ref 自身（toPrimitive 拦截会绕回来）
  const token: object = {};
  if (__DEV__) setReactivityDebugName(token, debugName);

  const ref: Ref<T> = {
    [STATE_FLAG]: true,
    [REF_FLAG]: true,

    get value(): T {
      track(token, "value");
      return raw;
    },

    set value(next: T) {
      const incoming = unwrapValue(next);
      if (Object.is(raw, incoming)) return;
      raw = shouldProxyTarget(incoming)
        ? (createReactive(incoming as object) as unknown as T)
        : incoming;
      trigger(token, "value");
    },

    peek(): T {
      return raw;
    },

    set(next: T): void {
      this.value = next;
    }
  };

  // 自动解包：基本类型在算术 / 字符串上下文中直接当原值用
  Object.defineProperty(ref, Symbol.toPrimitive, {
    value(hint: "number" | "string" | "default") {
      track(token, "value");
      const v = raw as unknown;
      if (hint === "number") return Number(v);
      if (hint === "string") return String(v);
      return v;
    },
    enumerable: false,
    configurable: false
  });

  Object.defineProperty(ref, "valueOf", {
    value() {
      track(token, "value");
      return raw;
    },
    enumerable: false,
    configurable: false
  });

  Object.defineProperty(ref, "toString", {
    value() {
      track(token, "value");
      return String(raw);
    },
    enumerable: false,
    configurable: false
  });

  return ref;
};

// ---------- useReactive ----------

/** 创建一个 Reactive 代理 — 直接 obj.foo 读写，无 .value 拦截
 *
 *  @param initial 初始对象
 *  @param name 可选调试名（DEV 仅挂在内部 token 不影响行为）
 */
export function useReactive<T extends object>(initial: T, name?: string): Reactive<T> {
  if (isReactive(initial)) {
    return initial as Reactive<T>;
  }
  if (isRef(initial)) {
    throw new TypeError(
      __DEV__
        ? "[useReactive] 不接收 Ref。请直接使用这个 Ref，或显式传入 ref.peek() 后再 useReactive。"
        : "[useReactive] invalid Ref input"
    );
  }
  if (!shouldProxyTarget(initial)) {
    // 第三方实例 / 标记 raw 等：原样返回
    return initial;
  }
  const proxy = createReactive(initial);
  if (__DEV__) setReactivityDebugName(initial, name);
  if (__DEV__ && name) {
    Object.defineProperty(initial, "__elf_name", {
      value: name,
      enumerable: false,
      configurable: false,
      writable: false
    });
  }
  return proxy;
}

const createReactive = <T extends object>(target: T): Reactive<T> => {
  const cached = reactiveProxyMap.get(target);
  if (cached) return cached as Reactive<T>;

  const collectionKind = getCollectionKind(target);
  if (collectionKind) {
    return createReactiveCollection(target as CollectionTarget, collectionKind) as Reactive<T>;
  }

  const proxy = new Proxy(target, {
    get(t, key, receiver) {
      // 标识位
      if (key === STATE_FLAG || key === REACTIVE_FLAG) return true;
      if (key === REF_FLAG) return false;
      // 私有内部访问器
      if (key === REACTIVE_PEEK) return () => target;
      if (key === REACTIVE_REPLACE) {
        return (next: T) => replaceReactive(target, next);
      }

      const value = Reflect.get(t, key, receiver);

      if (
        Array.isArray(t) &&
        typeof key === "string" &&
        arrayMutationMethods.has(key) &&
        value === Array.prototype[key as keyof typeof Array.prototype]
      ) {
        return getArrayMutationWrapper(key);
      }

      track(t, key);

      // 嵌套对象 lazy 代理；保留函数原样
      if (shouldProxyTarget(value)) {
        return createReactive(value);
      }
      return value;
    },

    set(t, key, value, receiver) {
      const incoming = unwrapValue(value);
      const isArray = Array.isArray(t);
      const oldLength = isArray ? (t as unknown[]).length : 0;
      const isArrayIndex = isArray && isArrayIndexKey(key);
      const hadKey = isArrayIndex
        ? Number(key) < oldLength
        : Object.prototype.hasOwnProperty.call(t, key);
      const old = (t as Record<PropertyKey, unknown>)[key as PropertyKey];
      const result = Reflect.set(t, key, incoming, receiver);

      if (!result) return false;

      if (isArray && key === "length") {
        if (!Object.is(old, incoming)) {
          triggerArrayLength(t as unknown[], Number(incoming));
        }
        return true;
      }

      if (!hadKey) {
        if (isArrayIndex) triggerMany(t, [key, "length"]);
        else trigger(t, key);
      } else if (!Object.is(old, incoming)) {
        trigger(t, key);
      }
      return true;
    },

    deleteProperty(t, key) {
      const had = Object.prototype.hasOwnProperty.call(t, key);
      const result = Reflect.deleteProperty(t, key);
      if (had && result) trigger(t, key);
      return result;
    }
  });

  reactiveProxyMap.set(target, proxy);
  return proxy as Reactive<T>;
};

function createReactiveCollection<T extends CollectionTarget>(target: T, kind: CollectionKind): T {
  const proxy = new Proxy(target, {
    get(t, key, receiver) {
      if (key === STATE_FLAG || key === REACTIVE_FLAG) return true;
      if (key === REF_FLAG) return false;
      if (key === REACTIVE_PEEK) return () => target;
      if (key === REACTIVE_REPLACE) return undefined;

      if (key === "size" && (kind === "map" || kind === "set")) {
        track(target, COLLECTION_SIZE_KEY);
        return (target as Map<unknown, unknown> | Set<unknown>).size;
      }

      if (kind === "map") {
        return getReactiveMapValue(target as Map<unknown, unknown>, key, receiver);
      }
      if (kind === "set") {
        return getReactiveSetValue(target as Set<unknown>, key, receiver);
      }
      if (kind === "weakMap") {
        return getReactiveWeakMapValue(target as WeakMap<object, unknown>, key, receiver);
      }
      return getReactiveWeakSetValue(target as WeakSet<object>, key, receiver);
    }
  });

  reactiveProxyMap.set(target, proxy);
  return proxy as T;
}

function getReactiveMapValue(
  target: Map<unknown, unknown>,
  key: PropertyKey,
  receiver: unknown
): unknown {
  if (key === "get") {
    return (itemKey: unknown) => {
      const rawKey = normalizeCollectionKey(itemKey);
      track(target, rawKey);
      return toReactiveCollectionValue(target.get(rawKey));
    };
  }

  if (key === "has") {
    return (itemKey: unknown) => {
      const rawKey = normalizeCollectionKey(itemKey);
      track(target, rawKey);
      return target.has(rawKey);
    };
  }

  if (key === "set") {
    return (itemKey: unknown, value: unknown) => {
      const rawKey = normalizeCollectionKey(itemKey);
      const rawValue = normalizeCollectionValue(value);
      const hadKey = target.has(rawKey);
      const oldValue = target.get(rawKey);
      target.set(rawKey, rawValue);
      if (!hadKey) {
        triggerCollectionAdd(target, rawKey, true);
      } else if (!Object.is(oldValue, rawValue)) {
        triggerMany(target, [rawKey, COLLECTION_ITERATE_KEY]);
      }
      return receiver;
    };
  }

  if (key === "delete") {
    return (itemKey: unknown) => {
      const rawKey = normalizeCollectionKey(itemKey);
      const hadKey = target.has(rawKey);
      const deleted = target.delete(rawKey);
      if (hadKey && deleted) {
        triggerCollectionDelete(target, rawKey, true);
      }
      return deleted;
    };
  }

  if (key === "clear") {
    return () => {
      const hadItems = target.size > 0;
      target.clear();
      if (hadItems) triggerAll(target);
    };
  }

  if (key === "forEach") {
    return (callback: (value: unknown, key: unknown, map: unknown) => void, thisArg?: unknown) => {
      track(target, COLLECTION_ITERATE_KEY);
      target.forEach((value, itemKey) => {
        callback.call(
          thisArg,
          toReactiveCollectionValue(value),
          toReactiveCollectionValue(itemKey),
          receiver
        );
      });
    };
  }

  if (key === "keys") {
    return () => {
      track(target, MAP_KEY_ITERATE_KEY);
      return createCollectionIterator(target.keys(), "values");
    };
  }

  if (key === "values") {
    return () => {
      track(target, COLLECTION_ITERATE_KEY);
      return createCollectionIterator(target.values(), "values");
    };
  }

  if (key === "entries" || key === Symbol.iterator) {
    return () => {
      track(target, COLLECTION_ITERATE_KEY);
      return createCollectionIterator(target.entries(), "entries");
    };
  }

  return Reflect.get(target, key, target);
}

function getReactiveSetValue(target: Set<unknown>, key: PropertyKey, receiver: unknown): unknown {
  if (key === "has") {
    return (value: unknown) => {
      const rawValue = normalizeCollectionKey(value);
      track(target, rawValue);
      return target.has(rawValue);
    };
  }

  if (key === "add") {
    return (value: unknown) => {
      const rawValue = normalizeCollectionValue(value);
      const hadValue = target.has(rawValue);
      target.add(rawValue);
      if (!hadValue) {
        triggerCollectionAdd(target, rawValue, false);
      }
      return receiver;
    };
  }

  if (key === "delete") {
    return (value: unknown) => {
      const rawValue = normalizeCollectionKey(value);
      const hadValue = target.has(rawValue);
      const deleted = target.delete(rawValue);
      if (hadValue && deleted) {
        triggerCollectionDelete(target, rawValue, false);
      }
      return deleted;
    };
  }

  if (key === "clear") {
    return () => {
      const hadItems = target.size > 0;
      target.clear();
      if (hadItems) triggerAll(target);
    };
  }

  if (key === "forEach") {
    return (callback: (value: unknown, key: unknown, set: unknown) => void, thisArg?: unknown) => {
      track(target, COLLECTION_ITERATE_KEY);
      target.forEach((value) => {
        const wrapped = toReactiveCollectionValue(value);
        callback.call(thisArg, wrapped, wrapped, receiver);
      });
    };
  }

  if (key === "keys" || key === "values" || key === Symbol.iterator) {
    return () => {
      track(target, COLLECTION_ITERATE_KEY);
      return createCollectionIterator(target.values(), "values");
    };
  }

  if (key === "entries") {
    return () => {
      track(target, COLLECTION_ITERATE_KEY);
      return createCollectionIterator(target.entries(), "entries");
    };
  }

  return Reflect.get(target, key, target);
}

function getReactiveWeakMapValue(
  target: WeakMap<object, unknown>,
  key: PropertyKey,
  receiver: unknown
): unknown {
  if (key === "get") {
    return (itemKey: object) => {
      const rawKey = normalizeCollectionKey(itemKey) as object;
      track(target, rawKey);
      return toReactiveCollectionValue(target.get(rawKey));
    };
  }

  if (key === "has") {
    return (itemKey: object) => {
      const rawKey = normalizeCollectionKey(itemKey) as object;
      track(target, rawKey);
      return target.has(rawKey);
    };
  }

  if (key === "set") {
    return (itemKey: object, value: unknown) => {
      const rawKey = normalizeCollectionKey(itemKey) as object;
      const rawValue = normalizeCollectionValue(value);
      const hadKey = target.has(rawKey);
      const oldValue = target.get(rawKey);
      target.set(rawKey, rawValue);
      if (!hadKey || !Object.is(oldValue, rawValue)) {
        trigger(target, rawKey);
      }
      return receiver;
    };
  }

  if (key === "delete") {
    return (itemKey: object) => {
      const rawKey = normalizeCollectionKey(itemKey) as object;
      const hadKey = target.has(rawKey);
      const deleted = target.delete(rawKey);
      if (hadKey && deleted) trigger(target, rawKey);
      return deleted;
    };
  }

  return Reflect.get(target, key, target);
}

function getReactiveWeakSetValue(
  target: WeakSet<object>,
  key: PropertyKey,
  receiver: unknown
): unknown {
  if (key === "has") {
    return (value: object) => {
      const rawValue = normalizeCollectionKey(value) as object;
      track(target, rawValue);
      return target.has(rawValue);
    };
  }

  if (key === "add") {
    return (value: object) => {
      const rawValue = normalizeCollectionKey(value) as object;
      const hadValue = target.has(rawValue);
      target.add(rawValue);
      if (!hadValue) trigger(target, rawValue);
      return receiver;
    };
  }

  if (key === "delete") {
    return (value: object) => {
      const rawValue = normalizeCollectionKey(value) as object;
      const hadValue = target.has(rawValue);
      const deleted = target.delete(rawValue);
      if (hadValue && deleted) trigger(target, rawValue);
      return deleted;
    };
  }

  return Reflect.get(target, key, target);
}

function normalizeCollectionKey(key: unknown): unknown {
  return isObject(key) ? toRaw(key) : key;
}

function normalizeCollectionValue(value: unknown): unknown {
  const unwrapped = unwrapValue(value);
  return isObject(unwrapped) ? toRaw(unwrapped) : unwrapped;
}

function toReactiveCollectionValue(value: unknown): unknown {
  return shouldProxyTarget(value) ? createReactive(value) : value;
}

function triggerCollectionAdd(target: object, key: unknown, isMap: boolean): void {
  triggerMany(
    target,
    isMap
      ? [key, COLLECTION_SIZE_KEY, COLLECTION_ITERATE_KEY, MAP_KEY_ITERATE_KEY]
      : [key, COLLECTION_SIZE_KEY, COLLECTION_ITERATE_KEY]
  );
}

function triggerCollectionDelete(target: object, key: unknown, isMap: boolean): void {
  triggerMany(
    target,
    isMap
      ? [key, COLLECTION_SIZE_KEY, COLLECTION_ITERATE_KEY, MAP_KEY_ITERATE_KEY]
      : [key, COLLECTION_SIZE_KEY, COLLECTION_ITERATE_KEY]
  );
}

function createCollectionIterator(
  iterator: IterableIterator<unknown>,
  mode: "entries" | "values"
): IterableIterator<unknown> {
  return {
    next() {
      const result = iterator.next();
      if (result.done) {
        return { value: undefined, done: true };
      }
      if (mode === "entries") {
        const [key, value] = result.value as [unknown, unknown];
        return {
          value: [toReactiveCollectionValue(key), toReactiveCollectionValue(value)],
          done: false
        };
      }
      return {
        value: toReactiveCollectionValue(result.value),
        done: false
      };
    },
    [Symbol.iterator]() {
      return this;
    }
  };
}

/** 内部 API — 用一个新对象整体替换 reactive 内容 */
const replaceReactive = <T extends object>(target: T, next: T): void => {
  if (Array.isArray(target) && Array.isArray(next)) {
    target.length = 0;
    for (let i = 0; i < next.length; i++) {
      (target as unknown[])[i] = (next as unknown[])[i];
    }
    triggerAll(target);
    return;
  }
  for (const key of Object.keys(target)) {
    if (!(key in (next as object))) {
      delete (target as Record<string, unknown>)[key];
    }
  }
  Object.assign(target as object, next as object);
  triggerAll(target);
};

// ---------- toRaw / unref / toValue ----------

/** 把 ref / reactive 解回原值；不会触发依赖追踪 */
export const toRaw = <T>(value: unknown): T => {
  if (isRef(value)) return (value as Ref<T>).peek();
  if (isReactive(value)) {
    const peek = (value as unknown as Record<symbol, unknown>)[REACTIVE_PEEK];
    if (typeof peek === "function") return (peek as () => T)();
  }
  return value as T;
};

/** unref：与 Vue 同名同义 */
export const unref = toRaw;

/** toValue：函数则调用、ref 则解包、其它原样 */
export const toValue = <T>(source: unknown): T => {
  if (isFunction(source)) return (source as () => T)();
  return toRaw<T>(source);
};

// ---------- 内部访问器导出（runtime 内部使用） ----------

export { REACTIVE_PEEK, REACTIVE_REPLACE };

// 进阶响应式工具：readonly / shallowState / isProxy
//
// readonly：把响应式对象包成只读视图。读取仍然 track（让 effect 订阅
// 原对象的变化），写入时打 console.warn 不抛错；嵌套对象 lazy 包装。
//
// shallowState：只代理顶层属性，嵌套不深度代理。适合大对象、第三方实例
// 不希望被深度 Proxy 的场景。
//
// isProxy：判断是否是 ElfUI 创建的 state / readonly / shallowState 代理。

import { isObject } from "@elfui/shared";

import { DEV as __DEV__ } from "./dev";
import { track, trigger } from "./dep";
import {
  COLLECTION_ITERATE_KEY,
  COLLECTION_SIZE_KEY,
  MAP_KEY_ITERATE_KEY,
  READONLY_FLAG,
  STATE_FLAG,
  isState,
  toRaw,
  useReactive
} from "./state";

// ---------- isProxy ----------

/** 判断是否是 ElfUI 创建的代理（state / readonly / shallowState） */
export const isProxy = (value: unknown): boolean => {
  if (!isObject(value)) return false;
  const r = value as Record<PropertyKey, unknown>;
  return r[STATE_FLAG] === true || r[READONLY_FLAG] === true;
};

// ---------- readonly ----------

/** readonly 代理缓存：原对象 -> readonly 代理 */
const readonlyMap: WeakMap<object, object> = new WeakMap();

type ReadonlyCollectionTarget =
  | Map<unknown, unknown>
  | Set<unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>;

type ReadonlyCollectionKind = "map" | "set" | "weakMap" | "weakSet";

/** 创建一个只读视图。
 *  - 读取依然 track（与 useState 一样，让 effect 订阅原对象的变化）
 *  - 写入 / 删除时打 console.warn，不抛错
 *  - 嵌套对象 lazy 包装为 readonly */
export function readonly<T extends object>(target: T): T {
  if (!isObject(target)) {
    return target;
  }
  // 已经是 readonly 直接返回
  if ((target as Record<PropertyKey, unknown>)[READONLY_FLAG] === true) {
    return target;
  }
  const cached = readonlyMap.get(target);
  if (cached) {
    return cached as T;
  }

  // 如果传入的是普通对象，先包成 reactive，让深度追踪生效
  const reactiveTarget = isState(target) ? target : useReactive(target as object);
  const collectionKind = getReadonlyCollectionKind(reactiveTarget);
  if (collectionKind) {
    const proxy = createReadonlyCollection(
      toRaw(reactiveTarget) as ReadonlyCollectionTarget,
      collectionKind
    );
    readonlyMap.set(target, proxy);
    return proxy as T;
  }

  const proxy = new Proxy(reactiveTarget as object, {
    get(t, key, receiver) {
      if (key === READONLY_FLAG) return true;
      if (key === STATE_FLAG) return true;
      const value = Reflect.get(t, key, receiver);
      // 嵌套对象 lazy 包装
      if (isObject(value)) {
        return readonly(value);
      }
      return value;
    },

    set(_t, key) {
      if (__DEV__)
        console.warn(
          `[readonly] 不能写入只读对象的属性 "${String(key)}"。如需修改请直接改原对象。`
        );
      return true;
    },

    deleteProperty(_t, key) {
      if (__DEV__) console.warn(`[readonly] 不能删除只读对象的属性 "${String(key)}"。`);
      return true;
    }
  });

  readonlyMap.set(target, proxy);
  return proxy as T;
}

function getReadonlyCollectionKind(value: unknown): ReadonlyCollectionKind | null {
  if (!isObject(value)) return null;
  if (value instanceof Map) return "map";
  if (value instanceof Set) return "set";
  if (value instanceof WeakMap) return "weakMap";
  if (value instanceof WeakSet) return "weakSet";
  return null;
}

function createReadonlyCollection<T extends ReadonlyCollectionTarget>(
  target: T,
  kind: ReadonlyCollectionKind
): T {
  const proxy = new Proxy(target, {
    get(t, key, receiver) {
      if (key === READONLY_FLAG) return true;
      if (key === STATE_FLAG) return true;

      if (key === "size" && (kind === "map" || kind === "set")) {
        track(target, COLLECTION_SIZE_KEY);
        return (target as Map<unknown, unknown> | Set<unknown>).size;
      }

      if (kind === "map") {
        return getReadonlyMapValue(target as Map<unknown, unknown>, key, receiver);
      }
      if (kind === "set") {
        return getReadonlySetValue(target as Set<unknown>, key, receiver);
      }
      if (kind === "weakMap") {
        return getReadonlyWeakMapValue(target as WeakMap<object, unknown>, key);
      }
      return getReadonlyWeakSetValue(target as WeakSet<object>, key, receiver);
    }
  });

  return proxy as T;
}

function getReadonlyMapValue(
  target: Map<unknown, unknown>,
  key: PropertyKey,
  receiver: unknown
): unknown {
  if (key === "get") {
    return (itemKey: unknown) => {
      const rawKey = normalizeReadonlyCollectionKey(itemKey);
      track(target, rawKey);
      return toReadonlyCollectionValue(target.get(rawKey));
    };
  }

  if (key === "has") {
    return (itemKey: unknown) => {
      const rawKey = normalizeReadonlyCollectionKey(itemKey);
      track(target, rawKey);
      return target.has(rawKey);
    };
  }

  if (key === "set") {
    return () => {
      warnReadonlyCollection("set");
      return receiver;
    };
  }

  if (key === "delete") {
    return () => {
      warnReadonlyCollection("delete");
      return false;
    };
  }

  if (key === "clear") {
    return () => {
      warnReadonlyCollection("clear");
    };
  }

  if (key === "forEach") {
    return (callback: (value: unknown, key: unknown, map: unknown) => void, thisArg?: unknown) => {
      track(target, COLLECTION_ITERATE_KEY);
      target.forEach((value, itemKey) => {
        callback.call(
          thisArg,
          toReadonlyCollectionValue(value),
          toReadonlyCollectionValue(itemKey),
          receiver
        );
      });
    };
  }

  if (key === "keys") {
    return () => {
      track(target, MAP_KEY_ITERATE_KEY);
      return createReadonlyCollectionIterator(target.keys(), "values");
    };
  }

  if (key === "values") {
    return () => {
      track(target, COLLECTION_ITERATE_KEY);
      return createReadonlyCollectionIterator(target.values(), "values");
    };
  }

  if (key === "entries" || key === Symbol.iterator) {
    return () => {
      track(target, COLLECTION_ITERATE_KEY);
      return createReadonlyCollectionIterator(target.entries(), "entries");
    };
  }

  return Reflect.get(target, key, target);
}

function getReadonlySetValue(target: Set<unknown>, key: PropertyKey, receiver: unknown): unknown {
  if (key === "has") {
    return (value: unknown) => {
      const rawValue = normalizeReadonlyCollectionKey(value);
      track(target, rawValue);
      return target.has(rawValue);
    };
  }

  if (key === "add") {
    return () => {
      warnReadonlyCollection("add");
      return receiver;
    };
  }

  if (key === "delete") {
    return () => {
      warnReadonlyCollection("delete");
      return false;
    };
  }

  if (key === "clear") {
    return () => {
      warnReadonlyCollection("clear");
    };
  }

  if (key === "forEach") {
    return (callback: (value: unknown, key: unknown, set: unknown) => void, thisArg?: unknown) => {
      track(target, COLLECTION_ITERATE_KEY);
      target.forEach((value) => {
        const wrapped = toReadonlyCollectionValue(value);
        callback.call(thisArg, wrapped, wrapped, receiver);
      });
    };
  }

  if (key === "keys" || key === "values" || key === Symbol.iterator) {
    return () => {
      track(target, COLLECTION_ITERATE_KEY);
      return createReadonlyCollectionIterator(target.values(), "values");
    };
  }

  if (key === "entries") {
    return () => {
      track(target, COLLECTION_ITERATE_KEY);
      return createReadonlyCollectionIterator(target.entries(), "entries");
    };
  }

  return Reflect.get(target, key, target);
}

function getReadonlyWeakMapValue(target: WeakMap<object, unknown>, key: PropertyKey): unknown {
  if (key === "get") {
    return (itemKey: object) => {
      const rawKey = normalizeReadonlyCollectionKey(itemKey) as object;
      track(target, rawKey);
      return toReadonlyCollectionValue(target.get(rawKey));
    };
  }

  if (key === "has") {
    return (itemKey: object) => {
      const rawKey = normalizeReadonlyCollectionKey(itemKey) as object;
      track(target, rawKey);
      return target.has(rawKey);
    };
  }

  if (key === "set") {
    return () => {
      warnReadonlyCollection("set");
      return target;
    };
  }

  if (key === "delete") {
    return () => {
      warnReadonlyCollection("delete");
      return false;
    };
  }

  return Reflect.get(target, key, target);
}

function getReadonlyWeakSetValue(
  target: WeakSet<object>,
  key: PropertyKey,
  receiver: unknown
): unknown {
  if (key === "has") {
    return (value: object) => {
      const rawValue = normalizeReadonlyCollectionKey(value) as object;
      track(target, rawValue);
      return target.has(rawValue);
    };
  }

  if (key === "add") {
    return () => {
      warnReadonlyCollection("add");
      return receiver;
    };
  }

  if (key === "delete") {
    return () => {
      warnReadonlyCollection("delete");
      return false;
    };
  }

  return Reflect.get(target, key, target);
}

function normalizeReadonlyCollectionKey(key: unknown): unknown {
  return isObject(key) ? toRaw(key) : key;
}

function toReadonlyCollectionValue(value: unknown): unknown {
  return isObject(value) ? readonly(value) : value;
}

function warnReadonlyCollection(method: string): void {
  if (__DEV__) console.warn(`[readonly] 不能调用只读集合的 ${method}()。`);
}

function createReadonlyCollectionIterator(
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
          value: [toReadonlyCollectionValue(key), toReadonlyCollectionValue(value)],
          done: false
        };
      }
      return {
        value: toReadonlyCollectionValue(result.value),
        done: false
      };
    },
    [Symbol.iterator]() {
      return this;
    }
  };
}

// ---------- useShallowReactive ----------

const shallowProxyMap: WeakMap<object, object> = new WeakMap();

/** 浅响应式：只代理顶层属性，嵌套不深度代理。
 *  - 顶层 set 触发 effect
 *  - 嵌套对象保持原样（直接修改不会触发 effect） */
export function useShallowReactive<T extends object>(target: T): T {
  if (!isObject(target)) {
    return target;
  }
  const cached = shallowProxyMap.get(target);
  if (cached) {
    return cached as T;
  }

  const proxy = new Proxy(target, {
    get(t, key, receiver) {
      if (key === STATE_FLAG) return true;
      track(t, key);
      return Reflect.get(t, key, receiver);
    },

    set(t, key, value, receiver) {
      const old = Reflect.get(t, key, receiver);
      const result = Reflect.set(t, key, value, receiver);
      if (!Object.is(old, value)) {
        trigger(t, key);
      }
      return result;
    },

    deleteProperty(t, key) {
      const had = Object.prototype.hasOwnProperty.call(t, key);
      const result = Reflect.deleteProperty(t, key);
      if (had && result) {
        trigger(t, key);
      }
      return result;
    }
  });

  shallowProxyMap.set(target, proxy);
  return proxy as T;
}

// ---------- useShallowRef ----------

import { REF_FLAG, type Ref } from "./state";

/** 浅 Ref：与 useState 类似，但 .value 替换时不深度比较，写入对象内属性不触发 */
export function useShallowRef<T>(initial: T): Ref<T> {
  let raw = initial;
  const token: object = {};
  const ref: Ref<T> = {
    [STATE_FLAG]: true,
    [REF_FLAG]: true,
    get value() {
      track(token, "value");
      return raw;
    },
    set value(next: T) {
      if (Object.is(raw, next)) return;
      raw = next;
      trigger(token, "value");
    },
    peek() {
      return raw;
    },
    set(next: T) {
      this.value = next;
      return this;
    }
  };
  Object.defineProperty(ref, Symbol.toPrimitive, {
    value() {
      track(token, "value");
      return raw;
    },
    enumerable: false,
    configurable: false
  });
  return ref;
}

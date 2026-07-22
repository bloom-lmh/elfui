// watch — 明确数据源监听入口
//
// 设计：
// - watch(src, cb, options?)：明确数据源（State / getter / 数组）+ 回调 (newVal, oldVal, onCleanup)
//   * 不立即执行回调；状态变化时才触发
//   * immediate: true 时首次也触发
//   * deep: true 时对对象 state 深度遍历建立追踪
// - 自动追踪副作用统一使用 useEffect(fn, options?)
// - flush 时机：sync / pre / post
// - cleanup：cb 第三个参数 onCleanup，或 onWatcherCleanup() 注册
//
// 与 Vue watch 差异：
// - State 自动解包：模板里直接读 .value；getter 形式与 Vue 一致
// - Ref 可直接作为 source 传入，不需要再包一层 getter

import { ReactiveEffect } from "./effect";
import { isFunction, isObject } from "@elfui/shared";
import { DEV as __DEV__ } from "./dev";
import { isState, type Ref, type StateMethods } from "./state";
import { queueJob, queuePostFlushJob, type SchedulerJob } from "./scheduler";

// 数据源形态：
// - 函数 () => T （会被 effect 追踪）
// - Ref<T>：自动取 .value 解包成 T
// - 任意 object（reactive / 普通对象）：deep 时按整体监听
export type WatchSource<T = unknown> = Ref<T> | (() => T) | object;

/** 从 WatchSource 提取被监听的实际值类型。
 *  优先匹配 State<T>，避免 StateMethods 含 peek: () => T 时被误匹配为函数 source */
export type WatchSourceValue<S> =
  S extends StateMethods<infer V> ? V : S extends () => infer V ? V : never;

/** 数组源映射 */
export type WatchSourceValues<T extends readonly unknown[]> = {
  [K in keyof T]: WatchSourceValue<T[K]>;
};

/** 数组源旧值（首次为 undefined） */
export type WatchSourceOldValues<T extends readonly unknown[]> = {
  [K in keyof T]: WatchSourceValue<T[K]> | undefined;
};

export interface WatchOptions {
  /** 首次也调用 cb（使用 oldVal=undefined） */
  immediate?: boolean;
  /** 对对象 state 深度遍历建立追踪 */
  deep?: boolean;
  /** 调度时机 */
  flush?: "sync" | "pre" | "post";
  /** stop 时调用一次 */
  onStop?: () => void;
}

export type WatchCleanup = () => void;
export type WatchCleanupRegister = (cleanup: WatchCleanup) => void;

export type WatchCallback<V = unknown, OV = V> = (
  value: V,
  oldValue: OV,
  onCleanup: WatchCleanupRegister
) => void | WatchCleanup;

export interface WatchStopHandle {
  (): void;
}

// 保存当前 watch callback 的 cleanup register，让 onWatcherCleanup() 能找到它
let activeCleanupRegister: WatchCleanupRegister | null = null;

/**
 * 注册一个清理回调；只能在 watch 的 cb 同步执行期间调用。
 *
 * @example
 *   watch(count, () => {
 *     const timer = setTimeout(...);
 *     onWatcherCleanup(() => clearTimeout(timer));
 *   });
 */
export const onWatcherCleanup = (cleanup: WatchCleanup): void => {
  if (!activeCleanupRegister) {
    if (__DEV__) console.warn("[onWatcherCleanup] 必须在 watch 回调同步执行期间调用。");
    return;
  }
  activeCleanupRegister(cleanup);
};

// ------------ watch ------------

/**
 * 监听一个数据源，状态变化时触发回调。
 *
 * @example
 *   const count = useRef(0);
 *   const stop = watch(count, (v, ov) => console.log(v, ov));
 *   count.value = 1; // -> 1, 0
 *   stop();
 *
 * @example getter 形式
 *   watch(() => user.name, (v, ov) => ...);
 *
 * @example 数组源
 *   watch([a, b], ([na, nb], [oa, ob]) => ...);
 */
export function watch<S extends WatchSource>(
  source: S,
  cb: WatchCallback<WatchSourceValue<S>, WatchSourceValue<S> | undefined>,
  options?: WatchOptions
): WatchStopHandle;
export function watch<S extends readonly WatchSource[]>(
  sources: [...S],
  cb: WatchCallback<WatchSourceValues<S>, WatchSourceOldValues<S>>,
  options?: WatchOptions
): WatchStopHandle;
export function watch(
  source: WatchSource | readonly WatchSource[],
  cb: WatchCallback<any, any>,
  options: WatchOptions = {}
): WatchStopHandle {
  const isMulti = Array.isArray(source);
  const getter = createGetter(source, options.deep === true);

  let oldValue: unknown = undefined;
  let cleanups: WatchCleanup[] = [];
  let initialized = false;

  const runCleanups = (): void => {
    if (cleanups.length === 0) return;
    const list = cleanups;
    cleanups = [];
    for (const fn of list) {
      try {
        fn();
      } catch (err) {
        if (__DEV__) console.error("[watch] cleanup error:", err);
        else console.error(err);
      }
    }
  };

  const register: WatchCleanupRegister = (fn) => {
    cleanups.push(fn);
  };

  const job = (): void => {
    if (!effectInstance.active) return;
    const newValue = effectInstance.run();

    // 数组源每次都是新数组，跟 Vue 一致：内层逐项比较
    // deep 模式下整个引用一般不变（同一个 proxy），跳过相等比较 — effect 触发即视为变化
    const isDeep = options.deep === true;
    const changed = isDeep
      ? true
      : isMulti
        ? hasArrayDiff(newValue as unknown[], oldValue as unknown[] | undefined)
        : !Object.is(newValue, oldValue);

    if (initialized && !changed) {
      return;
    }

    runCleanups();
    activeCleanupRegister = register;
    try {
      const result = cb(newValue, oldValue, register);
      if (typeof result === "function") {
        cleanups.push(result);
      }
    } finally {
      activeCleanupRegister = null;
    }

    oldValue = isMulti ? [...(newValue as unknown[])] : newValue;
    initialized = true;
  };

  const flush = options.flush ?? "pre";
  const scheduler = createScheduler(flush, job);

  const effectInstance = new ReactiveEffect(getter, scheduler);

  // 收集初始依赖与 oldValue
  if (options.immediate) {
    job();
  } else {
    oldValue = effectInstance.run();
    if (isMulti) oldValue = [...(oldValue as unknown[])];
    initialized = true;
  }

  return () => {
    runCleanups();
    if (options.onStop) options.onStop();
    effectInstance.stop();
  };
}

// ------------ helpers ------------

const createScheduler = (flush: "sync" | "pre" | "post", job: () => void): (() => void) => {
  if (flush === "sync") {
    return job;
  }
  const wrapped = job as SchedulerJob;
  if (flush === "post") {
    return () => queuePostFlushJob(wrapped);
  }
  // 默认 pre
  return () => queueJob(wrapped);
};

const createGetter = (
  source: WatchSource | readonly WatchSource[],
  deep: boolean
): (() => unknown) => {
  if (Array.isArray(source)) {
    return () =>
      source.map((s) => {
        const v = readSource(s);
        return deep ? traverse(v) : v;
      });
  }
  const single = source as WatchSource;
  return () => {
    const v = readSource(single);
    return deep ? traverse(v) : v;
  };
};

const readSource = (s: WatchSource): unknown => {
  if (isFunction(s)) {
    return s();
  }
  if (isState(s)) {
    // Ref：取 .value；Reactive 对象：直接返回（外层用 deep 包装做遍历）
    if ("value" in (s as object)) {
      return (s as { value: unknown }).value;
    }
    return s;
  }
  return s;
};

/** 深度遍历对象建立追踪
 *  对 State 对象直接遍历 proxy 自身（每次 get 都会触发 track），
 *  不要 toRaw 后再遍历，因为 toRaw 对对象 state 返回的也是 proxy 自身但
 *  我们要确保 isObject 与 Object.keys 的访问路径都通过 proxy。*/
const traverse = (value: unknown, seen: Set<unknown> = new Set()): unknown => {
  if (!isObject(value) || seen.has(value)) {
    return value;
  }
  seen.add(value);
  // 直接遍历传入的 value（如果是 state 就是 proxy，遍历会自动 track）
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse((value as unknown[])[i], seen);
    }
  } else if (value instanceof Map) {
    value.forEach((entryValue, entryKey) => {
      traverse(entryKey, seen);
      traverse(entryValue, seen);
    });
  } else if (value instanceof Set) {
    value.forEach((entryValue) => {
      traverse(entryValue, seen);
    });
  } else {
    for (const key of Object.keys(value)) {
      traverse((value as Record<string, unknown>)[key], seen);
    }
  }
  return value;
};

const hasArrayDiff = (a: unknown[], b: unknown[] | undefined): boolean => {
  if (!b) return true;
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return true;
  }
  return false;
};

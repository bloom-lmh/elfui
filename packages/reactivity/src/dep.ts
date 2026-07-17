// 依赖图 — 把 (target, key) 映射到一个 Dep
//
// targetMap: WeakMap<object, Map<unknown, Dep>>
//
// 用法：
//   - State<T> 的 .value 读取 → track(state, "value")
//   - State<T> 的 .value 写入 → trigger(state, "value")
//   - 对象 state 的属性读取 → track(rawObj, key)
//   - 对象 state 的属性写入 → trigger(rawObj, key)

import { type Dep, isTracking, trackEffects, triggerEffects } from "./effect";

type KeyToDepMap = Map<unknown, Dep>;

const targetMap: WeakMap<object, KeyToDepMap> = new WeakMap();

/** 把当前 active effect 关联到 (target, key) */
export const track = (target: object, key: unknown): void => {
  if (!isTracking()) {
    return;
  }

  let depsMap = targetMap.get(target);

  if (!depsMap) {
    depsMap = new Map();
    targetMap.set(target, depsMap);
  }

  let dep = depsMap.get(key);

  if (!dep) {
    dep = new Set();
    depsMap.set(key, dep);
  }

  trackEffects(dep);
};

/** 触发 (target, key) 上所有 effect */
export const trigger = (target: object, key: unknown): void => {
  const depsMap = targetMap.get(target);
  const dep = depsMap?.get(key);

  if (!dep) {
    return;
  }

  triggerEffects(dep, { target, key });
};

/** 一次性触发多个 key，并对重复 effect 去重 */
export const triggerMany = (target: object, keys: readonly unknown[]): void => {
  const depsMap = targetMap.get(target);

  if (!depsMap) {
    return;
  }

  const effects: Dep = new Set();
  for (const key of keys) {
    const dep = depsMap.get(key);
    if (!dep) continue;
    for (const effect of dep) {
      effects.add(effect);
    }
  }

  if (effects.size > 0) {
    triggerEffects(effects, { target, key: keys });
  }
};

const isArrayIndexKey = (key: unknown): key is string => {
  if (typeof key !== "string" || key === "") return false;
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < 4_294_967_295 && String(index) === key;
};

/**
 * 数组 length 写入需要同时通知 length 以及被截断索引的依赖，并在同一轮内去重。
 * 这里只遍历已经被追踪的 key，避免按稀疏数组的长度逐项扫描。
 */
export const triggerArrayLength = (target: unknown[], newLength: number): void => {
  const depsMap = targetMap.get(target);

  if (!depsMap) {
    return;
  }

  const effects: Dep = new Set();
  for (const [key, dep] of depsMap) {
    if (key !== "length" && !(isArrayIndexKey(key) && Number(key) >= newLength)) continue;
    for (const effect of dep) {
      effects.add(effect);
    }
  }

  if (effects.size > 0) {
    triggerEffects(effects, { target, key: "length" });
  }
};

/** 触发 target 下所有 key 的 effect（用于深度替换、Object.assign 等） */
export const triggerAll = (target: object): void => {
  const depsMap = targetMap.get(target);

  if (!depsMap) {
    return;
  }

  const effects: Dep = new Set();
  for (const dep of depsMap.values()) {
    for (const effect of dep) {
      effects.add(effect);
    }
  }

  if (effects.size > 0) {
    triggerEffects(effects, { target, key: "*" });
  }
};

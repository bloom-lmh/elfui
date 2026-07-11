// useComputed — 派生 state
//
// 设计：
// - 满足 State<T> 接口：.value / .peek() / .set() / [STATE_FLAG]
//   读取 .value 自动触发 track，让其他 effect 订阅本 computed 的变化
// - lazy 求值：第一次读取才计算；之后通过 dirty 标记控制重新计算
// - 脏标记传播：依赖变化时不立即重算，而是 markDirty + trigger 自身依赖图
//   这样下游 effect / computed 才能收到"我变了"的信号
// - 默认只读：computed.value = x 抛错；useComputed({ get, set }) 形式可写
// - 自动解包：同 BasicState，支持 Symbol.toPrimitive / valueOf / toString
//
// 与 Vue computed 的差异：
// - 同一个 .value 接口形态，但内部实现重写
// - 内置自动解包能力，模板里直接 {{ doubled }} 不用 .value

import { ReactiveEffect, isTracking } from "./effect";
import { track, trigger } from "./dep";
import { READONLY_FLAG, REF_FLAG, STATE_FLAG, type Ref } from "./state";

export interface ComputedGetterSetter<T> {
  get: () => T;
  set: (value: T) => void;
}

/** 用户可传：纯 getter 函数，或 { get, set } 形式 */
export type ComputedSource<T> = (() => T) | ComputedGetterSetter<T>;

/** 只读 Ref：用于纯 getter computed，类型层阻止写入。 */
export interface ReadonlyRef<T> {
  /** 响应式读取（会被 effect 追踪） */
  readonly value: T;
  /** 不触发追踪的读取，按 dirty 标记决定是否重算 */
  peek(): T;
  /** State 标识 */
  readonly [STATE_FLAG]: true;
  /** Ref 标识（computed 本质是 lazy ref） */
  readonly [REF_FLAG]: true;
}

/** 只读 computed 形态。 */
export interface ReadonlyComputed<T> extends ReadonlyRef<T> {
  /** 标记当前是否需要重新计算（外部只读，调试用） */
  readonly dirty: boolean;
  /** Readonly 标识 */
  readonly [READONLY_FLAG]: true;
}

/** 可写 computed 形态。 */
export interface Computed<T> extends Ref<T> {
  /** 标记当前是否需要重新计算（外部只读，调试用） */
  readonly dirty: boolean;
  /** Readonly 标识 */
  readonly [READONLY_FLAG]: false;
}

interface ComputedImpl<T> extends Ref<T> {
  readonly dirty: boolean;
  readonly [READONLY_FLAG]: boolean;
}

/**
 * 创建一个派生 state。
 *
 * @example
 *   const count = useState(0);
 *   const doubled = useComputed(() => count.value * 2);
 *   doubled.value; // 0
 *   count.value = 5;
 *   doubled.value; // 10（只在读取时才计算）
 *
 *   // 可写 computed
 *   const fullName = useComputed({
 *     get: () => `${first} ${last}`,
 *     set: (v) => { [first.value, last.value] = v.split(" "); }
 *   });
 */
export function useComputed<T>(source: () => T): ReadonlyComputed<T>;
export function useComputed<T>(source: ComputedGetterSetter<T>): Computed<T>;
export function useComputed<T>(source: ComputedSource<T>): ReadonlyComputed<T> | Computed<T> {
  const isWritable = typeof source !== "function";
  const getter = isWritable ? source.get : source;
  const setter = isWritable ? source.set : null;

  // 用一个稳定 token 作为依赖图的 key
  const token: object = {};
  let dirty = true;
  let cached: T;

  // computed 内部的 effect — 不立即执行，只在读 .value 时按需 run
  // 当依赖变化时，scheduler 触发：标记 dirty + 通知本 computed 的下游
  const reactiveEffect = new ReactiveEffect<T>(getter, () => {
    if (!dirty) {
      dirty = true;
      // 通知"读过本 computed 的 effect" — 它们会重跑、再来读、看到 dirty 触发重算
      trigger(token, "value");
    }
  });

  const computeValue = (): T => {
    if (dirty) {
      cached = reactiveEffect.run();
      dirty = false;
    }
    return cached;
  };

  const computed: ComputedImpl<T> = {
    [STATE_FLAG]: true,
    [REF_FLAG]: true,
    [READONLY_FLAG]: !isWritable,

    get value(): T {
      // 读取 computed 也要 track，让上层 effect 订阅本 computed
      if (isTracking()) {
        track(token, "value");
      }
      return computeValue();
    },

    set value(next: T) {
      if (!setter) {
        // 默认只读：写入时给出明确错误
        if (__DEV__)
          console.warn("[useComputed] 默认只读。要可写请用 useComputed({ get, set }) 形式。");
        return;
      }
      setter(next);
    },

    peek(): T {
      // peek 不 track，但还是要保证 dirty 时重算
      return computeValue();
    },

    set(next: T): Computed<T> {
      this.value = next;
      return computed as unknown as Computed<T>;
    },

    get dirty(): boolean {
      return dirty;
    }
  };

  // 自动解包三路径
  Object.defineProperty(computed, Symbol.toPrimitive, {
    value(hint: "number" | "string" | "default") {
      if (isTracking()) {
        track(token, "value");
      }
      const v = computeValue();
      if (hint === "number") return Number(v);
      if (hint === "string") return String(v);
      return v;
    },
    enumerable: false,
    configurable: false
  });

  Object.defineProperty(computed, "valueOf", {
    value() {
      if (isTracking()) {
        track(token, "value");
      }
      return computeValue();
    },
    enumerable: false,
    configurable: false
  });

  Object.defineProperty(computed, "toString", {
    value() {
      if (isTracking()) {
        track(token, "value");
      }
      return String(computeValue());
    },
    enumerable: false,
    configurable: false
  });

  return isWritable
    ? (computed as unknown as Computed<T>)
    : (computed as unknown as ReadonlyComputed<T>);
}

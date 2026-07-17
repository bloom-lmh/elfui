// effect 系统 — 提供细粒度 effect 注册、依赖追踪、调度
//
// 设计目标：
// - 与 ElfUI 的 useState/useEffect/useComputed/watch 共享同一套 active effect 栈
// - 比 Vue 3 的 effect 更轻：暂不引入 EffectScope dirty 链等优化
// - 支持嵌套 effect、scheduler、stop、cleanup callback
// - 自动加入当前 effectScope（A5）
//
// 单元概念：
// - ReactiveEffect：一次"被订阅且会重跑"的运行单元
// - Dep：Set<ReactiveEffect>，绑定在 (target, key) 维度
// - track：把当前 active effect 加入指定 Dep
// - trigger：通知 Dep 中的所有 effect 重跑（或调度）

import { DEV as __DEV__ } from "./dev";
import {
  createReactivityEffectId,
  emitReactivityEffect,
  emitReactivityTrigger,
  getReactivityComponentContext,
  reactivityNow,
  withReactivityTrigger
} from "./devtools";
import type { ReactivityEffectDebugInfo } from "./devtools";
import { recordEffectScope } from "./scope";

export type Dep = Set<ReactiveEffect>;
export type EffectScheduler = () => void;

export interface ReactiveEffectOptions {
  /** 创建后不立即执行；用于 useComputed 等 lazy 场景 */
  lazy?: boolean;
  /** 自定义调度（默认为同步重跑），用于批量、watch flush 等 */
  scheduler?: EffectScheduler;
  /** stop() 之后调用一次 */
  onStop?: () => void;
  /** DevTools 调试元数据；仅开发构建读取。 */
  debug?: ReactivityEffectDebugInfo;
}

export interface ReactiveEffectRunner<T = unknown> {
  (): T;
  effect: ReactiveEffect<T>;
}

let activeEffect: ReactiveEffect | undefined;
let shouldTrack = true;
const trackStack: boolean[] = [];

export class ReactiveEffect<T = unknown> {
  public active = true;
  /** computed effect 必须在普通订阅者前失效，避免 batch flush 读到旧缓存。 */
  public computed = false;
  public deps: Dep[] = [];
  public onStop?: (() => void) | undefined;
  public readonly devtoolsId = __DEV__ ? createReactivityEffectId() : "";
  public readonly devtoolsComponentId = __DEV__ ? getReactivityComponentContext() : null;
  public readonly devtoolsDebug: ReactivityEffectDebugInfo | undefined;
  public devtoolsTriggerId: string | null = null;
  private parent: ReactiveEffect | undefined;

  public constructor(
    private readonly fn: () => T,
    public scheduler?: EffectScheduler | undefined,
    debug?: ReactivityEffectDebugInfo
  ) {
    this.devtoolsDebug = __DEV__ ? debug : undefined;
    recordEffectScope(this);
  }

  public run(): T {
    if (!this.active) {
      return this.fn();
    }

    const triggerId = this.devtoolsTriggerId;
    this.devtoolsTriggerId = null;
    const startedAt = __DEV__ && triggerId ? reactivityNow() : 0;
    try {
      this.parent = activeEffect;
      activeEffect = this;
      cleanupEffect(this);
      return this.fn();
    } finally {
      activeEffect = this.parent;
      this.parent = undefined;
      if (__DEV__ && triggerId) {
        emitReactivityEffect(
          triggerId,
          this.devtoolsId,
          this.devtoolsComponentId,
          this.devtoolsDebug,
          Math.max(0, reactivityNow() - startedAt)
        );
      }
    }
  }

  public stop(): void {
    if (!this.active) {
      return;
    }

    cleanupEffect(this);
    this.onStop?.();
    this.active = false;
  }
}

/** 是否处于 effect 执行栈内（可被 track 收集） */
export const isTracking = (): boolean => shouldTrack && activeEffect !== undefined;

/** 获取当前 active effect（供 effectScope/onScopeDispose 等使用） */
export const getActiveEffect = (): ReactiveEffect | undefined => activeEffect;

/** 暂停依赖收集。必须与 resetTracking() 成对使用。 */
export const pauseTracking = (): void => {
  trackStack.push(shouldTrack);
  shouldTrack = false;
};

/** 恢复最近一次 pauseTracking() 前的依赖收集状态。 */
export const resetTracking = (): void => {
  const last = trackStack.pop();
  shouldTrack = last ?? true;
};

/** 在不建立响应式依赖的上下文中执行函数。主要供框架内部设施使用。 */
export const untrack = <T>(fn: () => T): T => {
  pauseTracking();
  try {
    return fn();
  } finally {
    resetTracking();
  }
};

/**
 * 注册一个 effect。默认同步执行一次以收集依赖。
 *
 * @example
 *   const stop = effect(() => { document.title = title.value; });
 *   stop(); // 卸载
 */
export const effect = <T = unknown>(
  fn: () => T,
  options: ReactiveEffectOptions = {}
): ReactiveEffectRunner<T> => {
  const reactiveEffect = new ReactiveEffect<T>(fn, options.scheduler, options.debug);

  if (options.onStop) {
    reactiveEffect.onStop = options.onStop;
  }

  const runner = reactiveEffect.run.bind(reactiveEffect) as ReactiveEffectRunner<T>;
  runner.effect = reactiveEffect;

  if (!options.lazy) {
    runner();
  }

  return runner;
};

/** 停止一个 runner（等价于 runner.effect.stop()） */
export const stop = (runner: ReactiveEffectRunner): void => {
  runner.effect.stop();
};

/** 把当前 active effect 加入 Dep */
export const trackEffects = (dep: Dep): void => {
  if (!activeEffect || dep.has(activeEffect)) {
    return;
  }

  dep.add(activeEffect);
  activeEffect.deps.push(dep);
};

/** 通知 Dep 内所有 effect 重跑（或调度） */
export const triggerEffects = (dep: Dep, debug?: { target: object; key: unknown }): void => {
  // 复制一份避免 effect 重跑时改动原 set 导致迭代异常
  const effects = Array.from(dep).filter((reactiveEffect) => reactiveEffect !== activeEffect);
  const triggerId =
    __DEV__ && debug ? emitReactivityTrigger(debug.target, debug.key, effects) : null;

  for (const reactiveEffect of effects) {
    if (triggerId) reactiveEffect.devtoolsTriggerId = triggerId;
    if (batchDepth > 0 || isFlushingBatch) {
      (reactiveEffect.computed ? batchedComputedEffects : batchedEffects).add(reactiveEffect);
    } else {
      runTriggeredEffect(reactiveEffect, triggerId);
    }
  }
};

let batchDepth = 0;
let isFlushingBatch = false;
const batchedComputedEffects = new Set<ReactiveEffect>();
const batchedEffects = new Set<ReactiveEffect>();

const runTriggeredEffect = (reactiveEffect: ReactiveEffect, triggerId: string | null): void => {
  const run = (): void => {
    if (reactiveEffect.scheduler) reactiveEffect.scheduler();
    else reactiveEffect.run();
  };
  if (triggerId) withReactivityTrigger(triggerId, run);
  else run();
};

const flushEffectSet = (effects: Set<ReactiveEffect>): void => {
  if (effects.size === 0) return;
  const pending = Array.from(effects);
  effects.clear();
  for (const reactiveEffect of pending) {
    if (!reactiveEffect.active) continue;
    runTriggeredEffect(reactiveEffect, reactiveEffect.devtoolsTriggerId);
  }
};

/** 立即排空 batch effect；主要供 batch 结束和 flushSync 逃生口调用。 */
export const flushBatchedEffects = (): void => {
  if (isFlushingBatch) return;
  isFlushingBatch = true;
  try {
    while (batchedComputedEffects.size > 0 || batchedEffects.size > 0) {
      // computed scheduler 会继续把下游订阅者加入普通 effect 队列。
      flushEffectSet(batchedComputedEffects);
      flushEffectSet(batchedEffects);
    }
  } finally {
    isFlushingBatch = false;
  }
};

/**
 * 把同步 state 写入合并为一次 effect 通知。支持嵌套，并在回调抛错时可靠恢复状态。
 */
export const batch = <T>(fn: () => T): T => {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) flushBatchedEffects();
  }
};

const cleanupEffect = (reactiveEffect: ReactiveEffect): void => {
  const { deps } = reactiveEffect;

  if (deps.length === 0) {
    return;
  }

  for (const dep of deps) {
    dep.delete(reactiveEffect);
  }

  deps.length = 0;
};

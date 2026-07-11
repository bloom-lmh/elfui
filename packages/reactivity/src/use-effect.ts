// useEffect — ElfUI 的副作用入口
//
// 设计差异（相对 React useEffect 与 Vue watchEffect）：
// - 自动依赖追踪：访问 state 即收集，无需依赖数组（解决 React 闭包陷阱与依赖数组心智）
// - cleanup 返回值：useEffect(() => { ...; return () => clean })
//   每次重跑前自动调用上一次的 cleanup，组件卸载也调用最后一次的 cleanup
// - 调度策略：默认 microtask 批量；可通过 flush: "sync" 立即触发
// - 嵌套 effect：内层 effect 跟随外层 effect 重跑（外层 stop 时内层一并停止）
// - stop()：返回 stop 句柄，调用即卸载
//
// 与 effect()（底层）的区别：useEffect 是面向用户的高层 API，
// 处理 cleanup、scheduler 等用户关心的东西；effect() 是底层原语。

import type { ReactiveEffect } from "./effect";
import { effect as createEffect, stop as stopEffect } from "./effect";
import { queueJob, type SchedulerJob } from "./scheduler";

export type EffectCleanup = () => void;
export type EffectFn = () => void | EffectCleanup;

export interface UseEffectOptions {
  /** sync: 写入即同步重跑（默认行为，与 watchEffect("sync") 等价）；
   *  pre / post: 进入 microtask 队列批量合并 */
  flush?: "sync" | "pre" | "post";
  /** stop 时调用一次 */
  onStop?: () => void;
}

export interface EffectStopHandle {
  (): void;
  /** 暴露底层 effect，便于高级 API（watch/computed）介入 */
  effect: ReactiveEffect;
}

/**
 * 注册一个会自动追踪依赖的副作用。
 *
 * @example
 *   const stop = useEffect(() => {
 *     document.title = `count=${count}`;
 *     return () => { console.log("cleanup"); };
 *   });
 *   stop(); // 卸载并触发最后一次 cleanup
 */
export const useEffect = (fn: EffectFn, options: UseEffectOptions = {}): EffectStopHandle => {
  let cleanup: EffectCleanup | undefined;

  const runWithCleanup = (): void => {
    if (cleanup) {
      try {
        cleanup();
      } catch (err) {
        // cleanup 抛错不应该阻塞下一次 effect
        if (__DEV__) console.error("[useEffect] cleanup error:", err);
        else console.error(err);
      } finally {
        cleanup = undefined;
      }
    }
    const result = fn();
    if (typeof result === "function") {
      cleanup = result;
    }
  };

  // 调度策略：默认 sync（写入立即重跑）；pre/post 进入 microtask 批量
  const flush = options.flush ?? "sync";
  const scheduler: SchedulerJob | undefined =
    flush === "sync"
      ? undefined
      : ((() => {
          runner.effect.run();
        }) as SchedulerJob);

  const effectOptions: { scheduler?: () => void; onStop?: () => void } = {};
  if (scheduler) {
    effectOptions.scheduler = () => queueJob(scheduler);
  }
  if (options.onStop) {
    effectOptions.onStop = options.onStop;
  }
  const runner = createEffect(runWithCleanup, effectOptions);

  const stop: EffectStopHandle = (() => {
    if (cleanup) {
      try {
        cleanup();
      } catch (err) {
        if (__DEV__) console.error("[useEffect] cleanup error:", err);
        else console.error(err);
      } finally {
        cleanup = undefined;
      }
    }
    stopEffect(runner);
  }) as EffectStopHandle;

  stop.effect = runner.effect;

  return stop;
};

// 调度器 — 批量合并 effect 触发到 microtask
//
// 设计：
// - 两条独立队列：pre / post（与 Vue / 组件渲染时序对齐）
//   * pre：在组件 patch 之前 flush（默认 effect / watchEffect）
//   * post：在组件 patch 之后 flush（DOM 更新完毕、可读 layout 等）
// - 同一 microtask 内：先 flush pre 再 flush post
// - 每条队列内 Set 去重；flush 期间新 push 进的 job 在本轮一并处理
// - flushSync(fn) 在需要立即看到结果时绕过批量
// - nextTick(fn?) 等本轮调度结束的 Promise

import { DEV as __DEV__ } from "./dev";
import { flushBatchedEffects } from "./effect";

export type SchedulerJob = (() => void) & {
  /** 用于去重 / 排序的标识；当前未做排序，预留 */
  id?: number;
};

const preQueue: SchedulerJob[] = [];
const postQueue: SchedulerJob[] = [];
const preSet: Set<SchedulerJob> = new Set();
const postSet: Set<SchedulerJob> = new Set();

let isFlushing = false;
let flushPromise: Promise<void> | null = null;
let isFlushingSync = false;

const resolvedPromise = Promise.resolve();

/** pre 队列：默认入口（effect / watchEffect / watch flush:"pre"） */
export const queueJob = (job: SchedulerJob): void => {
  if (preSet.has(job)) return;
  preSet.add(job);
  preQueue.push(job);
  scheduleFlush();
};

/** post 队列：watch flush:"post"、组件 patch 后回调 */
export const queuePostFlushJob = (job: SchedulerJob): void => {
  if (postSet.has(job)) return;
  postSet.add(job);
  postQueue.push(job);
  scheduleFlush();
};

const scheduleFlush = (): void => {
  if (isFlushing || flushPromise) return;
  flushPromise = resolvedPromise.then(flushJobs);
};

const flushJobs = (): void => {
  isFlushing = true;
  try {
    // 先 flush pre 队列；期间新加入 pre 的也在本轮处理
    flushQueue(preQueue, preSet);
    // 再 flush post 队列；期间新加入 post 的也在本轮处理
    flushQueue(postQueue, postSet);
    // 如果 post flush 期间又往 pre 加了 job，在本轮把它们也处理掉
    while (preQueue.length > 0) {
      flushQueue(preQueue, preSet);
      flushQueue(postQueue, postSet);
    }
  } finally {
    isFlushing = false;
    flushPromise = null;
  }
};

const flushQueue = (q: SchedulerJob[], s: Set<SchedulerJob>): void => {
  // 用 index 而不是 shift，确保 flush 期间新入队的 job 也能在本轮跑掉
  for (let i = 0; i < q.length; i++) {
    const job = q[i];
    if (job) {
      try {
        job();
      } catch (err) {
        if (__DEV__) console.error("[scheduler] job error:", err);
        else console.error(err);
      }
    }
  }
  q.length = 0;
  s.clear();
};

/**
 * 在 fn 执行期间禁用批量调度，所有 state 写入立即 flush。
 * 注意：fn 内部已经入队的 job 会在 fn 返回后立即 flush（不等下一 microtask）。
 */
export const flushSync = <T>(fn: () => T): T => {
  const wasSync = isFlushingSync;
  isFlushingSync = true;
  try {
    const result = fn();
    flushBatchedEffects();
    if (!isFlushing) {
      flushJobs();
    }
    return result;
  } finally {
    isFlushingSync = wasSync;
  }
};

/** 是否处于 flushSync 模式 */
export const isSyncMode = (): boolean => isFlushingSync;

/**
 * 等下一次 flush 完成的 Promise，类似 Vue 的 nextTick。
 * 也可传入 fn，flush 后调用并返回 Promise<T>。
 */
export const nextTick = <T = void>(fn?: () => T): Promise<T> => {
  const p = flushPromise ?? resolvedPromise;
  return fn ? p.then(fn) : (p as Promise<T>);
};

/** 仅供测试使用：清空所有调度状态 */
export const __resetScheduler = (): void => {
  preQueue.length = 0;
  postQueue.length = 0;
  preSet.clear();
  postSet.clear();
  isFlushing = false;
  flushPromise = null;
  isFlushingSync = false;
};

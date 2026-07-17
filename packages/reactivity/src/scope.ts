// effectScope — 副作用作用域
//
// 用途：把多个 effect / watch / computed 收纳到一个 scope，scope.stop()
//      一次性销毁所有内部副作用。组件卸载时一次清扫，避免逐个 stop。
//
// 设计：
// - effectScope() 返回 EffectScope 对象
// - scope.run(fn) 在内部执行 fn；fn 中创建的所有 effect 自动加入 scope
// - scope.stop() 卸载所有 effect 并触发 onScopeDispose 回调
// - getCurrentScope() 返回当前 active scope
// - onScopeDispose(fn) 在当前 scope 上注册一个 stop 时调用的回调
// - detached：若为 true，scope 不会被父 scope 收编（独立生命周期）

import { DEV as __DEV__ } from "./dev";
import type { ReactiveEffect } from "./effect";

export type EffectScopeCleanup = () => void;

let activeScope: EffectScope | undefined;

export class EffectScope {
  /** 是否仍处于 active（未 stop） */
  public active = true;
  /** 内部 effect 列表 */
  public effects: ReactiveEffect[] = [];
  /** 内部 cleanup 列表（onScopeDispose 注册） */
  public cleanups: EffectScopeCleanup[] = [];
  /** 内部子 scope（嵌套支持） */
  public scopes: EffectScope[] = [];
  /** 父 scope（用于自动收编） */
  public parent: EffectScope | undefined;
  /** 在父 scope.scopes 中的索引（删除用） */
  private index: number | undefined;

  public constructor(detached: boolean = false) {
    this.parent = activeScope;
    if (!detached && activeScope && activeScope.active) {
      this.index = activeScope.scopes.push(this) - 1;
    }
  }

  /** 在本 scope 内执行 fn；fn 中创建的 effect / 子 scope 自动加入 */
  public run<T>(fn: () => T): T | undefined {
    if (!this.active) {
      if (__DEV__) console.warn("[effectScope] 已停止的 scope 无法 run");
      return undefined;
    }
    const previous = activeScope;
    activeScope = this;
    try {
      return fn();
    } finally {
      activeScope = previous;
    }
  }

  /** 停止本 scope：销毁所有内部 effect / 调用所有 cleanup / 递归停子 scope */
  public stop(fromParent: boolean = false): void {
    if (!this.active) return;

    // 1. 停所有 effect
    for (const e of this.effects) {
      e.stop();
    }
    this.effects.length = 0;

    // 2. 调用 cleanups
    for (const c of this.cleanups) {
      try {
        c();
      } catch (err) {
        if (__DEV__) console.error("[effectScope] cleanup error:", err);
        else console.error(err);
      }
    }
    this.cleanups.length = 0;

    // 3. 递归停子 scope
    for (const s of this.scopes) {
      s.stop(true);
    }
    this.scopes.length = 0;

    // 4. 如果不是父级带停，从父 scope 列表中移除自己
    if (!fromParent && this.parent && this.index !== undefined) {
      const last = this.parent.scopes.pop();
      if (last && last !== this) {
        this.parent.scopes[this.index] = last;
        last.setIndex(this.index);
      }
    }
    this.parent = undefined;
    this.active = false;
  }

  /** 内部：用于嵌套 scope 移除时调整 index */
  public setIndex(index: number): void {
    this.index = index;
  }
}

/** 创建一个新的 effectScope。
 *  detached=true 时不会被父 scope 收编（独立生命周期）。 */
export const effectScope = (detached: boolean = false): EffectScope => new EffectScope(detached);

/** 获取当前激活的 scope；不在 scope 内时返回 undefined */
export const getCurrentScope = (): EffectScope | undefined => activeScope;

/** 在当前 scope 上注册一个停止时调用的回调 */
export const onScopeDispose = (fn: EffectScopeCleanup): void => {
  if (!activeScope) {
    if (__DEV__) console.warn("[onScopeDispose] 必须在 effectScope.run() 内调用");
    return;
  }
  activeScope.cleanups.push(fn);
};

/** 把 effect 注册到当前 scope（effect.ts 内部调用） */
export const recordEffectScope = (effect: ReactiveEffect): void => {
  if (activeScope && activeScope.active) {
    activeScope.effects.push(effect);
  }
};

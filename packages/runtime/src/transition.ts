// Transition / TransitionGroup 内置组件 runtime helpers
//
// 设计：
// - <Transition name="fade"> 包一个动态子节点（v-if / v-show / 动态组件）
// - 进入：依次添加 ${name}-enter-from / ${name}-enter-active，下一帧切换为
//   ${name}-enter-to / ${name}-enter-active，等 transitionend / animationend 后清理
// - 离开：反过来；离开期间元素留在 DOM 直到动画结束，再真正卸载
// - JS hooks：onBeforeEnter / onEnter(el, done) / onAfterEnter 等
// - css: false 时跳过 class 序列，完全由 hooks 控制
// - duration 用于强制超时（保险，避免 transitionend 没触发）
//
// API 形态：
//   transition(anchor, getKey, options, render)
// 编译器将 <Transition name="fade"><div v-if="show">x</div></Transition>
// 编译为对 transition() 的调用。

import { useEffect, type effectScope } from "@elfui/reactivity";

export interface TransitionHooks {
  onBeforeEnter?: (el: Element) => void;
  onEnter?: (el: Element, done: () => void) => void;
  onAfterEnter?: (el: Element) => void;
  onBeforeLeave?: (el: Element) => void;
  onLeave?: (el: Element, done: () => void) => void;
  onAfterLeave?: (el: Element) => void;
}

export interface TransitionOptions extends TransitionHooks {
  /** class 名前缀，如 "fade" -> fade-enter-from */
  name?: string;
  /** 首次挂载也走 enter 序列 */
  appear?: boolean;
  /** 显式持续时间（ms） — 超时强制完成 */
  duration?: number | { enter: number; leave: number };
  /** 关闭 CSS class 模式，完全由 JS hooks 控制 */
  css?: boolean;
}

const cls = (name: string | undefined, kind: string): string =>
  name ? `${name}-${kind}` : `v-${kind}`;

/**
 * 创建 Transition 包装。
 *
 * @param anchor 锚点节点（应已插入 DOM）
 * @param getRender 当前应渲染的子节点；返回 null 表示需要 leave
 * @param options Transition 配置
 */
export const transition = (
  anchor: Comment,
  getRender: () => Element | null,
  options: TransitionOptions = {}
): void => {
  const useCss = options.css !== false;
  const enterDuration =
    typeof options.duration === "object" ? options.duration.enter : options.duration;
  const leaveDuration =
    typeof options.duration === "object" ? options.duration.leave : options.duration;

  let current: Element | null = null;
  let firstRun = true;
  let scope: ReturnType<typeof effectScope> | null = null;

  const removeClass = (el: Element, ...names: string[]): void => {
    for (const n of names) el.classList.remove(n);
  };
  const addClass = (el: Element, ...names: string[]): void => {
    for (const n of names) el.classList.add(n);
  };

  const onTransitionEnd = (el: Element, timeout: number | undefined, cb: () => void): void => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      el.removeEventListener("transitionend", finish);
      el.removeEventListener("animationend", finish);
      cb();
    };
    el.addEventListener("transitionend", finish);
    el.addEventListener("animationend", finish);
    if (timeout !== undefined) {
      setTimeout(finish, timeout);
    }
  };

  const performEnter = (el: Element): void => {
    options.onBeforeEnter?.(el);
    if (useCss) {
      addClass(el, cls(options.name, "enter-from"), cls(options.name, "enter-active"));
    }

    // 下一帧切到 enter-to
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (useCss) {
          removeClass(el, cls(options.name, "enter-from"));
          addClass(el, cls(options.name, "enter-to"));
        }
        const finish = (): void => {
          if (useCss) {
            removeClass(el, cls(options.name, "enter-to"), cls(options.name, "enter-active"));
          }
          options.onAfterEnter?.(el);
        };
        if (options.onEnter) {
          options.onEnter(el, finish);
        } else if (useCss) {
          onTransitionEnd(el, enterDuration, finish);
        } else {
          finish();
        }
      });
    });
  };

  const performLeave = (el: Element, after: () => void): void => {
    options.onBeforeLeave?.(el);
    if (useCss) {
      addClass(el, cls(options.name, "leave-from"), cls(options.name, "leave-active"));
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (useCss) {
          removeClass(el, cls(options.name, "leave-from"));
          addClass(el, cls(options.name, "leave-to"));
        }
        const finish = (): void => {
          if (useCss) {
            removeClass(el, cls(options.name, "leave-to"), cls(options.name, "leave-active"));
          }
          el.parentNode?.removeChild(el);
          options.onAfterLeave?.(el);
          after();
        };
        if (options.onLeave) {
          options.onLeave(el, finish);
        } else if (useCss) {
          onTransitionEnd(el, leaveDuration, finish);
        } else {
          finish();
        }
      });
    });
  };

  useEffect(() => {
    const next = getRender();
    const isFirst = firstRun;
    firstRun = false;

    // 首次：要么 appear，要么直接挂上不走动画
    if (isFirst) {
      if (next) {
        anchor.parentNode?.insertBefore(next, anchor);
        current = next;
        if (options.appear) {
          performEnter(next);
        }
      }
      return;
    }

    // 后续：进入 / 离开
    if (next && !current) {
      // enter
      anchor.parentNode?.insertBefore(next, anchor);
      current = next;
      performEnter(next);
    } else if (!next && current) {
      // leave
      const leaving = current;
      current = null;
      performLeave(leaving, () => {
        scope?.stop();
        scope = null;
      });
    } else if (next && current && next !== current) {
      // 更换：旧 leave + 新 enter
      const leaving = current;
      current = next;
      anchor.parentNode?.insertBefore(next, anchor);
      performEnter(next);
      performLeave(leaving, () => {});
    }
  });
};

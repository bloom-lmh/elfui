// TransitionGroup — 列表过渡 + FLIP 重排动画
//
// 设计：
// - 包裹一个 keyed 列表，子项变化时为新增项 enter / 删除项 leave
// - 重排时用 FLIP 算法实现位置过渡：First / Last / Invert / Play
//   * First：记录变化前所有元素的位置（getBoundingClientRect）
//   * Last：变化后再记录新位置
//   * Invert：用 transform 把元素临时拉回旧位置
//   * Play：清掉 transform，CSS transition 自然过渡到新位置
// - tag：包裹元素的标签名（默认 "div"，"span" 或自定义元素也可以）
// - moveClass：自定义重排动画 class（默认 ${name}-move）
//
// API：
//   transitionGroup(host, getItems, getKey, render, options?)

import { effectScope, useEffect } from "@elfui/reactivity";

export interface TransitionGroupOptions {
  /** class 名前缀 */
  name?: string;
  /** 包裹标签 */
  tag?: string;
  /** 自定义重排 class（默认 `${name}-move`） */
  moveClass?: string;
  /** css 模式开关 */
  css?: boolean;
}

interface ItemState<T> {
  key: string | number;
  item: T;
  el: HTMLElement;
  scope: ReturnType<typeof effectScope>;
  /** 上一帧位置 */
  pos?: { left: number; top: number };
}

const cls = (name: string | undefined, kind: string): string =>
  name ? `${name}-${kind}` : `v-${kind}`;

/**
 * 创建 TransitionGroup。host 必须是已挂载的容器（如 ul / div）。
 *
 * @param host       容器元素（render 时把 children append 进来）
 * @param getItems   返回当前 items 数组
 * @param getKey     提取 stable key
 * @param render     (item, index) => HTMLElement 创建子项
 * @param options    transition 配置
 */
export const transitionGroup = <T>(
  host: HTMLElement,
  getItems: () => readonly T[],
  getKey: (item: T, index: number) => string | number,
  render: (item: T, index: number) => HTMLElement,
  options: TransitionGroupOptions = {}
): void => {
  const useCss = options.css !== false;
  const moveClass = options.moveClass ?? cls(options.name, "move");
  let prev: ItemState<T>[] = [];
  let firstRun = true;

  const enterClasses = (el: HTMLElement): void => {
    if (!useCss) return;
    el.classList.add(cls(options.name, "enter-from"), cls(options.name, "enter-active"));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.remove(cls(options.name, "enter-from"));
        el.classList.add(cls(options.name, "enter-to"));
        const finish = (): void => {
          el.classList.remove(cls(options.name, "enter-to"), cls(options.name, "enter-active"));
          el.removeEventListener("transitionend", finish);
        };
        el.addEventListener("transitionend", finish);
      });
    });
  };

  const leaveClasses = (el: HTMLElement, after: () => void): void => {
    if (!useCss) {
      el.parentNode?.removeChild(el);
      after();
      return;
    }
    el.classList.add(cls(options.name, "leave-from"), cls(options.name, "leave-active"));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.remove(cls(options.name, "leave-from"));
        el.classList.add(cls(options.name, "leave-to"));
        const finish = (): void => {
          el.classList.remove(cls(options.name, "leave-to"), cls(options.name, "leave-active"));
          el.removeEventListener("transitionend", finish);
          el.parentNode?.removeChild(el);
          after();
        };
        el.addEventListener("transitionend", finish);
      });
    });
  };

  const flipMove = (states: ItemState<T>[]): void => {
    if (!useCss) return;
    // 1. 记录新位置
    const newPositions = states.map((s) => {
      const r = s.el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    // 2. 用旧位置反推 transform
    for (let i = 0; i < states.length; i++) {
      const s = states[i]!;
      const np = newPositions[i]!;
      const op = s.pos;
      if (!op) continue;
      const dx = op.left - np.left;
      const dy = op.top - np.top;
      if (dx !== 0 || dy !== 0) {
        s.el.style.transform = `translate(${dx}px, ${dy}px)`;
        s.el.style.transitionDuration = "0s";
      }
    }
    // 3. 强制 reflow，下一帧清掉 transform 让 CSS transition 接管
    void host.offsetHeight;
    requestAnimationFrame(() => {
      for (const s of states) {
        s.el.classList.add(moveClass);
        s.el.style.transform = "";
        s.el.style.transitionDuration = "";
        const onEnd = (e: TransitionEvent): void => {
          if (e.target !== s.el) return;
          s.el.classList.remove(moveClass);
          s.el.removeEventListener("transitionend", onEnd as EventListener);
        };
        s.el.addEventListener("transitionend", onEnd as EventListener);
      }
    });
    // 更新所有 pos
    for (let i = 0; i < states.length; i++) {
      states[i]!.pos = newPositions[i]!;
    }
  };

  useEffect(() => {
    const items = getItems();
    const oldByKey = new Map<string | number, ItemState<T>>();
    for (const s of prev) oldByKey.set(s.key, s);

    // 第一阶段：记录所有旧子项当前位置（用于 FLIP）
    if (!firstRun && useCss) {
      for (const s of prev) {
        const r = s.el.getBoundingClientRect();
        s.pos = { left: r.left, top: r.top };
      }
    }

    const next: ItemState<T>[] = [];
    const used = new Set<string | number>();
    const newOnes: ItemState<T>[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i] as T;
      const key = getKey(item, i);
      const existing = oldByKey.get(key);
      if (existing && !used.has(key)) {
        used.add(key);
        existing.item = item;
        next.push(existing);
      } else {
        const scope = effectScope(true);
        const el = scope.run(() => render(item, i)) as HTMLElement;
        const state: ItemState<T> = { key, item, el, scope };
        next.push(state);
        newOnes.push(state);
      }
    }

    // 卸载旧的（leave）
    const leaving: ItemState<T>[] = [];
    for (const old of prev) {
      if (!used.has(old.key)) {
        leaving.push(old);
      }
    }
    // 把要离开的元素先保留在 DOM 里直到动画结束
    for (const old of leaving) {
      old.scope.stop();
      // leaveClasses 自己会移除节点
      leaveClasses(old.el, () => {});
    }

    // 把保留 + 新增的按顺序插入
    // 移除当前所有保留元素重新按 next 顺序插入，确保顺序正确
    for (const s of next) {
      if (s.el.parentNode === host) {
        host.removeChild(s.el);
      }
    }
    for (const s of next) {
      host.appendChild(s.el);
    }

    // 新增项 enter
    for (const n of newOnes) {
      enterClasses(n.el);
    }

    // FLIP 重排（保留项）
    if (!firstRun) {
      const moving = next.filter((s) => !newOnes.includes(s));
      if (moving.length > 0) {
        flipMove(moving);
      }
    }

    prev = next;
    firstRun = false;
  });
};

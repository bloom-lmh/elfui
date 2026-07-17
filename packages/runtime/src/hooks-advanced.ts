// 高阶交互 hooks（解锁 Dialog / Drawer / Tooltip / Popover / Lazy 等组件）

import { useEffect } from "@elfui/reactivity";

import { useEventListener } from "./hooks";
import { onBeforeUnmount, onMount, onMounted } from "./lifecycle";

/** 获取容器内所有可聚焦元素 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

const queryFocusables = (root: Element): HTMLElement[] => {
  const queryRoot = "shadowRoot" in root && root.shadowRoot ? root.shadowRoot : root;
  return Array.from(queryRoot.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1
  );
};

/** 焦点陷阱：限制 Tab 焦点在 target 内（Dialog / Drawer 必备）
 *
 *   useFocusTrap(useHost())
 */
export const useFocusTrap = (target: HTMLElement | null | undefined): void => {
  if (!target) return;
  let prevActive: HTMLElement | null = null;

  onMount(() => {
    prevActive = document.activeElement as HTMLElement | null;
    // 自动聚焦第一个可聚焦元素
    const first = queryFocusables(target)[0];
    if (first) first.focus();
    else target.focus?.();
  });

  onBeforeUnmount(() => {
    // 还原焦点
    if (prevActive && typeof prevActive.focus === "function") {
      prevActive.focus();
    }
  });

  useEventListener<KeyboardEvent>(target, "keydown", (e) => {
    if (e.key !== "Tab") return;
    const items = queryFocusables(target);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  });
};

/** ESC 键关闭便捷
 *
 *   useEscapeKey(() => close())
 */
export const useEscapeKey = (handler: () => void): void => {
  useEventListener<KeyboardEvent>(document, "keydown", (e) => {
    if (e.key === "Escape") handler();
  });
};

/** 打开 modal 时锁滚动
 *
 *   useScrollLock(() => open.value)
 */
export const useScrollLock = (getter: () => boolean): void => {
  let prevOverflow: string | null = null;
  let locked = false;

  useEffect(() => {
    const v = getter();
    if (v && !locked) {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      locked = true;
    } else if (!v && locked) {
      document.body.style.overflow = prevOverflow ?? "";
      locked = false;
    }
  });

  onBeforeUnmount(() => {
    if (locked) {
      document.body.style.overflow = prevOverflow ?? "";
      locked = false;
    }
  });
};

/** 监听元素尺寸变化
 *
 *   useResizeObserver(host, ({ width, height }) => { ... })
 */
export interface ResizeEntry {
  width: number;
  height: number;
  target: Element;
}

/** Observer 可接受的只读元素引用，兼容 useRef 和 useTemplateRef。 */
export interface ElementRefLike<T extends Element = Element> {
  readonly value: T | null | undefined;
}

/** DOM observer 的目标：元素、元素引用或响应式 getter。 */
export type ObserverTarget<T extends Element = Element> =
  | T
  | ElementRefLike<T>
  | (() => T | null | undefined)
  | null
  | undefined;

interface ElementObserver {
  observe(target: Element): void;
  disconnect(): void;
}

const isElement = <T extends Element>(value: unknown): value is T =>
  typeof value === "object" && value !== null && (value as { nodeType?: unknown }).nodeType === 1;

const resolveObserverTarget = <T extends Element>(target: ObserverTarget<T>): T | null => {
  const value =
    typeof target === "function" ? target() : isElement<T>(target) ? target : target?.value;
  return isElement<T>(value) ? value : null;
};

const useElementObserver = <T extends Element>(
  target: ObserverTarget<T>,
  create: (target: T, isActive: () => boolean) => ElementObserver | null
): void => {
  let mounted = false;
  let active: { target: T; observer: ElementObserver } | null = null;

  const disconnect = (): void => {
    if (!active) return;
    const { observer } = active;
    active = null;
    observer.disconnect();
  };

  const syncTarget = (): void => {
    const nextTarget = resolveObserverTarget(target);
    if (!mounted || nextTarget === active?.target) return;

    disconnect();
    if (!nextTarget) return;

    let nextObserver: ElementObserver | null = null;
    nextObserver = create(
      nextTarget,
      () => active?.observer === nextObserver && active.target === nextTarget
    );
    if (!nextObserver) return;

    active = { target: nextTarget, observer: nextObserver };
    nextObserver.observe(nextTarget);
  };

  // setup 阶段先建立响应式依赖；mounted 时 DOM/ref 已稳定，再开始观察。
  useEffect(syncTarget);
  onMounted(() => {
    mounted = true;
    syncTarget();
  });
  onBeforeUnmount(() => {
    mounted = false;
    disconnect();
  });
};

export const useResizeObserver = (
  target: ObserverTarget,
  callback: (entry: ResizeEntry) => void
): void => {
  useElementObserver(target, (observedTarget, isActive) => {
    if (typeof globalThis.ResizeObserver === "undefined") return null;
    return new globalThis.ResizeObserver((entries) => {
      if (!isActive()) return;
      for (const entry of entries) {
        if (entry.target !== observedTarget) continue;
        const rect = entry.contentRect;
        callback({ width: rect.width, height: rect.height, target: entry.target });
      }
    });
  });
};

/** 监听元素是否进入视口
 *
 *   useIntersectionObserver(img, (entry) => { if (entry.isIntersecting) load() })
 */
export const useIntersectionObserver = (
  target: ObserverTarget,
  callback: (entry: IntersectionObserverEntry) => void,
  options?: IntersectionObserverInit
): void => {
  useElementObserver(target, (observedTarget, isActive) => {
    if (typeof globalThis.IntersectionObserver === "undefined") return null;
    return new globalThis.IntersectionObserver((entries) => {
      if (!isActive()) return;
      for (const entry of entries) {
        if (entry.target === observedTarget) callback(entry);
      }
    }, options);
  });
};

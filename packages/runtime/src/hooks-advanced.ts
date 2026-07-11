// 高阶交互 hooks（解锁 Dialog / Drawer / Tooltip / Popover / Lazy 等组件）

import { useEffect } from "@elfui/reactivity";

import { useEventListener } from "./hooks";
import { onBeforeUnmount, onMount } from "./lifecycle";

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

export const useResizeObserver = (
  target: Element | null | undefined,
  callback: (entry: ResizeEntry) => void
): void => {
  if (!target) return;
  if (typeof ResizeObserver === "undefined") return;

  let observer: ResizeObserver | null = null;

  onMount(() => {
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.contentRect;
        callback({ width: rect.width, height: rect.height, target: entry.target });
      }
    });
    observer.observe(target);
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });
};

/** 监听元素是否进入视口
 *
 *   useIntersectionObserver(img, (entry) => { if (entry.isIntersecting) load() })
 */
export const useIntersectionObserver = (
  target: Element | null | undefined,
  callback: (entry: IntersectionObserverEntry) => void,
  options?: IntersectionObserverInit
): void => {
  if (!target) return;
  if (typeof IntersectionObserver === "undefined") return;

  let observer: IntersectionObserver | null = null;

  onMount(() => {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) callback(entry);
    }, options);
    observer.observe(target);
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });
};

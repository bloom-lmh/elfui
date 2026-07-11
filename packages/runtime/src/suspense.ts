// Suspense 内置组件 runtime helper
//
// 设计：suspense(anchor, source, slots) 三态切换
// - source 是 Promise 或 thenable
// - slots：default / fallback / error 三个 render 函数
// - 状态切换：pending（fallback）/ resolved（default）/ error（error fallback）
//
// 编译期：<Suspense :source="promise"><div>resolved</div></Suspense>
// 转为：suspense(anchor, () => promise, { default, fallback, error })

import { effectScope, useEffect } from "@elfui/reactivity";

export interface SuspenseSlots {
  default: () => Node | null;
  fallback?: () => Node | null;
  error?: (err: unknown) => Node | null;
}

export type SuspenseStatus = "pending" | "resolved" | "error";

/**
 * 创建一个 Suspense 边界。
 *
 * @param anchor 已挂载的 Comment 锚点
 * @param getSource 返回 Promise；返回 null 表示不进入异步状态
 * @param slots default / fallback / error 渲染函数
 */
export const suspense = (
  anchor: Comment,
  getSource: () => PromiseLike<unknown> | null | undefined,
  slots: SuspenseSlots
): void => {
  let mounted: Node[] = [];
  let scope: ReturnType<typeof effectScope> | null = null;
  let lastSource: unknown = undefined;
  let lastStatus: SuspenseStatus | undefined = undefined;

  const cleanup = (): void => {
    for (const n of mounted) {
      n.parentNode?.removeChild(n);
    }
    mounted = [];
    scope?.stop();
    scope = null;
  };

  const renderInto = (node: Node | null): void => {
    cleanup();
    if (!node) return;
    if (node instanceof DocumentFragment) {
      mounted = Array.from(node.childNodes);
    } else {
      mounted = [node];
    }
    anchor.parentNode?.insertBefore(node, anchor);
  };

  const setStatus = (status: SuspenseStatus, err?: unknown): void => {
    if (status === lastStatus && status !== "error") return;
    lastStatus = status;
    const newScope = effectScope(true);
    scope = newScope;
    let node: Node | null = null;
    newScope.run(() => {
      if (status === "resolved") {
        node = slots.default();
      } else if (status === "pending") {
        node = slots.fallback ? slots.fallback() : null;
      } else {
        node = slots.error ? slots.error(err) : null;
      }
    });
    renderInto(node);
  };

  useEffect(() => {
    const source = getSource();
    if (source === lastSource) return;
    lastSource = source;
    if (!source) {
      setStatus("resolved");
      return;
    }
    setStatus("pending");
    Promise.resolve(source).then(
      () => {
        if (lastSource === source) setStatus("resolved");
      },
      (err) => {
        if (lastSource === source) setStatus("error", err);
      }
    );
  });
};

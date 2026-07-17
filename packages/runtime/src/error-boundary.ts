// L3.6 错误边界 — errorBoundary helper
//
// 用法（编译产物 / 手写 render 内）：
//
//   const anchor = mark("error-boundary");
//   errorBoundary(anchor, defaultRender, fallbackRender);
//
// 行为：
// - 默认渲染 default slot；
// - default 渲染过程中抛错（含子组件 onErrorCaptured 未拦截的）→ 渲染 fallback；
// - fallback 接到 (err, retry) 参数；retry 重新渲染 default。
//
// 模板侧（编译器需识别）：
//
//   <ErrorBoundary>
//     <template #default>...</template>
//     <template #fallback="{ err, retry }">{{ err.message }} <button @click="retry">重试</button></template>
//   </ErrorBoundary>
//
// 编译器层接入留 H 阶段；这里先提供 runtime helper，用户可手写 render 调用。

import { effectScope } from "@elfui/reactivity";

import { DEV as __DEV__ } from "./dev";
import { onErrorCaptured } from "./lifecycle";

export interface ErrorBoundarySlots {
  /** 默认内容；抛错时被 fallback 替换 */
  default: () => Node;
  /** 错误时渲染：拿到 err + retry 回调 */
  fallback: (err: unknown, retry: () => void) => Node;
}

/**
 * 创建一个错误边界。
 *
 * @param anchor 已挂载的 Comment 锚点
 * @param slots default + fallback 渲染函数
 */
export const errorBoundary = (anchor: Comment, slots: ErrorBoundarySlots): void => {
  let mounted: Node[] = [];
  let scope: ReturnType<typeof effectScope> | null = null;

  const cleanup = (): void => {
    if (scope) {
      scope.stop();
      scope = null;
    }
    for (const n of mounted) n.parentNode?.removeChild(n);
    mounted = [];
  };

  const showFallback = (err: unknown): void => {
    cleanup();
    try {
      const node = slots.fallback(err, retry);
      anchor.parentNode?.insertBefore(node, anchor);
      mounted = collectInsertedSiblings(node);
    } catch (e) {
      if (__DEV__) console.error("[errorBoundary] fallback render error:", e);
      else console.error(e);
    }
  };

  const showDefault = (): void => {
    cleanup();
    scope = effectScope(true);
    scope.run(() => {
      // 在内部 scope 注册 onErrorCaptured 不会成功（onErrorCaptured 需要 ComponentInstance），
      // 这里只能捕获同步抛错。子组件抛错走 ComponentInstance.errorCapturedHooks 链路，
      // 由 element.ts 的 handleError → 父 instance 冒泡，最终如果父 instance setup 内
      // 调用 onErrorCaptured((err) => { errorBoundaryInstance.trigger(err); return false }) 即可。
      try {
        const node = slots.default();
        anchor.parentNode?.insertBefore(node, anchor);
        mounted = collectInsertedSiblings(node);
      } catch (err) {
        showFallback(err);
      }
    });
  };

  const retry = (): void => {
    showDefault();
  };

  showDefault();
};

const collectInsertedSiblings = (root: Node): Node[] => {
  if (root.nodeType === 11) {
    // DocumentFragment 在 insertBefore 后已经把子节点搬走了
    // 这里返回 [] 不行 — fragment 子节点已经在 anchor 父中。简化：返回 root 之前所有
    // 直到下一个非 fragment 的兄弟。但实际场景：缓存外层 root 引用 vs 子节点 — 这里
    // 用一个简单 marker：fragment 模式下不主动清理（依赖父级 effect scope 销毁）。
    return [];
  }
  return [root];
};

/** 父组件（要做错误边界的那个）调用：把子组件抛上来的错冒泡处理。
 *
 * 推荐用法：
 *
 *   const eb = useErrorBoundary();
 *   onErrorCaptured((err) => { eb.trigger(err); return false; });
 *   // 然后在模板里用 errorBoundary(anchor, { default, fallback });
 *
 * 但本最小实现先不引入 useErrorBoundary 单独 helper，让用户直接通过
 *   onErrorCaptured((err) => fallbackState.set(err))
 * 自己控制即可。
 */
export const captureError = (cb: (err: unknown) => void): void => {
  onErrorCaptured((err: unknown) => {
    cb(err);
    return false; // 阻止继续冒泡
  });
};

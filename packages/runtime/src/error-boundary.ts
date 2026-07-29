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

import { effectScope, getCurrentScope, onScopeDispose } from "@elfui/reactivity";

import { DEV as __DEV__ } from "./dev";
import { onErrorCaptured } from "./lifecycle";
import { captureNodeRange, insertNodeRange, removeNodeRange } from "./node-range";

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
    removeNodeRange(mounted);
    mounted = [];
  };

  const showFallback = (err: unknown): void => {
    cleanup();
    try {
      const node = slots.fallback(err, retry);
      mounted = captureNodeRange(node);
      if (anchor.parentNode) insertNodeRange(anchor.parentNode, mounted, anchor);
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
        mounted = captureNodeRange(node);
        if (anchor.parentNode) insertNodeRange(anchor.parentNode, mounted, anchor);
      } catch (err) {
        showFallback(err);
      }
    });
  };

  const retry = (): void => {
    showDefault();
  };

  if (getCurrentScope()) onScopeDispose(cleanup);
  showDefault();
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

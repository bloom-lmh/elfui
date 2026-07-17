// 生命周期钩子
//
// 设计：每个组件实例运行 setup 时，建立一个"当前实例"上下文。
// 钩子注册时把回调挂到该实例的对应数组上。
// 实例 mount/unmount/update 时顺序调用对应数组。

import {
  createDevtoolsComponentId,
  emitDevtoolsRuntimeEvent,
  hasDevtoolsRuntimeHook,
  setDevtoolsComponentContext,
  type ElfUIDevtoolsDebugState
} from "./devtools";
import { DEV as __DEV__ } from "./dev";

export type LifecycleHook = () => void;
export type AttributeChangedHook = (
  name: string,
  oldValue: string | null,
  newValue: string | null
) => void;
export type ErrorCapturedHook = (
  err: unknown,
  instance: ComponentInstance | null
) => boolean | void;

/** 组件实例 — 由 defineCustomElement 内部维护 */
export interface ComponentInstance {
  host: HTMLElement;
  shadow: ShadowRoot | null;
  parent: ComponentInstance | null;
  /** formControl=true 时由 element 注入，供组合式 helper 读取 */
  form?: unknown;
  isMounted: boolean;
  isUnmounted: boolean;
  /** 由组件 host 注入，统一转发 setup/render/lifecycle 错误。 */
  handleError?: (error: unknown, info: string) => void;
  beforeMountHooks: LifecycleHook[];
  mountedHooks: LifecycleHook[];
  beforeUnmountHooks: LifecycleHook[];
  unmountedHooks: LifecycleHook[];
  beforeUpdateHooks: LifecycleHook[];
  updatedHooks: LifecycleHook[];
  attrChangedHooks: AttributeChangedHook[];
  errorCapturedHooks: ErrorCapturedHook[];
  /** KeepAlive 激活/未激活：仅在 KeepAlive 包裹时有意义 */
  activatedHooks: LifecycleHook[];
  deactivatedHooks: LifecycleHook[];
  /** 仅开发态 DevTools 读取；生产构建中的访问会被 __DEV__ 分支移除。 */
  devtools: ElfUIDevtoolsDebugState;
}

let currentInstance: ComponentInstance | null = null;
const pendingUpdatedInstances = new WeakSet<ComponentInstance>();

export const setCurrentInstance = (i: ComponentInstance | null): ComponentInstance | null => {
  const prev = currentInstance;
  currentInstance = i;
  if (__DEV__) setDevtoolsComponentContext(i?.devtools.id ?? null);
  return prev;
};

export const getCurrentInstance = (): ComponentInstance | null => currentInstance;

const inject =
  <K extends Exclude<keyof ComponentInstance, "host" | "shadow" | "isMounted" | "isUnmounted">>(
    key: K
  ) =>
  (fn: ComponentInstance[K] extends Array<infer F> ? F : never): void => {
    if (!currentInstance) {
      if (__DEV__) console.warn(`[lifecycle] 钩子必须在 setup 同步执行期间调用。`);
      return;
    }
    (currentInstance[key] as unknown as Array<unknown>).push(fn);
  };

export const onMount = inject("mountedHooks");
/** Vue 风格兼容别名；与 onMount 注册到同一生命周期队列。 */
export const onMounted = onMount;
export const onBeforeMount = inject("beforeMountHooks");
export const onBeforeUnmount = inject("beforeUnmountHooks");
export const onUnmount = inject("unmountedHooks");
/** Vue 风格兼容别名；与 onUnmount 注册到同一生命周期队列。 */
export const onUnmounted = onUnmount;
export const onBeforeUpdate = inject("beforeUpdateHooks");
export const onUpdated = inject("updatedHooks");
export const onAttributeChanged = inject("attrChangedHooks");
export const onErrorCaptured = inject("errorCapturedHooks");
/** KeepAlive 切回到该组件时触发 */
export const onActivated = inject("activatedHooks");
/** KeepAlive 切走该组件时触发 */
export const onDeactivated = inject("deactivatedHooks");

/** 创建一个空实例骨架 */
export const createInstance = (
  host: HTMLElement,
  shadow: ShadowRoot | null,
  parent: ComponentInstance | null = null
): ComponentInstance => ({
  host,
  shadow,
  parent,
  form: undefined,
  isMounted: false,
  isUnmounted: false,
  beforeMountHooks: [],
  mountedHooks: [],
  beforeUnmountHooks: [],
  unmountedHooks: [],
  beforeUpdateHooks: [],
  updatedHooks: [],
  attrChangedHooks: [],
  errorCapturedHooks: [],
  activatedHooks: [],
  deactivatedHooks: [],
  devtools: {
    id: createDevtoolsComponentId(),
    appId: null,
    parentId: null,
    parentHost: null,
    children: new Set(),
    props: {},
    setup: {},
    exposed: {}
  }
});

/** 调用一组钩子，错误隔离 */
export const callHooks = (
  hooks: LifecycleHook[],
  instance?: ComponentInstance,
  info: string = "component lifecycle hook"
): void => {
  const reportError = (error: unknown): void => {
    if (instance?.handleError) instance.handleError(error, info);
    else if (__DEV__) console.error("[lifecycle] hook error:", error);
    else console.error(error);
  };

  for (const fn of hooks) {
    try {
      const result = fn() as unknown;
      if (
        result !== null &&
        result !== undefined &&
        (typeof result === "object" || typeof result === "function") &&
        typeof (result as { then?: unknown }).then === "function"
      ) {
        void Promise.resolve(result).catch(reportError);
      }
    } catch (err) {
      reportError(err);
    }
  }
};

/** 动态绑定更新时调用，负责触发组件 update 生命周期并在同一轮内去重。 */
export const runWithUpdateHooks = (
  instance: ComponentInstance | null,
  update: () => void
): void => {
  if (!instance || !instance.isMounted || instance.isUnmounted) {
    update();
    return;
  }

  const collectDevtoolsUpdate = hasDevtoolsRuntimeHook();
  if (
    !collectDevtoolsUpdate &&
    instance.beforeUpdateHooks.length === 0 &&
    instance.updatedHooks.length === 0
  ) {
    update();
    return;
  }

  const shouldSchedule = !pendingUpdatedInstances.has(instance);
  if (shouldSchedule) {
    pendingUpdatedInstances.add(instance);
    callHooks(instance.beforeUpdateHooks, instance, "component beforeUpdate hook");
  }

  try {
    update();
  } finally {
    if (shouldSchedule) {
      queueMicrotask(() => {
        pendingUpdatedInstances.delete(instance);
        if (!instance.isUnmounted) {
          callHooks(instance.updatedHooks, instance, "component updated hook");
          if (collectDevtoolsUpdate) {
            emitDevtoolsRuntimeEvent({ type: "component:update", host: instance.host });
          }
        }
      });
    }
  }
};

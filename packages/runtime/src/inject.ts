// Provide / Inject — 跨组件树值注入
//
// Web Components 场景下父子链是 DOM 链：通过 host.parentNode 一路上溯，
// 跨 ShadowRoot 时用 ShadowRoot.host 跳到宿主元素，继续上溯。
//
// 设计：
// - provide(key, value) 在组件 setup 内调用：把 (key, value) 写入当前实例
//   的 provides Map
// - inject(key, defaultValue?) 沿父链查找最近的提供者
// - InjectionKey<T> 类型工具（与 Vue 同名同义）
//
// 实现：每个组件实例（lifecycle.ts 的 ComponentInstance）增加 provides Map。
// 我们用 host element 上挂一个 symbol 属性指回 instance，inject 时上溯查找。

import { DEV as __DEV__ } from "./dev";
import { getCurrentInstance, type ComponentInstance } from "./lifecycle";

/** 类型化注入键 */
export type InjectionKey<T> = symbol & { __injectionType?: T };

/** 创建一个类型化注入键 */
export const createInjectionKey = <T = unknown>(description?: string): InjectionKey<T> =>
  Symbol.for(description ?? "elfui.injection.key") as InjectionKey<T>;

/** 实例上挂载 provides 的属性 key */
export const PROVIDES_KEY: unique symbol = Symbol.for("elfui.provides") as any;
const APP_PROVIDES_KEY: unique symbol = Symbol.for("elfui.app.provides") as any;
/** host element 上挂载 instance 引用的属性 key */
const INSTANCE_KEY: unique symbol = Symbol.for("elfui.instance") as any;

type ProvidesMap = Map<symbol | string, unknown>;

interface InstanceWithProvides extends ComponentInstance {
  [PROVIDES_KEY]?: ProvidesMap;
}

/** 把 instance 关联到 host（在 connectedCallback 内调用） */
export const attachInstanceToHost = (host: HTMLElement, instance: ComponentInstance): void => {
  (host as unknown as Record<symbol, unknown>)[INSTANCE_KEY] = instance;
};

/** 完整卸载后解除 host 与旧实例的关联。 */
export const detachInstanceFromHost = (host: HTMLElement, instance: ComponentInstance): void => {
  const target = host as unknown as Record<symbol, unknown>;
  if (target[INSTANCE_KEY] === instance) {
    delete target[INSTANCE_KEY];
  }
};

/** 从 host 取出已附加的组件实例（KeepAlive 等内部使用） */
export const getInstanceFromHost = (host: HTMLElement): ComponentInstance | null => {
  return readInstanceFromHost(host);
};

/** 沿真实 DOM / ShadowRoot 链查找最近的父组件实例。 */
export const findParentInstance = (host: HTMLElement): ComponentInstance | null => {
  let current: Node | null = host.parentNode;
  while (current) {
    const instance = readInstanceFromHost(current);
    if (instance && !instance.isUnmounted) return instance;
    if (current.parentNode) {
      current = current.parentNode;
    } else if (current.nodeType === 11 && "host" in current) {
      current = (current as ShadowRoot).host;
    } else {
      current = null;
    }
  }
  return null;
};

/** 从 host 取出 instance */
const readInstanceFromHost = (host: Node): ComponentInstance | null => {
  return (
    ((host as unknown as Record<symbol, unknown>)[INSTANCE_KEY] as ComponentInstance | undefined) ??
    null
  );
};

const readAppProvidesFromHost = (host: Node): ProvidesMap | null => {
  return (
    ((host as unknown as Record<symbol, unknown>)[APP_PROVIDES_KEY] as ProvidesMap | undefined) ??
    null
  );
};

/**
 * 在当前组件实例提供值。必须在 setup 同步执行期间调用。
 *
 * @example
 *   const KEY: InjectionKey<string> = createInjectionKey("theme");
 *   provide(KEY, "dark");
 */
export const provide = <T>(key: symbol | string, value: T): void => {
  const instance = getCurrentInstance() as InstanceWithProvides | null;
  if (!instance) {
    if (__DEV__) console.warn("[provide] 必须在组件 setup 同步执行期间调用。");
    return;
  }
  if (!instance[PROVIDES_KEY]) {
    instance[PROVIDES_KEY] = new Map();
  }
  instance[PROVIDES_KEY].set(key, value);
};

/**
 * 沿父级 DOM 链（含跨 ShadowRoot）查找已 provide 的值。
 *
 * @example
 *   const theme = inject(THEME_KEY, "light");
 */
export function inject<T>(key: InjectionKey<T>, defaultValue?: T): T | undefined;
export function inject<T>(key: symbol | string, defaultValue?: T): T | undefined;
export function inject(key: symbol | string, defaultValue?: unknown): unknown {
  const instance = getCurrentInstance();
  if (!instance) {
    if (__DEV__) console.warn("[inject] 必须在组件 setup 同步执行期间调用。");
    return defaultValue;
  }

  // 从当前实例 host 开始向上查找
  let current: Node | null = instance.host;
  while (current) {
    const appProvides = readAppProvidesFromHost(current);
    if (appProvides && appProvides.has(key)) {
      return appProvides.get(key);
    }

    const inst = readInstanceFromHost(current) as InstanceWithProvides | null;
    if (inst && inst !== instance) {
      const provides = inst[PROVIDES_KEY];
      if (provides && provides.has(key)) {
        return provides.get(key);
      }
    }
    // 向上：parentNode 优先；进入 ShadowRoot 时跳到 .host
    if (current.parentNode) {
      current = current.parentNode;
    } else if (
      current.nodeType === 11 /* DOCUMENT_FRAGMENT_NODE，ShadowRoot 也是 11 */ &&
      "host" in current
    ) {
      current = (current as ShadowRoot).host;
    } else {
      break;
    }
  }
  return defaultValue;
}

/** 是否处于"可注入"上下文（setup 同步执行期间） */
export const hasInjectionContext = (): boolean => getCurrentInstance() !== null;

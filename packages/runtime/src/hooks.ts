// 全局组合式 helpers — setup 内调用，自动从 currentInstance 取上下文
//
// 设计：参考旧版实现 / Vue 3 的 useAttrs / useSlots / useHost 风格，
// 用户不需要写 (props, ctx) => { ctx.host.... } 这种长链路。
//
//   ElfUI.createComponent()
//     .setup(() => {
//       const host = useHost()
//       const inp = useTemplateRef("inp")
//       useEventListener(document, "click", onDocClick)
//       return { ... }
//     })
//
// 注意：这些 helpers 只能在 setup 同步期间调用（同 onMount/inject 等约束）。

import { useEffect } from "@elfui/reactivity";

import { getHostAttrs } from "./attrs";
import { resolveAppConfig, warn } from "./config";
import { getCurrentInstance } from "./lifecycle";
import { onBeforeUnmount, onMount } from "./lifecycle";

const failNoInstance = (api: string): never => {
  throw new Error(__DEV__ ? `[${api}] 必须在 setup 同步执行期间调用。` : `[${api}] no instance`);
};

/** 当前组件实例的 host element */
export const useHost = <T extends HTMLElement = HTMLElement>(): T => {
  const inst = getCurrentInstance();
  if (!inst) {
    return failNoInstance("useHost");
  }
  return inst.host as T;
};

/** 当前组件的 ShadowRoot（无 shadow 时返回 null） */
export const useShadowRoot = <T extends ShadowRoot = ShadowRoot>(): T | null => {
  const inst = getCurrentInstance();
  if (!inst) {
    return failNoInstance("useShadowRoot");
  }
  return inst.shadow as T | null;
};

const readRenderRoot = <T extends HTMLElement | ShadowRoot>(api: string): T => {
  const inst = getCurrentInstance();
  if (!inst) {
    return failNoInstance(api);
  }
  return (inst.shadow ?? inst.host) as T;
};

/** 当前组件渲染挂载点（shadow 优先，否则 host 自身） */
export const useRenderRoot = <T extends HTMLElement | ShadowRoot = HTMLElement | ShadowRoot>(): T =>
  readRenderRoot<T>("useRenderRoot");

/** host element attribute 集合；外部改动会同步到这个响应式快照。 */
export const useAttrs = (): Readonly<Record<string, string>> => {
  const inst = getCurrentInstance();
  if (!inst) {
    return failNoInstance("useAttrs");
  }
  return getHostAttrs(inst.host);
};

/** 当前 App 的配置；宏组件可通过它读取 globalProperties。 */
export const useAppConfig = (): Readonly<ReturnType<typeof resolveAppConfig>> => {
  const instance = getCurrentInstance();
  if (!instance) return failNoInstance("useAppConfig");
  return resolveAppConfig(instance.host);
};

/** 自动 mount/unmount 的 addEventListener
 *
 *   useEventListener(document, "click", onDocClick)
 *   useEventListener(window, "resize", onResize, { passive: true })
 */
export const useEventListener = <E extends Event>(
  target: EventTarget | null | undefined,
  event: string,
  handler: (e: E) => void,
  options?: boolean | AddEventListenerOptions
): void => {
  if (!target) return;
  onMount(() => {
    target.addEventListener(event, handler as EventListener, options);
  });
  onBeforeUnmount(() => {
    target.removeEventListener(event, handler as EventListener, options);
  });
};

/** 点击 target 之外（即 host 之外）的元素时触发 callback
 *
 *   useClickOutside(useHost(), () => close())
 */
export const useClickOutside = (
  target: HTMLElement | null | undefined,
  handler: (e: MouseEvent) => void
): void => {
  if (!target) return;
  useEventListener<MouseEvent>(document, "click", (e) => {
    const path = e.composedPath();
    if (!path.includes(target)) {
      handler(e);
    }
  });
};

// ---------- Host 反射 helpers ----------

/** 把响应式表达式同步到 host attribute（值为 null/undefined/false 时移除） */
export const useHostAttr = (name: string, getter: () => unknown): void => {
  const host = useHost();
  if (!host) return;
  useEffect(() => {
    const v = getter();
    if (v == null || v === false) {
      host.removeAttribute(name);
    } else {
      host.setAttribute(name, v === true ? "" : String(v));
    }
  });
};

/** 把响应式表达式同步到 host CSS 变量
 *
 *   useHostCssVar('--cols', () => props.columns)   // host.style.setProperty('--cols', '12')
 */
export const useHostCssVar = (name: string, getter: () => unknown): void => {
  const host = useHost();
  if (!host) return;
  useEffect(() => {
    const v = getter();
    if (v == null) {
      host.style.removeProperty(name);
    } else {
      host.style.setProperty(name, String(v));
    }
  });
};

/** 把响应式表达式同步到 host 内联样式属性 */
export const useHostStyle = (name: keyof CSSStyleDeclaration, getter: () => unknown): void => {
  const host = useHost();
  if (!host) return;
  useEffect(() => {
    const v = getter();
    (host.style as unknown as Record<string, unknown>)[name as string] = v == null ? "" : String(v);
  });
};

/** 把布尔响应式同步为 host attribute 存在性（如 data-open / aria-checked）
 *
 *   useHostFlag('data-open', () => open.value)
 *   true  → setAttribute("data-open", "")
 *   false → removeAttribute("data-open")
 */
export const useHostFlag = (name: string, getter: () => unknown): void => {
  const host = useHost();
  if (!host) return;
  useEffect(() => {
    if (getter()) host.setAttribute(name, "");
    else host.removeAttribute(name);
  });
};

/** 把响应式 class 写入 host classList
 *
 *   useHostClass(() => ({ active: open.value, disabled: !ready.value }))
 *   useHostClass(() => ['foo', open.value && 'open'])
 */
export type HostClassValue =
  | string
  | Record<string, boolean | undefined | null>
  | Array<HostClassValue>
  | undefined
  | null
  | false;

const flattenClass = (v: HostClassValue, out: Set<string>): void => {
  if (!v) return;
  if (typeof v === "string") {
    for (const seg of v.split(/\s+/)) if (seg) out.add(seg);
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) flattenClass(x, out);
    return;
  }
  for (const k in v) {
    if (v[k]) out.add(k);
  }
};

export const useHostClass = (getter: () => HostClassValue): void => {
  const host = useHost();
  if (!host) return;
  let prev = new Set<string>();
  useEffect(() => {
    const next = new Set<string>();
    flattenClass(getter(), next);
    for (const c of prev) if (!next.has(c)) host.classList.remove(c);
    for (const c of next) if (!prev.has(c)) host.classList.add(c);
    prev = next;
  });
};

/** 把对象暴露为 host 的公共 property，外部 `el.method()` 可调用
 *
 *   defineExpose({ focus: () => input.value?.focus() })
 *   // 之后 document.querySelector('elf-input').focus()
 */
export const defineExpose = (exposed: Record<string, unknown>): void => {
  const instance = getCurrentInstance();
  const host = useHost();
  if (!host) return;
  if (__DEV__ && instance) instance.devtools.exposed = exposed;
  for (const k of Object.keys(exposed)) {
    if (__DEV__ && k in host) {
      warn(`[defineExpose] "${k}" 会覆盖 host 上已有的属性或方法。`);
    }
    Object.defineProperty(host, k, {
      get: () => exposed[k],
      enumerable: true,
      configurable: true
    });
  }
};

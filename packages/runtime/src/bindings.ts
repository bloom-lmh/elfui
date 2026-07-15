// 运行时绑定原语
//
// 这是 ElfUI 与 Solid 神似但与 Vue 完全不同的关键：
// 编译器把模板里的每个动态点编译成一个 effect 调用，运行时不需要 VNode、
// 不需要 patch、不需要 diff —— 每次 state 变化只重跑该动态点的 effect，
// 直接精准更新 DOM 节点。
//
// 原语清单：
// - text(node, getter)：动态文本节点
// - attr(el, key, getter)：HTML attribute（用 setAttribute）
// - prop(el, key, getter)：DOM property（el[key] = value）
// - on(el, event, handler, options?)：事件监听
// - cls(el, getter)：class 合并（string / object / array）
// - sty(el, getter)：style 合并（string / object）

import { useEffect, type ReactivityEffectDebugInfo } from "@elfui/reactivity";

import { getCurrentInstance, runWithUpdateHooks } from "./lifecycle";

export interface BindingDebugInfo {
  name?: string;
  source?: { line: number; column: number };
}

const bindEffect = (fn: () => void, name: string, debug?: BindingDebugInfo): void => {
  const instance = getCurrentInstance();
  const effectDebug: ReactivityEffectDebugInfo = {
    kind: "binding",
    name: debug?.name ?? name,
    ...(debug?.source ? { source: debug.source } : {})
  };
  useEffect(
    () => {
      runWithUpdateHooks(instance, fn);
    },
    { debug: effectDebug }
  );
};

const camel = (s: string): string => s.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

const customElementPropKey = (el: Element, key: string): string => {
  if (!key.includes("-")) return key;
  return el.localName.includes("-") ? camel(key) : key;
};

/** 动态文本节点：node 必须是 Text 节点 */
export const text = (node: Text, getter: () => unknown, debug?: BindingDebugInfo): void => {
  bindEffect(
    () => {
      const v = getter();
      node.data = v == null ? "" : String(v);
    },
    "text",
    debug
  );
};

/** HTML attribute：用 setAttribute / removeAttribute
 *
 *  智能 fallback：当值为对象 / 数组 / 函数 等无法序列化的类型时，
 *  自动改用 property 写入（el[key] = v）。这是 Web Components 的常见
 *  约定 —— 简单值走 attribute，复杂值走 property。
 */
export const attr = (
  el: Element,
  key: string,
  getter: () => unknown,
  debug?: BindingDebugInfo
): void => {
  bindEffect(
    () => {
      const v = getter();
      // 复杂类型：写 property
      if (v !== null && (typeof v === "object" || typeof v === "function")) {
        (el as unknown as Record<string, unknown>)[customElementPropKey(el, key)] = v;
        return;
      }
      if (v == null || v === false) {
        el.removeAttribute(key);
      } else {
        el.setAttribute(key, v === true ? "" : String(v));
      }
    },
    `attr:${key}`,
    debug
  );
};

/** DOM property：el[key] = value */
export const prop = (
  el: Element,
  key: string,
  getter: () => unknown,
  debug?: BindingDebugInfo
): void => {
  bindEffect(
    () => {
      const v = getter();
      (el as unknown as Record<string, unknown>)[customElementPropKey(el, key)] = v;
    },
    `prop:${key}`,
    debug
  );
};

/** 事件监听 */
export const on = (
  el: Element,
  event: string,
  handler: EventListener,
  options?: boolean | AddEventListenerOptions
): void => {
  el.addEventListener(event, handler, options);
};

// ---------- class ----------

export type ClassValue =
  | string
  | Record<string, boolean | undefined | null>
  | Array<ClassValue>
  | undefined
  | null;

const normalizeClass = (value: ClassValue): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(normalizeClass).filter(Boolean).join(" ");
  }
  // object: { foo: true, bar: false }
  const out: string[] = [];
  for (const k in value) {
    if (value[k]) out.push(k);
  }
  return out.join(" ");
};

/** class 绑定：合并多种形态 */
export const cls = (el: Element, getter: () => ClassValue, debug?: BindingDebugInfo): void => {
  // 记录组件直接写在标签上的静态 class，更新时与动态部分合并
  const staticClass = el.getAttribute("class") ?? "";
  bindEffect(
    () => {
      const dynamic = normalizeClass(getter());
      const merged = staticClass ? `${staticClass} ${dynamic}`.trim() : dynamic;
      if (merged) {
        el.setAttribute("class", merged);
      } else {
        el.removeAttribute("class");
      }
    },
    "class",
    debug
  );
};

// ---------- style ----------

export type StyleValue =
  | string
  | Record<string, string | number | undefined | null>
  | Array<StyleValue>
  | undefined
  | null;

const normalizeStyle = (value: StyleValue): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(normalizeStyle).filter(Boolean).join("; ");
  }
  // object: { color: "red", fontSize: 12 }
  const parts: string[] = [];
  for (const k in value) {
    const v = (value as Record<string, string | number | undefined | null>)[k];
    if (v == null) continue;
    parts.push(`${kebab(k)}: ${typeof v === "number" ? `${v}px` : v}`);
  }
  return parts.join("; ");
};

const kebab = (s: string): string => s.replace(/([A-Z])/g, "-$1").toLowerCase();

/** style 绑定 */
export const sty = (el: Element, getter: () => StyleValue, debug?: BindingDebugInfo): void => {
  bindEffect(
    () => {
      const v = normalizeStyle(getter());
      if (v) {
        el.setAttribute("style", v);
      } else {
        el.removeAttribute("style");
      }
    },
    "style",
    debug
  );
};

/** L3.9: v-bind="obj" — 把 obj 的每个 key 用响应式方式同步到 element */
export const bindObject = (el: Element, getter: () => unknown, debug?: BindingDebugInfo): void => {
  let prev: Record<string, unknown> = {};
  bindEffect(
    () => {
      const v = getter();
      const obj = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      for (const k in prev) {
        if (!(k in obj)) writeObjAttr(el, k, undefined, true);
      }
      for (const k in obj) {
        writeObjAttr(el, k, obj[k], false);
      }
      prev = obj;
    },
    "bind-object",
    debug
  );
};

const writeObjAttr = (el: Element, k: string, val: unknown, removal: boolean): void => {
  if (removal || val == null || val === false) {
    el.removeAttribute(k);
    return;
  }
  if (k === "class") {
    el.setAttribute("class", typeof val === "string" ? val : normalizeClass(val as ClassValue));
    return;
  }
  if (k === "style") {
    el.setAttribute("style", typeof val === "string" ? val : normalizeStyle(val as StyleValue));
    return;
  }
  if (typeof val === "object" || typeof val === "function") {
    (el as unknown as Record<string, unknown>)[customElementPropKey(el, k)] = val;
    return;
  }
  el.setAttribute(k, val === true ? "" : String(val));
};

/** L3.9: v-on="obj" — 把 obj 的每个 key 注册为事件监听，对象变化时增删 */
export const onObject = (el: Element, getter: () => unknown, debug?: BindingDebugInfo): void => {
  let prev: Record<string, EventListener> = {};
  bindEffect(
    () => {
      const v = getter();
      const obj = (v && typeof v === "object" ? v : {}) as Record<string, EventListener>;
      for (const k in prev) {
        if (obj[k] !== prev[k]) el.removeEventListener(k, prev[k]!);
      }
      for (const k in obj) {
        if (typeof obj[k] === "function" && obj[k] !== prev[k]) {
          el.addEventListener(k, obj[k]!);
        }
      }
      prev = { ...obj };
    },
    "on-object",
    debug
  );
};

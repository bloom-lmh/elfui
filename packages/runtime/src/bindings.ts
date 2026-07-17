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

import { batch, useEffect, type ReactivityEffectDebugInfo } from "@elfui/reactivity";

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
const batchedEventListener = (handler: EventListener): EventListener =>
  function (this: Element, event: Event): void {
    batch(() => handler.call(this, event));
  };

export const on = (
  el: Element,
  event: string,
  handler: EventListener,
  options?: boolean | AddEventListenerOptions
): (() => void) => {
  const listener = batchedEventListener(handler);
  el.addEventListener(event, listener, options);
  return () => el.removeEventListener(event, listener, options);
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

const kebab = (s: string): string => s.replace(/([A-Z])/g, "-$1").toLowerCase();

interface StyleDeclarationValue {
  value: string;
  priority: string;
}

const unitlessStyleProperties = new Set([
  "animation-iteration-count",
  "border-image-outset",
  "border-image-slice",
  "border-image-width",
  "column-count",
  "fill-opacity",
  "flex",
  "flex-grow",
  "flex-shrink",
  "flood-opacity",
  "font-weight",
  "grid-area",
  "grid-column",
  "grid-column-end",
  "grid-column-start",
  "grid-row",
  "grid-row-end",
  "grid-row-start",
  "line-clamp",
  "line-height",
  "opacity",
  "order",
  "orphans",
  "scale",
  "stop-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "tab-size",
  "widows",
  "z-index",
  "zoom"
]);

const stylePropertyName = (key: string): string => {
  if (key.startsWith("--")) return key;
  if (key === "cssFloat") return "float";
  return kebab(key);
};

const isUnitlessStyleProperty = (key: string): boolean =>
  unitlessStyleProperties.has(key) ||
  unitlessStyleProperties.has(key.replace(/^-(?:webkit|moz|ms|o)-/, ""));

const stylePropertyValue = (key: string, value: string | number): StyleDeclarationValue => {
  if (typeof value === "number") {
    return {
      value: key.startsWith("--") || isUnitlessStyleProperty(key) ? String(value) : `${value}px`,
      priority: ""
    };
  }
  const important = /\s*!important\s*$/i.test(value);
  return {
    value: important ? value.replace(/\s*!important\s*$/i, "") : value,
    priority: important ? "important" : ""
  };
};

const readStyleDeclaration = (style: CSSStyleDeclaration): Map<string, StyleDeclarationValue> => {
  const declarations = new Map<string, StyleDeclarationValue>();
  for (let i = 0; i < style.length; i++) {
    const key = style.item(i);
    declarations.set(key, {
      value: style.getPropertyValue(key),
      priority: style.getPropertyPriority(key)
    });
  }
  return declarations;
};

const normalizeStyle = (
  value: StyleValue,
  declarations: Map<string, StyleDeclarationValue>,
  parse: (cssText: string) => Map<string, StyleDeclarationValue>
): void => {
  if (value == null) return;
  if (typeof value === "string") {
    for (const [key, declaration] of parse(value)) declarations.set(key, declaration);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) normalizeStyle(entry, declarations, parse);
    return;
  }
  for (const rawKey in value) {
    const rawValue = value[rawKey];
    if (rawValue == null) continue;
    const key = stylePropertyName(rawKey);
    declarations.set(key, stylePropertyValue(key, rawValue));
  }
};

const serializeStyle = (el: Element, value: StyleValue): string => {
  if (typeof value === "string") return value;
  const parser = el.ownerDocument.createElement("div").style;
  const declarations = new Map<string, StyleDeclarationValue>();
  normalizeStyle(value, declarations, (cssText) => {
    parser.cssText = cssText;
    return readStyleDeclaration(parser);
  });
  return [...declarations]
    .map(
      ([key, declaration]) =>
        `${key}: ${declaration.value}${declaration.priority ? " !important" : ""}`
    )
    .join("; ");
};

/** style 绑定 */
export const sty = (el: Element, getter: () => StyleValue, debug?: BindingDebugInfo): void => {
  const style = (el as Element & { style?: CSSStyleDeclaration }).style;
  if (!style) {
    bindEffect(
      () => {
        const cssText = serializeStyle(el, getter());
        if (cssText) el.setAttribute("style", cssText);
        else el.removeAttribute("style");
      },
      "style",
      debug
    );
    return;
  }

  const staticDeclarations = readStyleDeclaration(style);
  const parser = el.ownerDocument.createElement("div").style;
  const parse = (cssText: string): Map<string, StyleDeclarationValue> => {
    parser.cssText = cssText;
    return readStyleDeclaration(parser);
  };
  let previous = new Map<string, StyleDeclarationValue>();
  bindEffect(
    () => {
      const next = new Map<string, StyleDeclarationValue>();
      normalizeStyle(getter(), next, parse);

      for (const key of previous.keys()) {
        if (next.has(key)) continue;
        const declaration = staticDeclarations.get(key);
        if (declaration) style.setProperty(key, declaration.value, declaration.priority);
        else style.removeProperty(key);
      }

      for (const [key, declaration] of next) {
        const current = previous.get(key);
        if (
          current?.value === declaration.value &&
          current.priority === declaration.priority &&
          style.getPropertyValue(key) === declaration.value &&
          style.getPropertyPriority(key) === declaration.priority
        ) {
          continue;
        }
        style.setProperty(key, declaration.value, declaration.priority);
      }

      previous = next;
      if (style.length === 0) el.removeAttribute("style");
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
    el.setAttribute("style", serializeStyle(el, val as StyleValue));
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
  let prev: Record<string, { source: EventListener; listener: EventListener }> = {};
  bindEffect(
    () => {
      const v = getter();
      const obj = (v && typeof v === "object" ? v : {}) as Record<string, EventListener>;
      const next: Record<string, { source: EventListener; listener: EventListener }> = {};
      for (const k in prev) {
        if (obj[k] !== prev[k]?.source) el.removeEventListener(k, prev[k]!.listener);
      }
      for (const k in obj) {
        const source = obj[k];
        if (typeof source !== "function") continue;
        const listener =
          prev[k]?.source === source ? prev[k]!.listener : batchedEventListener(source);
        if (listener !== prev[k]?.listener) el.addEventListener(k, listener);
        next[k] = { source, listener };
      }
      prev = next;
    },
    "on-object",
    debug
  );
};

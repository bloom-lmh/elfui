import { isRef, type useRef } from "@elfui/reactivity";

import { getHostAttrs } from "./attrs";
import { resolveAppConfig } from "./config";
import { DEV as __DEV__ } from "./dev";
import { emitDevtoolsRuntimeEvent } from "./devtools";
import { createRenderState } from "./unwrap";
import type {
  ComponentDefinition,
  EmitOptions,
  PropOption,
  PropsOptions,
  PropType,
  RenderContext
} from "./element";

export const normalizeProps = (props: PropsOptions): Array<[string, PropOption<unknown>]> => {
  const out: Array<[string, PropOption<unknown>]> = [];
  for (const key of Object.keys(props)) {
    const value = props[key];
    if (typeof value === "function") {
      out.push([key, { type: value as PropType<unknown> }]);
    } else if (value) {
      out.push([key, value]);
    }
  }
  return out;
};

export const resolveDefault = (option: PropOption<unknown>): unknown => {
  const value = option.default;
  if (typeof value === "function" && option.type !== Function) {
    return (value as () => unknown)();
  }
  return value;
};

export const coerceAttr = (
  raw: string | null,
  option: PropOption<unknown>,
  attributeName: string
): unknown => {
  if (raw === null) return resolveDefault(option);
  const Type = option.type;
  if (Type === Boolean) {
    return raw === "" || raw === "true" || raw === attributeName;
  }
  if (Type === Number) return Number(raw);
  if (Type === Object || Type === Array) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
};

export const createPropsProxy = (
  states: Map<string, ReturnType<typeof useRef>>
): Record<string, unknown> =>
  new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key === "symbol") return undefined;
        const state = states.get(key);
        if (!state) return undefined;
        return isRef(state) ? (state as { value: unknown }).value : state;
      },
      has(_target, key) {
        return typeof key === "string" && states.has(key);
      },
      ownKeys() {
        return Array.from(states.keys());
      },
      getOwnPropertyDescriptor(_target, key) {
        return typeof key === "string" && states.has(key)
          ? { enumerable: true, configurable: true }
          : undefined;
      }
    }
  );

export const createEmit =
  (
    host: HTMLElement,
    options: EmitOptions | undefined
  ): ((event: string, ...args: unknown[]) => boolean) =>
  (event, ...args) => {
    const detail = options?.rawDetail === false ? args : args.length <= 1 ? args[0] : args;
    const eventOptions = options?.events?.[event];
    const dispatched = host.dispatchEvent(
      new CustomEvent(event, {
        detail,
        bubbles: eventOptions?.bubbles ?? options?.bubbles ?? false,
        cancelable: eventOptions?.cancelable ?? options?.cancelable ?? false,
        composed: eventOptions?.composed ?? options?.composed ?? false
      })
    );
    if (__DEV__) {
      emitDevtoolsRuntimeEvent({ type: "component:emit", host, event, args });
    }
    return dispatched;
  };

const styleSheetCache = new WeakMap<object, Map<string, CSSStyleSheet>>();

export const injectStyles = (shadow: ShadowRoot, styles: string[]): void => {
  const StyleSheet = shadow.ownerDocument.defaultView?.CSSStyleSheet;
  if ("adoptedStyleSheets" in shadow && StyleSheet && "replaceSync" in StyleSheet.prototype) {
    try {
      let cache = styleSheetCache.get(StyleSheet);
      if (!cache) {
        cache = new Map();
        styleSheetCache.set(StyleSheet, cache);
      }
      const next = [...shadow.adoptedStyleSheets];
      const adopted = new Set(next);
      for (const css of styles) {
        let sheet = cache.get(css);
        if (!sheet) {
          sheet = new StyleSheet();
          sheet.replaceSync(css);
          cache.set(css, sheet);
        }
        if (!adopted.has(sheet)) {
          adopted.add(sheet);
          next.push(sheet);
        }
      }
      shadow.adoptedStyleSheets = next;
      return;
    } catch {
      // Some older browsers expose the API but reject adoption; use style elements instead.
    }
  }
  for (const css of styles) {
    const style = shadow.ownerDocument.createElement("style");
    style.textContent = css;
    shadow.appendChild(style);
  }
};

export const buildRenderCtx = (
  host: HTMLElement,
  shadow: ShadowRoot | null,
  props: Record<string, unknown>,
  setupState: Record<string, unknown>,
  emit: (event: string, ...args: unknown[]) => boolean,
  directives?: Record<string, unknown>,
  components?: ComponentDefinition["components"]
): RenderContext => {
  const systemState: Record<string, unknown> = {
    $emit: emit,
    $host: host,
    $root: shadow ?? host,
    $props: props,
    $attrs: getHostAttrs(host),
    $app: resolveAppConfig(host).globalProperties
  };
  const renderCtx: RenderContext = {
    state: createRenderState(props, setupState, systemState),
    props,
    emit,
    host,
    shadow
  };
  if (directives) renderCtx.directives = directives;
  if (components) renderCtx.components = components;
  return renderCtx;
};

export const kebab = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();

const camel = (value: string): string =>
  value.replace(/-(\w)/g, (_match, character: string) => character.toUpperCase());

const pascal = (value: string): string => {
  const camelValue = camel(value);
  return camelValue ? camelValue[0]!.toUpperCase() + camelValue.slice(1) : camelValue;
};

export const resolveLocalComponent = (
  tag: string,
  components?: ComponentDefinition["components"]
): string | CustomElementConstructor | undefined => {
  if (!components) return undefined;
  const direct =
    components[tag] ?? components[kebab(tag)] ?? components[camel(tag)] ?? components[pascal(tag)];
  if (direct) return direct;

  for (const [name, component] of Object.entries(components)) {
    const definition = (component as unknown as { __elfDefinition?: ComponentDefinition })
      .__elfDefinition;
    if (definition?.tag === tag) return component;

    const normalizedName = kebab(name);
    if (tag === name || tag === normalizedName || tag === camel(normalizedName)) return component;
  }
  return undefined;
};

export const findUnsetupParent = (element: HTMLElement): any | null => {
  let current: Node | null = element.parentNode;
  if (!current && element.getRootNode) {
    const root = element.getRootNode();
    if (root instanceof ShadowRoot) current = root.host;
  }
  while (current) {
    if (
      current instanceof HTMLElement &&
      current.constructor &&
      "__elfDefinition" in current.constructor
    ) {
      const elfElement = current as any;
      if (!elfElement.__setupDone) return elfElement;
    }
    let next: Node | null = current.parentNode;
    if (!next && current instanceof ShadowRoot) {
      next = current.host;
    } else if (!next && current.nodeType === 11 && "host" in current) {
      next = (current as any).host;
    }
    current = next;
  }
  return null;
};

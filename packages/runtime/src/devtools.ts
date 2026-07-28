import { DEV as __DEV__ } from "./dev";

export const ELFUI_DEVTOOLS_GLOBAL_HOOK = "__ELFUI_DEVTOOLS_GLOBAL_HOOK__";

const APP_ID_KEY: unique symbol = Symbol.for("elfui.app.id") as never;
const INSTANCE_KEY: unique symbol = Symbol.for("elfui.instance") as never;
const LOGICAL_PARENT_KEY: unique symbol = Symbol.for("elfui.devtools.logical-parent") as never;
const COMPONENT_CONTEXT_KEY: unique symbol = Symbol.for(
  "elfui.devtools.component-context"
) as never;
const TEMPLATE_NODE_KEY: unique symbol = Symbol.for("elfui.devtools.template-node") as never;

type WeakRegistry<K extends object, V> = Pick<WeakMap<K, V>, "get" | "set">;

let localTemplateNodeRegistry: WeakMap<Node, ElfUIDevtoolsTemplateNodeInfo> | undefined;
let localRenderRootRegistry: WeakMap<HTMLElement, ShadowRoot> | undefined;

const isWeakRegistry = <K extends object, V>(value: unknown): value is WeakRegistry<K, V> =>
  !!value &&
  typeof value === "object" &&
  typeof (value as { get?: unknown }).get === "function" &&
  typeof (value as { set?: unknown }).set === "function";

const templateNodeRegistry = (): WeakRegistry<Node, ElfUIDevtoolsTemplateNodeInfo> => {
  localTemplateNodeRegistry ??= new WeakMap();
  try {
    const key = Symbol.for("elfui.devtools.template-node-registry");
    const target = globalThis as unknown as Record<symbol, unknown>;
    const current = target[key];
    if (isWeakRegistry<Node, ElfUIDevtoolsTemplateNodeInfo>(current)) return current;
    const registry = new WeakMap<Node, ElfUIDevtoolsTemplateNodeInfo>();
    Object.defineProperty(target, key, { value: registry, configurable: true });
    return registry;
  } catch {
    return localTemplateNodeRegistry;
  }
};

const renderRootRegistry = (): WeakRegistry<HTMLElement, ShadowRoot> => {
  localRenderRootRegistry ??= new WeakMap();
  try {
    const key = Symbol.for("elfui.devtools.render-root-registry");
    const target = globalThis as unknown as Record<symbol, unknown>;
    const current = target[key];
    if (isWeakRegistry<HTMLElement, ShadowRoot>(current)) return current;
    const registry = new WeakMap<HTMLElement, ShadowRoot>();
    Object.defineProperty(target, key, { value: registry, configurable: true });
    return registry;
  } catch {
    return localRenderRootRegistry;
  }
};

export interface ElfUIDevtoolsDebugState {
  id: string;
  appId: string | null;
  parentId: string | null;
  parentHost: WeakRef<HTMLElement> | null;
  children: Set<string>;
  props: Record<string, unknown>;
  setup: Record<string, unknown>;
  exposed: Record<string, unknown>;
}

export interface ElfUIDevtoolsSourceLocation {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface ElfUIDevtoolsTemplateNodeInfo {
  sourceId: string;
  templateNodeId: string;
  fragment?: string;
  source: ElfUIDevtoolsSourceLocation;
}

export const attachDevtoolsRenderRoot = (host: HTMLElement, root: ShadowRoot): void => {
  if (!__DEV__) return;
  try {
    renderRootRegistry().set(host, root);
  } catch {
    // DevTools metadata is best-effort and must never interrupt component construction.
  }
  try {
    Object.defineProperty(host, Symbol.for("elfui.devtools.render-root"), {
      value: root,
      configurable: true
    });
  } catch {
    // Compatibility mirror only. Some DOM implementations reject Symbol descriptors.
  }
};

export const getDevtoolsRenderRoot = (host: HTMLElement): ShadowRoot | null => {
  if (!__DEV__) return null;
  try {
    const root = renderRootRegistry().get(host);
    if (root) return root;
  } catch {
    // Fall through to the legacy node mirror.
  }
  try {
    const root = (host as unknown as Record<symbol, unknown>)[
      Symbol.for("elfui.devtools.render-root")
    ];
    return root instanceof ShadowRoot ? root : null;
  } catch {
    return null;
  }
};

const setDevtoolsTemplateNode = (node: Node, info: ElfUIDevtoolsTemplateNodeInfo): void => {
  try {
    templateNodeRegistry().set(node, info);
  } catch {
    // DevTools metadata is best-effort and must never interrupt template rendering.
  }
  try {
    Object.defineProperty(node, TEMPLATE_NODE_KEY, {
      value: info,
      configurable: true
    });
  } catch {
    // Compatibility mirror only. happy-dom select elements reject this descriptor.
  }
};

export const getDevtoolsTemplateNode = (node: Node): ElfUIDevtoolsTemplateNodeInfo | null => {
  if (!__DEV__) return null;
  try {
    const info = templateNodeRegistry().get(node);
    if (info) return info;
  } catch {
    // Fall through to the legacy node mirror.
  }
  try {
    return (
      ((node as unknown as Record<symbol, unknown>)[TEMPLATE_NODE_KEY] as
        | ElfUIDevtoolsTemplateNodeInfo
        | undefined) ?? null
    );
  } catch {
    return null;
  }
};

export const attachDevtoolsTemplateNode = (
  node: Node,
  sourceId: string,
  fragment: string,
  line: number,
  column: number,
  endLine: number,
  endColumn: number
): void => {
  if (!__DEV__) return;
  const owner = fragment || "component";
  const tag = node instanceof Element ? node.localName : node.nodeName.toLowerCase();
  const info: ElfUIDevtoolsTemplateNodeInfo = {
    sourceId,
    templateNodeId: `${sourceId}:${owner}:${tag}:${line}:${column}`,
    ...(fragment ? { fragment } : {}),
    source: { file: sourceId, line, column, endLine, endColumn }
  };
  setDevtoolsTemplateNode(node, info);
};

export const cloneDevtoolsTemplateTree = <T extends Node>(node: T): T => {
  const clone = node.cloneNode(true) as T;
  if (!__DEV__) return clone;
  const copy = (source: Node, target: Node): void => {
    const info = getDevtoolsTemplateNode(source);
    if (info) setDevtoolsTemplateNode(target, info);
    const sourceChildren = source.childNodes;
    const targetChildren = target.childNodes;
    for (let index = 0; index < sourceChildren.length; index += 1) {
      const sourceChild = sourceChildren[index];
      const targetChild = targetChildren[index];
      if (sourceChild && targetChild) copy(sourceChild, targetChild);
    }
  };
  copy(node, clone);
  return clone;
};

export interface ElfUIDevtoolsComponentRegistration {
  id: string;
  host: HTMLElement;
  appId: string | null;
  parentId: string | null;
  parentHost: HTMLElement | null;
  tag: string;
  displayName: string;
  shadowMode: "open" | "closed" | "none";
  source?: ElfUIDevtoolsSourceLocation;
  props: () => Record<string, unknown>;
  attrs: () => Record<string, unknown>;
  setup: () => Record<string, unknown>;
  exposed: () => Record<string, unknown>;
}

export type ElfUIDevtoolsRuntimeEvent =
  | {
      type: "app:mount";
      app: { id: string; label: string; root: HTMLElement };
    }
  | { type: "app:unmount"; appId: string }
  | {
      type: "component:mount";
      component: ElfUIDevtoolsComponentRegistration;
    }
  | { type: "component:update"; host: HTMLElement }
  | { type: "component:unmount"; host: HTMLElement }
  | { type: "component:error"; host: HTMLElement; error: unknown }
  | {
      type: "component:emit";
      host: HTMLElement;
      event: string;
      args: unknown[];
    };

interface ElfUIDevtoolsRuntimeHook {
  emitRuntimeEvent?(event: ElfUIDevtoolsRuntimeEvent): void;
}

let nextAppId = 1;
let nextComponentId = 1;

const getHook = (): ElfUIDevtoolsRuntimeHook | null => {
  if (!__DEV__) return null;
  const hook = (globalThis as Record<string, unknown>)[ELFUI_DEVTOOLS_GLOBAL_HOOK];
  return hook && typeof hook === "object" ? (hook as ElfUIDevtoolsRuntimeHook) : null;
};

const parentNode = (node: Node): Node | null => {
  const logicalParent = (node as unknown as Record<symbol, unknown>)[LOGICAL_PARENT_KEY];
  if (logicalParent instanceof HTMLElement) return logicalParent;
  if (node.parentNode) return node.parentNode;
  return node instanceof ShadowRoot ? node.host : null;
};

export const createDevtoolsAppId = (): string => `elfui-app:${nextAppId++}`;

export const createDevtoolsComponentId = (): string => `elfui-component:${nextComponentId++}`;

export const attachDevtoolsAppId = (host: HTMLElement, appId: string): void => {
  if (!__DEV__) return;
  (host as unknown as Record<symbol, unknown>)[APP_ID_KEY] = appId;
};

export const getDevtoolsAppId = (host: HTMLElement): string | null => {
  if (!__DEV__) return null;
  let current: Node | null = host;
  while (current) {
    const appId = (current as unknown as Record<symbol, unknown>)[APP_ID_KEY];
    if (typeof appId === "string") return appId;
    current = parentNode(current);
  }
  return null;
};

export const findDevtoolsParentHost = (host: HTMLElement): HTMLElement | null => {
  if (!__DEV__) return null;
  let current = parentNode(host);
  while (current) {
    if (
      current instanceof HTMLElement &&
      (current as unknown as Record<symbol, unknown>)[INSTANCE_KEY]
    ) {
      return current;
    }
    current = parentNode(current);
  }
  return null;
};

export const attachDevtoolsLogicalParent = (node: Node, parentHost: HTMLElement | null): void => {
  if (!__DEV__ || !parentHost) return;
  const roots = node instanceof DocumentFragment ? Array.from(node.childNodes) : [node];
  for (const root of roots) {
    (root as unknown as Record<symbol, unknown>)[LOGICAL_PARENT_KEY] = parentHost;
  }
};

interface DevtoolsComponentOwner {
  host: HTMLElement;
  devtools: ElfUIDevtoolsDebugState;
}

const readDevtoolsOwner = (host: HTMLElement | null): DevtoolsComponentOwner | null => {
  if (!host) return null;
  return (
    ((host as unknown as Record<symbol, unknown>)[INSTANCE_KEY] as
      | DevtoolsComponentOwner
      | undefined) ?? null
  );
};

export const connectDevtoolsComponent = (owner: DevtoolsComponentOwner): void => {
  if (!__DEV__) return;
  const parentHost = findDevtoolsParentHost(owner.host);
  const parent = readDevtoolsOwner(parentHost);
  owner.devtools.parentId = parent?.devtools.id ?? null;
  owner.devtools.parentHost = parentHost ? new WeakRef(parentHost) : null;
  owner.devtools.appId = parent?.devtools.appId ?? getDevtoolsAppId(owner.host);
  parent?.devtools.children.add(owner.devtools.id);
};

export const disconnectDevtoolsComponent = (owner: DevtoolsComponentOwner): void => {
  if (!__DEV__) return;
  const parentHost = owner.devtools.parentHost?.deref() ?? null;
  readDevtoolsOwner(parentHost)?.devtools.children.delete(owner.devtools.id);
  owner.devtools.parentHost = null;
};

export const withDevtoolsComponentContext = <T>(componentId: string, run: () => T): T => {
  if (!__DEV__) return run();
  const target = globalThis as unknown as Record<symbol, unknown>;
  const previous = target[COMPONENT_CONTEXT_KEY];
  target[COMPONENT_CONTEXT_KEY] = componentId;
  try {
    return run();
  } finally {
    if (previous === undefined) delete target[COMPONENT_CONTEXT_KEY];
    else target[COMPONENT_CONTEXT_KEY] = previous;
  }
};

export const setDevtoolsComponentContext = (componentId: string | null): void => {
  if (!__DEV__) return;
  const target = globalThis as unknown as Record<symbol, unknown>;
  if (componentId) target[COMPONENT_CONTEXT_KEY] = componentId;
  else delete target[COMPONENT_CONTEXT_KEY];
};

export const hasDevtoolsRuntimeHook = (): boolean =>
  typeof getHook()?.emitRuntimeEvent === "function";

export const emitDevtoolsRuntimeEvent = (event: ElfUIDevtoolsRuntimeEvent): void => {
  const emit = getHook()?.emitRuntimeEvent;
  if (!emit) return;
  try {
    emit(event);
  } catch (error) {
    if (__DEV__) console.warn("[elfui:devtools] runtime hook failed", error);
  }
};

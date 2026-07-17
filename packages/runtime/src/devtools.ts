import { DEV as __DEV__ } from "./dev";

export const ELFUI_DEVTOOLS_GLOBAL_HOOK = "__ELFUI_DEVTOOLS_GLOBAL_HOOK__";

const APP_ID_KEY: unique symbol = Symbol.for("elfui.app.id") as never;
const INSTANCE_KEY: unique symbol = Symbol.for("elfui.instance") as never;
const LOGICAL_PARENT_KEY: unique symbol = Symbol.for("elfui.devtools.logical-parent") as never;
const COMPONENT_CONTEXT_KEY: unique symbol = Symbol.for(
  "elfui.devtools.component-context"
) as never;

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

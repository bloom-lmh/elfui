export const ELFUI_DEVTOOLS_GLOBAL_HOOK = "__ELFUI_DEVTOOLS_GLOBAL_HOOK__";

const APP_ID_KEY: unique symbol = Symbol.for("elfui.app.id") as never;
const INSTANCE_KEY: unique symbol = Symbol.for("elfui.instance") as never;

export interface ElfUIDevtoolsDebugState {
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
  host: HTMLElement;
  appId: string | null;
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

const getHook = (): ElfUIDevtoolsRuntimeHook | null => {
  if (!__DEV__) return null;
  const hook = (globalThis as Record<string, unknown>)[ELFUI_DEVTOOLS_GLOBAL_HOOK];
  return hook && typeof hook === "object" ? (hook as ElfUIDevtoolsRuntimeHook) : null;
};

const parentNode = (node: Node): Node | null => {
  if (node.parentNode) return node.parentNode;
  return node instanceof ShadowRoot ? node.host : null;
};

export const createDevtoolsAppId = (): string => `elfui-app:${nextAppId++}`;

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

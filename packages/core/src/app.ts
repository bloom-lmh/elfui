import {
  ensureCustomElement,
  type DirectiveDefinition,
  type ElfElementConstructor,
  type ElfUIConfig,
  type InjectionKey
} from "@elfui/runtime";
import {
  attachDevtoolsAppId,
  createDevtoolsAppId,
  emitDevtoolsRuntimeEvent
} from "@elfui/runtime/internal";

import { DEV as __DEV__ } from "./dev";

export type AppMountTarget = string | Element;
export type AppRootProps = Record<string, unknown>;
export type AppProvideKey<T = unknown> = InjectionKey<T> | symbol | string;

export type ElfUIAppConfig = ElfUIConfig;

export interface ElfUIApp<RootComponent extends ElfElementConstructor = ElfElementConstructor> {
  readonly config: ElfUIAppConfig;
  mount(target: AppMountTarget): InstanceType<RootComponent>;
  unmount(): void;
  use<T>(plugin: ElfUIAppPlugin<T>, options?: T): this;
  component(component: ElfElementConstructor): this;
  directive(name: string, definition: DirectiveDefinition): this;
  provide<T>(key: AppProvideKey<T>, value: T): this;
}

export interface ElfUIAppPluginObject<T = unknown> {
  install(app: ElfUIApp, options?: T): void;
}

export type ElfUIAppPluginFn<T = unknown> = (app: ElfUIApp, options?: T) => void;
export type ElfUIAppPlugin<T = unknown> = ElfUIAppPluginFn<T> | ElfUIAppPluginObject<T>;

type AppErrorCode =
  | "ELF_APP_DOCUMENT_UNAVAILABLE"
  | "ELF_APP_INVALID_COMPONENT"
  | "ELF_APP_INVALID_SELECTOR"
  | "ELF_APP_TARGET_NOT_FOUND"
  | "ELF_APP_ALREADY_MOUNTED";

const APP_PROVIDES_KEY: unique symbol = Symbol.for("elfui.app.provides") as never;
const APP_CONFIG_KEY: unique symbol = Symbol.for("elfui.app.config") as never;
const APP_DIRECTIVES_KEY: unique symbol = Symbol.for("elfui.app.directives") as never;

const createDefaultAppConfig = (): ElfUIAppConfig => ({
  globalProperties: {},
  warnHandler: null,
  errorHandler: null
});

const createAppError = (code: AppErrorCode): Error => new Error(`[${code}]`);

const resolveMountTarget = (target: AppMountTarget): Element => {
  if (typeof target !== "string") return target;

  let container: Element | null;
  try {
    container = document.querySelector(target);
  } catch {
    throw createAppError("ELF_APP_INVALID_SELECTOR");
  }

  if (!container) {
    throw createAppError("ELF_APP_TARGET_NOT_FOUND");
  }

  return container;
};

const validateComponent = (component: ElfElementConstructor): void => {
  if (!component?.__elfDefinition?.tag) {
    throw createAppError("ELF_APP_INVALID_COMPONENT");
  }
};

const attachAppContext = (
  instance: Element,
  provides: Map<symbol | string, unknown>,
  config: ElfUIAppConfig,
  directives: Map<string, DirectiveDefinition>
): void => {
  const target = instance as unknown as Record<symbol, unknown>;
  target[APP_PROVIDES_KEY] = provides;
  target[APP_CONFIG_KEY] = config;
  target[APP_DIRECTIVES_KEY] = directives;
};

export const createApp = <RootComponent extends ElfElementConstructor>(
  rootComponent: RootComponent,
  rootProps: AppRootProps = {}
): ElfUIApp<RootComponent> => {
  validateComponent(rootComponent);

  const installedPlugins = new WeakSet<object>();
  const provides = new Map<symbol | string, unknown>();
  const appConfig = createDefaultAppConfig();
  const directives = new Map<string, DirectiveDefinition>();
  let rootInstance: InstanceType<RootComponent> | null = null;
  let mountCalled = false;
  const devtoolsAppId = __DEV__ ? createDevtoolsAppId() : "";

  const app: ElfUIApp<RootComponent> = {
    config: appConfig,

    mount(target: AppMountTarget): InstanceType<RootComponent> {
      if (typeof document === "undefined") {
        throw createAppError("ELF_APP_DOCUMENT_UNAVAILABLE");
      }
      if (mountCalled) {
        throw createAppError("ELF_APP_ALREADY_MOUNTED");
      }

      const container = resolveMountTarget(target);
      mountCalled = true;
      try {
        const tag = ensureCustomElement(rootComponent);
        const instance = document.createElement(tag) as InstanceType<RootComponent>;
        attachAppContext(instance, provides, appConfig, directives);
        if (__DEV__) {
          attachDevtoolsAppId(instance, devtoolsAppId);
          emitDevtoolsRuntimeEvent({
            type: "app:mount",
            app: { id: devtoolsAppId, label: tag, root: instance }
          });
        }
        Object.assign(instance, rootProps);
        container.replaceChildren(instance);
        rootInstance = instance;
        return instance;
      } catch (error) {
        mountCalled = false;
        rootInstance = null;
        throw error;
      }
    },

    unmount(): void {
      if (rootInstance) {
        if (__DEV__) {
          emitDevtoolsRuntimeEvent({ type: "app:unmount", appId: devtoolsAppId });
        }
        rootInstance.remove();
        rootInstance = null;
      }
    },

    use<T>(plugin: ElfUIAppPlugin<T>, options?: T): ElfUIApp<RootComponent> {
      const key = plugin as unknown as object;
      if (installedPlugins.has(key)) return this;

      if (typeof plugin === "function") {
        plugin(this, options);
        installedPlugins.add(key);
      } else if (plugin && typeof plugin.install === "function") {
        plugin.install(this, options);
        installedPlugins.add(key);
      }
      return this;
    },

    component(component: ElfElementConstructor): ElfUIApp<RootComponent> {
      validateComponent(component);
      ensureCustomElement(component);
      return this;
    },

    directive(name: string, definition: DirectiveDefinition): ElfUIApp<RootComponent> {
      directives.set(name, definition);
      return this;
    },

    provide<T>(key: AppProvideKey<T>, value: T): ElfUIApp<RootComponent> {
      provides.set(key, value);
      return this;
    }
  };

  return app;
};

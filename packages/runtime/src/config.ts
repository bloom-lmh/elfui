// Global runtime configuration.
//
// tagPrefix is intentionally not a runtime option. Macro component tags are
// decided at compile time by @elfui/vite-plugin.

import { getCurrentInstance } from "./lifecycle";

const APP_CONFIG_KEY: unique symbol = Symbol.for("elfui.app.config") as never;

export interface ElfUIConfig {
  /** Global properties reserved for app-level conventions. */
  globalProperties: Record<string, unknown>;
  /** Global warn handler. */
  warnHandler: ((msg: string, ...args: unknown[]) => void) | null;
  /** Global error handler. */
  errorHandler: ((err: unknown, info?: string) => void) | null;
}

const config: ElfUIConfig = {
  globalProperties: {},
  warnHandler: null,
  errorHandler: null
};

/** Public API: merge runtime configuration. */
export const configure = (opts: Partial<ElfUIConfig>): void => {
  if (opts.globalProperties) {
    if (Object.keys(opts.globalProperties).length === 0) {
      config.globalProperties = {};
    } else {
      config.globalProperties = { ...config.globalProperties, ...opts.globalProperties };
    }
  }
  if (opts.warnHandler !== undefined) {
    config.warnHandler = opts.warnHandler;
  }
  if (opts.errorHandler !== undefined) {
    config.errorHandler = opts.errorHandler;
  }
};

/** Read current config as an immutable snapshot. */
export const getConfig = (): Readonly<ElfUIConfig> => ({
  globalProperties: { ...config.globalProperties },
  warnHandler: config.warnHandler,
  errorHandler: config.errorHandler
});

/** Test isolation: restore default runtime config. */
export const resetConfig = (): void => {
  config.globalProperties = {};
  config.warnHandler = null;
  config.errorHandler = null;
};

/** 从当前组件 host 向上查找 App 配置，找不到时退回 runtime 高级配置。 */
export const resolveAppConfig = (host?: Node | null): Readonly<ElfUIConfig> => {
  let current = host ?? getCurrentInstance()?.host ?? null;
  while (current) {
    const appConfig = (current as unknown as Record<symbol, ElfUIConfig | undefined>)[
      APP_CONFIG_KEY
    ];
    if (appConfig) return appConfig;
    if (current.parentNode) current = current.parentNode;
    else if (current.nodeType === 11 && "host" in current) current = (current as ShadowRoot).host;
    else break;
  }
  return config;
};

/** 将组件运行时警告交给所属 App；无 App 时保持 runtime 的 console.warn 行为。 */
export const warn = (message: string, ...args: unknown[]): void => {
  const handler = resolveAppConfig().warnHandler;
  if (handler) {
    handler(message, ...args);
    return;
  }
  console.warn(message, ...args);
};

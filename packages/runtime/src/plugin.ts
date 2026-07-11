// 插件系统 — ElfUI.use(plugin, options?)
//
// 设计：plugin 是一个对象 { install(ctx, options) } 或一个函数。
// install 时拿到一个上下文，可以注册全局指令、全局组件别名、修改配置等。

import { configure, getConfig, type ElfUIConfig } from "./config";
import { directive, type DirectiveDefinition, type DirectiveUnregister } from "./directive";

export interface ElfUIPluginContext {
  /** 注册全局指令 */
  directive(name: string, def: DirectiveDefinition): DirectiveUnregister;
  /** 修改全局配置 */
  configure(opts: Partial<ElfUIConfig>): void;
  /** 读当前配置（只读） */
  config: Readonly<ElfUIConfig>;
}

export interface ElfUIPluginObject<T = unknown> {
  install(ctx: ElfUIPluginContext, options?: T): void;
}

export type ElfUIPluginFn<T = unknown> = (ctx: ElfUIPluginContext, options?: T) => void;

export type ElfUIPlugin<T = unknown> = ElfUIPluginFn<T> | ElfUIPluginObject<T>;

const installed: WeakSet<object> = new WeakSet();

const createContext = (): ElfUIPluginContext => ({
  directive,
  configure,
  get config(): Readonly<ElfUIConfig> {
    return getConfig();
  }
});

/** 注册一个插件（幂等：同一个 plugin 实例只会装一次） */
export const usePlugin = <T>(plugin: ElfUIPlugin<T>, options?: T): void => {
  if (typeof plugin === "object" && plugin !== null && installed.has(plugin)) {
    return;
  }
  if (typeof plugin === "function" && installed.has(plugin)) {
    return;
  }

  const ctx = createContext();
  if (typeof plugin === "function") {
    plugin(ctx, options);
    installed.add(plugin as unknown as object);
  } else if (plugin && typeof plugin.install === "function") {
    plugin.install(ctx, options);
    installed.add(plugin);
  }
};

// 自定义指令系统
//
// 支持：
// - directive(name, definition) 全局注册
// - builder.directive(name, def) 局部注册（在 builder.ts 内接入）
// - 编译期识别未知 v-* 为指令调用，运行时调度
// - hooks: mounted / updated / beforeUnmount / unmounted
//
// 与 Vue 指令的对应：
// - mounted / updated / beforeUnmount / unmounted
// - el / binding（含 value、oldValue、arg、modifiers）
//
// ElfUI 不实现 created / beforeMount / beforeUpdate（用 onMounted + useEffect 完全等价）

import { effectScope, onScopeDispose, useEffect } from "@elfui/reactivity";
import { handleRuntimeError } from "./error";

const APP_DIRECTIVES_KEY: unique symbol = Symbol.for("elfui.app.directives") as never;

/** 编译器用于把组件实例级局部指令从 setup 传给渲染上下文。 */
export const ELF_LOCAL_DIRECTIVES = Symbol.for("elfui.local.directives");

export interface DirectiveBinding<V = unknown> {
  /** 当前值 */
  value: V;
  /** 上一次值 */
  oldValue: V | undefined;
  /** 参数（v-foo:arg） */
  arg?: string | undefined;
  /** 修饰符（v-foo.mod1.mod2） */
  modifiers: Readonly<Record<string, boolean>>;
}

export interface DirectiveHooks<V = unknown, El extends Element = Element> {
  /** 元素挂载到 DOM 之后调用 */
  mounted?: (el: El, binding: DirectiveBinding<V>) => void;
  /** 绑定值更新时调用 */
  updated?: (el: El, binding: DirectiveBinding<V>) => void;
  /** 卸载之前调用 */
  beforeUnmount?: (el: El, binding: DirectiveBinding<V>) => void;
  /** 卸载之后调用 */
  unmounted?: (el: El, binding: DirectiveBinding<V>) => void;
}

/** 函数形式的指令简写：等价于 { mounted: fn, updated: fn } */
export type DirectiveFn<V = unknown, El extends Element = Element> = (
  el: El,
  binding: DirectiveBinding<V>
) => void;

export type DirectiveDefinition<V = unknown, El extends Element = Element> =
  | DirectiveHooks<V, El>
  | DirectiveFn<V, El>;

export type DirectiveUnregister = () => void;
export type DirectiveDisposer = () => void;

const globalDirectives = new Map<string, DirectiveDefinition>();

/** 全局注册一个指令 */
export const directive = <V = unknown, El extends Element = Element>(
  name: string,
  def: DirectiveDefinition<V, El>
): DirectiveUnregister => {
  const stored = def as DirectiveDefinition;
  globalDirectives.set(name, stored);
  return () => {
    if (globalDirectives.get(name) === stored) {
      globalDirectives.delete(name);
    }
  };
};

/** 测试隔离 / 插件卸载：清空所有全局指令 */
export const resetDirectives = (): void => {
  globalDirectives.clear();
};

/** 查找指令定义（编译器调度用）*/
export const resolveDirective = (
  name: string,
  local?: Record<string, DirectiveDefinition>,
  host?: Node | null
): DirectiveDefinition | undefined => {
  if (local?.[name]) return local[name];

  let current = host ?? null;
  while (current) {
    const directives = (current as unknown as Record<symbol, Map<string, DirectiveDefinition>>)[
      APP_DIRECTIVES_KEY
    ];
    const definition = directives?.get(name);
    if (definition) return definition;
    if (current.parentNode) current = current.parentNode;
    else if (current.nodeType === 11 && "host" in current) current = (current as ShadowRoot).host;
    else break;
  }

  return globalDirectives.get(name);
};

/** 把 DirectiveDefinition 规范化为 hooks */
const normalizeDirective = (def: DirectiveDefinition): DirectiveHooks => {
  if (typeof def === "function") {
    return { mounted: def, updated: def };
  }
  return def;
};

/**
 * 应用一个指令到元素上。编译器会调用这个函数。
 *
 * @param el      目标元素
 * @param def     指令定义
 * @param getValue 当前值的 getter（响应式追踪）
 * @param arg     可选参数
 * @param modifiers 修饰符集合
 */
export const applyCustomDirective = <V = unknown>(
  el: Element,
  def: DirectiveDefinition<V>,
  getValue: () => V,
  arg?: string | undefined,
  modifiers: Readonly<Record<string, boolean>> = {},
  owner?: HTMLElement
): DirectiveDisposer => {
  const hooks = normalizeDirective(def as DirectiveDefinition);
  let oldValue: V | undefined = undefined;
  let mounted = false;
  let disposed = false;
  // 子作用域会自动加入当前组件、branch 或 list item 的作用域。
  // 返回的 disposer 仍允许调用方单独停止某一个指令。
  const scope = effectScope();

  scope.run(() => {
    onScopeDispose(() => {
      if (disposed) return;
      disposed = true;
      const binding: DirectiveBinding<V> = {
        value: oldValue as V,
        oldValue,
        arg,
        modifiers
      };
      try {
        hooks.beforeUnmount?.(el, binding);
      } catch (err) {
        handleRuntimeError(err, owner, "directive beforeUnmount");
      }
      try {
        hooks.unmounted?.(el, binding);
      } catch (err) {
        handleRuntimeError(err, owner, "directive unmounted");
      }
    });

    useEffect(() => {
      const value = getValue();
      const binding: DirectiveBinding<V> = { value, oldValue, arg, modifiers };
      if (!mounted) {
        // 首次：mounted 钩子
        // 用 microtask 延迟，确保 el 已经在 DOM 中（lifecycle 与 DOM 一致）
        queueMicrotask(() => {
          if (!mounted && !disposed) {
            mounted = true;
            try {
              hooks.mounted?.(el, binding);
            } catch (err) {
              handleRuntimeError(err, owner, "directive mounted");
            }
          }
        });
      } else {
        // 更新
        try {
          (hooks.updated as DirectiveHooks<V>["updated"])?.(el, binding);
        } catch (err) {
          handleRuntimeError(err, owner, "directive updated");
        }
      }
      oldValue = value;
    });
  });

  return () => scope.stop();
};

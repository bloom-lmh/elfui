// @elfui/runtime/internal — 编译产物与框架内部 helper
//
// 这个入口不作为用户主路径承诺稳定性。宏组件、离线 codegen、runtime compiler
// 和少量框架测试可以依赖它；普通组件代码优先从 `@elfui/core` / `@elfui/runtime` 导入。

export {
  attr,
  bindObject,
  cls,
  on,
  onObject,
  prop,
  sty,
  text,
  type ClassValue,
  type StyleValue
} from "./bindings";

export {
  branch,
  list,
  mark,
  show,
  type ListKeyGetter,
  type ListRender,
  type RenderBlock
} from "./control-flow";

export { renderOnce } from "./memo";

export { applyCustomDirective, resolveDirective, type DirectiveDefinition } from "./directive";

export {
  callHooks,
  createInstance,
  getCurrentInstance,
  setCurrentInstance,
  type ComponentInstance
} from "./lifecycle";

export { attachInstanceToHost, getInstanceFromHost, PROVIDES_KEY } from "./inject";

export { attachDevtoolsAppId, createDevtoolsAppId, emitDevtoolsRuntimeEvent } from "./devtools";

export {
  ELF_SCOPED_SLOTS,
  hasScopedSlot,
  setScopedSlot,
  setScopedSlots,
  useScopedSlot,
  type ScopedSlotFn
} from "./scoped-slots";

export { setTemplateRef } from "./template-ref";

export { unwrapStateAccess } from "./unwrap";

export {
  defineCustomElement,
  ensureCustomElement,
  registerComponents,
  resolveComponentTag,
  type ComponentDefinition,
  type RenderContext,
  type RenderFn
} from "./element";

export {
  dynamicComponent,
  keepAlive,
  projectLightDom,
  teleport,
  type KeepAliveOptions,
  type LightDomProjectionController,
  type LightDomProjectionOptions,
  type LightDomProjectionTarget
} from "./builtin";

export { transition, type TransitionHooks, type TransitionOptions } from "./transition";

export { transitionGroup, type TransitionGroupOptions } from "./transition-group";

export { suspense, type SuspenseSlots, type SuspenseStatus } from "./suspense";

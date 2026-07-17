// @elfui/runtime — 稳定运行时公共 API
//
// 编译产物 helper（attr/text/list/branch/unwrapStateAccess 等）已经收口到
// `@elfui/runtime/internal`，主入口只保留组件作者和链式包会直接使用的能力。

export {
  onActivated,
  onAttributeChanged,
  onBeforeMount,
  onBeforeUnmount,
  onBeforeUpdate,
  onDeactivated,
  onErrorCaptured,
  onMount,
  onMounted,
  onUnmount,
  onUnmounted,
  onUpdated,
  type AttributeChangedHook,
  type ErrorCapturedHook,
  type LifecycleHook
} from "./lifecycle";

export {
  createInjectionKey,
  hasInjectionContext,
  inject,
  provide,
  type InjectionKey
} from "./inject";

export { useScopedSlot, type ScopedSlotFn } from "./scoped-slots";

export {
  directive,
  resetDirectives,
  type DirectiveBinding,
  type DirectiveDefinition,
  type DirectiveFn,
  type DirectiveHooks,
  type DirectiveUnregister
} from "./directive";

export {
  configure,
  getConfig,
  resetConfig,
  resolveAppConfig,
  warn,
  type ElfUIConfig
} from "./config";

export {
  usePlugin,
  type ElfUIPlugin,
  type ElfUIPluginContext,
  type ElfUIPluginFn,
  type ElfUIPluginObject
} from "./plugin";

export { useModel, type ModelRef, type UseModelOptions } from "./use-model";

export { useTemplateRef } from "./template-ref";

export {
  defineExpose,
  useAppConfig,
  useAttrs,
  useClickOutside,
  useEventListener,
  useHost,
  useHostAttr,
  useHostClass,
  useHostCssVar,
  useHostFlag,
  useHostStyle,
  useRenderRoot,
  useShadowRoot,
  type HostClassValue
} from "./hooks";

export {
  useEscapeKey,
  useFocusTrap,
  useIntersectionObserver,
  useResizeObserver,
  useScrollLock,
  type ElementRefLike,
  type ObserverTarget,
  type ResizeEntry
} from "./hooks-advanced";

export {
  createFormControlContext,
  useFormControlContext,
  type FormControlContext,
  type FormControlOptions,
  type FormControlRule,
  type FormControlValidationResult,
  type FormControlValue
} from "./form-control";

export {
  defineCustomElement,
  ensureCustomElement,
  registerComponents,
  resolveComponentTag,
  type AnyPropType,
  type ComponentEmitMap,
  type ComponentRegistryInput,
  type ComponentDefinition,
  type ComponentSlotMap,
  type DefineCustomElementOptions,
  type ElfElementConstructor,
  type EmitOptions,
  type EventDispatchOptions,
  type PropOption,
  type PropsOptions,
  type PropType,
  type ResolvableComponent,
  type RenderContext,
  type RenderFn,
  type SetupContext,
  type SetupFn
} from "./element";

export {
  defineComponent,
  type DefineComponentOptions,
  type InferPropsOptions
} from "./define-component";

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

export { captureError, errorBoundary, type ErrorBoundarySlots } from "./error-boundary";

export {
  globalStyle,
  resetGlobalStyles,
  theme,
  type StyleDisposer,
  type StyleInjectionOptions,
  type ThemeTarget
} from "./theme";

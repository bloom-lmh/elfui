// @elfui/core — ElfUI 主入口（用户使用入口）
//
// 这个包做三件事：
// 1. 直接承载宏组件 API：defineHtml / defineProps / defineEmits / defineModel
// 2. 聚合常用 reactivity / runtime 用户面 API
// 3. 不注入 runtime compiler；链式 `.template()` 请使用 @elfui/chain
//
// 用户用法：
//   import { defineHtml, useRef, onMounted } from "@elfui/core";

export {
  createApp,
  type AppMountTarget,
  type AppProvideKey,
  type AppRootProps,
  type ElfUIApp,
  type ElfUIAppConfig,
  type ElfUIAppPlugin,
  type ElfUIAppPluginFn,
  type ElfUIAppPluginObject
} from "./app";

export {
  defineDirective,
  defineEmits,
  defineHtml,
  defineModel,
  defineName,
  defineOptions,
  defineProps,
  defineSlots,
  defineStyle,
  useComponents,
  useExtend,
  useVariant,
  type MacroComponentOptions,
  type MacroEmitArgs,
  type MacroEmitMap,
  type MacroEmitShape,
  type MacroEmitTupleMap,
  type MacroEmitTuples,
  type MacroEmitValue,
  type MacroExtendableComponent,
  type MacroExtensionBuilder,
  type MacroInferProps,
  type MacroModelOptions,
  type MacroSlotMap,
  type MacroUsableComponent,
  type MacroVariantConfigurator
} from "./macro";

// 响应式
//
// 注：底层 effect 原语（effect / stop / isTracking）和调度 API（queueJob / flushSync /
// queuePostFlushJob）属于内部能力，主入口不暴露；高级用户可从 `@elfui/reactivity` 直接 import。
// 响应式状态统一使用 useRef / useReactive 及其 shallow 版本。
export {
  batch,
  useComputed,
  effectScope,
  getCurrentScope,
  isProxy,
  isReactive,
  isReadonly,
  isRef,
  isState,
  markRaw,
  nextTick,
  onScopeDispose,
  onWatcherCleanup,
  readonly,
  toRaw,
  toValue,
  unref,
  useEffect,
  useReactive,
  useRef,
  useShallowReactive,
  useShallowRef,
  watch,
  watchEffect,
  watchPostEffect,
  watchSyncEffect,
  type Computed,
  type ComputedSource,
  type EffectCleanup,
  type EffectFn,
  type EffectScope,
  type EffectScopeCleanup,
  type EffectStopHandle,
  type ReadonlyComputed,
  type ReadonlyRef,
  type Reactive,
  type Ref,
  type StateMethods,
  type UseEffectOptions,
  type WatchCallback,
  type WatchCleanup,
  type WatchCleanupRegister,
  type WatchEffectFn,
  type WatchOptions,
  type WatchSource,
  type WatchSourceOldValues,
  type WatchSourceValue,
  type WatchSourceValues,
  type WatchStopHandle
} from "@elfui/reactivity";

// 兼容 Vue 命名：computed = useComputed
export { useComputed as computed } from "@elfui/reactivity";

// 稳定 runtime 用户面 API
//
// 注：底层绑定原语（attr/prop/text/cls/sty/on/branch/list/show/mark）默认不导出，
// 它们是编译产物使用的 internal API，编译器从 `@elfui/core/internal` 导入。
export {
  defineComponent,
  defineCustomElement,
  ensureCustomElement,
  registerComponents,
  resolveComponentTag,
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
  type ComponentDefinition,
  type ComponentEmitMap,
  type ElfElementConstructor,
  type ComponentSlotMap,
  type AnyPropType,
  type PropOption,
  type PropsOptions,
  type PropType,
  type ComponentRegistryInput,
  type RenderContext,
  type RenderFn,
  type SetupContext,
  type SetupFn
} from "@elfui/runtime";

// 宏组件 / 对象式命名入口：主包使用 use*，链式包仍使用 extend / variant。
export { theme as useTheme } from "@elfui/runtime";

// 协作能力 + 常用 host / form helper
//
// 注：以下属于 internal / 编译产物使用的 API，主入口不再导出，
// 编译产物从 `@elfui/core/internal` 导入：
// - applyCustomDirective / resolveDirective（编译产物）
// - setScopedSlot / setScopedSlots / hasScopedSlot（编译产物）
// - teleport / transition / transitionGroup / keepAlive / suspense / dynamicComponent（编译产物 helper）
export {
  // Light DOM 投射：ui-kit Dialog/Drawer 和宏组件迁移兼容主路径会用到。
  projectLightDom,
  // 自定义指令注册（用户层）
  directive,
  type DirectiveBinding,
  type DirectiveDefinition,
  type DirectiveFn,
  type DirectiveHooks,
  type DirectiveUnregister,
  // provide / inject
  provide,
  inject,
  hasInjectionContext,
  createInjectionKey,
  // 应用配置与插件
  configure,
  getConfig,
  usePlugin,
  type ElfUIPlugin,
  type ElfUIPluginContext,
  type ElfUIPluginFn,
  type ElfUIPluginObject,
  // 作用域 slot 消费（用户层）
  useScopedSlot,
  // 配置 / 插件
  // useTemplateRef — 模板引用
  useTemplateRef,
  // 双向模型
  useModel,
  type UseModelOptions,
  // 全局 setup helpers
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
  type HostClassValue,
  // 高阶交互 hooks
  useEscapeKey,
  useFocusTrap,
  useIntersectionObserver,
  useResizeObserver,
  useScrollLock,
  type ElementRefLike,
  type ObserverTarget,
  type ResizeEntry,
  // formControl
  createFormControlContext,
  useFormControlContext,
  // 错误边界
  captureError,
  errorBoundary,
  // 内建渲染能力（用户层封装与高级组件可直接使用）
  dynamicComponent,
  keepAlive,
  suspense,
  teleport,
  transition,
  transitionGroup,
  type KeepAliveOptions,
  type SuspenseSlots,
  type SuspenseStatus,
  type TransitionHooks,
  type TransitionOptions,
  type TransitionGroupOptions,
  // 主题样式
  globalStyle,
  resetGlobalStyles,
  theme,
  type DefineComponentOptions,
  type ElfUIConfig,
  type EmitOptions,
  type EventDispatchOptions,
  type FormControlContext,
  type FormControlOptions,
  type FormControlRule,
  type FormControlValidationResult,
  type FormControlValue,
  type ErrorBoundarySlots,
  type InferPropsOptions,
  type StyleDisposer,
  type StyleInjectionOptions,
  type ThemeTarget,
  type InjectionKey,
  type LightDomProjectionController,
  type LightDomProjectionOptions,
  type LightDomProjectionTarget,
  type ModelRef,
  type ScopedSlotFn
} from "@elfui/runtime";

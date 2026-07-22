// Custom Element 包壳
//
// 设计：
// - defineCustomElement(definition) 返回 CustomElementConstructor
// - 内部继承 HTMLElement，实现 connectedCallback / disconnectedCallback /
//   attributeChangedCallback
// - 创建 ShadowRoot（默认 open；可选 closed）
// - 样式注入：优先 adoptedStyleSheets，fallback 到 <style>
// - 重连复用 shadow root（不重复 attachShadow，不重复注入样式）
// - 整个组件运行在 effectScope 内，断开时 scope.stop 自动清理
//
// 链式 API 兼容：
// - definition 由 createComponent() 链式 builder 收集
// - props / setup / template-render / styles / formAssociated 等都通过 definition 传入

import {
  effectScope,
  isRef,
  isState,
  useReactive,
  useShallowRef,
  type useRef
} from "@elfui/reactivity";

import { getHostAttrs, disposeHostAttrs } from "./attrs";
import { DEV as __DEV__ } from "./dev";
import { ELF_KEEP_ALIVE_FLAG, ELF_KEEP_ALIVE_RELEASE } from "./builtin";
import { resolveAppConfig, type ElfUIConfig } from "./config";
import { handleRuntimeError } from "./error";
import {
  createFormControlContext,
  type FormControlContext,
  type FormControlOptions
} from "./form-control";
import { attachInstanceToHost, detachInstanceFromHost, findParentInstance } from "./inject";
import { clearTemplateRefs } from "./template-ref";
import {
  callHooks,
  callMountedCleanups,
  createInstance,
  getCurrentInstance,
  setCurrentInstance,
  type ComponentInstance
} from "./lifecycle";
import {
  connectDevtoolsComponent,
  disconnectDevtoolsComponent,
  emitDevtoolsRuntimeEvent,
  withDevtoolsComponentContext
} from "./devtools";
import {
  buildRenderCtx,
  coerceAttr,
  createEmit,
  createPropsProxy,
  findUnsetupParent,
  injectStyles,
  kebab,
  normalizeProps,
  resolveDefault,
  resolveLocalComponent
} from "./element-helpers";

/** Prop 选项 */
export interface PropOption<T = unknown> {
  /** 类型构造器；传 null 或 undefined 表示不做类型强制（保留 attribute 字符串） */
  type?: ([unknown] extends [T] ? AnyPropType : PropType<T>) | null;
  default?: T | (() => T);
  required?: boolean;
}

export type PropType<T> =
  | (T extends string ? StringConstructor : never)
  | (T extends number ? NumberConstructor : never)
  | (T extends boolean ? BooleanConstructor : never)
  | (T extends unknown[] ? ArrayConstructor : never)
  | (T extends (...args: unknown[]) => unknown ? FunctionConstructor : never)
  | (T extends object ? ObjectConstructor : never)
  | (new (...args: unknown[]) => T);

export type AnyPropType =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | ArrayConstructor
  | ObjectConstructor
  | FunctionConstructor
  | (new (...args: unknown[]) => unknown);

export type PropsOptions = Record<string, AnyPropType | PropOption<unknown>>;

/** setup 函数签名 — 可同步返回对象，也可返回 Promise（异步 setup）*/
export type SetupFn = (
  props: Record<string, unknown>,
  ctx: SetupContext
) => Record<string, unknown> | void | Promise<Record<string, unknown> | void>;

export interface SetupContext {
  emit(event: string, ...args: unknown[]): boolean;
  host: HTMLElement;
  shadow: ShadowRoot | null;
  attrs: Readonly<Record<string, string>>;
  /** 所属 App 配置；globalProperties 可用于组件作者约定。 */
  config: Readonly<ElfUIConfig>;
  /** 表单控制器（仅在 formControl=true 时有） */
  form?: FormControlContext;
}

/** render 函数签名：拿到 ctx 返回根 DOM 节点 */
export type RenderFn = (ctx: RenderContext) => Node;

export interface RenderContext {
  /** setup 返回的对象 + props（自动解包） */
  state: Record<string, unknown>;
  /** 原始 props */
  props: Record<string, unknown>;
  /** 工具：emit / host / shadow */
  emit(event: string, ...args: unknown[]): boolean;
  host: HTMLElement;
  shadow: ShadowRoot | null;
  /** 局部自定义指令注册表（来自 definition.directives）；编译器解析 v-* 时优先于全局 */
  directives?: Record<string, unknown>;
  /** 局部子组件注册表（来自 definition.components）；模板里可直接写 PascalCase 别名 */
  components?: ComponentDefinition["components"];
}

export interface EventDispatchOptions {
  /** 事件是否沿 DOM 树冒泡；默认 false。 */
  bubbles?: boolean;
  /** 事件是否可由 preventDefault() 取消；默认 false。 */
  cancelable?: boolean;
  /** 事件是否能穿过 Shadow DOM 边界；默认 false。 */
  composed?: boolean;
}

export interface EmitOptions extends EventDispatchOptions {
  /**
   * 是否把单参数事件直接写入 CustomEvent.detail。
   * 默认 true：ctx.emit("change", value) -> detail === value；
   * 设为 false 时兼容旧语义：detail 始终为参数数组。
   */
  rawDetail?: boolean;
  /** 按事件名覆盖组件级 dispatch 选项。 */
  events?: Readonly<Record<string, EventDispatchOptions>>;
}

export interface ComponentDefinition {
  /** Custom Element 标签名（如 "elf-counter"） */
  tag: string;
  /** props 类型声明（含默认值、类型转换） */
  props?: PropsOptions;
  /** 事件白名单 */
  emits?: string[];
  /** 事件 detail 行为选项。默认单参数直接透传；rawDetail=false 时使用旧数组包装。 */
  emitOptions?: EmitOptions;
  /** setup 函数 */
  setup?: SetupFn;
  /** 渲染函数（编译产物或手写） */
  render?: RenderFn;
  /** Shadow DOM 样式（CSS 字符串数组） */
  styles?: string[];
  /** Shadow mode：默认 open */
  shadow?: "open" | "closed" | false;
  /** form 关联（formAssociated）；可传 boolean 或 FormControlOptions */
  formControl?: boolean | FormControlOptions<any>;
  /** 局部子组件注册：{ AliasName: 构造器 | 标签名 } */
  components?: Record<string, string | CustomElementConstructor>;
  /** 局部自定义指令注册：{ name: DirectiveDefinition } */
  directives?: Record<string, unknown>;
}

export type ComponentEmitMap = Record<string, unknown[]>;
export type ComponentSlotMap = object;

/** 由 defineCustomElement 返回的构造器 */
export interface ElfElementConstructor<
  Props extends object = Record<string, unknown>,
  Emits extends ComponentEmitMap = ComponentEmitMap,
  Slots extends ComponentSlotMap = ComponentSlotMap
> extends CustomElementConstructor {
  __elfDefinition: ComponentDefinition;
  /** 仅类型层使用：给 IDE / 类型工具读取组件 props。 */
  readonly __elfProps?: Readonly<Props>;
  /** 仅类型层使用：给 IDE / 类型工具读取组件 emits。 */
  readonly __elfEmits?: Emits;
  /** 仅类型层使用：给 IDE / 类型工具读取组件 slots。 */
  readonly __elfSlots?: Slots;
}

export interface DefineCustomElementOptions {
  /** 默认 true；传 false 时只返回构造器，不写入 customElements registry。 */
  register?: boolean;
}

type SSRPlaceholderConstructor = ElfElementConstructor & {
  readonly __elfSSRPlaceholder: true;
};

const createSSRPlaceholder = (definition: ComponentDefinition): SSRPlaceholderConstructor => {
  class ElfSSRPlaceholder {}

  const placeholder = ElfSSRPlaceholder as unknown as SSRPlaceholderConstructor;
  Object.defineProperties(placeholder, {
    __elfDefinition: { value: definition },
    __elfSSRPlaceholder: { value: true }
  });
  return placeholder;
};

/** 把 definition 转成原生 CustomElementConstructor */
export const defineCustomElement = (
  definition: ComponentDefinition,
  options: DefineCustomElementOptions = {}
): ElfElementConstructor => {
  // SSR evaluates compiled component modules too. Return a metadata-only constructor so package
  // and component imports remain safe; the browser bundle evaluates the same module again with
  // HTMLElement available and receives the real Custom Element constructor.
  if (typeof HTMLElement === "undefined") {
    return createSSRPlaceholder(definition);
  }

  const propEntries = normalizeProps(definition.props ?? {});
  const propsByAttribute = new Map(
    propEntries.map(([key, option]) => [kebab(key), { key, option }] as const)
  );
  const observedAttrs = Array.from(propsByAttribute.keys());

  class ElfElement extends HTMLElement {
    public static observedAttributes = observedAttrs;
    public static formAssociated = !!definition.formControl;

    private __scope: ReturnType<typeof effectScope> | null = null;
    private __instance: ComponentInstance | null = null;
    private __propStates: Map<string, ReturnType<typeof useRef>> = new Map();
    private __preMountPropValues = new Map<string, unknown>();
    private __shadow: ShadowRoot | null = null;
    private __mounted = false;
    private __stylesInjected = false;
    private __renderedNodes: Node[] = [];
    private __mountVersion = 0;
    public __setupDone = false;
    public __pendingChildren: (() => void)[] = [];

    public constructor() {
      super();
      // 在构造时不做 setup —— 等 connectedCallback 时再做
      // 但要确保 shadow 提前可用（attribute 转 prop 需要）
      if (definition.shadow !== false) {
        this.__shadow = this.attachShadow({ mode: definition.shadow ?? "open" });
      }
      // 初始化 prop states 为默认值
      for (const [key, opt] of propEntries) {
        const def = resolveDefault(opt);
        // Props are shallow by contract: replacing a property is reactive, while objects and
        // arrays retain the identity owned by a native/framework host.
        this.__propStates.set(key, useShallowRef(def));
      }
      // Host frameworks such as React decide whether to assign a Custom Element value as a
      // property by checking the freshly constructed element. Expose accessors now rather than
      // waiting for connectedCallback, while retaining pre-mount values so they can win over
      // initial attributes deterministically.
      for (const [key] of propEntries) {
        let upgradedValue: unknown;
        let hasUpgradedValue = false;
        if (Object.prototype.hasOwnProperty.call(this, key)) {
          upgradedValue = (this as unknown as Record<string, unknown>)[key];
          hasUpgradedValue = true;
          delete (this as unknown as Record<string, unknown>)[key];
        }
        Object.defineProperty(this, key, {
          get: () => {
            const state = this.__propStates.get(key);
            if (!state) return undefined;
            if (isRef(state)) return (state as { peek: () => unknown }).peek();
            return state;
          },
          set: (value: unknown) => {
            if (!this.__mounted) this.__preMountPropValues.set(key, value);
            if (isState(value)) {
              this.__propStates.set(key, value as unknown as ReturnType<typeof useRef>);
              return;
            }
            const state = this.__propStates.get(key);
            if (state && isRef(state)) {
              (state as { set: (nextValue: unknown) => unknown }).set(value);
            }
          },
          enumerable: true,
          configurable: true
        });
        if (hasUpgradedValue) {
          (this as unknown as Record<string, unknown>)[key] = upgradedValue;
        }
      }
    }

    public connectedCallback(): void {
      (this as unknown as Record<symbol, unknown>)[ELF_KEEP_ALIVE_RELEASE] = undefined;
      if (this.__mounted) return;
      this.__mounted = true;
      const mountVersion = ++this.__mountVersion;

      const start = () => {
        if (!this.isConnected || !this.__mounted || mountVersion !== this.__mountVersion) return;
        const scope = effectScope(true);
        this.__scope = scope;
        const instance = createInstance(
          this,
          this.__shadow,
          findParentInstance(this) ?? getCurrentInstance()
        );
        this.__instance = instance;
        instance.handleError = (error, info) => {
          handleRuntimeError(error, instance, info);
        };
        // 把 instance 挂到 host 上，以便 inject 能沿父链查找
        attachInstanceToHost(this, instance);
        if (__DEV__) connectDevtoolsComponent(instance);

        scope.run(() => {
          // 同步 attribute 到 prop
          for (const [attrName, { key, option }] of propsByAttribute) {
            if (this.hasAttribute(attrName)) {
              const raw = this.getAttribute(attrName);
              const state = this.__propStates.get(key);
              state?.set(coerceAttr(raw, option, attrName));
            }
          }

          // Initial attributes are parsed first; host property writes made before connection then
          // win consistently, including values assigned by React during its commit.
          for (const [key, value] of this.__preMountPropValues) {
            (this as unknown as Record<string, unknown>)[key] = value;
          }
          this.__preMountPropValues.clear();

          // 构造 props（解包后的对象）
          const props = createPropsProxy(this.__propStates);
          if (__DEV__) instance.devtools.props = props;
          const emit = createEmit(this, definition.emitOptions);
          const ctx: SetupContext = {
            emit,
            host: this,
            shadow: this.__shadow,
            attrs: getHostAttrs(this),
            config: resolveAppConfig(this)
          };

          // 如果声明了 formControl，注入 form 控制器
          if (definition.formControl) {
            const formOptions: FormControlOptions =
              typeof definition.formControl === "object" ? definition.formControl : {};
            ctx.form = createFormControlContext(this, formOptions);
            instance.form = ctx.form;
          }

          // 注入样式
          if (
            !this.__stylesInjected &&
            this.__shadow &&
            definition.styles &&
            definition.styles.length > 0
          ) {
            injectStyles(this.__shadow, definition.styles);
            this.__stylesInjected = true;
          }

          // setup
          const prev = setCurrentInstance(instance);
          try {
            const setupReturned = definition.setup ? definition.setup(props, ctx) : undefined;

            // 检查 async setup
            const isAsync =
              setupReturned !== undefined &&
              setupReturned !== null &&
              typeof (setupReturned as { then?: unknown }).then === "function";

            if (isAsync) {
              // 异步 setup：先挂 placeholder，等 resolve 后再真正 render
              // 暴露 $asyncPending / $asyncError / $asyncResolved 给模板
              const asyncState = useReactive({
                $asyncPending: true,
                $asyncError: null as unknown,
                $asyncResolved: false
              });
              if (__DEV__) {
                instance.devtools.setup = asyncState as unknown as Record<string, unknown>;
              }

              const target: ShadowRoot | HTMLElement = this.__shadow ?? this;
              let pendingRenderScope: ReturnType<typeof effectScope> | null = null;

              // pending 期：渲染 fallback（如果 render 函数传 ctx.state.$asyncPending）
              const pendingCtx: RenderContext = buildRenderCtx(
                this,
                this.__shadow,
                props,
                asyncState as unknown as Record<string, unknown>,
                emit,
                definition.directives,
                definition.components
              );
              if (definition.render) {
                pendingRenderScope = effectScope();
                pendingRenderScope.run(() => {
                  const node = definition.render!(pendingCtx);
                  this.__appendRenderedNode(target, node);
                });
              }

              (setupReturned as Promise<Record<string, unknown> | void>).then(
                (resolvedState) => {
                  if (!this.isConnected || !this.__mounted || mountVersion !== this.__mountVersion)
                    return;
                  pendingRenderScope?.stop();
                  pendingRenderScope = null;
                  asyncState.$asyncPending = false;
                  asyncState.$asyncResolved = true;
                  if (__DEV__) {
                    instance.devtools.setup = {
                      ...(asyncState as unknown as Record<string, unknown>),
                      ...(resolvedState ?? {})
                    };
                  }
                  scope.run(() => {
                    const asyncPrev = setCurrentInstance(instance);
                    try {
                      callHooks(instance.beforeMountHooks, instance, "component beforeMount hook");
                      this.__rerenderAsync(
                        asyncState as unknown as Record<string, unknown>,
                        props,
                        ctx,
                        resolvedState
                      );
                      this.__finishMount(instance);
                    } catch (err) {
                      clearTemplateRefs(instance);
                      handleRuntimeError(err, instance, "component async render");
                    } finally {
                      setCurrentInstance(asyncPrev);
                    }
                  });
                },
                (err) => {
                  if (mountVersion !== this.__mountVersion) return;
                  if (!this.isConnected || !this.__mounted) return;
                  pendingRenderScope?.stop();
                  pendingRenderScope = null;
                  asyncState.$asyncPending = false;
                  asyncState.$asyncError = err;
                  scope.run(() => {
                    const asyncPrev = setCurrentInstance(instance);
                    try {
                      this.__rerenderAsync(
                        asyncState as unknown as Record<string, unknown>,
                        props,
                        ctx,
                        undefined
                      );
                    } catch (renderError) {
                      clearTemplateRefs(instance);
                      handleRuntimeError(renderError, instance, "component async error render");
                    } finally {
                      setCurrentInstance(asyncPrev);
                    }
                  });
                  handleRuntimeError(err, instance, "component async setup");
                }
              );
            } else {
              // 同步 setup
              const setupResult = setupReturned as Record<string, unknown> | void;
              if (__DEV__) instance.devtools.setup = setupResult ?? {};
              if (definition.render) {
                const renderCtx: RenderContext = buildRenderCtx(
                  this,
                  this.__shadow,
                  props,
                  setupResult ?? {},
                  emit,
                  definition.directives,
                  definition.components
                );
                callHooks(instance.beforeMountHooks, instance, "component beforeMount hook");
                const rootNode = definition.render(renderCtx);
                const target: ShadowRoot | HTMLElement = this.__shadow ?? this;
                this.__appendRenderedNode(target, rootNode);
              }
              this.__finishMount(instance);
            }
          } catch (err) {
            clearTemplateRefs(instance);
            handleRuntimeError(err, instance, "component setup/render");
          } finally {
            setCurrentInstance(prev);
          }
        });

        this.__setupDone = true;
        const pending = this.__pendingChildren;
        this.__pendingChildren = [];
        for (const childStart of pending) {
          childStart();
        }
      };

      const parent = findUnsetupParent(this);
      if (parent) {
        parent.__pendingChildren.push(start);
      } else {
        start();
      }
    }

    public disconnectedCallback(): void {
      if (!this.__mounted || !this.__instance) return;
      // 给一个微任务窗口让 dom move 不触发 unmount
      // 如果只是临时移动，元素会很快被重新 connect
      queueMicrotask(() => {
        if (this.isConnected) return;
        // 处于 KeepAlive 缓存中：跳过卸载
        const keepAliveHost = this as unknown as Record<symbol, unknown>;
        if (keepAliveHost[ELF_KEEP_ALIVE_FLAG]) {
          keepAliveHost[ELF_KEEP_ALIVE_RELEASE] = () => this.__finalizeUnmount();
          return;
        }
        this.__finalizeUnmount();
      });
    }

    private __finalizeUnmount(): void {
      if (this.isConnected || !this.__mounted || !this.__instance) return;
      (this as unknown as Record<symbol, unknown>)[ELF_KEEP_ALIVE_RELEASE] = undefined;
      this.__mountVersion++;
      callHooks(
        this.__instance.beforeUnmountHooks,
        this.__instance,
        "component beforeUnmount hook"
      );
      callMountedCleanups(this.__instance);
      this.__instance.isUnmounted = true;
      this.__scope?.stop();
      this.__scope = null;
      clearTemplateRefs(this.__instance);
      this.__clearRenderedNodes();
      callHooks(this.__instance.unmountedHooks, this.__instance, "component unmounted hook");
      if (__DEV__) {
        emitDevtoolsRuntimeEvent({ type: "component:unmount", host: this });
        disconnectDevtoolsComponent(this.__instance);
      }
      disposeHostAttrs(this);
      this.__instance.parent = null;
      detachInstanceFromHost(this, this.__instance);
      this.__instance = null;
      this.__mounted = false;

      // 重置 setup 状态
      this.__setupDone = false;
      this.__pendingChildren = [];
    }

    /** 异步 setup resolve/reject 后，重新渲染 shadow root */
    private __appendRenderedNode(target: ShadowRoot | HTMLElement, node: Node): void {
      const nodes =
        node.nodeType === 11 /* DOCUMENT_FRAGMENT_NODE */ ? Array.from(node.childNodes) : [node];
      target.appendChild(node);
      this.__renderedNodes = nodes;
    }

    private __clearRenderedNodes(): void {
      for (const node of this.__renderedNodes) {
        node.parentNode?.removeChild(node);
      }
      this.__renderedNodes = [];
    }

    private __finishMount(instance: ComponentInstance): void {
      if (
        instance.isMounted ||
        instance.isUnmounted ||
        this.__instance !== instance ||
        !this.isConnected
      ) {
        return;
      }
      instance.isMounted = true;
      callHooks(instance.mountedHooks, instance, "component mounted hook", true);
      if (__DEV__) {
        const hostRef = new WeakRef(this);
        const instanceRef = new WeakRef(instance);
        const source = (
          this.constructor as typeof HTMLElement & {
            __elfSource?: {
              file: string;
              line: number;
              column: number;
              endLine?: number;
              endColumn?: number;
            };
          }
        ).__elfSource;
        emitDevtoolsRuntimeEvent({
          type: "component:mount",
          component: {
            id: instance.devtools.id,
            host: this,
            appId: instance.devtools.appId,
            parentId: instance.devtools.parentId,
            parentHost: instance.devtools.parentHost?.deref() ?? null,
            tag: definition.tag,
            displayName: definition.tag,
            shadowMode: definition.shadow === false ? "none" : (definition.shadow ?? "open"),
            ...(source ? { source } : {}),
            props: () => instanceRef.deref()?.devtools.props ?? {},
            attrs: () =>
              Object.fromEntries(
                Array.from(hostRef.deref()?.attributes ?? [], (attribute) => [
                  attribute.name,
                  attribute.value
                ])
              ),
            setup: () => instanceRef.deref()?.devtools.setup ?? {},
            exposed: () => instanceRef.deref()?.devtools.exposed ?? {}
          }
        });
      }
    }

    private __rerenderAsync(
      asyncState: Record<string, unknown>,
      props: Record<string, unknown>,
      ctx: SetupContext,
      resolvedState: Record<string, unknown> | void
    ): void {
      if (!definition.render) return;
      const target: ShadowRoot | HTMLElement = this.__shadow ?? this;

      this.__clearRenderedNodes();

      const renderCtx: RenderContext = buildRenderCtx(
        this,
        this.__shadow,
        props,
        { ...asyncState, ...(resolvedState ?? {}) },
        ctx.emit,
        definition.directives,
        definition.components
      );
      const render = (): Node => definition.render!(renderCtx);
      const rootNode =
        __DEV__ && this.__instance
          ? withDevtoolsComponentContext(this.__instance.devtools.id, render)
          : render();
      this.__appendRenderedNode(target, rootNode);
    }

    public attributeChangedCallback(
      name: string,
      oldVal: string | null,
      newVal: string | null
    ): void {
      const prop = propsByAttribute.get(name);
      if (prop) {
        const state = this.__propStates.get(prop.key);
        state?.set(coerceAttr(newVal, prop.option, name));
      }
      if (this.__instance) {
        for (const fn of this.__instance.attrChangedHooks) {
          try {
            fn(name, oldVal, newVal);
          } catch (err) {
            handleRuntimeError(err, this.__instance, "component attributeChanged hook");
          }
        }
      }
    }
  }

  (ElfElement as unknown as { __elfDefinition: ComponentDefinition }).__elfDefinition = definition;

  // Missing customElements may be temporary while a polyfill is loading. Keep component module
  // evaluation safe and let an explicit ensureCustomElement/createApp call report the boundary.
  if (options.register !== false && typeof customElements !== "undefined") {
    ensureCustomElement(ElfElement as unknown as ElfElementConstructor);
  }

  return ElfElement as unknown as ElfElementConstructor;
};

export type ResolvableComponent = string | CustomElementConstructor;
export type ComponentRegistryInput =
  | ResolvableComponent
  | ResolvableComponent[]
  | Record<string, ResolvableComponent>;

/** 注册构造器（如果还未注册），并返回它的真实自定义元素标签名。 */
export const ensureCustomElement = (component: ResolvableComponent): string => {
  if (typeof component === "string") return component;
  const definition = (component as unknown as { __elfDefinition?: ComponentDefinition })
    .__elfDefinition;
  const tag = definition?.tag;
  if (!tag) {
    return (component as unknown as { name?: string }).name ?? "";
  }
  if (typeof customElements === "undefined") {
    throw new Error(
      `[ELF_CUSTOM_ELEMENTS_UNAVAILABLE] Cannot register "${tag}" outside a browser Custom Elements environment. ElfUI package and component imports are SSR-safe, but DOM creation and registration are client-only.`
    );
  }
  if ((component as unknown as { __elfSSRPlaceholder?: boolean }).__elfSSRPlaceholder) {
    throw new Error(
      `[ELF_SSR_PLACEHOLDER] Cannot register the server placeholder for "${tag}". Evaluate the component module in the client bundle after HTMLElement is available.`
    );
  }

  const registered = customElements.get(tag);
  if (registered && registered !== component) {
    throw new Error(
      `[ELF_CUSTOM_ELEMENT_CONFLICT] Cannot register "${tag}" because the tag already uses a different constructor. Give the component a unique tag/name prefix, or ensure only one component/runtime version owns that tag.`
    );
  }
  if (!registered) {
    customElements.define(tag, component);
  }
  return tag;
};

/** 把模板标签名映射到局部组件的真实 custom element tag，并确保只注册一次。 */
export const resolveComponentTag = (
  tag: string,
  components?: ComponentDefinition["components"]
): string => {
  const component = resolveLocalComponent(tag, components);
  if (!component) return tag;
  return ensureCustomElement(component);
};

/** 批量注册组件库导出的未注册组件；对象 key 只用于组织，不影响组件自身 tag。 */
export const registerComponents = (...inputs: ComponentRegistryInput[]): void => {
  for (const input of inputs) {
    if (Array.isArray(input)) {
      registerComponents(...input);
      continue;
    }
    if (typeof input === "object" && input !== null && typeof input !== "function") {
      registerComponents(...Object.values(input));
      continue;
    }
    ensureCustomElement(input as ResolvableComponent);
  }
};

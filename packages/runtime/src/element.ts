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

import { effectScope, isRef, isState, useReactive, useRef } from "@elfui/reactivity";

import { getHostAttrs, disposeHostAttrs } from "./attrs";
import { ELF_KEEP_ALIVE_FLAG } from "./builtin";
import { resolveAppConfig, type ElfUIConfig } from "./config";
import {
  createFormControlContext,
  type FormControlContext,
  type FormControlOptions
} from "./form-control";
import { attachInstanceToHost } from "./inject";
import { callHooks, createInstance, setCurrentInstance, type ComponentInstance } from "./lifecycle";
import {
  connectDevtoolsComponent,
  disconnectDevtoolsComponent,
  emitDevtoolsRuntimeEvent,
  withDevtoolsComponentContext
} from "./devtools";

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
  emit(event: string, ...args: unknown[]): void;
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
  emit(event: string, ...args: unknown[]): void;
  host: HTMLElement;
  shadow: ShadowRoot | null;
  /** 局部自定义指令注册表（来自 definition.directives）；编译器解析 v-* 时优先于全局 */
  directives?: Record<string, unknown>;
  /** 局部子组件注册表（来自 definition.components）；模板里可直接写 PascalCase 别名 */
  components?: ComponentDefinition["components"];
}

export interface EmitOptions {
  /**
   * 是否把单参数事件直接写入 CustomEvent.detail。
   * 默认 true：ctx.emit("change", value) -> detail === value；
   * 设为 false 时兼容旧语义：detail 始终为参数数组。
   */
  rawDetail?: boolean;
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

/** 把 definition 转成原生 CustomElementConstructor */
export const defineCustomElement = (
  definition: ComponentDefinition,
  options: DefineCustomElementOptions = {}
): ElfElementConstructor => {
  const propEntries = normalizeProps(definition.props ?? {});
  const observedAttrs = propEntries.map(([key]) => kebab(key));

  class ElfElement extends HTMLElement {
    public static observedAttributes = observedAttrs;
    public static formAssociated = !!definition.formControl;

    private __scope: ReturnType<typeof effectScope> | null = null;
    private __instance: ComponentInstance | null = null;
    private __propStates: Map<string, ReturnType<typeof useRef>> = new Map();
    private __shadow: ShadowRoot | null = null;
    private __mounted = false;
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
        this.__propStates.set(key, useRef(def, `prop:${key}`));
      }
    }

    public connectedCallback(): void {
      if (this.__mounted) return;
      this.__mounted = true;

      const start = () => {
        const scope = effectScope(true);
        this.__scope = scope;
        const instance = createInstance(this, this.__shadow);
        this.__instance = instance;
        // 把 instance 挂到 host 上，以便 inject 能沿父链查找
        attachInstanceToHost(this, instance);
        if (__DEV__) connectDevtoolsComponent(instance);

        scope.run(() => {
          // 同步 attribute 到 prop
          for (const [key, opt] of propEntries) {
            const attrName = kebab(key);
            if (this.hasAttribute(attrName)) {
              const raw = this.getAttribute(attrName);
              const state = this.__propStates.get(key);
              state?.set(coerceAttr(raw, opt));
            }
          }

          // 暴露 host property: this[propName]
          // 注意：用户可能在 appendChild 前已经 host[prop] = X 写入值（pre-mount 写）。
          // 此时已经存在 own property，直接 defineProperty 会触发 TypeError 或被跳过。
          // 处理：先捕获 own value、删掉它，再 defineProperty，最后通过 setter 把值写回。
          for (const [key] of propEntries) {
            let preMountValue: unknown = undefined;
            let hasPreMount = false;
            if (Object.prototype.hasOwnProperty.call(this, key)) {
              preMountValue = (this as unknown as Record<string, unknown>)[key];
              hasPreMount = true;
              delete (this as unknown as Record<string, unknown>)[key];
            }
            Object.defineProperty(this, key, {
              get: () => {
                const s = this.__propStates.get(key);
                if (!s) return undefined;
                if (isRef(s)) return (s as { peek: () => unknown }).peek();
                return s;
              },
              set: (v: unknown) => {
                // 如果传入的本身就是一个 State（例如父组件 useReactive / useRef 后直接绑定），
                // 用引用替换：丢掉原 propState，改用传入的 State 作为新 propState。
                // 这样后续父组件对原 State 的修改能直接反映到 props.X。
                if (isState(v)) {
                  this.__propStates.set(key, v as unknown as ReturnType<typeof useRef>);
                  return;
                }
                const s = this.__propStates.get(key);
                if (s && isRef(s)) (s as { set: (v: unknown) => unknown }).set(v);
              },
              enumerable: true,
              configurable: true
            });
            // 把 pre-mount 写入的值通过 setter 走一遍，让 State 引用替换 / 普通值同步生效
            if (hasPreMount) {
              (this as unknown as Record<string, unknown>)[key] = preMountValue;
            }
          }

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
          if (this.__shadow && definition.styles && definition.styles.length > 0) {
            injectStyles(this.__shadow, definition.styles);
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
                callHooks(instance.beforeMountHooks);
                const node = definition.render(pendingCtx);
                target.appendChild(node);
              }

              (setupReturned as Promise<Record<string, unknown> | void>).then(
                (resolvedState) => {
                  if (!this.isConnected) return;
                  asyncState.$asyncPending = false;
                  asyncState.$asyncResolved = true;
                  if (__DEV__) {
                    instance.devtools.setup = {
                      ...(asyncState as unknown as Record<string, unknown>),
                      ...(resolvedState ?? {})
                    };
                  }
                  this.__rerenderAsync(
                    asyncState as unknown as Record<string, unknown>,
                    props,
                    ctx,
                    resolvedState
                  );
                },
                (err) => {
                  if (!this.isConnected) {
                    handleError(instance, err);
                    return;
                  }
                  asyncState.$asyncPending = false;
                  asyncState.$asyncError = err;
                  this.__rerenderAsync(
                    asyncState as unknown as Record<string, unknown>,
                    props,
                    ctx,
                    undefined
                  );
                  handleError(instance, err);
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
                callHooks(instance.beforeMountHooks);
                const rootNode = definition.render(renderCtx);
                const target: ShadowRoot | HTMLElement = this.__shadow ?? this;
                target.appendChild(rootNode);
              }
            }
          } catch (err) {
            handleError(instance, err);
          } finally {
            setCurrentInstance(prev);
          }

          instance.isMounted = true;
          callHooks(instance.mountedHooks);
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
        if ((this as unknown as Record<symbol, unknown>)[ELF_KEEP_ALIVE_FLAG]) return;
        if (this.__instance) {
          callHooks(this.__instance.beforeUnmountHooks);
          this.__instance.isUnmounted = true;
        }
        this.__scope?.stop();
        if (this.__instance) callHooks(this.__instance.unmountedHooks);
        if (__DEV__) {
          emitDevtoolsRuntimeEvent({ type: "component:unmount", host: this });
          if (this.__instance) disconnectDevtoolsComponent(this.__instance);
        }
        disposeHostAttrs(this);
        this.__mounted = false;

        // 重置 setup 状态
        this.__setupDone = false;
        this.__pendingChildren = [];
      });
    }

    /** 异步 setup resolve/reject 后，重新渲染 shadow root */
    private __rerenderAsync(
      asyncState: Record<string, unknown>,
      props: Record<string, unknown>,
      ctx: SetupContext,
      resolvedState: Record<string, unknown> | void
    ): void {
      if (!definition.render) return;
      const target: ShadowRoot | HTMLElement = this.__shadow ?? this;

      // 清空 target 内已渲染节点（保留 <style> 注入节点 / adoptedStyleSheets 不变）
      // adoptedStyleSheets 模式下，target.children 都是用户内容，可以直接 innerHTML = ""
      // <style> fallback 模式下，需要保留 <style>
      const children = Array.from(target.childNodes);
      for (const node of children) {
        if (node.nodeType === 1 && (node as Element).tagName === "STYLE") continue;
        target.removeChild(node);
      }

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
      target.appendChild(rootNode);
    }

    public attributeChangedCallback(
      name: string,
      oldVal: string | null,
      newVal: string | null
    ): void {
      const propKey = camel(name);
      const opt = propEntries.find(([k]) => k === propKey)?.[1];
      if (opt) {
        const s = this.__propStates.get(propKey);
        if (s) (s as { set: (v: unknown) => unknown }).set(coerceAttr(newVal, opt));
      }
      if (this.__instance) {
        for (const fn of this.__instance.attrChangedHooks) {
          try {
            fn(name, oldVal, newVal);
          } catch (err) {
            if (__DEV__) console.error("[attributeChanged] hook error:", err);
            else console.error(err);
          }
        }
      }
    }
  }

  (ElfElement as unknown as { __elfDefinition: ComponentDefinition }).__elfDefinition = definition;

  if (options.register !== false) {
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
  if (typeof customElements !== "undefined" && !customElements.get(tag)) {
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

// ---------- helpers ----------

const normalizeProps = (props: PropsOptions): Array<[string, PropOption<unknown>]> => {
  const out: Array<[string, PropOption<unknown>]> = [];
  for (const key of Object.keys(props)) {
    const v = props[key];
    if (typeof v === "function") {
      out.push([key, { type: v as PropType<unknown> }]);
    } else if (v) {
      out.push([key, v]);
    }
  }
  return out;
};

const resolveDefault = (opt: PropOption<unknown>): unknown => {
  const d = opt.default;
  if (typeof d === "function" && opt.type !== Function) {
    return (d as () => unknown)();
  }
  return d;
};

const coerceAttr = (raw: string | null, opt: PropOption<unknown>): unknown => {
  if (raw === null) return resolveDefault(opt);
  const T = opt.type;
  if (T === Boolean) {
    return raw === "" || raw === "true" || raw === kebab(String(opt));
  }
  if (T === Number) {
    return Number(raw);
  }
  if (T === Object || T === Array) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
};

const createPropsProxy = (
  states: Map<string, ReturnType<typeof useRef>>
): Record<string, unknown> => {
  return new Proxy(
    {},
    {
      get(_t, key) {
        if (typeof key === "symbol") return undefined;
        const s = states.get(key);
        if (!s) return undefined;
        // Ref：取 .value（基本类型解包，对象返回内部 reactive 代理）
        if (isRef(s)) {
          return (s as { value: unknown }).value;
        }
        // 直接是 Reactive / 普通对象：原样返回
        return s;
      },
      has(_t, key) {
        return typeof key === "string" && states.has(key);
      },
      ownKeys() {
        return Array.from(states.keys());
      },
      getOwnPropertyDescriptor(_t, key) {
        if (typeof key === "string" && states.has(key)) {
          return { enumerable: true, configurable: true };
        }
        return undefined;
      }
    }
  );
};

const createEmit = (
  host: HTMLElement,
  options: EmitOptions | undefined
): ((event: string, ...args: unknown[]) => void) => {
  return (ev, ...args) => {
    const detail = options?.rawDetail === false ? args : args.length <= 1 ? args[0] : args;
    host.dispatchEvent(new CustomEvent(ev, { detail }));
    if (__DEV__) {
      emitDevtoolsRuntimeEvent({ type: "component:emit", host, event: ev, args });
    }
  };
};

const injectStyles = (shadow: ShadowRoot, styles: string[]): void => {
  // 优先 adoptedStyleSheets（更高效，浏览器兼容性 Chrome 73+ / Firefox 101+ / Safari 16.4+）
  if (
    "adoptedStyleSheets" in shadow &&
    typeof CSSStyleSheet !== "undefined" &&
    "replaceSync" in CSSStyleSheet.prototype
  ) {
    const sheets = styles.map((css) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      return sheet;
    });
    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, ...sheets];
    return;
  }
  // fallback: <style>
  for (const css of styles) {
    const styleEl = document.createElement("style");
    styleEl.textContent = css;
    shadow.appendChild(styleEl);
  }
};

/** 构造模板 / render 函数拿到的 ctx
 *
 *  state 字段是平铺的 Proxy：访问任何 key 时按以下顺序查找
 *    1. setupResult / props / asyncState（用户数据）
 *    2. `$emit` / `$host` / `$root` / `$attrs` / `$props` / `$slots`（系统字段）
 *
 *  这样模板里：
 *    {{ count }}             // 来自 setup return
 *    {{ size }}               // 来自 props
 *    @click="$emit('change')" // 系统字段
 *    {{ $host.tagName }}      // 系统字段
 */
const handleError = (instance: ComponentInstance | null, err: unknown): void => {
  if (instance) {
    if (__DEV__) {
      emitDevtoolsRuntimeEvent({ type: "component:error", host: instance.host, error: err });
    }
    for (const fn of instance.errorCapturedHooks) {
      try {
        const res = fn(err, instance);
        if (res === false) return;
      } catch (e) {
        if (__DEV__) console.error("[errorCaptured] hook error:", e);
        else console.error(e);
      }
    }
    const config = resolveAppConfig(instance.host);
    if (config.errorHandler) {
      config.errorHandler(err, "component setup/render");
      return;
    }
  }
  console.error(err);
};

/** 构建模板 / 手写 render 函数使用的 RenderContext。
 *
 *  约定：模板里 `{{ x }}` 解析顺序：
 *  1. setupState（setup return 的字段）
 *  2. props（声明在 .props 的字段，自动 unwrap）
 *  3. `$emit` / `$host` / `$root` / `$attrs` / `$props` 等系统字段
 *
 *  我们直接把它们都拍平到 ctx.state（一个对象）让模板编译器透明使用。
 *  这样心智 = Vue 3 setup 模板。
 */
const buildRenderCtx = (
  host: HTMLElement,
  shadow: ShadowRoot | null,
  props: Record<string, unknown>,
  setupState: Record<string, unknown>,
  emit: (event: string, ...args: unknown[]) => void,
  directives?: Record<string, unknown>,
  components?: ComponentDefinition["components"]
): RenderContext => {
  // 平铺：setupState 优先（setup 返回值覆盖 props 同名键）
  const flatState: Record<string, unknown> = {
    ...props,
    ...setupState,
    // 系统字段（$ 前缀避免与用户字段冲突）
    $emit: emit,
    $host: host,
    $root: shadow ?? host,
    $props: props,
    $attrs: getHostAttrs(host),
    $app: resolveAppConfig(host).globalProperties
  };
  const renderCtx: RenderContext = {
    state: flatState,
    props,
    emit,
    host,
    shadow
  };
  if (directives) renderCtx.directives = directives;
  if (components) renderCtx.components = components;
  return renderCtx;
};

const kebab = (s: string): string =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
const camel = (s: string): string => s.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
const pascal = (s: string): string => {
  const value = camel(s);
  return value ? value[0]!.toUpperCase() + value.slice(1) : value;
};

const resolveLocalComponent = (
  tag: string,
  components?: ComponentDefinition["components"]
): string | CustomElementConstructor | undefined => {
  if (!components) return undefined;
  const direct =
    components[tag] ?? components[kebab(tag)] ?? components[camel(tag)] ?? components[pascal(tag)];
  if (direct) return direct;

  for (const [name, component] of Object.entries(components)) {
    const definition = (component as unknown as { __elfDefinition?: ComponentDefinition })
      .__elfDefinition;
    if (definition?.tag === tag) return component;

    const normalizedName = kebab(name);
    if (tag === name || tag === normalizedName || tag === camel(normalizedName)) {
      return component;
    }
  }
  return undefined;
};

const findUnsetupParent = (el: HTMLElement): any | null => {
  let current: Node | null = el.parentNode;
  if (!current && el.getRootNode) {
    const root = el.getRootNode();
    if (root instanceof ShadowRoot) {
      current = root.host;
    }
  }
  while (current) {
    if (
      current instanceof HTMLElement &&
      current.constructor &&
      "__elfDefinition" in current.constructor
    ) {
      const elfEl = current as any;
      if (!elfEl.__setupDone) {
        return elfEl;
      }
    }
    let next: Node | null = current.parentNode;
    if (!next && current instanceof ShadowRoot) {
      next = current.host;
    } else if (!next && current.nodeType === 11 && "host" in current) {
      next = (current as any).host;
    }
    current = next;
  }
  return null;
};

import {
  defineCustomElement,
  ensureCustomElement,
  type ComponentEmitMap,
  type ComponentDefinition,
  type DirectiveDefinition,
  type ElfElementConstructor,
  type EmitOptions,
  type ModelRef,
  type PropOption,
  type PropType,
  type ComponentSlotMap
} from "@elfui/runtime";

export type MacroHtmlTemplate = string & { readonly __elfHtmlTemplate?: true };

export interface MacroModelOptions<T = unknown> {
  default?: T | (() => T);
  required?: boolean;
  prop?: string;
  event?: string;
}

export interface MacroComponentOptions {
  shadow?: ComponentDefinition["shadow"];
  formControl?: ComponentDefinition["formControl"];
  emitOptions?: EmitOptions;
  components?: ComponentDefinition["components"];
  register?: boolean;
}

export type MacroEmitFnMap = Record<string, (...args: any[]) => void>;
export type MacroEmitTupleMap = Record<string, readonly unknown[]>;
export type MacroEmitMap = MacroEmitFnMap | MacroEmitTupleMap;
export type MacroEmitValue = ((...args: any[]) => void) | readonly unknown[];
export type MacroEmitShape<T extends object> = {
  [K in keyof T]: T[K] extends MacroEmitValue ? T[K] : never;
};
export type MacroEmitArgs<T> = T extends (...args: infer Args) => unknown
  ? Args
  : T extends readonly unknown[]
    ? [...T]
    : never;
export type MacroEmitTuples<T extends object> = {
  [K in keyof T & string]: MacroEmitArgs<T[K]>;
};

type MacroPropConstructorValue<T> = T extends StringConstructor
  ? string
  : T extends NumberConstructor
    ? number
    : T extends BooleanConstructor
      ? boolean
      : T extends ArrayConstructor
        ? unknown[]
        : T extends ObjectConstructor
          ? Record<string, unknown>
          : T extends FunctionConstructor
            ? (...args: unknown[]) => unknown
            : T extends new (...args: unknown[]) => infer R
              ? R
              : unknown;

type MacroDefaultValue<T> = T extends (...args: unknown[]) => infer R ? R : T;

type MacroPropValue<T> = T extends { type: infer C; default: infer D }
  ? [NonNullable<C>] extends [never]
    ? MacroDefaultValue<D>
    : MacroPropConstructorValue<NonNullable<C>>
  : T extends { type: infer C }
    ? [NonNullable<C>] extends [never]
      ? unknown
      : MacroPropConstructorValue<NonNullable<C>>
    : T extends { default: infer D }
      ? MacroDefaultValue<D>
      : T extends
            | StringConstructor
            | NumberConstructor
            | BooleanConstructor
            | ArrayConstructor
            | ObjectConstructor
            | FunctionConstructor
        ? MacroPropConstructorValue<T>
        : T extends PropType<infer V>
          ? V
          : T extends PropOption<infer V>
            ? V
            : MacroDefaultValue<T>;

export type MacroInferProps<T extends Record<string, unknown>> = Readonly<{
  [K in keyof T]: MacroPropValue<T[K]>;
}>;

export const html = (_strings: TemplateStringsArray, ..._values: unknown[]): MacroHtmlTemplate =>
  macroOnly("html");

export const css = (_strings: TemplateStringsArray, ..._values: unknown[]): string =>
  macroOnly("css");

export const defineHtml = <
  Props extends object = Record<string, unknown>,
  Emits extends MacroEmitShape<Emits> = Record<string, unknown[]>,
  Slots extends MacroSlotMap = MacroSlotMap
>(
  _template: MacroHtmlTemplate | string
): ElfElementConstructor<Props, MacroEmitTuples<Emits>, Slots> => macroOnly("defineHtml");

export const defineName = (_name: string): void => {
  macroOnly("defineName");
};

export const defineOptions = (_options: MacroComponentOptions): void => {
  macroOnly("defineOptions");
};

export function defineProps<const T extends readonly string[]>(
  _props: T
): Record<T[number], unknown>;
export function defineProps<const T extends Record<string, unknown>>(_props: T): MacroInferProps<T>;
export function defineProps<
  TProps extends object,
  const TOptions extends Record<string, unknown> = Record<string, unknown>
>(_props: TOptions): Readonly<TProps>;
export function defineProps<TProps extends object>(): Readonly<TProps>;
export function defineProps(
  _props?: readonly string[] | Record<string, unknown>
): Record<string, unknown> {
  return macroOnly("defineProps");
}

export function defineEmits<T extends MacroEmitShape<T>>(
  _events?: readonly (keyof T & string)[]
): <K extends keyof T & string>(event: K, ...args: MacroEmitArgs<T[K]>) => boolean;
export function defineEmits<const T extends readonly string[]>(
  _events: T
): (event: T[number], ...args: unknown[]) => boolean;
export function defineEmits(
  _events?: readonly string[]
): (event: string, ...args: unknown[]) => boolean {
  return macroOnly("defineEmits");
}

export function defineModel<T = unknown>(_options?: MacroModelOptions<T>): ModelRef<T>;
export function defineModel<T = unknown>(
  _name: string,
  _options?: MacroModelOptions<T>
): ModelRef<T>;
export function defineModel(
  _nameOrOptions?: string | MacroModelOptions,
  _options?: MacroModelOptions
): ModelRef<unknown> {
  return macroOnly("defineModel");
}

export const defineStyle = (_style: string, ..._styles: string[]): void => {
  macroOnly("defineStyle");
};

export function defineDirective<V = unknown, El extends Element = Element>(
  _name: string,
  _definition: DirectiveDefinition<V, El>
): void {
  macroOnly("defineDirective");
}

export type MacroSlotMap = object;

export function defineSlots<T extends MacroSlotMap>(): Readonly<T> {
  return macroOnly("defineSlots");
}

export type MacroUsableComponent = string | CustomElementConstructor | ElfElementConstructor;

export function useComponents(
  ..._components: Array<MacroUsableComponent | Record<string, MacroUsableComponent>>
): void {
  macroOnly("useComponents");
}

export type MacroExtendableComponent<
  Props extends object = Record<string, unknown>,
  Emits extends ComponentEmitMap = ComponentEmitMap,
  Slots extends ComponentSlotMap = ComponentSlotMap
> = ElfElementConstructor<Props, Emits, Slots> | ComponentDefinition;

export interface MacroExtensionBuilder<
  Props extends object = Record<string, unknown>,
  Emits extends ComponentEmitMap = ComponentEmitMap,
  Slots extends ComponentSlotMap = ComponentSlotMap
> {
  name(tag: string): this;
  style(css: string): this;
  build(): ElfElementConstructor<Props, Emits, Slots>;
  register(tag?: string): ElfElementConstructor<Props, Emits, Slots>;
  toDefinition(): ComponentDefinition;
}

class MacroExtensionBuilderImpl<
  Props extends object = Record<string, unknown>,
  Emits extends ComponentEmitMap = ComponentEmitMap,
  Slots extends ComponentSlotMap = ComponentSlotMap
> implements MacroExtensionBuilder<Props, Emits, Slots> {
  private definition: ComponentDefinition;

  public constructor(component: MacroExtendableComponent<Props, Emits, Slots>) {
    this.definition = cloneDefinition(resolveDefinition(component));
    this.definition.tag = "";
  }

  public name(tag: string): this {
    this.definition.tag = tag;
    return this;
  }

  public style(css: string): this {
    this.definition.styles = [...(this.definition.styles ?? []), css];
    return this;
  }

  public build(): ElfElementConstructor<Props, Emits, Slots> {
    return defineCustomElement(this.definition, { register: false }) as ElfElementConstructor<
      Props,
      Emits,
      Slots
    >;
  }

  public register(tag?: string): ElfElementConstructor<Props, Emits, Slots> {
    if (tag) this.definition.tag = tag;
    const ctor = this.build();
    ensureCustomElement(ctor);
    return ctor;
  }

  public toDefinition(): ComponentDefinition {
    return cloneDefinition(this.definition);
  }
}

export const useExtend = <
  Props extends object = Record<string, unknown>,
  Emits extends ComponentEmitMap = ComponentEmitMap,
  Slots extends ComponentSlotMap = ComponentSlotMap
>(
  component: MacroExtendableComponent<Props, Emits, Slots>
): MacroExtensionBuilder<Props, Emits, Slots> =>
  new MacroExtensionBuilderImpl<Props, Emits, Slots>(component);

export type MacroVariantConfigurator<
  Props extends object = Record<string, unknown>,
  Emits extends ComponentEmitMap = ComponentEmitMap,
  Slots extends ComponentSlotMap = ComponentSlotMap
> = (builder: MacroExtensionBuilder<Props, Emits, Slots>) => void;

export const useVariant = <
  Props extends object = Record<string, unknown>,
  Emits extends ComponentEmitMap = ComponentEmitMap,
  Slots extends ComponentSlotMap = ComponentSlotMap
>(
  component: MacroExtendableComponent<Props, Emits, Slots>,
  name: string,
  configure?: MacroVariantConfigurator<Props, Emits, Slots>
): MacroExtensionBuilder<Props, Emits, Slots> => {
  const builder = useExtend(component).name(name);
  configure?.(builder);
  return builder;
};

const resolveDefinition = (component: MacroExtendableComponent): ComponentDefinition => {
  const fromCtor = (component as { __elfDefinition?: ComponentDefinition }).__elfDefinition;
  if (fromCtor) return fromCtor;
  return component as ComponentDefinition;
};

const cloneDefinition = (definition: ComponentDefinition): ComponentDefinition => {
  const cloned: ComponentDefinition = {
    ...definition,
    props: { ...(definition.props ?? {}) }
  };
  if (definition.emits) cloned.emits = [...definition.emits];
  if (definition.emitOptions) cloned.emitOptions = { ...definition.emitOptions };
  if (definition.styles) cloned.styles = [...definition.styles];
  if (definition.components) cloned.components = { ...definition.components };
  if (definition.directives) cloned.directives = { ...definition.directives };
  return cloned;
};

export {
  effectScope,
  getCurrentScope,
  isProxy,
  isReadonly,
  isState,
  markRaw,
  nextTick,
  onScopeDispose,
  onWatcherCleanup,
  readonly,
  toRaw,
  toValue,
  unref,
  useComputed,
  useComputed as computed,
  useEffect,
  useReactive,
  useRef,
  useShallowReactive,
  useShallowRef,
  watch,
  watchEffect,
  watchPostEffect,
  watchSyncEffect
} from "@elfui/reactivity";

export {
  createInjectionKey,
  defineExpose,
  inject,
  onActivated,
  onAttributeChanged,
  onBeforeMount,
  onBeforeUnmount,
  onBeforeUpdate,
  onDeactivated,
  onErrorCaptured,
  onMount,
  onUnmount,
  onUpdated,
  provide,
  globalStyle,
  projectLightDom,
  useAppConfig,
  useAttrs,
  useClickOutside,
  useEscapeKey,
  useEventListener,
  useHost,
  useHostAttr,
  useHostClass,
  useHostCssVar,
  useHostFlag,
  useHostStyle,
  useFormControlContext,
  useRenderRoot,
  useScrollLock,
  useScopedSlot,
  useShadowRoot,
  useTemplateRef,
  theme
} from "@elfui/runtime";

const macroOnly = (name: string): never => {
  throw new Error(
    `[ElfUI macro] ${name} 只能在 .elf.ts 中使用，或在 .ts/.tsx 文件头添加 ` +
      "`/// <!--@elf component-->`，并需要通过 @elfui/vite-plugin 编译。"
  );
};

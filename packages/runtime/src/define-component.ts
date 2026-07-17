import { defineCustomElement, ensureCustomElement } from "./element";
import type {
  ComponentDefinition,
  ElfElementConstructor,
  EmitOptions,
  PropOption,
  PropType,
  PropsOptions,
  RenderFn,
  SetupContext,
  SetupFn
} from "./element";

type InferPropConstructorValue<T> = T extends StringConstructor
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

type InferDefaultValue<T> = T extends (...args: unknown[]) => infer R ? R : T;

type InferPropValue<T> = T extends { type: infer C }
  ? [NonNullable<C>] extends [never]
    ? T extends { default: infer D }
      ? InferDefaultValue<D>
      : unknown
    : InferPropConstructorValue<NonNullable<C>>
  : T extends PropOption<infer V>
    ? unknown extends V
      ? T extends { default: infer D }
        ? InferDefaultValue<D>
        : unknown
      : V
    : T extends
          | StringConstructor
          | NumberConstructor
          | BooleanConstructor
          | ArrayConstructor
          | ObjectConstructor
          | FunctionConstructor
      ? InferPropConstructorValue<T>
      : T extends PropType<infer V>
        ? V
        : InferDefaultValue<T>;

export type InferPropsOptions<T extends Record<string, unknown>> = {
  [K in keyof T]: InferPropValue<T[K]>;
};

export type EmitMap = Record<string, unknown[]>;
export type SlotsMap = object;

export interface TypedSetupContext<
  Emits extends EmitMap = EmitMap,
  Slots extends SlotsMap = SlotsMap
> extends Omit<SetupContext, "emit"> {
  emit: <K extends keyof Emits & string>(event: K, ...args: Emits[K]) => boolean;
  readonly slots?: Slots;
}

export type TypedSetup<
  Props extends object = Record<string, unknown>,
  Emits extends EmitMap = EmitMap,
  Slots extends SlotsMap = SlotsMap
> = (
  props: Readonly<Props>,
  ctx: TypedSetupContext<Emits, Slots>
) => Record<string, unknown> | void | Promise<Record<string, unknown> | void>;

export interface DefineComponentOptions<
  Props extends object = Record<string, unknown>,
  Emits extends EmitMap = EmitMap,
  Slots extends SlotsMap = SlotsMap
> {
  name?: string;
  tag?: string;
  props?: PropsOptions;
  emits?: ReadonlyArray<keyof Emits & string>;
  emitOptions?: EmitOptions;
  setup?: TypedSetup<Props, Emits, Slots>;
  render?: RenderFn;
  /**
   * Runtime 主包不再注入模板编译器；链式/运行时模板请从 @elfui/chain 使用。
   */
  template?: string;
  styles?: string[];
  shadow?: "open" | "closed" | false;
  formControl?: ComponentDefinition["formControl"];
  components?: ComponentDefinition["components"];
  directives?: ComponentDefinition["directives"];
  register?: boolean;
}

export function defineComponent<
  const Options extends Record<string, unknown>,
  Emits extends EmitMap = EmitMap,
  Slots extends SlotsMap = SlotsMap
>(
  options: Omit<DefineComponentOptions<InferPropsOptions<Options>, Emits, Slots>, "props"> & {
    props: Options;
  }
): ElfElementConstructor<InferPropsOptions<Options>, Emits, Slots>;
export function defineComponent<
  Props extends object = Record<string, unknown>,
  Emits extends EmitMap = EmitMap,
  Slots extends SlotsMap = SlotsMap
>(options: DefineComponentOptions<Props, Emits, Slots>): ElfElementConstructor<Props, Emits, Slots>;
export function defineComponent(
  options: DefineComponentOptions<Record<string, unknown>, EmitMap, SlotsMap>
): ElfElementConstructor {
  if (options.template !== undefined) {
    throw new Error(
      "[defineComponent] template runtime compile 已移到 @elfui/chain；主包请使用 render 或宏组件 defineHtml。"
    );
  }

  const tag = options.name ?? options.tag ?? "";
  const definition: ComponentDefinition = { tag };
  if (options.props) definition.props = options.props;
  if (options.emits) definition.emits = [...options.emits];
  if (options.emitOptions) definition.emitOptions = options.emitOptions;
  if (options.setup) definition.setup = options.setup as SetupFn;
  if (options.render) definition.render = options.render;
  if (options.styles) definition.styles = [...options.styles];
  if (options.shadow !== undefined) definition.shadow = options.shadow;
  if (options.formControl !== undefined) definition.formControl = options.formControl;
  if (options.components) definition.components = { ...options.components };
  if (options.directives) definition.directives = { ...options.directives };

  const ctor = defineCustomElement(definition, { register: false });
  if (options.register !== false && typeof customElements !== "undefined") {
    ensureCustomElement(ctor);
  }
  return ctor;
}

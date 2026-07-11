export interface TypedChildProps {
  label: string;
  modelValue: number;
  disabled?: boolean;
}

export type TypedChildEmits = {
  select: [id: string];
  "update:modelValue": [value: number];
};

export type TypedChildSlots = {
  default?: () => unknown;
  item?: (scope: { id: string }) => unknown;
};

export const TypedChild = null as unknown as CustomElementConstructor & {
  readonly __elfProps?: Readonly<TypedChildProps>;
  readonly __elfEmits?: TypedChildEmits;
  readonly __elfSlots?: TypedChildSlots;
};

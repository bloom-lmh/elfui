export interface RequiredSlotChildProps {
  label: string;
}

export type RequiredSlotChildSlots = {
  item: (scope: { id: string; count: number }) => unknown;
  optional?: () => unknown;
};

export const RequiredSlotChild = null as unknown as CustomElementConstructor & {
  readonly __elfProps?: Readonly<RequiredSlotChildProps>;
  readonly __elfEmits?: Record<string, unknown[]>;
  readonly __elfSlots?: RequiredSlotChildSlots;
};

import { useEffect } from "@elfui/reactivity";
import { defineCustomElement, defineExpose, onMounted, onUnmounted } from "@elfui/runtime";

export interface HostContractSnapshot {
  textValue: string;
  countValue: number;
  active: boolean;
  config: Record<string, unknown>;
  items: unknown[];
  handlerType: string;
}

export interface HostContractElement extends HTMLElement {
  textValue: string;
  countValue: number;
  active: boolean;
  config: Record<string, unknown>;
  items: unknown[];
  handler: (value: number) => number;
  getContractSnapshot(): HostContractSnapshot;
  invokeHandler(value: number): number;
  emitSingle(detail: unknown): boolean;
  emitMultiple(previous: unknown, next: unknown): boolean;
  emitCancelable(detail: unknown): boolean;
  focusControl(): void;
}

export const hostContractLifecycle = {
  setup: 0,
  mounted: 0,
  unmounted: 0,
  renders: 0
};

export const HostContract = defineCustomElement({
  tag: "elf-host-contract",
  emits: ["contract-single", "contract-multiple", "contract-cancelable"],
  emitOptions: {
    bubbles: true,
    composed: true,
    events: { "contract-cancelable": { cancelable: true } }
  },
  formControl: { defaultValue: "default" },
  styles: [
    `
      :host { display: block; }
      [part~="surface"] {
        color: var(--contract-accent, rgb(1, 2, 3));
        border-top: 0 solid transparent;
      }
    `
  ],
  props: {
    textValue: { type: String, default: "default" },
    countValue: { type: Number, default: 0 },
    active: { type: Boolean, default: false },
    config: { type: Object, default: () => ({}) },
    items: { type: Array, default: () => [] },
    handler: { type: Function, default: () => 0 }
  },
  setup: (props, { emit, form, host }) => {
    hostContractLifecycle.setup++;
    let output: HTMLOutputElement | null = null;

    const snapshot = (): HostContractSnapshot => ({
      textValue: String(props.textValue),
      countValue: Number(props.countValue),
      active: Boolean(props.active),
      config: props.config as Record<string, unknown>,
      items: props.items as unknown[],
      handlerType: typeof props.handler
    });
    const renderSnapshot = (): void => {
      const current = snapshot();
      if (!output) return;
      output.textContent = `${current.textValue}|${current.countValue}|${current.active}|${String(current.config.mode)}|${current.items.length}`;
      hostContractLifecycle.renders++;
    };

    useEffect(renderSnapshot);
    useEffect(() => form?.setValue(String(props.textValue)));
    defineExpose({
      getContractSnapshot: snapshot,
      invokeHandler: (value: number): number => (props.handler as (input: number) => number)(value),
      emitSingle: (detail: unknown): boolean => emit("contract-single", detail),
      emitMultiple: (previous: unknown, next: unknown): boolean =>
        emit("contract-multiple", previous, next),
      emitCancelable: (detail: unknown): boolean => emit("contract-cancelable", detail),
      focusControl: (): void => host.shadowRoot?.querySelector<HTMLButtonElement>("button")?.focus()
    });
    onMounted(() => {
      output = host.shadowRoot?.querySelector("output") ?? null;
      hostContractLifecycle.mounted++;
      renderSnapshot();
    });
    onUnmounted(() => {
      output = null;
      hostContractLifecycle.unmounted++;
    });
    return {};
  },
  render: () => {
    const surface = document.createElement("section");
    surface.part.add("surface");
    const labelSlot = document.createElement("slot");
    labelSlot.name = "label";
    const defaultSlot = document.createElement("slot");
    const output = document.createElement("output");
    const control = document.createElement("button");
    control.type = "button";
    control.part.add("control");
    control.textContent = "focus target";
    surface.append(labelSlot, defaultSlot, output, control);
    return surface;
  }
});

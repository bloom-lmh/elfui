import { useComputed, useRef } from "@elfui/reactivity";

import { defineComponent, type InferPropsOptions } from "../define-component";
import type { PropOption, PropType } from "../element";
import { useModel } from "../use-model";

defineComponent({
  name: "elf-type-infer",
  props: {
    count: Number,
    label: { type: String, default: "ok" },
    disabled: { type: Boolean, default: false }
  },
  setup(props) {
    props.count.toFixed();
    props.label.toUpperCase();
    props.disabled.valueOf();
    // @ts-expect-error number prop should not expose string methods
    props.count.toUpperCase();
    return {};
  },
  render: () => document.createElement("div"),
  register: false
});

defineComponent<{ label: string }, { save: [id: number] }, { default: { id: number } }>({
  name: "elf-type-explicit",
  emits: ["save"],
  setup(props, ctx) {
    props.label.toUpperCase();
    ctx.emit("save", 1);
    // @ts-expect-error save expects a number id
    ctx.emit("save", "bad");
    return {};
  },
  render: () => document.createElement("div"),
  register: false
});

type OptionInferred = InferPropsOptions<{
  count: { type: NumberConstructor; default: 0 };
  label: { type: StringConstructor; default: "ok" };
  disabled: { type: BooleanConstructor; default: false };
}>;

const optionInferred: OptionInferred = {
  count: 1,
  label: "next",
  disabled: true
};

optionInferred.count.toFixed();
optionInferred.label.toUpperCase();
optionInferred.disabled.valueOf();

const _numberPropType: PropType<number> = Number;
// @ts-expect-error PropType<number> should not accept StringConstructor
const _wrongNumberPropType: PropType<number> = String;

const _numberPropOption: PropOption<number> = { type: Number, default: 0 };
// @ts-expect-error PropOption<number> should not accept StringConstructor
const _wrongNumberPropOption: PropOption<number> = { type: String, default: 0 };

const sourceRef = useRef(1);
const sameRef = useRef(sourceRef);
sameRef.value.toFixed();
// @ts-expect-error useRef(existingRef) should not become Ref<Ref<T>>
const _wrongNestedRef = sameRef.value.value;

const readonlyComputed = useComputed(() => 1);
readonlyComputed.value.toFixed();
// @ts-expect-error getter computed should not expose set
readonlyComputed.set(2);
// @ts-expect-error getter computed value should be readonly
readonlyComputed.value = 2;

const writableComputed = useComputed({
  get: () => 1,
  set: (_value: number) => undefined
});
writableComputed.set(2).set(3);

const model = useModel<number>({ modelValue: 1 }, { emit: () => undefined });
model.set(2).set(3);
model.value.toFixed();

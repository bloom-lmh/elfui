import { defineEmits, defineExpose, defineHtml, defineProps, defineStyle } from "../macro";

interface ButtonProps {
  disabled: boolean;
  type: "button" | "submit";
}

interface ButtonSlots {
  default: () => unknown;
}

interface ButtonEmits {
  click: [event: MouseEvent];
  close: [];
}

const props = defineProps<ButtonProps>({
  disabled: { type: Boolean, default: false },
  type: { type: String, default: "button" }
});

props.disabled.valueOf();
props.type.toUpperCase();
// @ts-expect-error unknown prop should not be exposed by typed defineProps
void props.missing;

const inferredProps = defineProps({
  label: { type: String, default: "ready" },
  count: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false }
});
const inferredLabel: string = inferredProps.label;
const inferredCount: number = inferredProps.count;
const inferredDisabled: boolean = inferredProps.disabled;
void inferredLabel;
void inferredCount;
void inferredDisabled;

const emit = defineEmits<ButtonEmits>(["click", "close"]);

const dispatched: boolean = emit("click", new MouseEvent("click"));
void dispatched;
// @ts-expect-error click event requires a MouseEvent payload
emit("click", "bad");
// @ts-expect-error runtime event names must belong to the typed emit map
defineEmits<ButtonEmits>(["missing"]);

const _Button = defineHtml<ButtonProps, ButtonEmits, ButtonSlots>(`<button></button>`);

defineStyle(":host { display: block; }", ".button { cursor: pointer; }");

type ExportedButtonProps = NonNullable<(typeof _Button)["__elfProps"]>;
type ExportedButtonEmits = NonNullable<(typeof _Button)["__elfEmits"]>;
type ExportedButtonSlots = NonNullable<(typeof _Button)["__elfSlots"]>;

const typedProps: ExportedButtonProps = {
  disabled: false,
  type: "button"
};

typedProps.type.toUpperCase();

const typedClickArgs: ExportedButtonEmits["click"] = [new MouseEvent("click")];
typedClickArgs[0].preventDefault();
// @ts-expect-error click event metadata requires a MouseEvent payload
const _badClickArgs: ExportedButtonEmits["click"] = ["bad"];

const renderDefaultSlot: ExportedButtonSlots["default"] = () => undefined;
renderDefaultSlot();

interface ExposedButtonApi {
  focus(): void;
}

defineExpose<ExposedButtonApi>({
  focus: () => undefined
});

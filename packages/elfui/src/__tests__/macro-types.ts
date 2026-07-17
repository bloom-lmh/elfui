import { defineEmits, defineHtml, defineProps, html } from "../macro";

interface ButtonProps {
  disabled: boolean;
  type: "button" | "submit";
}

interface ButtonSlots {
  default: () => unknown;
}

const props = defineProps<ButtonProps>({
  disabled: { type: Boolean, default: false },
  type: { type: String, default: "button" }
});

props.disabled.valueOf();
props.type.toUpperCase();
// @ts-expect-error unknown prop should not be exposed by typed defineProps
void props.missing;

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

const dispatched: boolean = emit("click", new MouseEvent("click"));
void dispatched;
// @ts-expect-error click event requires a MouseEvent payload
emit("click", "bad");

const _Button = defineHtml<ButtonProps, { click: [event: MouseEvent] }, ButtonSlots>(
  html`<button></button>`
);

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

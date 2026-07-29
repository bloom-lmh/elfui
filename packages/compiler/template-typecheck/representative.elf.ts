import { defineHtml, defineProps } from "@elfui/core";

interface RepresentativeProps {
  label?: string;
}

const props = defineProps<RepresentativeProps>();

export const RepresentativeTemplateTypecheck = defineHtml(
  `<button type="button" title=${props.label}>${props.label}</button>`
);

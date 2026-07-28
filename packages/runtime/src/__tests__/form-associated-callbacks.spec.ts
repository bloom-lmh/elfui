import { afterEach, describe, expect, it } from "vitest";

import { defineCustomElement } from "../element";
import type { FormControlContext } from "../form-control";

let tagCounter = 0;
const nextTag = (): string => `elf-form-callback-${++tagCounter}`;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("form-associated custom element callbacks", () => {
  it("bridges native reset, disabled and state restore callbacks", () => {
    const tag = nextTag();
    let form: FormControlContext<string> | undefined;
    defineCustomElement({
      tag,
      formControl: { defaultValue: "default" },
      setup: (_, ctx) => {
        form = ctx.form as FormControlContext<string>;
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag) as HTMLElement & {
      formResetCallback(): void;
      formDisabledCallback(disabled: boolean): void;
      formStateRestoreCallback(
        state: string | File | FormData | null,
        mode: "restore" | "autocomplete"
      ): void;
    };
    document.body.appendChild(el);

    form!.setValue("changed");
    el.formDisabledCallback(true);
    expect(form!.disabled).toBe(true);
    el.formDisabledCallback(false);
    expect(form!.disabled).toBe(false);

    el.formStateRestoreCallback("restored", "restore");
    expect(form!.getValue()).toBe("restored");
    el.formResetCallback();
    expect(form!.getValue()).toBe("default");
  });
});

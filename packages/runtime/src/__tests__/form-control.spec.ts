// E4 formControl 验收测试

import { afterEach, describe, expect, it } from "vitest";

import { defineCustomElement } from "../element";
import { type FormControlContext, useFormControlContext } from "../form-control";

let tagCounter = 0;
const nextTag = (): string => `elf-form-${++tagCounter}`;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("E4 formControl 注入", () => {
  it("formControl=true 时 setup ctx 含 form 控制器", () => {
    const tag = nextTag();
    let captured: FormControlContext | undefined = undefined;
    defineCustomElement({
      tag,
      formControl: true,
      setup: (_, ctx) => {
        captured = ctx.form;
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    expect(captured).toBeDefined();
    expect(typeof captured!.setValue).toBe("function");
    expect(typeof captured!.validate).toBe("function");
    expect(typeof captured!.reset).toBe("function");
    expect(typeof captured!.report).toBe("function");
  });

  it("formControl=false 时 setup ctx 没有 form", () => {
    const tag = nextTag();
    let captured: FormControlContext | undefined = undefined;
    defineCustomElement({
      tag,
      setup: (_, ctx) => {
        captured = ctx.form;
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    expect(captured).toBeUndefined();
  });

  it("默认值与 reset", () => {
    const tag = nextTag();
    let form: FormControlContext<string> | undefined = undefined;
    defineCustomElement({
      tag,
      formControl: { defaultValue: "default" },
      setup: (_, ctx) => {
        form = ctx.form as FormControlContext<string>;
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    expect(form!.getValue()).toBe("default");
    form!.setValue("changed");
    expect(form!.getValue()).toBe("changed");
    form!.reset();
    expect(form!.getValue()).toBe("default");
  });

  it("useFormControlContext 读取当前 form 控制器", () => {
    const tag = nextTag();
    let form: FormControlContext<string> | undefined = undefined;
    defineCustomElement({
      tag,
      formControl: { defaultValue: "macro" },
      setup: () => {
        form = useFormControlContext<string>();
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    expect(form!.getValue()).toBe("macro");
    form!.setValue("changed");
    expect(form!.getValue()).toBe("changed");
  });

  it("useFormControlContext 在未启用 formControl 时给出清晰错误", () => {
    const tag = nextTag();
    let error: unknown = undefined;
    defineCustomElement({
      tag,
      setup: () => {
        try {
          useFormControlContext();
        } catch (err) {
          error = err;
        }
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("当前组件没有启用 formControl");
  });
});

describe("E4 校验规则", () => {
  it("validate 通过", async () => {
    const tag = nextTag();
    let form: FormControlContext<string> | undefined = undefined;
    defineCustomElement({
      tag,
      formControl: {
        defaultValue: "abc",
        rules: [{ validator: (v: string) => v.length > 0, message: "required" }]
      },
      setup: (_, ctx) => {
        form = ctx.form as FormControlContext<string>;
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    const result = await form!.validate();
    expect(result.valid).toBe(true);
  });

  it("validate 失败返回 message", async () => {
    const tag = nextTag();
    let form: FormControlContext<string> | undefined = undefined;
    defineCustomElement({
      tag,
      formControl: {
        defaultValue: "",
        rules: [{ validator: (v: string) => v.length > 0, message: "required" }]
      },
      setup: (_, ctx) => {
        form = ctx.form as FormControlContext<string>;
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    const result = await form!.validate();
    expect(result.valid).toBe(false);
    expect(result.message).toBe("required");
  });

  it("validator 返回 string 当作错误消息", async () => {
    const tag = nextTag();
    let form: FormControlContext<string> | undefined = undefined;
    defineCustomElement({
      tag,
      formControl: {
        defaultValue: "x",
        rules: [{ validator: (v: string) => (v.length >= 3 ? true : "至少 3 个字符") }]
      },
      setup: (_, ctx) => {
        form = ctx.form as FormControlContext<string>;
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    const result = await form!.validate();
    expect(result.valid).toBe(false);
    expect(result.message).toBe("至少 3 个字符");
  });

  it("rules() 运行时替换", async () => {
    const tag = nextTag();
    let form: FormControlContext<string> | undefined = undefined;
    defineCustomElement({
      tag,
      formControl: { defaultValue: "x" },
      setup: (_, ctx) => {
        form = ctx.form as FormControlContext<string>;
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    expect((await form!.validate()).valid).toBe(true);
    form!.rules([{ validator: () => false, message: "fail" }]);
    expect((await form!.validate()).valid).toBe(false);
  });

  it("valid 字段反映最近一次结果", async () => {
    const tag = nextTag();
    let form: FormControlContext<string> | undefined = undefined;
    defineCustomElement({
      tag,
      formControl: {
        defaultValue: "",
        rules: [{ validator: (v: string) => v.length > 0 }]
      },
      setup: (_, ctx) => {
        form = ctx.form as FormControlContext<string>;
        return {};
      },
      render: () => document.createElement("div")
    });
    const el = document.createElement(tag);
    document.body.appendChild(el);
    await form!.validate();
    expect(form!.valid).toBe(false);
    form!.setValue("x");
    await form!.validate();
    expect(form!.valid).toBe(true);
  });
});

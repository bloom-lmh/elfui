import { afterEach, describe, expect, it, vi } from "vitest";
import * as ts from "typescript";

import * as reactivity from "@elfui/reactivity";
import * as runtime from "@elfui/runtime";
import * as runtimeInternal from "@elfui/runtime/internal";

import { compileMacroComponent, formatElfDiagnostic } from "../macro-component";

type EvaluatedModule = Record<string, unknown>;

const elfuiRuntimeShim = {
  ...reactivity,
  ...runtime
};

const evalMacroModule = (code: string, dev: boolean | "absent" = true): EvaluatedModule => {
  const js = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS
    }
  }).outputText;
  const module = { exports: {} as EvaluatedModule };
  const require = (id: string): unknown => {
    if (id === "@elfui/core") return elfuiRuntimeShim;
    if (id === "@elfui/core/internal") return runtimeInternal;
    if (id === "@elfui/reactivity") return reactivity;
    if (id === "@elfui/runtime") return runtime;
    if (id === "@elfui/runtime/internal") return runtimeInternal;
    throw new Error(`Unexpected module import in macro runtime test: ${id}`);
  };
  if (dev === "absent") {
    const factory = new Function("require", "exports", "module", js);
    factory(require, module.exports, module);
  } else {
    const factory = new Function("require", "exports", "module", "__DEV__", js);
    factory(require, module.exports, module, dev);
  }
  return module.exports;
};

const expectNoDiagnostics = (result: ReturnType<typeof compileMacroComponent>): void => {
  expect(result.diagnostics.map(formatElfDiagnostic)).toEqual([]);
};

const nextMicrotask = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

const compileRuntimeMacro = (
  source: string,
  options: NonNullable<Parameters<typeof compileMacroComponent>[1]> = {}
): ReturnType<typeof compileMacroComponent> =>
  compileMacroComponent(source, { ...options, templateTypeCheck: false });

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  runtimeInternal.resetDirectives();
  runtime.resetConfig();
  delete (globalThis as { __elfMacroRuntimeLog?: string[] }).__elfMacroRuntimeLog;
  delete (globalThis as { __elfMacroTemplateRef?: Element | null }).__elfMacroTemplateRef;
});

describe("M9.7 macro runtime coverage", () => {
  it("compiles direct template literals without eager interpolation", () => {
    const result = compileRuntimeMacro(
      `
import { defineHtml, useRef } from "@elfui/core";
const count = useRef(0);
const increment = (): void => count.set(count.peek() + 1);
export const DirectTemplateProbe = defineHtml(\`
  <button class="direct" @click=\${increment}>\${count}</button>
\`);
      `,
      { filename: "DirectTemplateProbe.ts", templateTypeCheck: false }
    );
    expectNoDiagnostics(result);

    const exports = evalMacroModule(result.code);
    const ctor = exports.DirectTemplateProbe as runtime.ElfElementConstructor;
    const el = document.createElement(runtime.ensureCustomElement(ctor));
    document.body.appendChild(el);

    const button = (el.shadowRoot ?? el).querySelector("button")!;
    expect(button.textContent?.trim()).toBe("0");
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(button.textContent?.trim()).toBe("1");
  });

  it("combines imported-style expressions and direct style literals", () => {
    const result = compileRuntimeMacro(
      `
import { defineHtml, defineStyle } from "@elfui/core";
export const baseStyles = ":host { display: block; }";
defineStyle(baseStyles, \`.direct { color: red; }\`);
export const DirectStyleProbe = defineHtml(\`<p class="direct">styled</p>\`);
      `,
      { filename: "DirectStyleProbe.ts", templateTypeCheck: false }
    );
    expectNoDiagnostics(result);
    expect(result.code).toContain("baseStyles");
    expect(result.code).toContain(".direct { color: red; }");

    const exports = evalMacroModule(result.code);
    const ctor = exports.DirectStyleProbe as runtime.ElfElementConstructor;
    const el = document.createElement(runtime.ensureCustomElement(ctor));
    document.body.appendChild(el);

    const styleText = [...(el.shadowRoot ?? el).querySelectorAll("style")]
      .map((style) => style.textContent)
      .join("\n");
    expect(styleText).toContain(":host { display: block; }");
    expect(styleText).toContain(".direct { color: red; }");
  });

  it("rejects runtime template variables without adding a runtime compiler", () => {
    const result = compileRuntimeMacro(
      `
import { defineHtml } from "@elfui/core";
const template: string = "<p>runtime</p>";
export const RuntimeTemplateProbe = defineHtml(template);
      `,
      { filename: "RuntimeTemplateProbe.ts", templateTypeCheck: false }
    );

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ELF_MACRO_DEFINE_HTML_TEMPLATE", severity: "error" })
      ])
    );
  });

  it("populates template refs before onMounted hooks run", () => {
    const result = compileRuntimeMacro(
      `
import { defineHtml, onMounted, useTemplateRef } from "@elfui/core";
const chart = useTemplateRef<HTMLDivElement>("chart");
onMounted(() => {
  (globalThis as { __elfMacroTemplateRef?: Element | null }).__elfMacroTemplateRef = chart.value;
});
export const MacroTemplateRefProbe = defineHtml(\`<div ref="chart"></div>\`);
      `,
      { filename: "MacroTemplateRefProbe.ts", templateTypeCheck: false }
    );
    expectNoDiagnostics(result);

    const exports = evalMacroModule(result.code);
    const ctor = exports.MacroTemplateRefProbe as runtime.ElfElementConstructor;
    const el = document.createElement(runtime.ensureCustomElement(ctor));
    document.body.appendChild(el);

    const chart = (el.shadowRoot ?? el).querySelector("div");
    expect(chart).not.toBeNull();
    expect((globalThis as { __elfMacroTemplateRef?: Element | null }).__elfMacroTemplateRef).toBe(
      chart
    );
  });

  it("runs generated components when the host bundler does not define __DEV__", () => {
    const result = compileRuntimeMacro(
      `
import { defineHtml } from "@elfui/core";
export const PortableDevProbe = defineHtml(\`<p>portable</p>\`);
      `,
      { filename: "PortableDevProbe.ts", templateTypeCheck: false }
    );
    expectNoDiagnostics(result);

    const exports = evalMacroModule(result.code, "absent");
    const ctor = exports.PortableDevProbe as runtime.ElfElementConstructor & {
      __elfSource?: { file: string };
    };
    expect(ctor).toBeTypeOf("function");
    expect(ctor.__elfSource?.file).toBe("PortableDevProbe.ts");
  });

  it("infers runtime converters from local type-only props", () => {
    const result = compileRuntimeMacro(
      `
import { defineHtml, defineProps } from "@elfui/core";

interface BaseProps {
  label: string;
  count?: number;
}

type Props = BaseProps & {
  active: boolean;
  items: string[];
  settings: { dense: boolean };
  mode: "compact" | "wide";
};

const props = defineProps<Props>();

export const TypeOnlyPropsProbe = defineHtml(\`
  <p>\${props.label}|\${props.count}|\${props.active}|\${props.items[0]}|\${props.settings.dense}|\${props.mode}</p>
\`);
      `,
      { filename: "TypeOnlyPropsProbe.ts", templateTypeCheck: false }
    );
    expectNoDiagnostics(result);
    expect(result.metadata.components[0]?.propNames).toEqual([
      "label",
      "count",
      "active",
      "items",
      "settings",
      "mode"
    ]);
    expect(result.metadata.components[0]?.runtimePropOptions).toMatchObject({
      label: "{ type: String, required: true }",
      count: "{ type: Number }",
      active: "{ type: Boolean, required: true }",
      items: "{ type: Array, required: true }",
      settings: "{ type: Object, required: true }",
      mode: "{ type: String, required: true }"
    });
    const exports = evalMacroModule(result.code);
    const ctor = exports.TypeOnlyPropsProbe as runtime.ElfElementConstructor;
    const el = document.createElement(runtime.ensureCustomElement(ctor));
    el.setAttribute("label", "ElfUI");
    el.setAttribute("count", "2");
    el.setAttribute("active", "active");
    el.setAttribute("items", '["first"]');
    el.setAttribute("settings", '{"dense":true}');
    el.setAttribute("mode", "compact");
    document.body.appendChild(el);

    expect(el.shadowRoot?.textContent?.trim()).toBe("ElfUI|2|true|first|true|compact");
  });

  it("requires explicit runtime options for unsafe type-only props", () => {
    const mixed = compileRuntimeMacro(
      `
import { defineHtml, defineProps } from "@elfui/core";
interface Props { value: string | number }
const props = defineProps<Props>();
export const MixedProps = defineHtml(\`<p>\${props.value}</p>\`);
      `,
      { filename: "MixedProps.ts", templateTypeCheck: false }
    );
    expect(mixed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ELF_MACRO_PROP_RUNTIME_TYPE", severity: "warning" })
      ])
    );

    const imported = compileRuntimeMacro(
      `
import { defineHtml, defineProps } from "@elfui/core";
import type { ExternalProps } from "./external";
const props = defineProps<ExternalProps>();
export const ImportedProps = defineHtml(\`<p>\${props.value}</p>\`);
      `,
      { filename: "ImportedProps.ts", templateTypeCheck: false }
    );
    expect(imported.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ELF_MACRO_PROPS_RUNTIME_TYPE", severity: "warning" })
      ])
    );
  });

  it("runs plugin directives and lifecycle hooks in a real macro component", async () => {
    const log: string[] = [];
    (globalThis as { __elfMacroRuntimeLog?: string[] }).__elfMacroRuntimeLog = log;
    const result = compileRuntimeMacro(
      `
import {
  defineHtml,
  onBeforeUpdate,
  onMounted,
  onUnmounted,
  onUpdated,
  usePlugin,
  useRef
} from "@elfui/core";

const log = (globalThis as { __elfMacroRuntimeLog: string[] }).__elfMacroRuntimeLog;

usePlugin((ctx, options: { marker: string }) => {
  ctx.directive("macro-mark", {
    mounted(el: HTMLElement) {
      el.dataset.plugin = options.marker;
    }
  });
  ctx.configure({ globalProperties: { macroPluginReady: true } });
}, { marker: "ok" });

const count = useRef(0);
const inc = (): void => {
  count.set(count.peek() + 1);
};

onMounted(() => log.push("mount"));
onBeforeUpdate(() => log.push("beforeUpdate"));
onUpdated(() => log.push("updated"));
onUnmounted(() => log.push("unmount"));

export const MacroLifecycleProbe = defineHtml(\`
  <button v-macro-mark @click=\${inc}>\${count}</button>
\`);
      `,
      { filename: "MacroLifecycleProbe.ts" }
    );
    expectNoDiagnostics(result);
    expect(result.code).not.toContain("...ctx.props");
    const exports = evalMacroModule(result.code);
    const ctor = exports.MacroLifecycleProbe as runtime.ElfElementConstructor;
    const tag = runtime.ensureCustomElement(ctor);

    const el = document.createElement(tag);
    document.body.appendChild(el);
    await nextMicrotask();

    const root = el.shadowRoot ?? el;
    const button = root.querySelector("button")!;
    expect(button.textContent).toBe("0");
    expect((button as HTMLElement).dataset.plugin).toBe("ok");
    expect(runtime.getConfig().globalProperties.macroPluginReady).toBe(true);
    expect(log).toEqual(["mount"]);

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(log).toEqual(["mount", "beforeUpdate"]);
    await nextMicrotask();
    expect(button.textContent).toBe("1");
    expect(log).toEqual(["mount", "beforeUpdate", "updated"]);

    document.body.removeChild(el);
    await nextMicrotask();
    expect(log).toEqual(["mount", "beforeUpdate", "updated", "unmount"]);
  });

  it("runs inferred local directives inside v-for and cleans them up on unmount", async () => {
    const log: string[] = [];
    (globalThis as { __elfMacroRuntimeLog?: string[] }).__elfMacroRuntimeLog = log;
    const result = compileRuntimeMacro(
      `
import { defineDirective, defineHtml } from "@elfui/core";

const dual = defineDirective<string, HTMLLIElement>({
  mounted(_element, binding) {
    (globalThis as { __elfMacroRuntimeLog: string[] }).__elfMacroRuntimeLog.push("local:" + binding.value);
  },
  beforeUnmount(_element, binding) {
    (globalThis as { __elfMacroRuntimeLog: string[] }).__elfMacroRuntimeLog.push("before:" + binding.value);
  },
  unmounted(_element, binding) {
    (globalThis as { __elfMacroRuntimeLog: string[] }).__elfMacroRuntimeLog.push("unmounted:" + binding.value);
  }
});

const items = ["a", "b"];

export const LocalDirectiveProbe = defineHtml(\`
  <ul><li v-for="item in items" :key="item" v-dual=\${item}>\${item}</li></ul>
\`);
      `,
      { filename: "LocalDirectiveProbe.ts", templateTypeCheck: false }
    );
    expectNoDiagnostics(result);
    expect(result.code).toContain("const __elfStaticDirective0 = {");
    expect(result.code).toContain("const __elfDirectives = { dual: __elfStaticDirective0 }");
    expect(result.code).not.toContain("ELF_LOCAL_DIRECTIVES as __elfLocalDirectivesKey");
    expect(result.code).toMatch(/resolveDirective\("dual", _ctx\d+\.directives, _ctx\d+\.host\)/);

    const exports = evalMacroModule(result.code);
    const ctor = exports.LocalDirectiveProbe as runtime.ElfElementConstructor;
    expect(ctor.__elfDefinition.directives?.dual).toBeTruthy();
    const el = document.createElement(runtime.ensureCustomElement(ctor));
    const appDirective = {
      mounted: () => log.push("app")
    };
    (el as unknown as Record<symbol, Map<string, unknown>>)[Symbol.for("elfui.app.directives")] =
      new Map([["dual", appDirective]]);
    document.body.appendChild(el);
    await nextMicrotask();

    expect(log).toEqual(["local:a", "local:b"]);
    expect((el.shadowRoot ?? el).querySelectorAll("li")).toHaveLength(2);

    el.remove();
    await nextMicrotask();
    await nextMicrotask();
    expect(log).toEqual(
      expect.arrayContaining([
        "local:a",
        "local:b",
        "before:a",
        "before:b",
        "unmounted:a",
        "unmounted:b"
      ])
    );
    expect(log).not.toContain("app");
  });

  it("preserves local directive closures and isolates captured setup state per instance", async () => {
    const result = compileRuntimeMacro(
      `
import { defineDirective, defineHtml, defineProps, useRef } from "@elfui/core";

const props = defineProps({ prefix: { type: String, default: "local" } });
const mountCount = useRef(0);
const suffix = "content";

function formatContent(value: unknown): string {
  return props.prefix + ":" + String(value) + ":" + suffix;
}

const mountContent = (element: HTMLElement, value: unknown): void => {
  const count = mountCount.peek() + 1;
  mountCount.set(count);
  element.textContent = formatContent(value) + ":" + count;
};

const content = defineDirective<string, HTMLLIElement>((element, binding) => {
  mountContent(element, binding.value);
});

const items = ["a", "b"];

export const DirectiveClosureProbe = defineHtml(\`
  <ul><li v-for="item in items" :key="item" v-content=\${item}></li></ul>
\`);
      `,
      { filename: "DirectiveClosureProbe.ts", templateTypeCheck: false }
    );
    expectNoDiagnostics(result);
    expect(result.code).toContain("const content = (element, binding) =>");
    expect(result.code).toContain("[__elfLocalDirectivesKey]: { content: content }");
    expect(result.code).not.toMatch(/const __elfDirectives\s*=/);

    const exports = evalMacroModule(result.code);
    const ctor = exports.DirectiveClosureProbe as runtime.ElfElementConstructor;
    const tag = runtime.ensureCustomElement(ctor);
    const first = document.createElement(tag);
    const second = document.createElement(tag);
    first.setAttribute("prefix", "first");
    second.setAttribute("prefix", "second");
    document.body.append(first, second);
    await nextMicrotask();
    await nextMicrotask();

    expect(
      Array.from((first.shadowRoot ?? first).querySelectorAll("li"), (item) => item.textContent)
    ).toEqual(["first:a:content:1", "first:b:content:2"]);
    expect(
      Array.from((second.shadowRoot ?? second).querySelectorAll("li"), (item) => item.textContent)
    ).toEqual(["second:a:content:1", "second:b:content:2"]);
  });

  it("rejects legacy or unassigned defineDirective macro calls", () => {
    const legacy = compileRuntimeMacro(
      `
import { defineDirective, defineHtml } from "@elfui/core";
defineDirective("legacy", { mounted() {} });
export const LegacyDirectiveProbe = defineHtml(\`<p v-legacy>legacy</p>\`);
      `,
      { filename: "LegacyDirectiveProbe.ts", templateTypeCheck: false }
    );
    const unassigned = compileRuntimeMacro(
      `
import { defineDirective, defineHtml } from "@elfui/core";
defineDirective({ mounted() {} });
export const UnassignedDirectiveProbe = defineHtml(\`<p>unassigned</p>\`);
      `,
      { filename: "UnassignedDirectiveProbe.ts", templateTypeCheck: false }
    );

    expect(legacy.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "ELF_MACRO_DEFINE_DIRECTIVE" })])
    );
    expect(unassigned.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "ELF_MACRO_DEFINE_DIRECTIVE" })])
    );
  });

  it("runs onErrorCaptured for macro render errors", () => {
    const log: string[] = [];
    (globalThis as { __elfMacroRuntimeLog?: string[] }).__elfMacroRuntimeLog = log;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = compileRuntimeMacro(
      `
import { defineHtml, onErrorCaptured } from "@elfui/core";

const log = (globalThis as { __elfMacroRuntimeLog: string[] }).__elfMacroRuntimeLog;
const fail = (): string => {
  throw new Error("macro boom");
};

onErrorCaptured((err) => {
  log.push(err instanceof Error ? err.message : String(err));
  return false;
});

const broken = fail();

export const MacroErrorProbe = defineHtml(\`<p>\${broken}</p>\`);
      `,
      { filename: "MacroErrorProbe.ts" }
    );
    expectNoDiagnostics(result);
    const exports = evalMacroModule(result.code);
    const ctor = exports.MacroErrorProbe as runtime.ElfElementConstructor;
    document.body.appendChild(document.createElement(runtime.ensureCustomElement(ctor)));

    expect(log).toEqual(["macro boom"]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("routes child template getter, event and directive errors to the parent boundary", async () => {
    const log: string[] = [];
    (globalThis as { __elfMacroRuntimeLog?: string[] }).__elfMacroRuntimeLog = log;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = compileRuntimeMacro(
      `
import { defineHtml, usePlugin } from "@elfui/core";

const failGetter = (): string => {
  throw new Error("getter boom");
};
const failEvent = (): void => {
  throw new Error("event boom");
};

usePlugin((ctx) => {
  ctx.directive("explode", {
    mounted() {
      throw new Error("directive boom");
    }
  });
});

export const MacroBindingErrorProbe = defineHtml(\`
  <button v-explode @click=\${failEvent}>\${failGetter()}</button>
\`);
      `,
      { filename: "MacroBindingErrorProbe.ts" }
    );
    expectNoDiagnostics(result);
    const exports = evalMacroModule(result.code);
    const ctor = exports.MacroBindingErrorProbe as runtime.ElfElementConstructor;
    const childTag = runtime.ensureCustomElement(ctor);
    const parentTag = `elf-macro-error-parent-${Math.random().toString(36).slice(2, 8)}`;
    runtime.defineCustomElement({
      tag: parentTag,
      setup: () => {
        runtime.onErrorCaptured((error) => {
          log.push(error instanceof Error ? error.message : String(error));
          return false;
        });
        return {};
      },
      render: () => document.createElement(childTag)
    });
    const parent = document.createElement(parentTag);
    document.body.appendChild(parent);
    await nextMicrotask();

    const child = (parent.shadowRoot ?? parent).querySelector(childTag)!;
    const button = (child.shadowRoot ?? child).querySelector("button")!;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(log).toEqual(["getter boom", "directive boom", "event boom"]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("batches multiple state writes in a compiled event boundary", () => {
    const log: string[] = [];
    (globalThis as { __elfMacroRuntimeLog?: string[] }).__elfMacroRuntimeLog = log;
    const result = compileRuntimeMacro(
      `
import { defineHtml, useRef } from "@elfui/core";

const log = (globalThis as { __elfMacroRuntimeLog: string[] }).__elfMacroRuntimeLog;
const count = useRef(0);
const increment = (): void => {
  count.value = 1;
  count.value = 2;
};
const label = (): number => {
  log.push(\`render:\${count.value}\`);
  return count.value;
};

export const MacroBatchProbe = defineHtml(\`<button @click=\${increment}>\${label()}</button>\`);
      `,
      { filename: "MacroBatchProbe.ts" }
    );
    expectNoDiagnostics(result);
    const exports = evalMacroModule(result.code);
    const ctor = exports.MacroBatchProbe as runtime.ElfElementConstructor;
    const el = document.createElement(runtime.ensureCustomElement(ctor));
    document.body.appendChild(el);

    (el.shadowRoot ?? el).querySelector("button")?.dispatchEvent(new MouseEvent("click"));

    expect(log).toEqual(["render:0", "render:2"]);
    expect((el.shadowRoot ?? el).querySelector("button")?.textContent).toBe("2");
  });
});

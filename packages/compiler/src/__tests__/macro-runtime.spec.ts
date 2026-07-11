import { afterEach, describe, expect, it, vi } from "vitest";
import * as ts from "typescript";

import * as reactivity from "@elfui/reactivity";
import * as runtime from "@elfui/runtime";
import * as runtimeInternal from "@elfui/runtime/internal";

import { compileMacroComponent, formatElfDiagnostic } from "../macro-component";

type EvaluatedModule = Record<string, unknown>;

const elfuiRuntimeShim = {
  ...reactivity,
  ...runtime,
  computed: reactivity.useComputed
};

const evalMacroModule = (code: string): EvaluatedModule => {
  const js = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS
    }
  }).outputText;
  const module = { exports: {} as EvaluatedModule };
  const require = (id: string): unknown => {
    if (id === "@elfui/core") return elfuiRuntimeShim;
    if (id === "@elfui/reactivity") return reactivity;
    if (id === "@elfui/runtime") return runtime;
    if (id === "@elfui/runtime/internal") return runtimeInternal;
    throw new Error(`Unexpected module import in macro runtime test: ${id}`);
  };
  const factory = new Function("require", "exports", "module", "__DEV__", js);
  factory(require, module.exports, module, true);
  return module.exports;
};

const expectNoDiagnostics = (result: ReturnType<typeof compileMacroComponent>): void => {
  expect(result.diagnostics.map(formatElfDiagnostic)).toEqual([]);
};

const nextMicrotask = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  runtime.resetDirectives();
  runtime.resetConfig();
  delete (globalThis as { __elfMacroRuntimeLog?: string[] }).__elfMacroRuntimeLog;
});

describe("M9.7 macro runtime coverage", () => {
  it("runs plugin directives and lifecycle hooks in a real macro component", async () => {
    const log: string[] = [];
    (globalThis as { __elfMacroRuntimeLog?: string[] }).__elfMacroRuntimeLog = log;
    const result = compileMacroComponent(
      `
import {
  defineHtml,
  html,
  onBeforeUpdate,
  onMount,
  onUnmount,
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

onMount(() => log.push("mount"));
onBeforeUpdate(() => log.push("beforeUpdate"));
onUpdated(() => log.push("updated"));
onUnmount(() => log.push("unmount"));

export const MacroLifecycleProbe = defineHtml(html\`
  <button v-macro-mark @click=\${inc}>\${count}</button>
\`);
      `,
      { filename: "MacroLifecycleProbe.ts" }
    );
    expectNoDiagnostics(result);
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

  it("runs onErrorCaptured for macro render errors", () => {
    const log: string[] = [];
    (globalThis as { __elfMacroRuntimeLog?: string[] }).__elfMacroRuntimeLog = log;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = compileMacroComponent(
      `
import { defineHtml, html, onErrorCaptured } from "@elfui/core";

const log = (globalThis as { __elfMacroRuntimeLog: string[] }).__elfMacroRuntimeLog;
const fail = (): string => {
  throw new Error("macro boom");
};

onErrorCaptured((err) => {
  log.push(err instanceof Error ? err.message : String(err));
  return false;
});

const broken = fail();

export const MacroErrorProbe = defineHtml(html\`<p>\${broken}</p>\`);
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
});

import { describe, expect, it } from "vitest";
import * as ts from "typescript";

import { compileMacroComponent, formatElfDiagnostic } from "../macro-component";

// cspell:ignore apiLab

const workspaceRoot = ts.sys.getCurrentDirectory().replace(/\\/g, "/");

const typeCheckOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  baseUrl: workspaceRoot,
  paths: {
    "@elfui/shared": ["./packages/shared/src/index.ts"],
    "@elfui/reactivity": ["./packages/reactivity/src/index.ts"],
    "@elfui/runtime": ["./packages/runtime/src/index.ts"],
    "@elfui/runtime/internal": ["./packages/runtime/src/internal.ts"],
    "@elfui/compiler-template": ["./packages/compiler-template/src/index.ts"],
    "@elfui/compiler": ["./packages/compiler/src/index.ts"],
    elfui: ["./packages/elfui/src/index.ts"]
  }
};

const expectGeneratedCodeTypeChecks = (code: string): void => {
  const fileName = `${workspaceRoot}/.elf-api-lab-generated.ts`;
  const globalsFileName = `${workspaceRoot}/.elf-api-lab-globals.d.ts`;
  const host = ts.createCompilerHost(typeCheckOptions, true);
  const originalReadFile = host.readFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);

  host.fileExists = (name): boolean => {
    const normalized = name.replace(/\\/g, "/");
    return normalized === fileName || normalized === globalsFileName || originalFileExists(name);
  };
  host.readFile = (name): string | undefined => {
    const normalized = name.replace(/\\/g, "/");
    if (normalized === fileName) return code;
    if (normalized === globalsFileName) return "declare const __DEV__: boolean;";
    return originalReadFile(name);
  };

  const program = ts.createProgram([globalsFileName, fileName], typeCheckOptions, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  expect(
    diagnostics.map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      if (!diagnostic.file || diagnostic.start === undefined) return message;
      const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} ${message}`;
    })
  ).toEqual([]);
};

const expectNoDiagnostics = (result: ReturnType<typeof compileMacroComponent>): void => {
  expect(result.diagnostics.map(formatElfDiagnostic)).toEqual([]);
};

describe("M9.1 api-lab macro coverage", () => {
  it("compiles a macro component covering macro, reactive, lifecycle and form APIs", () => {
    const result = compileMacroComponent(
      `
import {
  css,
  createInjectionKey,
  defineDirective,
  defineEmits,
  defineExpose,
  defineHtml,
  defineModel,
  defineOptions,
  defineProps,
  defineSlots,
  defineStyle,
  html,
  inject,
  nextTick,
  onActivated,
  onBeforeMount,
  onBeforeUnmount,
  onBeforeUpdate,
  onDeactivated,
  onErrorCaptured,
  onMount,
  onUnmount,
  onUpdated,
  provide,
  readonly,
  useComputed,
  useEffect,
  useFormControlContext,
  useHost,
  useReactive,
  useRef,
  useRenderRoot,
  useScopedSlot,
  useTemplateRef,
  watch,
  watchEffect
} from "elfui";

type ApiLabProps = {
  label: string;
  modelValue: string;
  disabled?: boolean;
};
type ApiLabEmits = {
  select: [value: string];
  "update:modelValue": [value: string];
};
type ApiLabSlots = {
  default?: () => unknown;
  item: (scope: { item: string; index: number }) => unknown;
};

const ApiKey = createInjectionKey<{ label: string }>("api-lab");

defineOptions({
  shadow: "open",
  formControl: { defaultValue: "" },
  register: false
});

const props = defineProps<ApiLabProps>({
  label: { type: String, default: "Lab" },
  modelValue: { type: String, default: "" },
  disabled: Boolean
});
const emit = defineEmits<ApiLabEmits>();
const model = defineModel<string>({ default: "" });
defineSlots<ApiLabSlots>();
defineDirective("api-focus", {
  mounted(el: HTMLElement) {
    el.setAttribute("data-api-focus", "true");
  }
});
defineStyle(css\`
  :host { display: block; }
\`);

provide(ApiKey, { label: props.label });
const injected = inject(ApiKey, { label: "fallback" }) ?? { label: "fallback" };
const count = useRef(0);
const state = useReactive({ items: ["one"], ready: true });
const doubled = useComputed(() => count.value * 2);
const frozen = readonly({ kind: "api-lab" });
const form = useFormControlContext<string>();
const host = useHost();
const root = useRenderRoot();
const input = useTemplateRef<HTMLInputElement>("input");
const renderItem = useScopedSlot<{ item: string; index: number }>("item");

const syncForm = (): void => {
  form.setValue(model.value);
};
const activate = (): void => {
  count.set(count.peek() + 1);
  model.set(injected.label);
  emit("select", injected.label);
};

watch(() => props.label, syncForm);
watchEffect(() => {
  if (state.ready) syncForm();
});
useEffect(() => {
  host.dataset.kind = frozen.kind;
});
void nextTick();

onBeforeMount(syncForm);
onMount(() => {
  input.value?.focus();
  renderItem({ item: injected.label, index: count.value });
});
onBeforeUpdate(syncForm);
onUpdated(syncForm);
onBeforeUnmount(syncForm);
onUnmount(syncForm);
onActivated(syncForm);
onDeactivated(syncForm);
onErrorCaptured(() => false);

defineExpose({
  focus: () => input.value?.focus(),
  host,
  root
});

export const ApiLabField = defineHtml<ApiLabProps, ApiLabEmits, ApiLabSlots>(html\`
  <section v-api-focus=\${model.value} :data-kind=\${frozen.kind}>
    <input ref="input" v-model=\${model} :disabled=\${props.disabled} />
    <button type="button" @click=\${activate}>\${props.label}: \${doubled}</button>
    <template v-for="(item, index) in state.items" :key="item">
      <span>{{ index }}: {{ item }}</span>
    </template>
    <slot></slot>
  </section>
\`);
      `,
      { filename: "packages/compiler/src/__tests__/ApiLabField.elf.ts" }
    );

    expectNoDiagnostics(result);
    expect(result.components[0]).toMatchObject({
      exportName: "ApiLabField",
      name: "elf-api-lab-field"
    });
    expect(result.code).toContain('formControl: { defaultValue: "" }');
    expect(result.code).toContain('const __elfDirectives = { "api-focus":');
    expect(result.code).toContain("onActivated(syncForm);");
    expect(result.code).toContain("useFormControlContext<string>();");
    expect(result.code).toContain("useScopedSlot<{ item: string; index: number }>");
    expect(result.code).toContain(
      "__elfDefineComponent<ApiLabProps, __ElfEmitTuples<ApiLabEmits>, ApiLabSlots>"
    );
    expectGeneratedCodeTypeChecks(result.code);
  }, 15000);

  it("compiles a parent smoke component covering local components, plugins, router and built-ins", () => {
    const result = compileMacroComponent(
      `
import {
  defineHtml,
  defineProps,
  html,
  useComponents,
  useExtend,
  usePlugin,
  useRef,
  useTheme,
  useVariant
} from "elfui";
import { TypedChild } from "./fixtures/typed-child";

usePlugin({
  install(ctx) {
    ctx.directive("plugin-mark", {
      mounted(el: Element) {
        el.setAttribute("data-plugin-mark", "true");
      }
    });
    ctx.configure({ globalProperties: { apiLab: true } });
  }
});

const disposeTheme = useTheme("elf-api-lab-parent", \`
  color: var(--api-lab-color);
\`, { id: "api-lab-parent" });
const ExtendedChild = useExtend(TypedChild).name("elf-api-lab-extended").build();
const VariantChild = useVariant(TypedChild, "elf-api-lab-variant").build();
useComponents(TypedChild, { ExtendedChild, VariantChild });

const props = defineProps({
  open: false,
  names: [] as string[]
});
const current = useRef(1);
const dynamicTag = useRef("elf-api-lab-extended");
const source = useRef(Promise.resolve("ok"));

const onSelect = (event: CustomEvent<string>): void => {
  current.set(event.detail.length);
};
const navigate = (): void => {
  disposeTheme();
};

export const ApiLabParent = defineHtml(html\`
  <main v-plugin-mark>
    <TypedChild label="Save" v-model=\${current} @select=\${onSelect}>
      <template #item="{ id }">{{ (id ?? "").toUpperCase() }}</template>
    </TypedChild>
    <ExtendedChild label="Ext" :model-value=\${current}></ExtendedChild>
    <VariantChild label="Var" :model-value=\${current}></VariantChild>
    <Transition name="fade"><p v-if=\${props.open}>open</p></Transition>
    <TransitionGroup tag="ul" name="list">
      <li v-for="name in props.names" :key="name">{{ name }}</li>
    </TransitionGroup>
    <KeepAlive><component :is=\${dynamicTag}></component></KeepAlive>
    <Suspense :source=\${source}>
      <p>done</p>
      <template #fallback><span>loading</span></template>
    </Suspense>
    <Teleport to="body"><button type="button" @click=\${navigate}>go</button></Teleport>
  </main>
\`);
      `,
      { filename: "packages/compiler/src/__tests__/ApiLabParent.elf.ts" }
    );

    expectNoDiagnostics(result);
    expect(result.components[0]).toMatchObject({
      exportName: "ApiLabParent",
      name: "elf-api-lab-parent"
    });
    expect(result.code).toContain("usePlugin({");
    expect(result.code).toContain("const ExtendedChild = useExtend(TypedChild)");
    expect(result.code).toContain("const VariantChild = useVariant(TypedChild");
    expect(result.code).toContain("teleport(");
    expect(result.code).toContain("transition(");
    expect(result.code).toContain("transitionGroup(");
    expect(result.code).toContain("keepAlive(");
    expect(result.code).toContain("suspense(");
  });
});

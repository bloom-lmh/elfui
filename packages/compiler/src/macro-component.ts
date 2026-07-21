import * as ts from "typescript";
import path from "node:path";
import {
  AttrTypes,
  NodeTypes,
  parse,
  type DirectiveNode,
  type ElementNode,
  type SourceLoc,
  type TemplateChildNode
} from "@elfui/compiler-template";
import { codegen } from "./codegen";
import type { ElfDiagnostic, ElfDiagnosticSeverity } from "./diagnostic";

export { formatElfDiagnostic, type ElfDiagnostic, type ElfDiagnosticSeverity } from "./diagnostic";

const DEFAULT_RUNTIME_IMPORT = "@elfui/core";
const DEFAULT_MACRO_IMPORT = "@elfui/core";
const DEFAULT_RENDER_RUNTIME_IMPORT = "@elfui/core/internal";
const TEMPLATE_MACRO_STUB = `
declare module "@elfui/core" {
  export type MacroHtmlTemplate = string & { readonly __elfHtmlTemplate?: true };
  export type MacroSlotMap = object;
  export type MacroEmitMap = Record<string, (...args: any[]) => void> | Record<string, readonly unknown[]>;
  export type MacroEmitValue = ((...args: any[]) => void) | readonly unknown[];
  export type MacroEmitShape<T extends object> = { [K in keyof T]: T[K] extends MacroEmitValue ? T[K] : never };
  export type MacroEmitArgs<T> = T extends (...args: infer Args) => unknown ? Args : T extends readonly unknown[] ? [...T] : never;
  export type MacroEmitTuples<T extends object> = { [K in keyof T & string]: MacroEmitArgs<T[K]> };
  export interface ElfElementConstructor<Props extends object = Record<string, unknown>, Emits extends Record<string, unknown[]> = Record<string, unknown[]>, Slots extends object = object> extends CustomElementConstructor {
    readonly __elfProps?: Readonly<Props>;
    readonly __elfEmits?: Emits;
    readonly __elfSlots?: Slots;
  }
  type MacroPropConstructorValue<T> = T extends StringConstructor
    ? string
    : T extends NumberConstructor
      ? number
      : T extends BooleanConstructor
        ? boolean
        : T extends ArrayConstructor
          ? unknown[]
          : T extends ObjectConstructor
            ? Record<string, unknown>
            : T extends FunctionConstructor
              ? (...args: unknown[]) => unknown
              : unknown;
  type MacroDefaultValue<T> = T extends (...args: unknown[]) => infer R ? R : T;
  type MacroPropValue<T> = T extends { type: infer C; default: infer D }
    ? [NonNullable<C>] extends [never]
      ? MacroDefaultValue<D>
      : MacroPropConstructorValue<NonNullable<C>>
    : T extends { type: infer C }
      ? [NonNullable<C>] extends [never]
        ? unknown
        : MacroPropConstructorValue<NonNullable<C>>
      : T extends { default: infer D }
        ? MacroDefaultValue<D>
        : T extends StringConstructor | NumberConstructor | BooleanConstructor | ArrayConstructor | ObjectConstructor | FunctionConstructor
          ? MacroPropConstructorValue<T>
          : MacroDefaultValue<T>;
  export type MacroInferProps<T extends Record<string, unknown>> = Readonly<{ [K in keyof T]: MacroPropValue<T[K]> }>;
  export const html: any;
  export const css: any;
  export function defineHtml<Props extends object = Record<string, unknown>, Emits extends MacroEmitShape<Emits> = Record<string, unknown[]>, Slots extends object = object>(template: MacroHtmlTemplate): ElfElementConstructor<Props, MacroEmitTuples<Emits>, Slots>;
  export const defineName: any;
  export const defineOptions: any;
  export function defineProps<const T extends Record<string, unknown>>(props: T): MacroInferProps<T>;
  export function defineProps<TProps extends object, const TOptions extends Record<string, unknown> = Record<string, unknown>>(props: TOptions): Readonly<TProps>;
  export function defineProps<TProps extends object>(): Readonly<TProps>;
  export function defineProps(props?: unknown): Record<string, unknown>;
  export function defineEmits<T extends MacroEmitShape<T>>(events?: readonly (keyof T & string)[]): any;
  export function defineEmits(events?: readonly string[]): any;
  export const defineModel: any;
  export const defineStyle: any;
  export const defineDirective: any;
  export const defineSlots: any;
  export const useComponents: any;
  export function useRef<T>(value: T): { value: T; peek(): T; set(value: T): void };
  export function useComputed<T>(getter: () => T): { readonly value: T; peek(): T };
  export const useReactive: any;
  export const useEffect: any;
  export const useTemplateRef: any;
  export const useHost: any;
  export const useShadowRoot: any;
  export const useRenderRoot: any;
  export const useAppConfig: any;
  export const useAttrs: any;
  export const useEventListener: any;
  export const useClickOutside: any;
  export const useEscapeKey: any;
  export const useScrollLock: any;
  export const useHostAttr: any;
  export const useHostClass: any;
  export const useHostCssVar: any;
  export const useHostFlag: any;
  export const useHostStyle: any;
  export const defineExpose: any;
  export const globalStyle: any;
  export const theme: any;
  export const provide: any;
  export const inject: any;
  export const createInjectionKey: any;
  export const onMount: any;
  export const onUnmount: any;
  export const onUpdated: any;
  export const onBeforeUpdate: any;
  export const nextTick: any;
  export const watch: any;
  export const watchEffect: any;
}
`;

const macroNames = new Set([
  "html",
  "css",
  "defineHtml",
  "defineName",
  "defineOptions",
  "defineProps",
  "defineEmits",
  "defineModel",
  "defineStyle",
  "defineDirective",
  "defineSlots",
  "useComponents"
]);

const removedMacroAliasReplacements = new Map([
  ["useName", "defineName"],
  ["useProps", "defineProps"],
  ["useEmit", "defineEmits"],
  ["useStyle", "defineStyle"]
]);

const moduleSideEffectCalls = new Set(["globalStyle", "theme", "usePlugin", "useTheme"]);
const moduleLevelDeclarationCalls = new Set(["useExtend", "useVariant"]);

export interface MacroComponentCompileOptions {
  filename?: string;
  /** 跨机器稳定的源码标识；Vite 插件使用项目根目录相对 POSIX 路径。 */
  sourceId?: string;
  runtimeImport?: string;
  macroImport?: string;
  tagPrefix?: string;
  templateTypeCheck?: boolean;
}

export interface ElfSourceMap {
  version: 3;
  file: string;
  sources: string[];
  sourcesContent: string[];
  names: string[];
  mappings: string;
}

export interface MacroCompiledComponent {
  exportName: "default" | string;
  name: string;
  template: string;
  lazyRegister: boolean;
}

export interface MacroComponentCompileResult {
  code: string;
  map: ElfSourceMap;
  components: MacroCompiledComponent[];
  diagnostics: ElfDiagnostic[];
  metadata: MacroComponentMetadata;
}

export interface MacroComponentMetadata {
  filename: string;
  sourceId: string;
  components: MacroExportedComponentMetadata[];
  localComponents: MacroLocalComponentMetadata[];
  exposed: string[];
}

export interface MacroExportedComponentMetadata {
  exportName: "default" | string;
  localName?: string;
  name: string;
  propsType: string;
  emitsType: string;
  slotsType: string;
  propNames: string[];
  /** 编译器生成或保留的 runtime prop option 源码，供 language-tools/诊断展示。 */
  runtimePropOptions: Record<string, string>;
  emitNames: string[];
}

export interface MacroLocalComponentMetadata {
  name: string;
  expression: string;
  constructorType: string;
  propsType: string;
  emitsType: string;
  slotsType: string;
}

interface InternalCompiledComponent extends MacroCompiledComponent {
  localName?: string;
  exportMode?: "inline" | "separate" | "default";
  propsType?: string;
  emitsType?: string;
  slotsType?: string;
  renderName: string;
  renderCode: string;
  renderHelpers: string[];
  sourceStart: number;
  sourceEnd: number;
}

interface ModelMacro {
  localName: string;
  propName: string;
  typeArgs: string;
}

interface TemplateExport {
  exportName: "default" | string;
  localName?: string;
  nameHint?: string;
  template: string;
  sourceStart: number;
  sourceEnd: number;
  lazyRegister: boolean;
  exportMode?: "inline" | "separate" | "default";
  propsType?: string;
  emitsType?: string;
  slotsType?: string;
}

interface TemplateInfo {
  template: string;
  sourceStart: number;
  sourceEnd: number;
  propsType?: string;
  emitsType?: string;
  slotsType?: string;
}

interface TemplateTypeCheckEntry {
  expression: string;
  kind: string;
  loc: SourceLoc;
  templateSourceStart: number;
}

interface TemplateTypeCheckBuilder {
  code: CodeBuilder;
  entries: Map<number, TemplateTypeCheckEntry>;
  templateIndex: number;
  loopIndex: number;
  slotIndex: number;
  currentTemplateSourceStart: number;
}

class CodeBuilder {
  readonly lines: string[];

  constructor(lines: readonly string[] = []) {
    this.lines = [...lines];
  }

  line(value = ""): number {
    this.lines.push(value);
    return this.lines.length;
  }

  chunk(value: string | null | undefined): void {
    if (!value) return;
    if (this.lines.length > 0 && this.lines[this.lines.length - 1] !== "") {
      this.line();
    }
    for (const line of value.split(/\r\n|\r|\n/)) {
      this.line(line);
    }
  }

  toString(): string {
    return this.lines.join("\n");
  }
}

interface MacroGeneratedModule {
  runtimeImport: string;
  runtimeImports: string[];
  renderRuntimeImport: string;
  renderRuntimeImports: string[];
  modelRuntimeImport: string;
  modelRuntimeImports: string[];
  preservedImports: string[];
  topLevelStatements: string[];
  sharedDeclarations: string[];
  renderFunctions: string[];
  typeAliases: string;
  setupFactory: string;
  componentFactories: string[];
}

interface TransformState {
  source: string;
  sourceFile: ts.SourceFile;
  filename: string;
  sourceId: string;
  runtimeImport: string;
  macroImport: string;
  tagPrefix: string;
  imports: string[];
  macroRuntimeImports: string[];
  topLevel: string[];
  setupStatements: string[];
  templateTemps: string[];
  diagnostics: ElfDiagnostic[];
  props: Map<string, string>;
  emits: Set<string>;
  styles: string[];
  directives: Map<string, string>;
  components: Map<string, string>;
  options: Map<string, string>;
  templateVars: Map<string, TemplateInfo & { lazyRegister: boolean }>;
  templates: TemplateExport[];
  templateExportKeys: Set<string>;
  exposed: Set<string>;
  modelMacros: ModelMacro[];
  slotsType: string | null;
  propsType: string | null;
  emitsType: string | null;
  nameDefault: string | null;
  nameMap: Map<string, string>;
  propsVarName: string | null;
  emitVarName: string | null;
}

interface DiagnosticInit {
  code: string;
  message: string;
  severity?: ElfDiagnosticSeverity;
  node?: ts.Node;
  start?: number;
  end?: number;
  hint?: string;
}

const addDiagnostic = (state: TransformState, init: DiagnosticInit): void => {
  let start = init.start;
  let end = init.end;
  if (init.node) {
    start ??= init.node.getStart(state.sourceFile);
    end ??= init.node.getEnd();
  }

  const diagnostic: ElfDiagnostic = {
    code: init.code,
    severity: init.severity ?? "error",
    message: init.message,
    file: state.filename,
    ...(start !== undefined ? { start } : {}),
    ...(end !== undefined ? { end } : {}),
    ...(init.hint ? { hint: init.hint } : {})
  };

  if (start !== undefined) {
    const position = state.sourceFile.getLineAndCharacterOfPosition(start);
    diagnostic.line = position.line + 1;
    diagnostic.column = position.character + 1;
  }

  state.diagnostics.push(diagnostic);
};

export const compileMacroComponent = (
  source: string,
  options: MacroComponentCompileOptions = {}
): MacroComponentCompileResult => {
  const filename = options.filename ?? "component.elf.ts";
  const sourceId = normalizeSourceId(options.sourceId ?? filename);
  const state: TransformState = {
    source,
    sourceFile: ts.createSourceFile(
      filename,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    ),
    filename,
    sourceId,
    runtimeImport: options.runtimeImport ?? DEFAULT_RUNTIME_IMPORT,
    macroImport: options.macroImport ?? DEFAULT_MACRO_IMPORT,
    tagPrefix: normalizeTagPrefix(options.tagPrefix),
    imports: [],
    macroRuntimeImports: [],
    topLevel: [],
    setupStatements: [],
    templateTemps: [],
    diagnostics: [],
    props: new Map(),
    emits: new Set(),
    styles: [],
    directives: new Map(),
    components: new Map(),
    options: new Map(),
    templateVars: new Map(),
    templates: [],
    templateExportKeys: new Set(),
    exposed: new Set(),
    modelMacros: [],
    slotsType: null,
    propsType: null,
    emitsType: null,
    nameDefault: null,
    nameMap: new Map(),
    propsVarName: null,
    emitVarName: null
  };

  for (const statement of state.sourceFile.statements) {
    visitTopLevelStatement(statement, state);
  }

  if (state.templates.length === 0) {
    addDiagnostic(state, {
      code: "ELF_MACRO_NO_TEMPLATE",
      message:
        "未找到组件模板；请使用 export const X = defineHtml(html`...`) 或 const X = defineHtml(html`...`); export { X }。",
      hint: "宏组件文件需要导出一个 html 模板或 defineHtml(...) 组件构造器。"
    });
  }

  const components: InternalCompiledComponent[] = state.templates.map((template, index) => {
    const renderName = `__elfRender${index}`;
    const scopeNames = dedupe([...state.exposed, ...state.props.keys()]);
    const render = renderPrecompiledTemplate(template.template, renderName, scopeNames);
    return {
      exportName: template.exportName,
      name: resolveComponentName(template, state),
      template: template.template,
      lazyRegister: template.lazyRegister,
      renderName,
      renderCode: render.code,
      renderHelpers: render.helpers,
      sourceStart: template.sourceStart,
      sourceEnd: template.sourceEnd,
      ...(template.localName ? { localName: template.localName } : {}),
      ...(template.exportMode ? { exportMode: template.exportMode } : {}),
      ...(template.propsType ? { propsType: template.propsType } : {}),
      ...(template.emitsType ? { emitsType: template.emitsType } : {}),
      ...(template.slotsType ? { slotsType: template.slotsType } : {})
    };
  });

  if (options.templateTypeCheck !== false) {
    collectTemplateTypeDiagnostics(state);
  }

  const code = renderOutput(state, components);

  return {
    code,
    map: createMacroSourceMap(state, code),
    components: components.map(({ exportName, name, template, lazyRegister }) => ({
      exportName,
      name,
      template,
      lazyRegister
    })),
    diagnostics: state.diagnostics,
    metadata: buildMetadata(state, components)
  };
};

const visitTopLevelStatement = (statement: ts.Statement, state: TransformState): void => {
  if (ts.isImportDeclaration(statement)) {
    collectImport(statement, state);
    return;
  }

  if (ts.isExportDeclaration(statement)) {
    if (collectExportDeclaration(statement, state)) {
      return;
    }
    state.topLevel.push(textOf(statement, state));
    return;
  }

  if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
    state.topLevel.push(textOf(statement, state));
    return;
  }

  if (ts.isExportAssignment(statement)) {
    collectExportAssignment(statement, state);
    return;
  }

  if (ts.isVariableStatement(statement)) {
    collectVariableStatement(statement, state);
    return;
  }

  if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)) {
    if (collectMacroCall(statement.expression, null, state)) {
      return;
    }
    if (isModuleSideEffectCall(statement.expression)) {
      state.topLevel.push(textOf(statement, state));
      return;
    }
  }

  if (isExported(statement)) {
    state.topLevel.push(textOf(statement, state));
    return;
  }

  state.setupStatements.push(textOf(statement, state));
  collectStatementBindings(statement, state.exposed);
};

const collectImport = (statement: ts.ImportDeclaration, state: TransformState): void => {
  const moduleName = stringLiteralValue(statement.moduleSpecifier);
  if (moduleName !== state.macroImport) {
    state.imports.push(textOf(statement, state));
    return;
  }

  const clause = statement.importClause;
  if (!clause) return;
  if (clause.isTypeOnly) {
    state.imports.push(textOf(statement, state));
    return;
  }

  if (clause.name || (clause.namedBindings && !ts.isNamedImports(clause.namedBindings))) {
    addDiagnostic(state, {
      code: "ELF_MACRO_UNSUPPORTED_IMPORT",
      message: "暂不支持 elfui 的 default 或 namespace import。",
      node: statement.importClause ?? statement
    });
    return;
  }

  const named = clause.namedBindings;
  if (!named || !ts.isNamedImports(named)) return;

  for (const specifier of named.elements) {
    const imported = (specifier.propertyName ?? specifier.name).text;
    const replacement = removedMacroAliasReplacements.get(imported);
    if (replacement) {
      addDiagnostic(state, {
        code: "ELF_MACRO_REMOVED_ALIAS",
        message: `${imported} 已从 beta 宏 API 删除；请改用 ${replacement}。`,
        node: specifier,
        hint: `把 import 中的 ${imported} 改为 ${replacement}，并同步替换调用点。`
      });
      continue;
    }
    if (!macroNames.has(imported)) {
      state.macroRuntimeImports.push(specifier.getText(state.sourceFile));
    }
  }
};

const collectExportDeclaration = (
  statement: ts.ExportDeclaration,
  state: TransformState
): boolean => {
  if (statement.moduleSpecifier) return false;
  const clause = statement.exportClause;
  if (!clause || !ts.isNamedExports(clause)) return false;

  const kept: ts.ExportSpecifier[] = [];
  let collected = false;

  for (const specifier of clause.elements) {
    const localName = (specifier.propertyName ?? specifier.name).text;
    const exportName = specifier.name.text;
    const template = state.templateVars.get(localName);
    if (!template) {
      kept.push(specifier);
      continue;
    }

    addTemplateExport(
      {
        exportName,
        localName,
        nameHint: exportName,
        template: template.template,
        sourceStart: template.sourceStart,
        sourceEnd: template.sourceEnd,
        lazyRegister: template.lazyRegister,
        exportMode: "separate",
        ...(template.propsType ? { propsType: template.propsType } : {}),
        ...(template.emitsType ? { emitsType: template.emitsType } : {}),
        ...(template.slotsType ? { slotsType: template.slotsType } : {})
      },
      state
    );
    collected = true;
  }

  if (!collected) return false;
  if (kept.length > 0) {
    const names = kept.map((specifier) => textOf(specifier, state)).join(", ");
    state.topLevel.push(`export { ${names} };`);
  }
  return true;
};

const collectExportAssignment = (statement: ts.ExportAssignment, state: TransformState): void => {
  const expression = stripExpression(statement.expression);
  if (ts.isCallExpression(expression) && callName(expression) === "defineHtml") {
    const defineHtmlTemplate = getDefineHtmlTemplate(expression, state);
    if (defineHtmlTemplate) {
      addTemplateExport(
        {
          exportName: "default",
          template: defineHtmlTemplate.template,
          sourceStart: defineHtmlTemplate.sourceStart,
          sourceEnd: defineHtmlTemplate.sourceEnd,
          lazyRegister: true,
          exportMode: "default",
          ...(defineHtmlTemplate.propsType ? { propsType: defineHtmlTemplate.propsType } : {}),
          ...(defineHtmlTemplate.emitsType ? { emitsType: defineHtmlTemplate.emitsType } : {}),
          ...(defineHtmlTemplate.slotsType ? { slotsType: defineHtmlTemplate.slotsType } : {})
        },
        state
      );
    }
    return;
  }

  if (ts.isIdentifier(expression)) {
    const template = state.templateVars.get(expression.text);
    if (template) {
      addTemplateExport(
        {
          exportName: "default",
          localName: expression.text,
          nameHint: expression.text,
          template: template.template,
          sourceStart: template.sourceStart,
          sourceEnd: template.sourceEnd,
          lazyRegister: template.lazyRegister,
          exportMode: "default",
          ...(template.propsType ? { propsType: template.propsType } : {}),
          ...(template.emitsType ? { emitsType: template.emitsType } : {}),
          ...(template.slotsType ? { slotsType: template.slotsType } : {})
        },
        state
      );
      return;
    }
  }

  if (
    ts.isTaggedTemplateExpression(statement.expression) &&
    isMacroTag(statement.expression, "html")
  ) {
    const template = compileHtmlTemplate(statement.expression, state);
    addTemplateExport(
      {
        exportName: "default",
        template: template.template,
        sourceStart: template.sourceStart,
        sourceEnd: template.sourceEnd,
        lazyRegister: false,
        exportMode: "default"
      },
      state
    );
    return;
  }
  state.topLevel.push(textOf(statement, state));
};

const collectVariableStatement = (statement: ts.VariableStatement, state: TransformState): void => {
  const exported = isExported(statement);
  const keptTopLevelDeclarations: string[] = [];
  const keptSetupDeclarations: string[] = [];

  for (const declaration of statement.declarationList.declarations) {
    const initializer = declaration.initializer;
    const localName = identifierText(declaration.name);

    if (
      exported &&
      localName &&
      initializer &&
      ts.isTaggedTemplateExpression(initializer) &&
      isMacroTag(initializer, "html")
    ) {
      addDiagnostic(state, {
        code: "ELF_MACRO_DIRECT_HTML_EXPORT",
        message: "命名模板导出请使用 defineHtml(html`...`)；不要直接 export const X = html`...`。",
        node: declaration,
        hint: "示例：export const Button = defineHtml(html`<button></button>`);"
      });
      continue;
    }

    const initializerValue = initializer ? stripExpression(initializer) : undefined;
    const defineHtmlTemplate = initializerValue
      ? getDefineHtmlTemplate(initializerValue, state)
      : null;
    if (localName && defineHtmlTemplate) {
      state.templateVars.set(localName, {
        template: defineHtmlTemplate.template,
        sourceStart: defineHtmlTemplate.sourceStart,
        sourceEnd: defineHtmlTemplate.sourceEnd,
        lazyRegister: true,
        ...(defineHtmlTemplate.propsType ? { propsType: defineHtmlTemplate.propsType } : {}),
        ...(defineHtmlTemplate.emitsType ? { emitsType: defineHtmlTemplate.emitsType } : {}),
        ...(defineHtmlTemplate.slotsType ? { slotsType: defineHtmlTemplate.slotsType } : {})
      });
      if (exported) {
        addTemplateExport(
          {
            exportName: localName,
            localName,
            nameHint: localName,
            template: defineHtmlTemplate.template,
            sourceStart: defineHtmlTemplate.sourceStart,
            sourceEnd: defineHtmlTemplate.sourceEnd,
            lazyRegister: true,
            exportMode: "inline",
            ...(defineHtmlTemplate.propsType ? { propsType: defineHtmlTemplate.propsType } : {}),
            ...(defineHtmlTemplate.emitsType ? { emitsType: defineHtmlTemplate.emitsType } : {}),
            ...(defineHtmlTemplate.slotsType ? { slotsType: defineHtmlTemplate.slotsType } : {})
          },
          state
        );
      }
      continue;
    }

    if (initializerValue && ts.isCallExpression(initializerValue)) {
      if (collectMacroCall(initializerValue, localName, state)) {
        continue;
      }
    }

    const declarationText = textOf(declaration, state);
    if (exported || isModuleLevelDeclaration(declaration)) {
      keptTopLevelDeclarations.push(declarationText);
    } else {
      keptSetupDeclarations.push(declarationText);
      collectBindingNames(declaration.name, state.exposed);
    }
  }

  const kind = declarationKind(statement.declarationList);

  if (keptTopLevelDeclarations.length > 0) {
    state.topLevel.push(
      `${exported ? "export " : ""}${kind} ${keptTopLevelDeclarations.join(", ")};`
    );
  }

  if (keptSetupDeclarations.length > 0) {
    state.setupStatements.push(`${kind} ${keptSetupDeclarations.join(", ")};`);
  }
};

const addTemplateExport = (template: TemplateExport, state: TransformState): void => {
  const key = `${template.exportName}:${template.localName ?? ""}`;
  if (state.templateExportKeys.has(key)) return;
  state.templateExportKeys.add(key);
  state.templates.push(template);
};

const collectMacroCall = (
  call: ts.CallExpression,
  localName: string | null,
  state: TransformState
): boolean => {
  const name = callName(call);
  if (!name || !macroNames.has(name)) return false;

  switch (name) {
    case "defineHtml":
      addDiagnostic(state, {
        code: "ELF_MACRO_DEFINE_HTML_USAGE",
        message:
          "defineHtml 需要赋值给本地变量或直接导出，例如 const Button = defineHtml(html`...`); export { Button }。",
        node: call
      });
      return true;
    case "defineName":
      collectUseName(call, state);
      return true;
    case "defineOptions":
      collectDefineOptions(call, state);
      return true;
    case "defineProps":
      collectUseProps(call, localName, state);
      return true;
    case "defineEmits":
      collectUseEmit(call, localName, state);
      return true;
    case "defineModel":
      collectUseModel(call, localName, state);
      return true;
    case "defineStyle":
      collectUseStyle(call, state);
      return true;
    case "defineDirective":
      collectUseDirective(call, state);
      return true;
    case "defineSlots":
      collectDefineSlots(call, state);
      return true;
    case "useComponents":
      collectUseComponents(call, state);
      return true;
    default:
      return false;
  }
};

const collectDefineSlots = (call: ts.CallExpression, state: TransformState): void => {
  const typeArg = call.typeArguments?.[0];
  if (!typeArg) {
    addDiagnostic(state, {
      code: "ELF_MACRO_DEFINE_SLOTS_GENERIC",
      message: "defineSlots 需要通过泛型声明，例如 defineSlots<{ default: () => unknown }>()。",
      node: call
    });
    return;
  }
  state.slotsType = textOf(typeArg, state);
};

const collectUseComponents = (call: ts.CallExpression, state: TransformState): void => {
  for (const arg of call.arguments) {
    const value = stripExpression(arg);
    if (ts.isIdentifier(value)) {
      state.components.set(value.text, value.text);
      continue;
    }

    if (ts.isObjectLiteralExpression(value)) {
      for (const prop of value.properties) {
        if (ts.isShorthandPropertyAssignment(prop)) {
          state.components.set(prop.name.text, prop.name.text);
          continue;
        }
        if (ts.isPropertyAssignment(prop)) {
          const key = propertyNameText(prop.name);
          if (key) {
            state.components.set(key, textOf(prop.initializer, state));
            continue;
          }
        }
        addDiagnostic(state, {
          code: "ELF_MACRO_USE_COMPONENTS_ARGUMENT",
          message: "useComponents 对象参数目前只支持普通属性或简写属性。",
          node: prop
        });
      }
      continue;
    }

    addDiagnostic(state, {
      code: "ELF_MACRO_USE_COMPONENTS_ARGUMENT",
      message: "useComponents 支持 useComponents(Button) 或 useComponents({ Alias: Button })。",
      node: arg
    });
  }
};

const collectUseName = (call: ts.CallExpression, state: TransformState): void => {
  const first = call.arguments[0];
  if (!first) return;

  if (ts.isStringLiteralLike(first)) {
    state.nameDefault = first.text;
    return;
  }

  if (!ts.isObjectLiteralExpression(first)) {
    addDiagnostic(state, {
      code: "ELF_MACRO_DEFINE_NAME",
      message: "defineName 目前支持字符串。",
      node: first
    });
    return;
  }

  addDiagnostic(state, {
    code: "ELF_MACRO_DEFINE_NAME",
    message:
      'defineName({ ... }) 属于旧的多模板导出写法；当前宏组件建议一个文件一个组件，请改用 defineName("elf-name")。',
    node: first
  });
};

const collectDefineOptions = (call: ts.CallExpression, state: TransformState): void => {
  const first = call.arguments[0];
  const value = first ? stripExpression(first) : null;
  if (!value || !ts.isObjectLiteralExpression(value)) {
    addDiagnostic(state, {
      code: "ELF_MACRO_DEFINE_OPTIONS",
      message: "defineOptions 目前支持对象字面量，例如 defineOptions({ shadow: false })。",
      node: call
    });
    return;
  }

  const allowed = new Set(["shadow", "formControl", "emitOptions", "components", "register"]);

  for (const prop of value.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const key = propertyNameText(prop.name);
      if (!key) continue;
      if (!allowed.has(key)) {
        addDiagnostic(state, {
          code: "ELF_MACRO_DEFINE_OPTIONS_FIELD",
          message: `defineOptions 不支持 ${key}；请继续使用 defineName / defineProps / defineEmits / defineStyle / defineDirective。`,
          node: prop.name
        });
        continue;
      }
      state.options.set(key, textOf(prop.initializer, state));
      continue;
    }

    if (ts.isShorthandPropertyAssignment(prop)) {
      const key = prop.name.text;
      if (!allowed.has(key)) {
        addDiagnostic(state, {
          code: "ELF_MACRO_DEFINE_OPTIONS_FIELD",
          message: `defineOptions 不支持 ${key}；请继续使用 defineName / defineProps / defineEmits / defineStyle / defineDirective。`,
          node: prop.name
        });
        continue;
      }
      state.options.set(key, key);
      continue;
    }

    addDiagnostic(state, {
      code: "ELF_MACRO_DEFINE_OPTIONS",
      message: "defineOptions 目前只支持普通属性。",
      node: prop
    });
  }
};

const collectTypeOnlyProps = (typeNode: ts.TypeNode, state: TransformState): void => {
  const members = resolvePropsTypeMembers(typeNode, state, new Set());
  if (!members) {
    addDiagnostic(state, {
      code: "ELF_MACRO_PROPS_RUNTIME_TYPE",
      severity: "warning",
      message: `无法从 ${textOf(typeNode, state)} 生成 runtime props。`,
      node: typeNode,
      hint: "请改用 defineProps<Props>({ key: String }) 显式声明 runtime converter；当前自动推断只解析同文件 type literal 或 interface。"
    });
    return;
  }

  for (const member of members) {
    if (!ts.isPropertySignature(member)) {
      addDiagnostic(state, {
        code: "ELF_MACRO_PROP_RUNTIME_TYPE",
        severity: "warning",
        message: "type-only props 目前只支持具名属性签名。",
        node: member,
        hint: "请为该 prop 提供显式 runtime option。"
      });
      continue;
    }
    const key = propertyNameText(member.name);
    if (!key || !member.type) {
      addDiagnostic(state, {
        code: "ELF_MACRO_PROP_RUNTIME_TYPE",
        severity: "warning",
        message: "无法推断未具名或缺少类型的 prop。",
        node: member,
        hint: "请为该 prop 提供显式 runtime option。"
      });
      continue;
    }
    const runtimeType = inferRuntimePropType(member.type, state, new Set());
    if (!runtimeType) {
      addDiagnostic(state, {
        code: "ELF_MACRO_PROP_RUNTIME_TYPE",
        severity: "warning",
        message: `无法安全推断 prop ${key} 的 runtime converter：${textOf(member.type, state)}。`,
        node: member.type,
        hint: `请改用 defineProps<Props>({ ${key}: { type: ..., required: ${member.questionToken ? "false" : "true"} } })。`
      });
      state.props.set(key, member.questionToken ? "{}" : "{ required: true }");
      continue;
    }
    state.props.set(
      key,
      `{ type: ${runtimeType}${member.questionToken ? "" : ", required: true"} }`
    );
  }
};

const resolvePropsTypeMembers = (
  typeNode: ts.TypeNode,
  state: TransformState,
  seen: Set<string>
): readonly ts.TypeElement[] | null => {
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return resolvePropsTypeMembers(typeNode.type, state, seen);
  }
  if (ts.isTypeLiteralNode(typeNode)) return typeNode.members;
  if (ts.isIntersectionTypeNode(typeNode)) {
    const members: ts.TypeElement[] = [];
    for (const part of typeNode.types) {
      const resolved = resolvePropsTypeMembers(part, state, seen);
      if (!resolved) return null;
      members.push(...resolved);
    }
    return members;
  }
  if (!ts.isTypeReferenceNode(typeNode) || !ts.isIdentifier(typeNode.typeName)) return null;
  if (typeNode.typeArguments?.length) return null;

  const name = typeNode.typeName.text;
  if (seen.has(name)) return null;
  seen.add(name);
  const declaration = state.sourceFile.statements.find(
    (statement): statement is ts.InterfaceDeclaration | ts.TypeAliasDeclaration =>
      (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
      statement.name.text === name
  );
  if (!declaration || declaration.typeParameters?.length) return null;
  if (ts.isTypeAliasDeclaration(declaration)) {
    return resolvePropsTypeMembers(declaration.type, state, seen);
  }

  const members: ts.TypeElement[] = [];
  for (const clause of declaration.heritageClauses ?? []) {
    for (const inherited of clause.types) {
      const inheritedType = ts.factory.createTypeReferenceNode(
        inherited.expression.getText(state.sourceFile),
        inherited.typeArguments
      );
      const inheritedMembers = resolvePropsTypeMembers(inheritedType, state, seen);
      if (!inheritedMembers) return null;
      members.push(...inheritedMembers);
    }
  }
  members.push(...declaration.members);
  return members;
};

const inferRuntimePropType = (
  typeNode: ts.TypeNode,
  state: TransformState,
  seen: Set<string>
): "String" | "Number" | "Boolean" | "Array" | "Object" | "Function" | null => {
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return inferRuntimePropType(typeNode.type, state, seen);
  }
  if (ts.isTypeOperatorNode(typeNode)) {
    return inferRuntimePropType(typeNode.type, state, seen);
  }
  if (ts.isArrayTypeNode(typeNode) || ts.isTupleTypeNode(typeNode)) return "Array";
  if (ts.isTypeLiteralNode(typeNode)) return "Object";
  if (ts.isFunctionTypeNode(typeNode)) return "Function";
  if (ts.isLiteralTypeNode(typeNode)) {
    if (ts.isStringLiteralLike(typeNode.literal)) return "String";
    if (ts.isNumericLiteral(typeNode.literal) || isUnaryNumber(typeNode.literal)) return "Number";
    if (
      typeNode.literal.kind === ts.SyntaxKind.TrueKeyword ||
      typeNode.literal.kind === ts.SyntaxKind.FalseKeyword
    ) {
      return "Boolean";
    }
    return null;
  }
  if (ts.isUnionTypeNode(typeNode)) {
    const runtimeTypes = new Set<NonNullable<ReturnType<typeof inferRuntimePropType>>>();
    for (const part of typeNode.types) {
      if (part.kind === ts.SyntaxKind.UndefinedKeyword || part.kind === ts.SyntaxKind.NullKeyword) {
        continue;
      }
      const runtimeType = inferRuntimePropType(part, state, new Set(seen));
      if (!runtimeType) return null;
      runtimeTypes.add(runtimeType);
    }
    return runtimeTypes.size === 1 ? ([...runtimeTypes][0] ?? null) : null;
  }

  switch (typeNode.kind) {
    case ts.SyntaxKind.StringKeyword:
      return "String";
    case ts.SyntaxKind.NumberKeyword:
      return "Number";
    case ts.SyntaxKind.BooleanKeyword:
      return "Boolean";
    case ts.SyntaxKind.ObjectKeyword:
      return "Object";
    default:
      break;
  }

  if (!ts.isTypeReferenceNode(typeNode) || !ts.isIdentifier(typeNode.typeName)) return null;
  const name = typeNode.typeName.text;
  if (name === "Array" || name === "ReadonlyArray") return "Array";
  if (name === "Record") return "Object";
  if (seen.has(name)) return null;
  seen.add(name);
  const declaration = state.sourceFile.statements.find(
    (statement): statement is ts.InterfaceDeclaration | ts.TypeAliasDeclaration =>
      (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
      statement.name.text === name
  );
  if (!declaration || declaration.typeParameters?.length) return null;
  if (ts.isInterfaceDeclaration(declaration)) return "Object";
  return inferRuntimePropType(declaration.type, state, seen);
};

const collectUseProps = (
  call: ts.CallExpression,
  localName: string | null,
  state: TransformState
): void => {
  const typeArg = call.typeArguments?.[0];
  if (typeArg) {
    state.propsType = textOf(typeArg, state);
  }

  if (localName) {
    state.propsVarName = localName;
    state.exposed.add(localName);
  }

  const first = call.arguments[0];
  if (!first) {
    if (typeArg) collectTypeOnlyProps(typeArg, state);
    return;
  }

  if (ts.isArrayLiteralExpression(first)) {
    for (const item of first.elements) {
      const value = stripExpression(item);
      if (ts.isStringLiteralLike(value)) {
        state.props.set(value.text, "{}");
      }
    }
    return;
  }

  if (!ts.isObjectLiteralExpression(first)) {
    addDiagnostic(state, {
      code: "ELF_MACRO_DEFINE_PROPS",
      message: "defineProps 目前支持字符串数组或对象字面量。",
      node: first
    });
    return;
  }

  for (const prop of first.properties) {
    if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue;
    const key = propertyNameText(prop.name);
    if (!key) continue;
    const value = ts.isPropertyAssignment(prop) ? prop.initializer : prop.name;
    state.props.set(key, inferPropOption(value, state));
  }
};

const collectUseEmit = (
  call: ts.CallExpression,
  localName: string | null,
  state: TransformState
): void => {
  const typeArg = call.typeArguments?.[0];
  if (typeArg) {
    state.emitsType = emitTuplesType(textOf(typeArg, state));
  }

  if (localName) {
    state.emitVarName = localName;
    state.exposed.add(localName);
  }

  collectTypedEmitNames(call, state);

  const first = call.arguments[0];
  if (!first || !ts.isArrayLiteralExpression(first)) return;

  for (const item of first.elements) {
    const value = stripExpression(item);
    if (ts.isStringLiteralLike(value)) {
      state.emits.add(value.text);
    }
  }
};

const collectUseModel = (
  call: ts.CallExpression,
  localName: string | null,
  state: TransformState
): void => {
  if (!localName) {
    addDiagnostic(state, {
      code: "ELF_MACRO_DEFINE_MODEL",
      message: "defineModel 宏需要赋值给一个本地变量。",
      node: call
    });
    return;
  }

  const parsed = parseModelArguments(call, state);
  state.modelMacros.push({
    localName,
    propName: parsed.propName,
    typeArgs: call.typeArguments?.map((arg) => textOf(arg, state)).join(", ") ?? ""
  });
  state.exposed.add(localName);
  state.emits.add(parsed.eventName);
  if (!state.props.has(parsed.propName)) {
    state.props.set(parsed.propName, parsed.propOption);
  }
};

const collectUseStyle = (call: ts.CallExpression, state: TransformState): void => {
  for (const arg of call.arguments) {
    state.styles.push(styleExpressionToCode(arg, state));
  }
};

const collectUseDirective = (call: ts.CallExpression, state: TransformState): void => {
  const first = call.arguments[0];
  const second = call.arguments[1];
  if (!first || !second || !ts.isStringLiteralLike(stripExpression(first))) {
    addDiagnostic(state, {
      code: "ELF_MACRO_DEFINE_DIRECTIVE",
      message: 'defineDirective 目前支持 defineDirective("name", definition)。',
      node: call
    });
    return;
  }

  state.directives.set(
    (stripExpression(first) as ts.StringLiteralLike).text,
    textOf(second, state)
  );
};

const collectTypedEmitNames = (call: ts.CallExpression, state: TransformState): void => {
  const firstType = call.typeArguments?.[0];
  if (!firstType) return;
  const members = resolvePropsTypeMembers(firstType, state, new Set());
  if (!members) return;

  for (const member of members) {
    if (!ts.isPropertySignature(member) && !ts.isMethodSignature(member)) continue;
    const name = propertyNameText(member.name);
    if (name) state.emits.add(name);
  }
};

const parseModelArguments = (
  call: ts.CallExpression,
  state: TransformState
): { propName: string; eventName: string; propOption: string } => {
  let propName = "modelValue";
  let options: ts.Expression | undefined;

  const first = call.arguments[0];
  const second = call.arguments[1];
  if (first && ts.isStringLiteralLike(stripExpression(first))) {
    propName = (stripExpression(first) as ts.StringLiteralLike).text;
    options = second;
  } else {
    options = first;
  }

  const explicitProp = options ? getObjectStringProperty(options, "prop") : null;
  if (explicitProp) propName = explicitProp;

  const explicitEvent = options ? getObjectStringProperty(options, "event") : null;
  const eventName = explicitEvent ?? `update:${propName}`;
  const defaultValue = options ? getObjectProperty(options, "default") : null;
  const requiredValue = options ? getObjectProperty(options, "required") : null;
  const base = defaultValue ? inferPropOption(defaultValue, state) : "{}";

  if (!requiredValue) {
    return { propName, eventName, propOption: base };
  }

  if (base === "{}") {
    return {
      propName,
      eventName,
      propOption: `{ required: ${textOf(requiredValue, state)} }`
    };
  }

  return {
    propName,
    eventName,
    propOption: mergePropOption(base, `required: ${textOf(requiredValue, state)}`)
  };
};

const inferPropOption = (expression: ts.Expression, state: TransformState): string => {
  const value = stripExpression(expression);

  if (ts.isIdentifier(value) && isPropTypeIdentifier(value.text)) {
    return value.text;
  }

  if (ts.isObjectLiteralExpression(value) && looksLikePropOption(value)) {
    return textOf(value, state);
  }

  if (ts.isStringLiteralLike(value)) {
    return `{ type: String, default: ${JSON.stringify(value.text)} }`;
  }

  if (ts.isNumericLiteral(value) || isUnaryNumber(value)) {
    return `{ type: Number, default: ${textOf(value, state)} }`;
  }

  if (value.kind === ts.SyntaxKind.TrueKeyword || value.kind === ts.SyntaxKind.FalseKeyword) {
    return `{ type: Boolean, default: ${textOf(value, state)} }`;
  }

  if (ts.isArrayLiteralExpression(value)) {
    return `{ type: Array, default: () => ${textOf(value, state)} }`;
  }

  if (ts.isObjectLiteralExpression(value)) {
    return `{ type: Object, default: () => (${textOf(value, state)}) }`;
  }

  if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
    return `{ type: Function, default: ${textOf(value, state)} }`;
  }

  if (value.kind === ts.SyntaxKind.NullKeyword) {
    return "{ default: null }";
  }

  return `{ default: ${textOf(value, state)} }`;
};

const looksLikePropOption = (node: ts.ObjectLiteralExpression): boolean => {
  return node.properties.some((prop) => {
    if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) return false;
    const key = propertyNameText(prop.name);
    return key === "type" || key === "default" || key === "required";
  });
};

const mergePropOption = (base: string, field: string): string => {
  const trimmed = base.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const body = trimmed.slice(1, -1).trim();
    return body ? `{ ${body}, ${field} }` : `{ ${field} }`;
  }
  return `{ type: ${base}, ${field} }`;
};

const getDefineHtmlTemplate = (
  expression: ts.Expression,
  state: TransformState
): TemplateInfo | null => {
  const value = stripExpression(expression);
  if (!ts.isCallExpression(value) || callName(value) !== "defineHtml") return null;
  const first = value.arguments[0];
  const templateArg = first ? stripExpression(first) : null;
  if (
    templateArg &&
    ts.isTaggedTemplateExpression(templateArg) &&
    isMacroTag(templateArg, "html")
  ) {
    const propsType = value.typeArguments?.[0] ? textOf(value.typeArguments[0], state) : undefined;
    const emitsType = value.typeArguments?.[1]
      ? emitTuplesType(textOf(value.typeArguments[1], state))
      : undefined;
    const slotsType = value.typeArguments?.[2] ? textOf(value.typeArguments[2], state) : undefined;
    const compiledTemplate = compileHtmlTemplate(templateArg, state);
    return {
      template: compiledTemplate.template,
      sourceStart: compiledTemplate.sourceStart,
      sourceEnd: compiledTemplate.sourceEnd,
      ...(propsType ? { propsType } : {}),
      ...(emitsType ? { emitsType } : {}),
      ...(slotsType ? { slotsType } : {})
    };
  }
  addDiagnostic(state, {
    code: "ELF_MACRO_DEFINE_HTML_TEMPLATE",
    message: "defineHtml 需要接收 html`...` 模板。",
    node: value,
    hint: "示例：const Button = defineHtml(html`<button></button>`);"
  });
  return null;
};

const compileHtmlTemplate = (
  node: ts.TaggedTemplateExpression,
  state: TransformState
): { template: string; sourceStart: number; sourceEnd: number } => {
  const template = node.template;
  const sourceStart = template.getStart(state.sourceFile) + 1;
  const sourceEnd = template.getEnd() - 1;
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return { template: template.text, sourceStart, sourceEnd };
  }

  let out = template.head.text;
  for (const span of template.templateSpans) {
    out += expressionHoleToTemplate(span.expression, out, state);
    out += span.literal.text;
  }
  return { template: out, sourceStart, sourceEnd };
};

const expressionHoleToTemplate = (
  expression: ts.Expression,
  currentOutput: string,
  state: TransformState
): string => {
  const attr = currentOutput.match(/([:@][\w$.-]+|v-[\w$:-]+(?:\.[\w$-]+)*)\s*=\s*$/);
  if (attr) {
    return attributeExpressionValue(attr[1] ?? "", expression, state);
  }

  const expr = interpolationExpression(expression, state);
  return `{{ ${expr} }}`;
};

const attributeExpressionValue = (
  attrName: string,
  expression: ts.Expression,
  state: TransformState
): string => {
  if (attrName.startsWith("@") || attrName.startsWith("v-on")) {
    return quoteAttributeExpression(eventExpressionName(expression, state), expression, state);
  }
  return quoteAttributeExpression(textOf(stripExpression(expression), state), expression, state);
};

const eventExpressionName = (expression: ts.Expression, state: TransformState): string => {
  const value = stripExpression(expression);
  if (ts.isIdentifier(value) || ts.isPropertyAccessExpression(value)) {
    return textOf(value, state);
  }
  if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
    return addTemplateTemp(value, state);
  }
  return textOf(value, state);
};

const quoteAttributeExpression = (
  expressionText: string,
  originalExpression: ts.Expression,
  state: TransformState
): string => {
  if (!expressionText.includes('"')) return `"${expressionText}"`;
  if (!expressionText.includes("'")) return `'${expressionText}'`;
  return `"${addTemplateGetterTemp(originalExpression, state)}()"`;
};

const interpolationExpression = (expression: ts.Expression, state: TransformState): string => {
  const value = stripExpression(expression);
  if (
    ts.isArrowFunction(value) ||
    ts.isFunctionExpression(value) ||
    ts.isObjectLiteralExpression(value) ||
    ts.isArrayLiteralExpression(value)
  ) {
    return addTemplateTemp(value, state);
  }
  return textOf(value, state);
};

const addTemplateTemp = (expression: ts.Expression, state: TransformState): string => {
  const name = `__elfExpr${state.templateTemps.length}`;
  state.templateTemps.push(`const ${name} = ${textOf(expression, state)};`);
  state.exposed.add(name);
  return name;
};

const addTemplateGetterTemp = (expression: ts.Expression, state: TransformState): string => {
  const name = `__elfExpr${state.templateTemps.length}`;
  state.templateTemps.push(
    `const ${name} = () => (${textOf(stripExpression(expression), state)});`
  );
  state.exposed.add(name);
  return name;
};

const styleExpressionToCode = (expression: ts.Expression, state: TransformState): string => {
  const value = stripExpression(expression);
  if (ts.isStringLiteralLike(value)) {
    return JSON.stringify(value.text);
  }
  if (ts.isTaggedTemplateExpression(value) && isMacroTag(value, "css")) {
    return value.template.getText(state.sourceFile);
  }
  return textOf(value, state);
};

const collectTemplateTypeDiagnostics = (state: TransformState): void => {
  if (state.templates.length === 0) return;

  const builder: TemplateTypeCheckBuilder = {
    code: new CodeBuilder([
      ...state.source.split(/\r\n|\r|\n/),
      "",
      ...state.templateTemps,
      "",
      ...renderTemplateTypeCheckPrelude(state),
      renderTemplateTypeCheckOpen(state)
    ]),
    entries: new Map(),
    templateIndex: 0,
    loopIndex: 0,
    slotIndex: 0,
    currentTemplateSourceStart: 0
  };

  emitTemplateTypeCheckScope(state, builder, "  ");

  for (const template of state.templates) {
    builder.currentTemplateSourceStart = template.sourceStart;
    builder.code.line(`  {`);
    builder.code.line(`    // ${template.exportName} template`);
    try {
      const root = parse(template.template, {
        onError: (err) => {
          addDiagnostic(state, {
            code: "ELF_TEMPLATE_PARSE",
            message: `Template parse error in ${template.exportName}: ${err.message}`,
            start: template.sourceStart + err.loc.start.offset,
            end: template.sourceStart + err.loc.end.offset
          });
        }
      });
      emitTemplateChecks(root.children, state, builder, "    ");
    } catch (error) {
      const loc = error instanceof Error && "loc" in error ? (error.loc as SourceLoc) : null;
      addDiagnostic(state, {
        code: "ELF_TEMPLATE_PARSE",
        message: `Template parse error in ${template.exportName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        ...(loc
          ? {
              start: template.sourceStart + loc.start.offset,
              end: template.sourceStart + loc.end.offset
            }
          : { start: template.sourceStart, end: template.sourceEnd })
      });
    }
    builder.code.line(`  }`);
    builder.templateIndex++;
  }

  builder.code.line("};");

  if (builder.entries.size === 0) return;

  const diagnostics = typeCheckVirtualTemplate(state, builder.code.toString());
  for (const diagnostic of diagnostics) {
    if (!diagnostic.file || diagnostic.start === undefined) continue;
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    const line = position.line + 1;
    const entry = builder.entries.get(line);
    if (!entry) continue;
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    addDiagnostic(state, {
      code: "ELF_TEMPLATE_TYPE",
      message: `Template ${entry.kind} expression "${entry.expression}" at line ${entry.loc.start.line}, column ${entry.loc.start.column}: ${message}`,
      start: entry.templateSourceStart + entry.loc.start.offset,
      end: entry.templateSourceStart + entry.loc.end.offset
    });
  }
};

const emitTemplateChecks = (
  children: TemplateChildNode[],
  state: TransformState,
  builder: TemplateTypeCheckBuilder,
  indentText: string,
  parentComponentExpression: string | null = null
): void => {
  for (const child of children) {
    if (child.type === NodeTypes.INTERPOLATION) {
      addTemplateCheck(builder, indentText, child.content, "interpolation", child.contentLoc);
      continue;
    }
    if (child.type === NodeTypes.ELEMENT) {
      if (
        emitComponentSlotTemplateChecks(
          child,
          state,
          builder,
          indentText,
          parentComponentExpression
        )
      ) {
        continue;
      }
      emitElementTemplateChecks(child, state, builder, indentText);
    }
  }
};

const emitComponentSlotTemplateChecks = (
  node: ElementNode,
  state: TransformState,
  builder: TemplateTypeCheckBuilder,
  indentText: string,
  parentComponentExpression: string | null
): boolean => {
  if (!parentComponentExpression || node.tag !== "template") return false;
  const slot = getSlotDirective(node);
  if (!slot) return false;
  const slotName = slot.arg || "default";

  addComponentSlotNameCheck(
    builder,
    indentText,
    parentComponentExpression,
    slotName,
    slot.argLoc ?? slot.loc
  );

  if (!slot.exp.trim()) {
    emitTemplateChecks(node.children, state, builder, indentText);
    return true;
  }

  const scopeName = `__elfSlotScope${builder.slotIndex++}`;
  builder.code.line(`${indentText}{`);
  builder.code.line(
    `${indentText}  const ${scopeName} = __elfComponentSlotScope(${parentComponentExpression}, ${JSON.stringify(
      slotName
    )});`
  );
  builder.code.line(`${indentText}  const ${slot.exp} = ${scopeName};`);
  emitTemplateChecks(node.children, state, builder, `${indentText}  `);
  builder.code.line(`${indentText}}`);
  return true;
};

const renderTemplateTypeCheckPrelude = (state: TransformState): string[] => {
  const lines: string[] = [];
  if (state.exposed.size > 0) {
    lines.push(
      "const __elfTemplateValue = <T>(value: T): T extends { readonly value: infer V; peek(): unknown } ? V : T =>",
      "  value as unknown as T extends { readonly value: infer V; peek(): unknown } ? V : T;"
    );
  }
  if (state.components.size > 0) {
    lines.push(
      "type __ElfComponentProps<C> = C extends { readonly __elfProps?: infer Props } ? NonNullable<Props> : Record<string, unknown>;",
      "type __ElfComponentEmits<C> = C extends { readonly __elfEmits?: infer Emits } ? NonNullable<Emits> : Record<string, unknown[]>;",
      "type __ElfComponentEventArgs<C, K extends keyof __ElfComponentEmits<C> & string> = __ElfComponentEmits<C>[K] extends readonly unknown[] ? __ElfComponentEmits<C>[K] : unknown[];",
      "type __ElfComponentEventDetail<Args extends readonly unknown[]> = Args extends readonly [] ? undefined : Args extends readonly [infer Only] ? Only : Args;",
      "type __ElfComponentEvent<C, K extends string> = K extends keyof __ElfComponentEmits<C> & string ? CustomEvent<__ElfComponentEventDetail<__ElfComponentEventArgs<C, K>>> : CustomEvent<unknown>;",
      "type __ElfComponentSlots<C> = C extends { readonly __elfSlots?: infer Slots } ? NonNullable<Slots> : Record<string, never>;",
      "type __ElfComponentSlotScope<C, K extends keyof __ElfComponentSlots<C> & string> = __ElfComponentSlots<C>[K] extends (scope: infer Scope) => unknown ? Scope : Record<string, never>;",
      "type __ElfRequiredSlotNames<C> = keyof { [K in keyof __ElfComponentSlots<C> & string as {} extends Pick<__ElfComponentSlots<C>, K> ? never : K]: true } & string;",
      "const __elfCheckComponentProp = <C, K extends keyof __ElfComponentProps<C> & string>(_component: C, _name: K, _value: __ElfComponentProps<C>[K]): void => {};",
      "const __elfCheckComponentEvent = <C, K extends keyof __ElfComponentEmits<C> & string>(_component: C, _name: K, _handler: (event: __ElfComponentEvent<C, K>) => unknown): void => {};",
      "const __elfCheckComponentEventName = <C, K extends keyof __ElfComponentEmits<C> & string>(_component: C, _name: K): void => {};",
      "const __elfComponentEvent = <C, K extends string>(_component: C, _name: K): __ElfComponentEvent<C, K> => null as unknown as __ElfComponentEvent<C, K>;",
      "const __elfCheckComponentSlotName = <C, K extends keyof __ElfComponentSlots<C> & string>(_component: C, _name: K): void => {};",
      "const __elfComponentSlotScope = <C, K extends keyof __ElfComponentSlots<C> & string>(_component: C, _name: K): __ElfComponentSlotScope<C, K> => null as unknown as __ElfComponentSlotScope<C, K>;",
      "const __elfCheckRequiredSlots = <C, Provided extends string>(_component: C, _provided: Record<Provided, true> & Record<Exclude<__ElfRequiredSlotNames<C>, Provided>, true>): void => {};"
    );
  }
  return lines;
};

const renderTemplateTypeCheckOpen = (state: TransformState): string => {
  const names = Array.from(state.exposed).filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
  if (names.length === 0) return "const __elfTemplateTypeCheck = () => {";
  return `const __elfTemplateTypeCheck = (__elfTemplateScope = { ${names.join(", ")} }) => {`;
};

const emitTemplateTypeCheckScope = (
  state: TransformState,
  builder: TemplateTypeCheckBuilder,
  indentText: string
): void => {
  for (const name of state.exposed) {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
    builder.code.line(
      `${indentText}const ${name} = __elfTemplateValue(__elfTemplateScope.${name});`
    );
  }

  if (!state.propsVarName) return;
  for (const key of state.props.keys()) {
    if (!/^[A-Za-z_$][\w$]*$/.test(key) || state.exposed.has(key)) continue;
    builder.code.line(`${indentText}const ${key} = ${state.propsVarName}.${key};`);
  }
};

const emitElementTemplateChecks = (
  node: ElementNode,
  state: TransformState,
  builder: TemplateTypeCheckBuilder,
  indentText: string
): void => {
  const forDirective = node.props.find(
    (prop) => prop.type === AttrTypes.DIRECTIVE && prop.name === "for"
  );
  const parsedFor =
    forDirective && forDirective.type === AttrTypes.DIRECTIVE
      ? parseForExpression(forDirective.exp)
      : null;

  if (forDirective?.type === AttrTypes.DIRECTIVE && forDirective.exp) {
    if (parsedFor) {
      const itemName = `__elfForItem${builder.loopIndex}`;
      const indexName = `__elfForIndex${builder.loopIndex}`;
      builder.loopIndex++;
      addTemplateLine(
        builder,
        `${indentText}for (const [${indexName}, ${itemName}] of Array.from(${oneLineExpression(
          parsedFor.source
        )}).entries()) {`,
        {
          expression: parsedFor.source,
          kind: "v-for",
          loc: forDirective.expLoc ?? forDirective.loc
        }
      );
      builder.code.line(`${indentText}  const ${parsedFor.valueAlias} = ${itemName};`);
      if (parsedFor.indexAlias) {
        builder.code.line(`${indentText}  const ${parsedFor.indexAlias} = ${indexName};`);
      }
      emitElementBodyChecks(node, state, builder, `${indentText}  `);
      builder.code.line(`${indentText}}`);
      return;
    }

    addTemplateCheck(
      builder,
      indentText,
      forDirective.exp,
      "v-for",
      forDirective.expLoc ?? forDirective.loc
    );
  }

  emitElementBodyChecks(node, state, builder, indentText);
};

const emitElementBodyChecks = (
  node: ElementNode,
  state: TransformState,
  builder: TemplateTypeCheckBuilder,
  indentText: string
): void => {
  const componentExpression = componentExpressionForNode(node, state);
  const guard = node.props.find(
    (prop) =>
      prop.type === AttrTypes.DIRECTIVE &&
      (prop.name === "if" || prop.name === "else-if" || prop.name === "show")
  );

  if (guard?.type === AttrTypes.DIRECTIVE && guard.exp) {
    addTemplateLine(builder, `${indentText}if (${oneLineExpression(guard.exp)}) {`, {
      expression: guard.exp,
      kind: `v-${guard.name}`,
      loc: guard.expLoc ?? guard.loc
    });
    if (componentExpression) {
      addComponentRequiredSlotsCheck(
        builder,
        `${indentText}  `,
        componentExpression,
        collectProvidedSlotNames(node),
        node.loc
      );
    }
    emitElementPropsChecks(node, state, builder, `${indentText}  `);
    emitTemplateChecks(node.children, state, builder, `${indentText}  `, componentExpression);
    builder.code.line(`${indentText}}`);
    return;
  }

  if (componentExpression) {
    addComponentRequiredSlotsCheck(
      builder,
      indentText,
      componentExpression,
      collectProvidedSlotNames(node),
      node.loc
    );
  }
  emitElementPropsChecks(node, state, builder, indentText);
  emitTemplateChecks(node.children, state, builder, indentText, componentExpression);
};

const emitElementPropsChecks = (
  node: ElementNode,
  state: TransformState,
  builder: TemplateTypeCheckBuilder,
  indentText: string
): void => {
  const componentExpression = componentExpressionForNode(node, state);

  for (const prop of node.props) {
    if (prop.type === AttrTypes.ATTRIBUTE) {
      if (componentExpression && !isNativeComponentAttribute(prop.name)) {
        addComponentPropCheck(
          builder,
          indentText,
          componentExpression,
          templateAttrToProp(prop.name),
          prop.value === true ? "true" : JSON.stringify(prop.value),
          "component prop",
          prop.valueLoc ?? prop.loc
        );
      }
      continue;
    }

    if (prop.type !== AttrTypes.DIRECTIVE) continue;

    if (prop.argDynamic) {
      addTemplateCheck(
        builder,
        indentText,
        prop.argDynamic,
        "dynamic argument",
        prop.argLoc ?? prop.loc
      );
    }

    if (
      !prop.exp ||
      prop.name === "for" ||
      prop.name === "if" ||
      prop.name === "else-if" ||
      prop.name === "show"
    ) {
      continue;
    }

    if (prop.name === "on") {
      if (componentExpression && prop.arg) {
        addComponentEventTemplateCheck(
          builder,
          indentText,
          componentExpression,
          prop.arg,
          prop.exp,
          prop.expLoc ?? prop.loc
        );
        continue;
      }
      addEventTemplateCheck(builder, indentText, prop.arg ?? "", prop.exp, prop.expLoc ?? prop.loc);
      continue;
    }

    if (componentExpression && prop.name === "model") {
      const propName = prop.arg ? templateAttrToProp(prop.arg) : "modelValue";
      addComponentPropCheck(
        builder,
        indentText,
        componentExpression,
        propName,
        prop.exp,
        "component v-model",
        prop.expLoc ?? prop.loc
      );
      addComponentEventNameCheck(
        builder,
        indentText,
        componentExpression,
        `update:${propName}`,
        prop.argLoc ?? prop.loc
      );
      continue;
    }

    if (
      componentExpression &&
      prop.name === "bind" &&
      prop.arg &&
      !isNativeComponentAttribute(prop.arg)
    ) {
      addComponentPropCheck(
        builder,
        indentText,
        componentExpression,
        templateAttrToProp(prop.arg),
        prop.exp,
        "component prop",
        prop.expLoc ?? prop.loc
      );
      continue;
    }

    addTemplateCheck(builder, indentText, prop.exp, `v-${prop.name}`, prop.expLoc ?? prop.loc);
  }
};

const addComponentPropCheck = (
  builder: TemplateTypeCheckBuilder,
  indentText: string,
  componentExpression: string,
  propName: string,
  expression: string,
  kind: string,
  loc: SourceLoc
): void => {
  addTemplateLine(
    builder,
    `${indentText}__elfCheckComponentProp(${componentExpression}, ${JSON.stringify(
      propName
    )}, ${oneLineExpression(expression)});`,
    {
      expression,
      kind,
      loc
    }
  );
};

const addComponentEventNameCheck = (
  builder: TemplateTypeCheckBuilder,
  indentText: string,
  componentExpression: string,
  eventName: string,
  loc: SourceLoc
): void => {
  addTemplateLine(
    builder,
    `${indentText}__elfCheckComponentEventName(${componentExpression}, ${JSON.stringify(
      eventName
    )});`,
    {
      expression: eventName,
      kind: "component event",
      loc
    }
  );
};

const addComponentSlotNameCheck = (
  builder: TemplateTypeCheckBuilder,
  indentText: string,
  componentExpression: string,
  slotName: string,
  loc: SourceLoc
): void => {
  addTemplateLine(
    builder,
    `${indentText}__elfCheckComponentSlotName(${componentExpression}, ${JSON.stringify(
      slotName
    )});`,
    {
      expression: slotName,
      kind: "component slot",
      loc
    }
  );
};

const addComponentRequiredSlotsCheck = (
  builder: TemplateTypeCheckBuilder,
  indentText: string,
  componentExpression: string,
  providedSlotNames: readonly string[],
  loc: SourceLoc
): void => {
  const provided = Array.from(new Set(providedSlotNames));
  const record = `{ ${provided.map((name) => `${objectKey(name)}: true`).join(", ")} }`;
  addTemplateLine(
    builder,
    `${indentText}__elfCheckRequiredSlots(${componentExpression}, ${record});`,
    {
      expression: provided.length > 0 ? provided.join(", ") : "(none)",
      kind: "component required slots",
      loc
    }
  );
};

const addComponentEventTemplateCheck = (
  builder: TemplateTypeCheckBuilder,
  indentText: string,
  componentExpression: string,
  eventName: string,
  expression: string,
  loc: SourceLoc
): void => {
  const eventArg = JSON.stringify(eventName);
  addComponentEventNameCheck(builder, indentText, componentExpression, eventName, loc);
  addTemplateLine(
    builder,
    `${indentText}{ const $event = __elfComponentEvent(${componentExpression}, ${eventArg}); void (${oneLineExpression(
      expression
    )}); }`,
    {
      expression,
      kind: "component event",
      loc
    }
  );

  if (!isHandlerReferenceExpression(expression)) {
    return;
  }

  addTemplateLine(
    builder,
    `${indentText}__elfCheckComponentEvent(${componentExpression}, ${eventArg}, ${oneLineExpression(
      expression
    )});`,
    {
      expression,
      kind: "component event handler",
      loc
    }
  );
};

const addTemplateCheck = (
  builder: TemplateTypeCheckBuilder,
  indentText: string,
  expression: string,
  kind: string,
  loc: SourceLoc
): void => {
  addTemplateLine(builder, `${indentText}void (${oneLineExpression(expression)});`, {
    expression,
    kind,
    loc
  });
};

const addEventTemplateCheck = (
  builder: TemplateTypeCheckBuilder,
  indentText: string,
  eventName: string,
  expression: string,
  loc: SourceLoc
): void => {
  addTemplateLine(
    builder,
    `${indentText}{ const $event = null as unknown as ${eventTypeForName(eventName)}; void (${oneLineExpression(
      expression
    )}); }`,
    {
      expression,
      kind: "event",
      loc
    }
  );
};

const eventTypeForName = (eventName: string): string => {
  if (
    /^(click|dblclick|mousedown|mouseup|mousemove|mouseenter|mouseleave|mouseover|mouseout|contextmenu)$/.test(
      eventName
    )
  ) {
    return "MouseEvent";
  }
  if (/^(keydown|keyup|keypress)$/.test(eventName)) return "KeyboardEvent";
  if (/^(input|change|submit|focus|blur)$/.test(eventName)) return "Event";
  return "Event";
};

const componentExpressionForNode = (node: ElementNode, state: TransformState): string | null => {
  const candidates = new Set([
    node.tag,
    templateAttrToProp(node.tag),
    kebab(node.tag),
    tagFromName(node.tag, state.tagPrefix)
  ]);
  for (const [name, expression] of state.components) {
    for (const alias of componentAliases(name, state.tagPrefix)) {
      if (candidates.has(alias)) return expression;
    }
  }
  return null;
};

const getSlotDirective = (node: ElementNode): DirectiveNode | null => {
  return (
    node.props.find(
      (prop): prop is DirectiveNode => prop.type === AttrTypes.DIRECTIVE && prop.name === "slot"
    ) ?? null
  );
};

const collectProvidedSlotNames = (node: ElementNode): string[] => {
  const names = new Set<string>();
  for (const child of node.children) {
    if (child.type === NodeTypes.COMMENT) continue;
    if (child.type === NodeTypes.TEXT) {
      if (child.content.trim()) names.add("default");
      continue;
    }
    if (child.type !== NodeTypes.ELEMENT) {
      names.add("default");
      continue;
    }
    if (child.tag === "template") {
      const slot = getSlotDirective(child);
      if (slot) {
        names.add(slot.arg || "default");
        continue;
      }
    }
    names.add("default");
  }
  return Array.from(names);
};

const templateAttrToProp = (name: string): string => {
  return name.includes("-") ? camel(name) : name;
};

const typeQueryForComponentExpression = (expression: string): string => {
  const value = expression.trim();
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(value)) {
    return `typeof ${value}`;
  }
  return "unknown";
};

const isNativeComponentAttribute = (name: string): boolean => {
  return (
    name === "class" ||
    name === "style" ||
    name === "id" ||
    name === "slot" ||
    name === "part" ||
    name === "role" ||
    name === "tabindex" ||
    name.startsWith("aria-") ||
    name.startsWith("data-")
  );
};

const isHandlerReferenceExpression = (expression: string): boolean => {
  return /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(expression.trim());
};

const addTemplateLine = (
  builder: TemplateTypeCheckBuilder,
  line: string,
  entry: Omit<TemplateTypeCheckEntry, "templateSourceStart">
): void => {
  const lineNumber = builder.code.line(line);
  builder.entries.set(lineNumber, {
    ...entry,
    templateSourceStart: builder.currentTemplateSourceStart
  });
};

const typeCheckVirtualTemplate = (
  state: TransformState,
  source: string
): readonly ts.Diagnostic[] => {
  const workspaceRoot = ts.sys.getCurrentDirectory().replace(/\\/g, "/");
  const sourceFileName = state.filename.replace(/\\/g, "/");
  const fileName = sourceFileName.includes("/")
    ? sourceFileName
    : `${workspaceRoot}/${sourceFileName}`;
  const macroStubFileName = `${workspaceRoot}/.elf-template-macro-stub.d.ts`;
  const styleStubFileName = `${workspaceRoot}/.elf-template-style-stub.d.ts`;
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    baseUrl: workspaceRoot
  };
  const globalsFileName = `${workspaceRoot}/.elf-template-globals.d.ts`;
  const host = ts.createCompilerHost(compilerOptions, true);
  const originalReadFile = host.readFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);

  host.fileExists = (name): boolean => {
    const normalized = name.replace(/\\/g, "/");
    return (
      normalized === fileName ||
      normalized === globalsFileName ||
      normalized === macroStubFileName ||
      normalized === styleStubFileName ||
      readTypeScriptLibFile(name) !== undefined ||
      originalFileExists(name)
    );
  };
  host.readFile = (name): string | undefined => {
    const normalized = name.replace(/\\/g, "/");
    if (normalized === fileName) return source;
    if (normalized === globalsFileName) return "declare const __DEV__: boolean;";
    if (normalized === macroStubFileName) return TEMPLATE_MACRO_STUB;
    if (normalized === styleStubFileName) {
      return "declare const styles: string; export default styles;";
    }
    return originalReadFile(name) ?? readTypeScriptLibFile(name);
  };
  host.resolveModuleNames = (moduleNames, containingFile) =>
    moduleNames.map((moduleName) => {
      if (moduleName === state.macroImport || moduleName === DEFAULT_MACRO_IMPORT) {
        return {
          resolvedFileName: macroStubFileName,
          extension: ts.Extension.Dts,
          isExternalLibraryImport: false
        };
      }
      if (moduleName.endsWith("?inline") || moduleName.endsWith(".scss")) {
        return {
          resolvedFileName: styleStubFileName,
          extension: ts.Extension.Dts,
          isExternalLibraryImport: false
        };
      }
      return ts.resolveModuleName(moduleName, containingFile, compilerOptions, host).resolvedModule;
    });

  const program = ts.createProgram([globalsFileName, fileName], compilerOptions, host);
  return ts.getPreEmitDiagnostics(program);
};

const readTypeScriptLibFile = (fileName: string): string | undefined => {
  const baseName = path.basename(fileName.replace(/\\/g, "/"));

  if (!/^lib\..+\.d\.ts$/.test(baseName)) {
    return undefined;
  }

  for (const directory of getTypeScriptLibFallbackDirectories()) {
    const candidate = path.join(directory, baseName);

    if (ts.sys.fileExists(candidate)) {
      return ts.sys.readFile(candidate);
    }
  }

  return undefined;
};

const getTypeScriptLibFallbackDirectories = (): string[] => {
  const executingPath = ts.sys.getExecutingFilePath?.();
  const executingDirectory = executingPath ? path.dirname(executingPath) : "";

  return [
    executingDirectory,
    path.join(executingDirectory, "typescript-lib"),
    path.join(ts.sys.getCurrentDirectory(), "tools", "vscode-extension", "dist", "typescript-lib")
  ].filter(Boolean);
};

const parseForExpression = (
  expression: string
): { valueAlias: string; indexAlias: string | null; source: string } | null => {
  const match = expression.match(/^\s*(?:\((.+)\)|([^()\s]+))\s+(?:in|of)\s+(.+?)\s*$/);
  if (!match) return null;
  const aliases = splitAliases(match[1] ?? match[2] ?? "");
  const valueAlias = aliases[0]?.trim();
  if (!valueAlias) return null;
  return {
    valueAlias,
    indexAlias: aliases[1]?.trim() || null,
    source: match[3] ?? ""
  };
};

const splitAliases = (value: string): string[] => {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === "(" || char === "[" || char === "{") depth++;
    if (char === ")" || char === "]" || char === "}") depth--;
    if (char === "," && depth === 0) {
      result.push(value.slice(start, i));
      start = i + 1;
    }
  }
  result.push(value.slice(start));
  return result;
};

const internalRuntimeImport = (runtimeImport: string): string =>
  `${runtimeImport.replace(/\/$/u, "")}/internal`;

const oneLineExpression = (expression: string): string => expression.trim().replace(/\s+/g, " ");

const renderPrecompiledTemplate = (
  template: string,
  functionName: string,
  scopeNames: readonly string[]
): { code: string; helpers: string[] } => {
  const generated = codegen(template, {
    functionName,
    runtimeImport: DEFAULT_RENDER_RUNTIME_IMPORT,
    expressionMode: "scope",
    scopeNames,
    includePropsInScope: false
  });
  const code = generated.code
    .replace(/^import\s+\{[^}]*\}\s+from\s+["'][^"']+["'];?\s*/u, "")
    .replace(`export default function ${functionName}`, `function ${functionName}`)
    .trim();
  return { code, helpers: generated.helpers };
};

const renderOutput = (state: TransformState, components: InternalCompiledComponent[]): string => {
  const code = renderGeneratedModule(buildGeneratedModule(state, components));
  if (!isJavaScriptFilename(state.filename)) return code;

  return `${ts
    .transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext
      }
    })
    .outputText.trimEnd()}\n`;
};

const buildGeneratedModule = (
  state: TransformState,
  components: InternalCompiledComponent[]
): MacroGeneratedModule => {
  const runtimeImports = [
    "defineComponent as __elfDefineComponent",
    ...dedupe(state.macroRuntimeImports)
  ];
  const renderRuntimeImports = dedupe(components.flatMap((component) => component.renderHelpers));
  const modelRuntimeImports =
    state.modelMacros.length > 0 ? ["useModel as __elfRuntimeUseModel"] : [];

  const propsCode = renderProps(state);
  const emitsCode = renderEmits(state);
  const stylesCode = renderStyles(state);
  const directivesCode = renderDirectives(state);
  const componentsCode = renderComponents(state);

  return {
    runtimeImport: state.runtimeImport,
    runtimeImports,
    renderRuntimeImport: internalRuntimeImport(state.runtimeImport),
    renderRuntimeImports,
    modelRuntimeImport: state.runtimeImport,
    modelRuntimeImports,
    preservedImports: state.imports,
    topLevelStatements: state.topLevel,
    sharedDeclarations: [
      `const __elfPropsOptions = ${propsCode};`,
      `const __elfEmits = ${emitsCode};`,
      `const __elfStyles = ${stylesCode};`,
      `const __elfDirectives = ${directivesCode};`,
      `const __elfComponents = ${componentsCode};`
    ],
    renderFunctions: components.map((component) => component.renderCode),
    typeAliases: renderTypeAliases(state),
    setupFactory: renderSetup(state),
    componentFactories: components.map((component) => renderComponent(component, state))
  };
};

const renderGeneratedModule = (module: MacroGeneratedModule): string => {
  const code = new CodeBuilder();
  code.chunk(
    `import { ${module.runtimeImports.join(", ")} } from ${JSON.stringify(module.runtimeImport)};`
  );
  if (module.renderRuntimeImports.length > 0) {
    code.chunk(
      `import { ${module.renderRuntimeImports.join(", ")} } from ${JSON.stringify(module.renderRuntimeImport)};`
    );
  }
  if (module.modelRuntimeImports.length > 0) {
    code.chunk(
      `import { ${module.modelRuntimeImports.join(", ")} } from ${JSON.stringify(module.modelRuntimeImport)};`
    );
  }
  for (const preservedImport of module.preservedImports) code.chunk(preservedImport);
  for (const statement of module.topLevelStatements) code.chunk(statement);
  for (const declaration of module.sharedDeclarations) code.chunk(declaration);
  for (const renderFunction of module.renderFunctions) code.chunk(renderFunction);
  code.chunk(module.typeAliases);
  code.chunk(module.setupFactory);
  for (const componentFactory of module.componentFactories) code.chunk(componentFactory);
  return `${code.toString()}\n`;
};

const createMacroSourceMap = (state: TransformState, code: string): ElfSourceMap => {
  const generatedLines = code.split(/\r\n|\r|\n/);
  const sourceLines = state.source.split(/\r\n|\r|\n/);
  const sourceLineByText = new Map<string, number[]>();
  for (let index = 0; index < sourceLines.length; index++) {
    const key = sourceLines[index]?.trim();
    if (!key) continue;
    const lines = sourceLineByText.get(key) ?? [];
    lines.push(index);
    sourceLineByText.set(key, lines);
  }

  let sourceCursor = 0;
  let templateCursor = 0;
  let activeTemplate: TemplateExport | undefined;
  const originalPositions = generatedLines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const template = state.templates[templateCursor];
    if (
      (trimmed.startsWith("template:") || trimmed.startsWith("function __elfRender")) &&
      template
    ) {
      templateCursor++;
      activeTemplate = template;
      return state.sourceFile.getLineAndCharacterOfPosition(template.sourceStart);
    }
    const bindingSource = /source:\s*\{\s*line:\s*(\d+),\s*column:\s*(\d+)\s*\}/u.exec(trimmed);
    if (bindingSource && activeTemplate) {
      const relativeLine = Number(bindingSource[1]);
      const relativeColumn = Number(bindingSource[2]);
      const start = state.sourceFile.getLineAndCharacterOfPosition(activeTemplate.sourceStart);
      return {
        line: start.line + relativeLine - 1,
        character: relativeLine === 1 ? start.character + relativeColumn - 1 : relativeColumn - 1
      };
    }
    if (trimmed.includes('"__elfSource"')) {
      const lineMatch = /"line":(\d+),"column":(\d+)/u.exec(trimmed);
      if (lineMatch) {
        return {
          line: Number(lineMatch[1]) - 1,
          character: Number(lineMatch[2]) - 1
        };
      }
    }
    const candidates = sourceLineByText.get(trimmed);
    if (!candidates || candidates.length === 0) return null;
    const forward = candidates.find((candidate) => candidate >= sourceCursor);
    const originalLine = forward ?? candidates[0] ?? null;
    if (originalLine !== null) sourceCursor = originalLine;
    return originalLine === null ? null : { line: originalLine, character: 0 };
  });

  return {
    version: 3,
    file: state.sourceId,
    sources: [state.sourceId],
    sourcesContent: [state.source],
    names: [],
    mappings: encodeLineSourceMapMappings(originalPositions)
  };
};

const encodeLineSourceMapMappings = (
  originalPositions: readonly (ts.LineAndCharacter | null)[]
): string => {
  let previousSource = 0;
  let previousOriginalLine = 0;
  let previousOriginalColumn = 0;

  return originalPositions
    .map((original) => {
      if (original === null) return "";
      const segment = [
        0,
        0 - previousSource,
        original.line - previousOriginalLine,
        original.character - previousOriginalColumn
      ];
      previousSource = 0;
      previousOriginalLine = original.line;
      previousOriginalColumn = original.character;
      return segment.map(encodeVlq).join("");
    })
    .join(";");
};

const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const encodeVlq = (value: number): string => {
  let vlq = value < 0 ? (-value << 1) + 1 : value << 1;
  let encoded = "";
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    encoded += base64Chars[digit] ?? "";
  } while (vlq > 0);
  return encoded;
};

const renderProps = (state: TransformState): string => {
  if (state.props.size === 0) return "{}";
  return `{ ${Array.from(state.props, ([key, value]) => `${objectKey(key)}: ${value}`).join(", ")} }`;
};

const renderEmits = (state: TransformState): string => {
  return `[${Array.from(state.emits, (name) => JSON.stringify(name)).join(", ")}] as const`;
};

const renderStyles = (state: TransformState): string => {
  if (state.styles.length === 0) return "[] as string[]";
  return `[${state.styles.join(", ")}]`;
};

const renderDirectives = (state: TransformState): string => {
  if (state.directives.size === 0) return "{}";
  return `{ ${Array.from(state.directives, ([key, value]) => `${objectKey(key)}: ${value}`).join(
    ", "
  )} }`;
};

const renderComponents = (state: TransformState): string => {
  if (state.components.size === 0) return "{}";
  const entries = new Map<string, string>();
  for (const [key, value] of state.components) {
    for (const alias of componentAliases(key, state.tagPrefix)) {
      entries.set(alias, value);
    }
  }
  return `{ ${Array.from(entries, ([key, value]) => `${objectKey(key)}: ${value}`).join(", ")} }`;
};

const renderTypeAliases = (state: TransformState): string => {
  const propsType =
    state.propsType ??
    `import(${JSON.stringify(state.runtimeImport)}).InferPropsOptions<typeof __elfPropsOptions>`;
  const emitsType = state.emitsType ?? "Record<string, unknown[]>";
  const slotsType = state.slotsType ?? "Record<string, unknown>";
  const setupContextType = `Omit<import(${JSON.stringify(
    state.runtimeImport
  )}).SetupContext, "emit"> & {
  emit: <K extends keyof Emits & string>(event: K, ...args: Emits[K]) => boolean;
  readonly slots?: Slots;
}`;

  return [
    "type __ElfEmitTuples<T> = {",
    "  [K in keyof T & string]: T[K] extends (...args: infer Args) => unknown",
    "    ? Args",
    "    : T[K] extends readonly unknown[]",
    "      ? [...T[K]]",
    "      : unknown[];",
    "};",
    `type __ElfSetupContext<Emits extends Record<string, unknown[]>, Slots extends object> = ${setupContextType};`,
    `type __ElfProps = ${propsType};`,
    `type __ElfEmits = ${emitsType};`,
    `type __ElfSlots = ${slotsType};`
  ].join("\n");
};

const renderSetup = (state: TransformState): string => {
  const code = new CodeBuilder([
    "const __elfSetup = (",
    "  __elfProps: Readonly<__ElfProps>,",
    "  __elfCtx: __ElfSetupContext<__ElfEmits, __ElfSlots>",
    ") => {"
  ]);

  if (state.propsVarName) {
    code.line(`  const ${state.propsVarName} = __elfProps;`);
  }

  if (state.emitVarName) {
    code.line(`  const ${state.emitVarName} = __elfCtx.emit;`);
  }

  for (const model of state.modelMacros) {
    const typeArgs = model.typeArgs ? `<${model.typeArgs}>` : "";
    code.line(
      `  const ${model.localName} = __elfRuntimeUseModel${typeArgs}(__elfProps as Record<string, unknown>, __elfCtx as { emit(event: string, ...args: unknown[]): void }, ${JSON.stringify(
        model.propName
      )});`
    );
  }

  for (const statement of state.setupStatements) {
    for (const line of indent(statement, "  ").split(/\r\n|\r|\n/)) {
      code.line(line);
    }
  }

  for (const temp of state.templateTemps) {
    code.line(`  ${temp}`);
  }

  const exposed = Array.from(state.exposed);
  code.line(`  return ${renderReturnObject(exposed)};`);
  code.line("};");
  return code.toString();
};

const renderReturnObject = (names: string[]): string => {
  if (names.length === 0) return "{}";
  return `{ ${names.join(", ")} }`;
};

const renderComponent = (component: InternalCompiledComponent, state: TransformState): string => {
  const fields = [
    `name: ${JSON.stringify(component.name)}`,
    "props: __elfPropsOptions",
    "emits: __elfEmits",
    "setup: __elfSetup",
    `render: ${component.renderName}`,
    "styles: __elfStyles",
    "directives: __elfDirectives"
  ];
  const optionComponents = state.options.get("components") ?? null;
  if (state.components.size > 0 || optionComponents) {
    fields.push(
      `components: ${mergeComponentsOption(
        state.components.size > 0 ? "__elfComponents" : null,
        optionComponents
      )}`
    );
  }
  for (const [key, value] of state.options) {
    if (key === "components") continue;
    fields.push(`${objectKey(key)}: ${value}`);
  }
  if (component.lazyRegister && !state.options.has("register")) {
    fields.push("register: false");
  }
  const propsType = component.propsType ?? "__ElfProps";
  const emitsType = component.emitsType ?? "__ElfEmits";
  const slotsType = component.slotsType ?? "__ElfSlots";
  const generics = `<${propsType}, ${emitsType}, ${slotsType}>`;
  const code = `__elfDefineComponent${generics}({ ${fields.join(", ")} })`;
  const withSource = (reference: string): string => {
    const start = state.sourceFile.getLineAndCharacterOfPosition(component.sourceStart);
    const end = state.sourceFile.getLineAndCharacterOfPosition(component.sourceEnd);
    const source = JSON.stringify({
      file: state.sourceId,
      line: start.line + 1,
      column: start.character + 1,
      endLine: end.line + 1,
      endColumn: end.character + 1
    });
    return `if (typeof __DEV__ === "undefined" || __DEV__) Object.defineProperty(${reference}, "__elfSource", { value: ${source}, configurable: true });`;
  };

  if (component.exportName === "default") {
    if (component.localName) {
      return `const ${component.localName} = ${code};\n${withSource(component.localName)}\nexport default ${component.localName};`;
    }
    return `const __elfDefaultComponent = ${code};\n${withSource("__elfDefaultComponent")}\nexport default __elfDefaultComponent;`;
  }

  if (component.localName && component.exportMode === "separate") {
    const exportClause =
      component.localName === component.exportName
        ? component.localName
        : `${component.localName} as ${component.exportName}`;
    return `const ${component.localName} = ${code};\n${withSource(component.localName)}\nexport { ${exportClause} };`;
  }

  return `export const ${component.exportName} = ${code};\n${withSource(component.exportName)}`;
};

const buildMetadata = (
  state: TransformState,
  components: InternalCompiledComponent[]
): MacroComponentMetadata => {
  const fallbackPropsType = state.propsType ?? "__ElfProps";
  const fallbackEmitsType = state.emitsType ?? "__ElfEmits";
  const fallbackSlotsType = state.slotsType ?? "__ElfSlots";

  return {
    filename: state.filename,
    sourceId: state.sourceId,
    components: components.map((component) => ({
      exportName: component.exportName,
      ...(component.localName ? { localName: component.localName } : {}),
      name: component.name,
      propsType: component.propsType ?? fallbackPropsType,
      emitsType: component.emitsType ?? fallbackEmitsType,
      slotsType: component.slotsType ?? fallbackSlotsType,
      propNames: Array.from(state.props.keys()),
      runtimePropOptions: Object.fromEntries(state.props),
      emitNames: Array.from(state.emits)
    })),
    localComponents: Array.from(state.components, ([name, expression]) => {
      const constructorType = typeQueryForComponentExpression(expression);
      const unknownComponent = constructorType === "unknown";
      return {
        name,
        expression,
        constructorType,
        propsType: unknownComponent
          ? "Record<string, unknown>"
          : `NonNullable<(${constructorType})["__elfProps"]>`,
        emitsType: unknownComponent
          ? "Record<string, unknown[]>"
          : `NonNullable<(${constructorType})["__elfEmits"]>`,
        slotsType: unknownComponent
          ? "Record<string, unknown>"
          : `NonNullable<(${constructorType})["__elfSlots"]>`
      };
    }),
    exposed: Array.from(state.exposed)
  };
};

const normalizeSourceId = (value: string): string =>
  value.replace(/\?.*$/u, "").replace(/\\/g, "/");

const resolveComponentName = (template: TemplateExport, state: TransformState): string => {
  if (template.exportName === "default") {
    return (
      state.nameDefault ??
      (template.nameHint
        ? tagFromName(template.nameHint, state.tagPrefix)
        : inferNameFromFilename(state.filename, state.tagPrefix))
    );
  }
  return (
    state.nameMap.get(template.exportName) ?? tagFromName(template.exportName, state.tagPrefix)
  );
};

const mergeComponentsOption = (
  localComponents: string | null,
  optionComponents: string | null
): string => {
  if (localComponents && optionComponents) {
    return `{ ...${optionComponents}, ...${localComponents} }`;
  }
  return localComponents ?? optionComponents ?? "{}";
};

const inferNameFromFilename = (filename: string, prefix = "elf"): string => {
  const parts = filename.replace(/\\/g, "/").split("/");
  const fileBase = parts
    .pop()
    ?.replace(/\.elf\.[cm]?[jt]sx?$/, "")
    .replace(/\.[cm]?[jt]sx?$/, "");
  const base =
    fileBase === "index" || fileBase === "component" ? (parts.pop() ?? fileBase) : fileBase;
  return tagFromName(base || "component", prefix);
};

const isJavaScriptFilename = (filename: string): boolean => /\.[cm]?jsx?$/i.test(filename);

const getObjectProperty = (expression: ts.Expression, key: string): ts.Expression | null => {
  const value = stripExpression(expression);
  if (!ts.isObjectLiteralExpression(value)) return null;
  for (const prop of value.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (propertyNameText(prop.name) === key) return prop.initializer;
  }
  return null;
};

const getObjectStringProperty = (expression: ts.Expression, key: string): string | null => {
  const prop = getObjectProperty(expression, key);
  if (!prop) return null;
  const value = stripExpression(prop);
  return ts.isStringLiteralLike(value) ? value.text : null;
};

const stripExpression = (expression: ts.Expression): ts.Expression => {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
};

const isMacroTag = (node: ts.TaggedTemplateExpression, name: string): boolean => {
  return ts.isIdentifier(node.tag) && node.tag.text === name;
};

const callName = (call: ts.CallExpression): string | null => {
  return ts.isIdentifier(call.expression) ? call.expression.text : null;
};

const isModuleSideEffectCall = (call: ts.CallExpression): boolean => {
  const name = callName(call);
  return !!name && moduleSideEffectCalls.has(name);
};

const isModuleLevelDeclaration = (declaration: ts.VariableDeclaration): boolean => {
  const initializer = declaration.initializer ? stripExpression(declaration.initializer) : null;
  if (!initializer) return false;
  const rootName = rootExpressionName(initializer);
  return !!rootName && moduleLevelDeclarationCalls.has(rootName);
};

const rootExpressionName = (expression: ts.Expression): string | null => {
  const value = stripExpression(expression);
  if (ts.isIdentifier(value)) return value.text;
  if (ts.isCallExpression(value)) return rootExpressionName(value.expression);
  if (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) {
    return rootExpressionName(value.expression);
  }
  return null;
};

const identifierText = (name: ts.BindingName): string | null => {
  return ts.isIdentifier(name) ? name.text : null;
};

const collectStatementBindings = (statement: ts.Statement, out: Set<string>): void => {
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
    if (statement.name) out.add(statement.name.text);
    return;
  }
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      collectBindingNames(declaration.name, out);
    }
  }
};

const collectBindingNames = (name: ts.BindingName, out: Set<string>): void => {
  if (ts.isIdentifier(name)) {
    out.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) collectBindingNames(element.name, out);
  }
};

const stringLiteralValue = (node: ts.Expression): string | null => {
  return ts.isStringLiteralLike(node) ? node.text : null;
};

const propertyNameText = (name: ts.PropertyName): string | null => {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
};

const declarationKind = (list: ts.VariableDeclarationList): "const" | "let" | "var" => {
  const flags = ts.getCombinedNodeFlags(list);
  if (flags & ts.NodeFlags.Const) return "const";
  if (flags & ts.NodeFlags.Let) return "let";
  return "var";
};

const isExported = (node: ts.Node): boolean => {
  if (!ts.canHaveModifiers(node)) return false;
  return !!ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
};

const isPropTypeIdentifier = (name: string): boolean => {
  return ["String", "Number", "Boolean", "Array", "Object", "Function"].includes(name);
};

const isUnaryNumber = (node: ts.Expression): boolean => {
  return (
    ts.isPrefixUnaryExpression(node) &&
    (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken) &&
    ts.isNumericLiteral(node.operand)
  );
};

const textOf = (node: ts.Node, state: TransformState): string => node.getText(state.sourceFile);

const emitTuplesType = (typeText: string): string => `__ElfEmitTuples<${typeText}>`;

const objectKey = (key: string): string => {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
};

const indent = (value: string, prefix: string): string => {
  return value
    .split("\n")
    .map((line) => (line ? `${prefix}${line}` : line))
    .join("\n");
};

const kebab = (value: string): string => {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
};

const tagFromName = (value: string, prefix: string): string => {
  const normalized = kebab(value).replace(/^-+/, "");
  if (!normalized) return `${prefix}-component`;
  return normalized.startsWith(`${prefix}-`) ? normalized : `${prefix}-${normalized}`;
};

const componentAliases = (name: string, prefix: string): string[] => {
  const normalized = kebab(name).replace(/^-+/, "");
  const aliases = [name, normalized];
  if (normalized && !normalized.startsWith(`${prefix}-`)) {
    aliases.push(`${prefix}-${normalized}`);
  }
  return dedupe(aliases.filter(Boolean));
};

const normalizeTagPrefix = (value: string | undefined): string => {
  const normalized = (value ?? "elf").trim().replace(/-+$/g, "");
  return normalized || "elf";
};

const camel = (value: string): string => {
  return value.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
};

const dedupe = (values: string[]): string[] => Array.from(new Set(values));

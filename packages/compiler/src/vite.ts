import * as ts from "typescript";

import {
  compileMacroComponent,
  type ElfSourceMap,
  type MacroComponentCompileOptions
} from "./macro-component";
import { createElfDiagnostic, formatElfDiagnostic, type ElfDiagnostic } from "./diagnostic";

const DEFAULT_MACRO_IMPORT = "elfui";
const elfFileRE = /\.elf\.tsx?(?:\?.*)?$/;
const scriptFileRE = /\.[cm]?[jt]sx?(?:\?.*)?$/;
const pragmaCommentRE = /^\/\/\/[ \t]*<!--[ \t]*@elf[ \t]+component[ \t]*-->[ \t]*$/;
const macroImportNames = new Set([
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
  "useComponents",
  // 已删除别名仍参与文件识别，确保 pragma `.ts` 能进入编译器并给出精准迁移诊断。
  "useName",
  "useProps",
  "useEmit",
  "useModel",
  "useStyle"
]);

const defineHtmlImportName = "defineHtml";

export interface ElfUIMacroPluginOptions extends MacroComponentCompileOptions {
  include?: RegExp;
  exclude?: RegExp;
  pragma?: boolean;
  /**
   * 为 true 时，宏编译 warning 和宏文件识别 warning 都会让构建失败。
   * 适合 CI 或 beta 前质量门禁。
   */
  strictDiagnostics?: boolean;
  /** 默认 false：避免 Vite transform 为每个组件同步创建 TS Program；类型检查交给独立 check / 语言服务。 */
  templateTypeCheck?: boolean;
}

export interface MinimalVitePlugin {
  name: string;
  enforce?: "pre" | "post";
  transform?(code: string, id: string): { code: string; map: ElfSourceMap | null } | null;
}

export interface ElfUIPragmaAnalysis {
  hasPragma: boolean;
  valid: boolean;
  start?: number;
  message?: string;
}

interface ElfUIMacroUsageAnalysis {
  hasMacroImport: boolean;
  hasMacroAuthoringImport: boolean;
  hasMacroComponentExport: boolean;
  firstMacroImportStart?: number;
}

export const elfuiMacroPlugin = (options: ElfUIMacroPluginOptions = {}): MinimalVitePlugin => {
  const include = options.include ?? scriptFileRE;
  const exclude = options.exclude;
  const macroImport = options.macroImport ?? DEFAULT_MACRO_IMPORT;
  const pragmaEnabled = options.pragma ?? true;

  return {
    name: "elfui:macro-component",
    enforce: "pre",
    transform(code, id) {
      if (!include.test(id) || exclude?.test(id)) return null;
      const isElfFile = elfFileRE.test(id);
      const isScriptFile = scriptFileRE.test(id);
      const pragma = analyzeElfComponentPragma(code);
      const usage = analyzeElfMacroUsage(code, macroImport, id);

      if (!isElfFile) {
        if (!isScriptFile || !pragmaEnabled) return null;
        if (pragma.hasPragma && !pragma.valid) {
          throw new Error(
            formatPluginDiagnostic(
              createElfDiagnostic({
                code: "ELF_VITE_PRAGMA_POSITION",
                severity: "error",
                file: id,
                source: code,
                ...(pragma.start !== undefined ? { start: pragma.start } : {}),
                message:
                  pragma.message ??
                  "ElfUI component pragma must appear in the file header before imports/exports/statements.",
                hint: "Move `/// <!--@elf component-->` to the top of the file."
              })
            )
          );
        }
        if (pragma.hasPragma && !usage.hasMacroImport) {
          reportMacroUsageDiagnostic(
            createElfDiagnostic({
              code: "ELF_VITE_PRAGMA_NO_IMPORT",
              severity: "warning",
              file: id,
              source: code,
              ...(pragma.start !== undefined ? { start: pragma.start } : {}),
              message: `Found ElfUI component pragma, but no import from ${JSON.stringify(
                macroImport
              )}.`,
              hint: "Add a macro import from `elfui`, or remove the pragma."
            }),
            options
          );
          return null;
        }
        if (!pragma.hasPragma) {
          if (usage.hasMacroComponentExport) {
            // 普通 .ts/.tsx 以导出的 defineHtml(...) 作为组件边界，无需 .elf.ts 或 pragma。
          } else if (usage.hasMacroAuthoringImport) {
            reportMacroUsageDiagnostic(
              createElfDiagnostic({
                code: "ELF_VITE_NO_COMPONENT_EXPORT",
                severity: "warning",
                file: id,
                source: code,
                ...(usage.firstMacroImportStart !== undefined
                  ? { start: usage.firstMacroImportStart }
                  : {}),
                message: "Found ElfUI macro imports, but no exported defineHtml component.",
                hint:
                  "Export one with `export const X = defineHtml(html`...`)`, " +
                  "`export default defineHtml(html`...`)`, `const X = defineHtml(...); export { X }`, " +
                  "or remove the macro imports."
              }),
              options
            );
            return null;
          } else {
            return null;
          }
        }
      }

      const compileOptions: MacroComponentCompileOptions = { filename: id };
      if (options.runtimeImport) compileOptions.runtimeImport = options.runtimeImport;
      if (options.tagPrefix) compileOptions.tagPrefix = options.tagPrefix;
      compileOptions.macroImport = macroImport;
      compileOptions.templateTypeCheck = options.templateTypeCheck ?? false;
      const result = compileMacroComponent(code, compileOptions);
      if (result.diagnostics.length > 0) {
        const diagnostics = result.diagnostics.map(formatElfDiagnostic).join("\n");
        const shouldFail =
          options.strictDiagnostics === true ||
          result.diagnostics.some((diagnostic) => diagnostic.severity === "error");
        const message = `[elfui:macro-component] ${id}\n${diagnostics}`;
        if (shouldFail) {
          throw new Error(message);
        }
        if (typeof console !== "undefined") {
          console.warn(message);
        }
      }
      return { code: result.code, map: result.map };
    }
  };
};

const formatPluginDiagnostic = (diagnostic: ElfDiagnostic): string =>
  `[elfui:macro-component] ${diagnostic.file}\n${formatElfDiagnostic(diagnostic)}`;

const reportMacroUsageDiagnostic = (
  diagnostic: ElfDiagnostic,
  options: ElfUIMacroPluginOptions
): void => {
  const message = formatPluginDiagnostic(diagnostic);
  if (options.strictDiagnostics === true) {
    throw new Error(message);
  }
  if (typeof console !== "undefined") {
    console.warn(message);
  }
};

export const analyzeElfComponentPragma = (code: string): ElfUIPragmaAnalysis => {
  const pragmaIndex = findFirstPragmaCommentIndex(code);
  if (pragmaIndex < 0) return { hasPragma: false, valid: false };

  const firstStatementIndex = findFirstStatementIndex(code);
  const beforeFirstStatement = firstStatementIndex < 0 || pragmaIndex < firstStatementIndex;
  const inHeaderWindow = pragmaIndex <= 1024;

  if (beforeFirstStatement && inHeaderWindow) {
    return { hasPragma: true, valid: true, start: pragmaIndex };
  }

  return {
    hasPragma: true,
    valid: false,
    start: pragmaIndex,
    message:
      "ElfUI component pragma must appear in the file header before imports/exports/statements. " +
      "Move `/// <!--@elf component-->` to the top of the file."
  };
};

const findFirstPragmaCommentIndex = (code: string): number => {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    code
  );

  while (true) {
    const token = scanner.scan();
    if (token === ts.SyntaxKind.EndOfFileToken) return -1;
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia) continue;
    if (pragmaCommentRE.test(scanner.getTokenText())) return scanner.getTokenPos();
  }
};

export const analyzeElfMacroUsage = (
  code: string,
  macroImport = DEFAULT_MACRO_IMPORT,
  filename = "anonymous.ts"
): ElfUIMacroUsageAnalysis => {
  const sourceFile = ts.createSourceFile(
    filename,
    code,
    ts.ScriptTarget.Latest,
    false,
    scriptKindFromId(filename)
  );

  const defineHtmlLocals = new Set<string>();
  let hasMacroImport = false;
  let hasMacroAuthoringImport = false;
  let firstMacroImportStart: number | undefined;

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== macroImport
    ) {
      continue;
    }

    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (clause.name || (clause.namedBindings && !ts.isNamedImports(clause.namedBindings))) {
      hasMacroImport = true;
      continue;
    }

    const named = clause.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;

    for (const specifier of named.elements) {
      const imported = (specifier.propertyName ?? specifier.name).text;
      if (!macroImportNames.has(imported)) continue;
      hasMacroImport = true;
      firstMacroImportStart ??= specifier.getStart(sourceFile);
      if (imported !== "html" && imported !== "css") {
        hasMacroAuthoringImport = true;
      }
      if (imported === defineHtmlImportName) {
        defineHtmlLocals.add(specifier.name.text);
      }
    }
  }

  const componentLocals = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer || !ts.isIdentifier(declaration.name)) continue;
      if (isDefineHtmlCall(declaration.initializer, defineHtmlLocals)) {
        componentLocals.add(declaration.name.text);
      }
    }
  }

  let hasMacroComponentExport = false;
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      if (
        isDefineHtmlCall(statement.expression, defineHtmlLocals) ||
        (ts.isIdentifier(statement.expression) && componentLocals.has(statement.expression.text))
      ) {
        hasMacroComponentExport = true;
      }
      continue;
    }

    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer || !ts.isIdentifier(declaration.name)) continue;
        if (isDefineHtmlCall(declaration.initializer, defineHtmlLocals)) {
          hasMacroComponentExport = true;
        }
      }
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (!statement.moduleSpecifier && clause && ts.isNamedExports(clause)) {
        for (const specifier of clause.elements) {
          const localName = (specifier.propertyName ?? specifier.name).text;
          if (componentLocals.has(localName)) {
            hasMacroComponentExport = true;
          }
        }
      }
    }
  }

  return {
    hasMacroImport,
    hasMacroAuthoringImport,
    hasMacroComponentExport,
    ...(firstMacroImportStart !== undefined ? { firstMacroImportStart } : {})
  };
};

const isDefineHtmlCall = (expression: ts.Expression, defineHtmlLocals: Set<string>): boolean => {
  const value = unwrapExpression(expression);
  return (
    ts.isCallExpression(value) &&
    ts.isIdentifier(value.expression) &&
    defineHtmlLocals.has(value.expression.text)
  );
};

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
};

const isExported = (statement: ts.Statement): boolean =>
  ts.canHaveModifiers(statement) &&
  (ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
    false);

const findFirstStatementIndex = (code: string): number => {
  const lines = code.split(/\r?\n/);
  let offset = 0;
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i] ?? "";
    if (i === 0) line = line.replace(/^\uFEFF/, "");
    const originalLength = line.length;
    const trimmed = line.trim();

    if (i === 0 && trimmed.startsWith("#!")) {
      offset += originalLength + 1;
      continue;
    }
    if (trimmed === "") {
      offset += originalLength + 1;
      continue;
    }
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      offset += originalLength + 1;
      continue;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      offset += originalLength + 1;
      continue;
    }
    if (trimmed.startsWith("//")) {
      offset += originalLength + 1;
      continue;
    }

    return offset + line.search(/\S/);
  }

  return -1;
};

const scriptKindFromId = (id: string): ts.ScriptKind => {
  if (/\.tsx(?:\?.*)?$/.test(id)) return ts.ScriptKind.TSX;
  if (/\.jsx(?:\?.*)?$/.test(id)) return ts.ScriptKind.JSX;
  return ts.ScriptKind.TS;
};

export {
  compileMacroComponent,
  type ElfSourceMap,
  type MacroComponentCompileOptions
} from "./macro-component";
export { formatElfDiagnostic, type ElfDiagnostic, type ElfDiagnosticSeverity } from "./diagnostic";

import type ts from "typescript";

export const PARSED_MACRO_SOURCE: unique symbol = Symbol("elfui.parsed-macro-source");

export interface MacroInternalCompileOptions {
  [PARSED_MACRO_SOURCE]?: ts.SourceFile;
}

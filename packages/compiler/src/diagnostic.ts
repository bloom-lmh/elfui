export type ElfDiagnosticSeverity = "error" | "warning";

export interface ElfDiagnostic {
  code: string;
  severity: ElfDiagnosticSeverity;
  message: string;
  file: string;
  start?: number;
  end?: number;
  line?: number;
  column?: number;
  hint?: string;
}

export interface ElfDiagnosticInit {
  code: string;
  severity: ElfDiagnosticSeverity;
  message: string;
  file: string;
  source?: string;
  start?: number;
  end?: number;
  line?: number;
  column?: number;
  hint?: string;
}

export const createElfDiagnostic = (init: ElfDiagnosticInit): ElfDiagnostic => {
  const diagnostic: ElfDiagnostic = {
    code: init.code,
    severity: init.severity,
    message: init.message,
    file: init.file
  };

  if (init.start !== undefined) diagnostic.start = init.start;
  if (init.end !== undefined) diagnostic.end = init.end;
  if (init.hint !== undefined) diagnostic.hint = init.hint;

  if (init.line !== undefined && init.column !== undefined) {
    diagnostic.line = init.line;
    diagnostic.column = init.column;
  } else if (init.source !== undefined && init.start !== undefined) {
    const location = offsetToLineColumn(init.source, init.start);
    diagnostic.line = location.line;
    diagnostic.column = location.column;
  }

  return diagnostic;
};

export const formatElfDiagnostic = (diagnostic: ElfDiagnostic): string => {
  const severity = diagnostic.severity.toUpperCase();
  const location =
    diagnostic.line !== undefined && diagnostic.column !== undefined
      ? `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`
      : diagnostic.file;
  const hint = diagnostic.hint ? `\n  hint: ${diagnostic.hint}` : "";
  return `[${diagnostic.code}] ${severity} ${location}\n  ${diagnostic.message}${hint}`;
};

export const offsetToLineColumn = (
  source: string,
  offset: number
): { line: number; column: number } => {
  const safeOffset = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  let column = 1;

  for (let index = 0; index < safeOffset; index++) {
    if (source.charCodeAt(index) === 10) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }

  return { line, column };
};

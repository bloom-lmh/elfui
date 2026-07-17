import type { DirectiveNode, SourceLoc } from "@elfui/compiler-template";
import { isState } from "@elfui/reactivity";
import {
  handleRuntimeError,
  readTemplateValue,
  unwrapStateAccess,
  writeTemplateValue
} from "@elfui/runtime/internal";

import type { RenderCtx } from "./compile";
import { createElfDiagnostic, formatElfDiagnostic } from "./diagnostic";
import { DEV as __DEV__ } from "./dev";
import { createTemplateExpressionIR } from "./expression";

export interface RuntimeExpressionMeta {
  kind: string;
  loc?: SourceLoc | undefined;
}

const wrappedCtxCache = new WeakMap<RenderCtx, RenderCtx>();

export const wrapCtx = (ctx: RenderCtx): RenderCtx => {
  const cached = wrappedCtxCache.get(ctx);
  if (cached) return cached;
  const wrapped = { ...ctx, state: unwrapStateAccess(ctx.state) };
  wrappedCtxCache.set(ctx, wrapped);
  return wrapped;
};

const createRuntimeExpression = (expression: string) =>
  createTemplateExpressionIR(expression, { stateExpression: "__state" });

export const expressionMeta = (
  kind: string,
  loc: SourceLoc | undefined
): RuntimeExpressionMeta => ({ kind, ...(loc ? { loc } : {}) });

export const bindingDebug = (
  loc: SourceLoc | undefined,
  name?: string
): { name?: string; source: { line: number; column: number } } | undefined =>
  loc
    ? {
        ...(name ? { name } : {}),
        source: { line: loc.start.line, column: loc.start.column }
      }
    : undefined;

export const directiveMeta = (kind: string, directive: DirectiveNode): RuntimeExpressionMeta =>
  expressionMeta(kind, directive.expLoc ?? directive.loc);

export const reportRuntimeCompilerDiagnostic = (
  ctx: RenderCtx,
  severity: "error" | "warning",
  code: string,
  message: string,
  meta: RuntimeExpressionMeta,
  hint?: string,
  error?: unknown
): void => {
  if (!__DEV__) {
    if (severity === "error") console.error(error ?? message);
    return;
  }
  const tag = ctx.host?.localName || ctx.host?.tagName?.toLowerCase() || "anonymous";
  const diagnostic = createElfDiagnostic({
    code,
    severity,
    file: `<${tag}>`,
    message,
    ...(meta.loc ? { line: meta.loc.start.line, column: meta.loc.start.column } : {}),
    ...(hint ? { hint } : {})
  });
  const output = `[elfui:runtime-compiler]\n${formatElfDiagnostic(diagnostic)}`;
  if (severity === "error") console.error(output, ...(error === undefined ? [] : [error]));
  else console.warn(output);
};

export const reportRuntimeExpressionError = (
  ctx: RenderCtx,
  expression: string,
  error: unknown,
  meta: RuntimeExpressionMeta,
  phase: "compile" | "event" | "getter" | "key" | "setter" | "transition",
  reportUnhandled: boolean = true
): void => {
  const handled = handleRuntimeError(
    error,
    ctx.host,
    `runtime compiler ${phase} ${meta.kind}`,
    false
  );
  if (handled || !reportUnhandled) return;
  if (!__DEV__) {
    console.error(error);
    return;
  }
  const tag = ctx.host?.localName || ctx.host?.tagName?.toLowerCase() || "anonymous";
  const snippet = meta.loc?.source?.trim();
  const locationText = meta.loc
    ? ` at line ${meta.loc.start.line}, column ${meta.loc.start.column}`
    : "";
  const hint = `expression: ${expression}${snippet ? `; template: ${snippet}` : ""}`;
  const diagnostic = createElfDiagnostic({
    code: "ELF_RUNTIME_EXPRESSION",
    severity: "error",
    file: `<${tag}>`,
    message: `${phase} ${meta.kind} expression failed in <${tag}>${locationText}`,
    ...(meta.loc ? { line: meta.loc.start.line, column: meta.loc.start.column } : {}),
    hint
  });
  console.error(`[elfui:runtime-compiler]\n${formatElfDiagnostic(diagnostic)}`, error);
};

export const makeGetter = (
  expressionSource: string,
  meta: RuntimeExpressionMeta = expressionMeta("expression", undefined)
): ((ctx: RenderCtx) => unknown) => {
  if (!expressionSource.trim()) return () => undefined;
  const transformedExpression = createRuntimeExpression(expressionSource).code;
  try {
    const evaluate = new Function(
      "ctx",
      "$event",
      "__state",
      "readTemplateValue",
      "writeTemplateValue",
      `with(ctx.state){return (${transformedExpression});}`
    );
    let reported = false;
    return (ctx) => {
      try {
        return evaluate(wrapCtx(ctx), undefined, ctx.state, readTemplateValue, writeTemplateValue);
      } catch (error) {
        reportRuntimeExpressionError(ctx, expressionSource, error, meta, "getter", !reported);
        reported = true;
        return undefined;
      }
    };
  } catch (error) {
    let reported = false;
    return (ctx) => {
      reportRuntimeExpressionError(ctx, expressionSource, error, meta, "compile", !reported);
      reported = true;
      return undefined;
    };
  }
};

export const makeSetter = (
  expressionSource: string,
  meta: RuntimeExpressionMeta = expressionMeta("assignment", undefined)
): ((ctx: RenderCtx, value: unknown) => void) => {
  try {
    const expression = createRuntimeExpression(expressionSource);
    if (expression.statePath) {
      const { root, property } = expression.statePath;
      let reported = false;
      return (ctx, value) => {
        try {
          const target = ctx.state[root];
          if (target && isState(target)) {
            if (property) (target as unknown as Record<string, unknown>)[property] = value;
            else (target as { set?: (next: unknown) => unknown }).set?.(value);
          } else if (target && typeof target === "object" && property) {
            (target as Record<string, unknown>)[property] = value;
          } else {
            ctx.state[root] = value;
          }
        } catch (error) {
          reportRuntimeExpressionError(ctx, expressionSource, error, meta, "setter", !reported);
          reported = true;
        }
      };
    }

    const assign = new Function("ctx", "__v", `with(ctx.state){${expressionSource} = __v}`);
    let reported = false;
    return (ctx, value) => {
      try {
        assign(wrapCtx(ctx), value);
      } catch (error) {
        reportRuntimeExpressionError(ctx, expressionSource, error, meta, "setter", !reported);
        reported = true;
      }
    };
  } catch (error) {
    let reported = false;
    return (ctx) => {
      reportRuntimeExpressionError(ctx, expressionSource, error, meta, "compile", !reported);
      reported = true;
    };
  }
};

export const makeEventHandler = (
  expressionSource: string,
  meta: RuntimeExpressionMeta = expressionMeta("event", undefined)
): ((ctx: RenderCtx, event: Event) => void) => {
  if (!expressionSource.trim()) return () => undefined;
  const expression = createRuntimeExpression(expressionSource);
  try {
    const body = expression.simpleReference
      ? `with(ctx.state){const __h=(${expression.code});if(typeof __h==="function"){return __h($event);}}`
      : `with(ctx.state){${expression.code};}`;
    const evaluate = new Function(
      "ctx",
      "$event",
      "__state",
      "readTemplateValue",
      "writeTemplateValue",
      body
    );
    let reported = false;
    return (ctx, event) => {
      try {
        return evaluate(wrapCtx(ctx), event, ctx.state, readTemplateValue, writeTemplateValue);
      } catch (error) {
        reportRuntimeExpressionError(ctx, expressionSource, error, meta, "event", !reported);
        reported = true;
      }
    };
  } catch (error) {
    let reported = false;
    return (ctx) => {
      reportRuntimeExpressionError(ctx, expressionSource, error, meta, "compile", !reported);
      reported = true;
    };
  }
};

export const makeChildKeyGetter = (
  expressionSource: string,
  ctx: RenderCtx,
  itemName: string,
  indexName: string | undefined,
  meta: RuntimeExpressionMeta = expressionMeta("key", undefined)
): ((item: unknown, index: number) => string | number) => {
  try {
    const transformedExpression = createRuntimeExpression(expressionSource).code;
    const evaluate = new Function(
      "ctx",
      itemName,
      indexName ?? "_index",
      "__state",
      "readTemplateValue",
      "writeTemplateValue",
      `with(ctx.state){return (${transformedExpression});}`
    );
    let reported = false;
    return (item, index) => {
      try {
        const value = evaluate(
          wrapCtx(ctx),
          item,
          index,
          ctx.state,
          readTemplateValue,
          writeTemplateValue
        );
        return typeof value === "string" || typeof value === "number" ? value : String(value);
      } catch (error) {
        reportRuntimeExpressionError(ctx, expressionSource, error, meta, "key", !reported);
        reported = true;
        return index;
      }
    };
  } catch (error) {
    let reported = false;
    return (_item, index) => {
      reportRuntimeExpressionError(ctx, expressionSource, error, meta, "compile", !reported);
      reported = true;
      return index;
    };
  }
};

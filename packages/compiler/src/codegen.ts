// B3.6 离线 codegen — 把模板编译成可执行的 ESM 源码字符串
//
// 与运行时 compile 的区别：
// - compile(template) 返回 (ctx) => Node，立即可调用，运行时构造闭包
// - codegen(template) 返回 string（一段 ESM 模块代码），由构建工具写入 .js
//   文件，用户在生产环境直接 import 而不需要在运行时再跑一遍 parser
//
// 输出形态（示意）:
//
//   import { branch, list, mark, on, attr, prop, cls, sty, text, show,
//            teleport, dynamicComponent, applyCustomDirective, resolveDirective,
//            setScopedSlot } from "@elfui/core/internal";
//
//   export default function render(ctx) {
//     // ... 编译产物 ...
//   }
//
// 表达式仍然用 with(ctx.state){...} 包装，与 runtime compile 一致；
// 不引入额外的"标识符提升"分析（保持产物最小）。

import {
  AttrTypes,
  NodeTypes,
  parse,
  type AttributeNode,
  type DirectiveNode,
  type ElementNode,
  type InterpolationNode,
  type ParserOptions,
  type RootNode,
  type SourceLoc,
  type TemplateChildNode,
  type TextNode
} from "@elfui/compiler-template";

import {
  createTemplateExpressionIR,
  type TemplateExpressionIR,
  type TemplateValueHelper
} from "./expression";

export interface CodegenOptions extends ParserOptions {
  /** 渲染函数名（默认 "render"） */
  functionName?: string;
  /** 运行时 helper 包名（默认 "@elfui/core/internal"） */
  runtimeImport?: string;
  /**
   * 表达式包装模式。
   *
   * - "with"：默认离线 codegen 行为，产物更小但依赖 with(ctx.state)。
   * - "scope"：宏组件预编译产物使用，生成严格 TS 可检查代码，不使用 with。
   */
  expressionMode?: "with" | "scope";
  /** scope 模式下可从 ctx.state 解构出来的 setup 变量名 */
  scopeNames?: readonly string[];
  /** scope 模式下是否把 ctx.props 也合并进模板直写标识符作用域 */
  includePropsInScope?: boolean;
}

export interface CodegenResult {
  /** ESM 源码 */
  code: string;
  /** 用到的运行时 helper 列表（按需 import） */
  helpers: string[];
  /** 解析后的 AST（方便外部继续做别的处理） */
  ast: RootNode;
}

type Helper =
  | "branch"
  | "list"
  | "mark"
  | "on"
  | "attr"
  | "prop"
  | "renderOnce"
  | "cls"
  | "sty"
  | "text"
  | "show"
  | "teleport"
  | "dynamicComponent"
  | "ensureCustomElement"
  | "applyCustomDirective"
  | "resolveDirective"
  | "resolveComponentTag"
  | "setScopedSlot"
  | "setTemplateRef"
  | "bindObject"
  | "onObject"
  | "unwrapStateAccess"
  | TemplateValueHelper
  | "extendRenderState"
  | "handleRuntimeError"
  | "transition"
  | "transitionGroup"
  | "keepAlive"
  | "suspense";

interface CodegenContext {
  used: Set<Helper>;
  /** 命名计数器：保证生成的局部变量名唯一 */
  uid: number;
  buf: string[];
  expressionMode: "with" | "scope";
  scopeNames: Set<string>;
  includePropsInScope: boolean;
  ctxName: string;
}

const fresh = (ctx: CodegenContext, prefix: string): string => `_${prefix}${ctx.uid++}`;

const use = (ctx: CodegenContext, h: Helper): Helper => {
  ctx.used.add(h);
  return h;
};

const createCodegenExpression = (
  expression: string,
  ctx: CodegenContext,
  stateExpression: string = "ctx.state"
): TemplateExpressionIR => {
  const result = createTemplateExpressionIR(expression, {
    stateExpression,
    castReads: ctx.expressionMode === "scope"
  });
  for (const helper of result.helpers) use(ctx, helper);
  return result;
};

const transformTemplateExpression = (
  expression: string,
  ctx: CodegenContext,
  stateExpression: string = "ctx.state"
): string => createCodegenExpression(expression, ctx, stateExpression).code;

const isIdentifierName = (value: string): boolean => /^[A-Za-z_$][\w$]*$/.test(value);

const scopedStateAccess = (
  ctx: CodegenContext,
  stateExpr = "ctx.state",
  propsExpr = "ctx.props",
  referencedRoots: ReadonlySet<string> | null = null
): string => {
  if (ctx.expressionMode !== "scope") return "";
  const names = Array.from(ctx.scopeNames).filter(
    (name) => isIdentifierName(name) && (!referencedRoots || referencedRoots.has(name))
  );
  if (names.length === 0) return "";
  use(ctx, "unwrapStateAccess");
  const sourceExpr = ctx.includePropsInScope ? `({ ...${propsExpr}, ...${stateExpr} })` : stateExpr;
  return `const { ${names.join(", ")} } = unwrapStateAccess(${sourceExpr}) as Record<string, any>; `;
};

const renderCtxParam = (ctx: CodegenContext, name = "ctx"): string =>
  ctx.expressionMode === "scope" ? `${name}: any` : name;

const renderEventParam = (ctx: CodegenContext, name = "e"): string =>
  ctx.expressionMode === "scope" ? `${name}: Event & { __elf_once?: boolean }` : name;

const renderAnyParam = (ctx: CodegenContext, name: string): string =>
  ctx.expressionMode === "scope" ? `${name}: any` : name;

const renderListParams = (ctx: CodegenContext): string =>
  ctx.expressionMode === "scope" ? "__item: any, __index: any" : "__item, __index";

const currentCtx = (ctx: CodegenContext): string => ctx.ctxName;

const withCtxName = <T>(ctx: CodegenContext, name: string, run: () => T): T => {
  const previous = ctx.ctxName;
  ctx.ctxName = name;
  try {
    return run();
  } finally {
    ctx.ctxName = previous;
  }
};

const withScopeNames = <T>(
  ctx: CodegenContext,
  names: readonly (string | undefined)[],
  run: () => T
): T => {
  if (ctx.expressionMode !== "scope") return run();
  const previous = ctx.scopeNames;
  ctx.scopeNames = new Set(previous);
  for (const name of names) {
    if (name && isIdentifierName(name)) ctx.scopeNames.add(name);
  }
  try {
    return run();
  } finally {
    ctx.scopeNames = previous;
  }
};

/** 把 JS 表达式安全包成 getter `(ctx) => ((with(ctx.state){return (expr)}))` */
const wrapGetter = (expr: string, ctx: CodegenContext): string => {
  if (!expr.trim()) return "() => undefined";
  const expression = createCodegenExpression(expr, ctx);
  const transformedExpr = expression.code;
  use(ctx, "handleRuntimeError");
  if (ctx.expressionMode === "scope") {
    return `((ctx: any) => { try { ${scopedStateAccess(ctx, "ctx.state", "ctx.props", expression.referencedRoots)}return (${transformedExpr}); } catch (__e) { handleRuntimeError(__e, ctx.host, "template getter"); return undefined; } })`;
  }
  use(ctx, "unwrapStateAccess");
  return (
    `((ctx) => { try { with (unwrapStateAccess(ctx.state)) { return (${transformedExpr}); } } ` +
    `catch (__e) { handleRuntimeError(__e, ctx.host, "template getter"); return undefined; } })`
  );
};

const wrapEvent = (expr: string, ctx: CodegenContext): string => {
  if (!expr.trim()) return "() => undefined";
  const expression = createCodegenExpression(expr, ctx);
  const transformedExpr = expression.code;
  use(ctx, "handleRuntimeError");
  if (ctx.expressionMode === "scope") {
    if (expression.simpleReference) {
      return (
        `((ctx: any, $event: Event) => { try { ${scopedStateAccess(ctx, "ctx.state", "ctx.props", expression.referencedRoots)}` +
        `const __h = (${transformedExpr}); if (typeof __h === "function") { return __h($event); } ` +
        `} catch (__e) { handleRuntimeError(__e, ctx.host, "template event"); } })`
      );
    }
    return `((ctx: any, $event: Event) => { try { ${scopedStateAccess(ctx, "ctx.state", "ctx.props", expression.referencedRoots)}${transformedExpr}; } catch (__e) { handleRuntimeError(__e, ctx.host, "template event"); } })`;
  }
  use(ctx, "unwrapStateAccess");
  if (expression.simpleReference) {
    return (
      `((ctx, $event) => { try { with (unwrapStateAccess(ctx.state)) { ` +
      `const __h = (${transformedExpr}); if (typeof __h === "function") { return __h($event); } ` +
      `} } catch (__e) { handleRuntimeError(__e, ctx.host, "template event"); } })`
    );
  }
  return `((ctx, $event) => { try { with (unwrapStateAccess(ctx.state)) { ${transformedExpr}; } } catch (__e) { handleRuntimeError(__e, ctx.host, "template event"); } })`;
};

const wrapSetter = (expr: string, ctx: CodegenContext): string => {
  const cleanedExpr = expr.trim();
  const expression = createCodegenExpression(cleanedExpr, ctx);
  use(ctx, "handleRuntimeError");
  if (expression.statePath) {
    const { root, property: sub } = expression.statePath;
    const ctxParam = renderAnyParam(ctx, "__ctx");
    const valueParam = renderAnyParam(ctx, "__v");
    const setRoot =
      `const __target = __ctx.state[${escapeStr(root)}]; ` +
      `if (__target && typeof __target === "object" && typeof __target.set === "function") { __target.set(__v); } ` +
      `else { __ctx.state[${escapeStr(root)}] = __v; }`;
    const setSub =
      `const __target = __ctx.state[${escapeStr(root)}]; ` +
      `if (__target && typeof __target === "object") { __target[${escapeStr(sub ?? "")}] = __v; } ` +
      `else { __ctx.state[${escapeStr(root)}] = { [${escapeStr(sub ?? "")}]: __v }; }`;
    return `(${ctxParam}, ${valueParam}) => { try { ${sub ? setSub : setRoot} } catch (__e) { handleRuntimeError(__e, __ctx.host, "template setter"); } }`;
  }

  const ctxParam = renderAnyParam(ctx, "__ctx");
  const valueParam = renderAnyParam(ctx, "__v");
  if (ctx.expressionMode === "scope") {
    return `(${ctxParam}, ${valueParam}) => { try { ${scopedStateAccess(ctx, "__ctx.state", "__ctx.props", expression.referencedRoots)}${cleanedExpr} = __v; } catch (__e) { handleRuntimeError(__e, __ctx.host, "template setter"); } }`;
  }
  return `(${ctxParam}, ${valueParam}) => { try { with (__ctx.state) { ${cleanedExpr} = __v; } } catch (__e) { handleRuntimeError(__e, __ctx.host, "template setter"); } }`;
};

const castElement = (ctx: CodegenContext, expr: string, type: string): string =>
  ctx.expressionMode === "scope" ? `(${expr} as ${type})` : expr;

const modelValueCoercion = (mods: readonly string[], valueExpr: string): string => {
  const lines: string[] = [];
  if (mods.includes("number")) {
    lines.push(
      `${valueExpr} = Array.isArray(${valueExpr}) ? ${valueExpr}.map((__item) => Number(__item)) : Number(${valueExpr});`
    );
  }
  if (mods.includes("trim")) {
    lines.push(`if (typeof ${valueExpr} === "string") ${valueExpr} = ${valueExpr}.trim();`);
  }
  return lines.join(" ");
};

const escapeStr = (s: string): string => JSON.stringify(s);

const bindingDebug = (loc: SourceLoc, name?: string): string =>
  `{ ${name ? `name: ${escapeStr(name)}, ` : ""}source: { line: ${loc.start.line}, column: ${loc.start.column} } }`;

const SVG_NS = "http://www.w3.org/2000/svg";

const SVG_TAGS = new Set([
  "animate",
  "circle",
  "clippath",
  "defs",
  "ellipse",
  "feblend",
  "fecolormatrix",
  "fecomponenttransfer",
  "fecomposite",
  "feconvolvematrix",
  "fediffuselighting",
  "fedisplacementmap",
  "fedistantlight",
  "fedropshadow",
  "feflood",
  "fefunca",
  "fefuncb",
  "fefuncg",
  "fefuncr",
  "fegaussianblur",
  "feimage",
  "femerge",
  "femergenode",
  "femorphology",
  "feoffset",
  "fepointlight",
  "fespecularlighting",
  "fespotlight",
  "fetile",
  "feturbulence",
  "filter",
  "foreignobject",
  "g",
  "image",
  "line",
  "lineargradient",
  "marker",
  "mask",
  "metadata",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "radialgradient",
  "rect",
  "stop",
  "svg",
  "switch",
  "symbol",
  "text",
  "textpath",
  "tspan",
  "use",
  "view"
]);

const isSvgElementTag = (tag: string): boolean => SVG_TAGS.has(tag.toLowerCase());

const templateAttrToProp = (name: string): string =>
  name.includes("-") ? name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()) : name;

// ---------- 入口 ----------

/** 把模板字符串编译成 ESM 源码字符串 */
export const codegen = (template: string, options: CodegenOptions = {}): CodegenResult => {
  const ast = parse(template, options);
  const ctx: CodegenContext = {
    used: new Set(),
    uid: 0,
    buf: [],
    expressionMode: options.expressionMode ?? "with",
    scopeNames: new Set(options.scopeNames ?? []),
    includePropsInScope: options.includePropsInScope ?? false,
    ctxName: "ctx"
  };
  const fnName = options.functionName ?? "render";
  const runtimeImport = options.runtimeImport ?? "@elfui/core/internal";

  const childExpr = genChildren(ast.children, ctx);

  const helpers = Array.from(ctx.used).sort();
  const importLine =
    helpers.length === 0
      ? ""
      : `import { ${helpers.join(", ")} } from ${escapeStr(runtimeImport)};\n\n`;

  const code = `${importLine}export default function ${fnName}(${renderCtxParam(ctx)}) {\n  return ${childExpr};\n}\n`;

  return { code, helpers, ast };
};

// ---------- children ----------

const genChildren = (children: TemplateChildNode[], ctx: CodegenContext): string => {
  if (children.length === 1) {
    const only = children[0]!;
    return genNode(only, ctx);
  }
  return genFragment(children, ctx);
};

const genFragment = (children: TemplateChildNode[], ctx: CodegenContext): string => {
  const parts: string[] = [];
  let i = 0;
  while (i < children.length) {
    const child = children[i]!;
    if (child.type === NodeTypes.ELEMENT) {
      const el = child as ElementNode;
      if (hasIfDir(el)) {
        const { code, consumed } = genIfChain(children, i, ctx);
        parts.push(`__frag.appendChild(${code})`);
        i += consumed;
        continue;
      }
    }
    parts.push(`__frag.appendChild(${genNode(child, ctx)})`);
    i++;
  }
  return `(() => { const __frag = document.createDocumentFragment(); ${parts.join("; ")}; return __frag; })()`;
};

const genNode = (node: TemplateChildNode, ctx: CodegenContext): string => {
  switch (node.type) {
    case NodeTypes.TEXT:
      return `document.createTextNode(${escapeStr((node as TextNode).content)})`;
    case NodeTypes.INTERPOLATION: {
      use(ctx, "text");
      const t = fresh(ctx, "t");
      const interpolation = node as InterpolationNode;
      return `(() => { const ${t} = document.createTextNode(""); text(${t}, () => (${wrapGetter(interpolation.content, ctx)})(${currentCtx(ctx)}), ${bindingDebug(interpolation.contentLoc)}); return ${t}; })()`;
    }
    case NodeTypes.COMMENT:
      return `document.createComment(${escapeStr((node as { content: string }).content)})`;
    case NodeTypes.ELEMENT:
      return genElement(node as ElementNode, ctx);
    default:
      return `document.createTextNode("")`;
  }
};

// ---------- element ----------

const genElement = (node: ElementNode, ctx: CodegenContext): string => {
  const directives = node.props.filter((p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE);
  const vOnce = directives.find((d) => d.name === "once");
  const vMemo = directives.find((d) => d.name === "memo");
  const vIf = directives.find((d) => d.name === "if");
  const vFor = directives.find((d) => d.name === "for");

  if (vOnce) return genOnce(node, ctx);
  if (vMemo) return genMemo(node, vMemo, ctx);
  if (vFor) return genFor(node, vFor, ctx);
  if (vIf) {
    return genIfChainBlock([{ cond: vIf.exp, node }], ctx);
  }

  if (node.tag === "Teleport") return genTeleport(node, ctx);
  if (node.tag === "KeepAlive") return genKeepAlive(node, ctx);
  if (node.tag === "component") return genDynamic(node, ctx);
  if (node.tag === "Transition") return genTransition(node, ctx);
  if (node.tag === "TransitionGroup") return genTransitionGroup(node, ctx);
  if (node.tag === "Suspense") return genSuspense(node, ctx);

  return genPlain(node, ctx);
};

const genOnce = (node: ElementNode, ctx: CodegenContext): string => {
  use(ctx, "renderOnce");
  return `renderOnce(() => ${genElement(stripDirective(node, "once"), ctx)})`;
};

const genMemo = (node: ElementNode, dir: DirectiveNode, ctx: CodegenContext): string => {
  use(ctx, "branch");
  use(ctx, "mark");
  const clean = stripDirective(node, "memo");
  const deps = `(${wrapGetter(dir.exp, ctx)})(${currentCtx(ctx)})`;
  const render = `() => ${genElement(clean, ctx)}`;
  return `(() => { const __anchor = mark(); const __frag = document.createDocumentFragment(); __frag.appendChild(__anchor); let __prev; let __key = 0; const __render = ${render}; branch(__anchor, () => { const __next = ${deps}; if (__prev && __prev.length === __next.length && __prev.every((__v, __i) => __v === __next[__i])) return __key; __prev = __next; __key = __key === 0 ? 1 : 0; return __key; }, [__render, __render], true, ${bindingDebug(dir.expLoc ?? dir.loc, "v-memo")}); return __frag; })()`;
};

const stripDirective = (node: ElementNode, name: string): ElementNode => ({
  ...node,
  props: node.props.filter((prop) => !(prop.type === AttrTypes.DIRECTIVE && prop.name === name))
});

const genPlain = (node: ElementNode, ctx: CodegenContext): string => {
  if (node.tag === "template") return genTemplateFragment(node, ctx);

  const elVar = fresh(ctx, "el");
  const stmts: string[] = [];
  if (isSvgElementTag(node.tag)) {
    stmts.push(
      `const ${elVar} = document.createElementNS(${escapeStr(SVG_NS)}, ${escapeStr(node.tag)})`
    );
  } else {
    use(ctx, "resolveComponentTag");
    stmts.push(
      `const ${elVar} = document.createElement(resolveComponentTag(${escapeStr(node.tag)}, ${currentCtx(ctx)}.components))`
    );
  }

  for (const p of node.props) {
    if (p.type === AttrTypes.ATTRIBUTE) {
      stmts.push(genAttribute(elVar, p, ctx));
    } else {
      stmts.push(genDirective(elVar, p, ctx));
    }
  }

  // 子节点
  let i = 0;
  while (i < node.children.length) {
    const child = node.children[i]!;
    if (child.type === NodeTypes.ELEMENT && hasIfDir(child as ElementNode)) {
      const { code, consumed } = genIfChain(node.children, i, ctx);
      stmts.push(`${elVar}.appendChild(${code})`);
      i += consumed;
      continue;
    }
    stmts.push(`${elVar}.appendChild(${genNode(child, ctx)})`);
    i++;
  }

  stmts.push(`return ${elVar}`);
  return `(() => { ${stmts.join("; ")} })()`;
};

const genTemplateFragment = (node: ElementNode, ctx: CodegenContext): string => {
  const slotName = getSlotName(node);
  if (!slotName) return genFragment(node.children, ctx);

  const slotLit = escapeStr(slotName);
  const slotFn = fresh(ctx, "slot");
  const parts = node.children.map((child) => `${slotFn}(${genNode(child, ctx)})`).join("; ");

  return `(() => { const __frag = document.createDocumentFragment(); const ${slotFn} = (${renderAnyParam(ctx, "__node")}) => { if (__node instanceof DocumentFragment) { for (const __child of Array.from(__node.childNodes)) ${slotFn}(__child); return; } if (__node instanceof Element) { __node.setAttribute("slot", ${slotLit}); __frag.appendChild(__node); return; } if (__node.nodeType === 3) { if (!__node.textContent || !__node.textContent.trim()) return; const __span = document.createElement("span"); __span.setAttribute("slot", ${slotLit}); __span.appendChild(__node); __frag.appendChild(__span); return; } __frag.appendChild(__node); }; ${parts}; return __frag; })()`;
};

const genAttribute = (elVar: string, p: AttributeNode, ctx: CodegenContext): string => {
  if (p.name === "ref" && typeof p.value === "string") {
    use(ctx, "setTemplateRef");
    return `setTemplateRef(${currentCtx(ctx)}.host, ${escapeStr(p.value)}, ${elVar})`;
  }
  if (p.value === true) return `${elVar}.setAttribute(${escapeStr(p.name)}, "")`;
  return `${elVar}.setAttribute(${escapeStr(p.name)}, ${escapeStr(p.value)})`;
};

const genDirective = (elVar: string, d: DirectiveNode, ctx: CodegenContext): string => {
  switch (d.name) {
    case "bind": {
      const arg = d.arg;
      const getter = `() => (${wrapGetter(d.exp, ctx)})(${currentCtx(ctx)})`;
      if (!arg) {
        // v-bind="obj"
        use(ctx, "bindObject");
        return `bindObject(${elVar}, ${getter}, ${bindingDebug(d.expLoc ?? d.loc)})`;
      }
      if (arg === "class") {
        use(ctx, "cls");
        return `cls(${elVar}, ${getter}, ${bindingDebug(d.expLoc ?? d.loc)})`;
      } else if (arg === "style") {
        use(ctx, "sty");
        return `sty(${elVar}, ${getter}, ${bindingDebug(d.expLoc ?? d.loc)})`;
      } else if (d.modifiers.includes("prop")) {
        use(ctx, "prop");
        return `prop(${elVar}, ${escapeStr(arg)}, ${getter}, ${bindingDebug(d.expLoc ?? d.loc)})`;
      } else {
        use(ctx, "attr");
        return `attr(${elVar}, ${escapeStr(arg)}, ${getter}, ${bindingDebug(d.expLoc ?? d.loc)})`;
      }
    }
    case "on": {
      const event = d.arg;
      if (!event) {
        // v-on="obj"
        use(ctx, "onObject");
        const getter = `() => (${wrapGetter(d.exp, ctx)})(${currentCtx(ctx)})`;
        return `onObject(${elVar}, ${getter}, ${bindingDebug(d.expLoc ?? d.loc)})`;
      }
      use(ctx, "on");
      const handler = `(${wrapEvent(d.exp, ctx)})`;
      const wrapped = `((${renderAnyParam(ctx, "__h")}) => (${renderEventParam(ctx)}) => { ${genEventModifiers(d.modifiers)} __h(${currentCtx(ctx)}, e); })(${handler})`;
      const opts = pickOptionsLiteral(d.modifiers);
      return `on(${elVar}, ${escapeStr(event)}, ${wrapped}${opts ? ", " + opts : ""})`;
    }
    case "model":
      return genModelDirective(elVar, d, ctx);
    case "show": {
      use(ctx, "show");
      return `show(${elVar}, () => (${wrapGetter(d.exp, ctx)})(${currentCtx(ctx)}), ${bindingDebug(d.expLoc ?? d.loc, "v-show")})`;
    }
    case "text": {
      use(ctx, "text");
      const t = fresh(ctx, "t");
      return `(() => { ${elVar}.textContent = ""; const ${t} = document.createTextNode(""); ${elVar}.appendChild(${t}); text(${t}, () => (${wrapGetter(d.exp, ctx)})(${currentCtx(ctx)}), ${bindingDebug(d.expLoc ?? d.loc)}); })()`;
    }
    case "html": {
      use(ctx, "attr");
      return `attr(${elVar}, "data-elf-html-marker", () => { const __v = (${wrapGetter(d.exp, ctx)})(${currentCtx(ctx)}); ${elVar}.innerHTML = __v == null ? "" : String(__v); return null; }, ${bindingDebug(d.expLoc ?? d.loc)})`;
    }
    // v-if / v-else-if / v-else / v-for 在更高层处理，落到这里的是单独 v-if
    case "if":
    case "for":
    case "else":
    case "else-if":
    case "once":
    case "memo":
      return "";
    default: {
      // 自定义指令
      use(ctx, "applyCustomDirective");
      use(ctx, "resolveDirective");
      const modMap = `{ ${d.modifiers.map((m) => `${escapeStr(m)}: true`).join(", ")} }`;
      return `(() => { const __def = resolveDirective(${escapeStr(d.name)}, undefined, ${currentCtx(ctx)}.host); if (__def) { applyCustomDirective(${elVar}, __def, () => (${wrapGetter(d.exp, ctx)})(${currentCtx(ctx)}), ${d.arg ? escapeStr(d.arg) : "undefined"}, ${modMap}, ${currentCtx(ctx)}.host); } })()`;
    }
  }
};

const genModelDirective = (elVar: string, d: DirectiveNode, ctx: CodegenContext): string => {
  use(ctx, "prop");
  use(ctx, "on");
  const getter = `() => (${wrapGetter(d.exp, ctx)})(${currentCtx(ctx)})`;
  const setter = wrapSetter(d.exp, ctx);
  const inputTarget = castElement(ctx, "__e.target", "HTMLInputElement");
  const selectTarget = castElement(ctx, "__e.target", "HTMLSelectElement");
  const inputEl = castElement(ctx, elVar, "HTMLInputElement");
  const selectEl = castElement(ctx, elVar, "HTMLSelectElement");
  const propName = d.arg ? templateAttrToProp(d.arg) : "modelValue";
  const customEventName = `update:${propName}`;
  const lazyEvent = d.modifiers.includes("lazy") ? "change" : "input";
  const nativeCoercion = modelValueCoercion(d.modifiers, "__v");
  const customDetail =
    ctx.expressionMode === "scope"
      ? `const __ce = __e as CustomEvent; let __v: unknown = __ce.detail;`
      : `let __v = __e.detail;`;
  const selectOptions = castElement(ctx, "__target", "HTMLSelectElement");
  const syncMultipleSelect =
    `if (${selectEl}.multiple) { queueMicrotask(() => { const __values = __get(); ` +
    `if (Array.isArray(__values)) { for (const __option of Array.from(${selectEl}.options)) { __option.selected = __values.includes(__option.value); } } }); }`;
  const debug = bindingDebug(d.expLoc ?? d.loc, "v-model");

  return (
    `(() => { const __get = ${getter}; const __set = ${setter}; const __tag = ${elVar}.tagName.toLowerCase(); ` +
    `if (__tag === "input" && ${inputEl}.type === "checkbox") { prop(${elVar}, "checked", () => Boolean(__get()), ${debug}); on(${elVar}, "change", (${renderEventParam(ctx, "__e")}) => { const __target = ${inputTarget}; __set(${currentCtx(ctx)}, __target.checked); }); return; } ` +
    `if (__tag === "input" && ${inputEl}.type === "radio") { prop(${elVar}, "checked", () => __get() === ${inputEl}.value, ${debug}); on(${elVar}, "change", (${renderEventParam(ctx, "__e")}) => { const __target = ${inputTarget}; if (__target.checked) __set(${currentCtx(ctx)}, __target.value); }); return; } ` +
    `if (__tag.includes("-")) { prop(${elVar}, ${escapeStr(propName)}, () => __get(), ${debug}); on(${elVar}, ${escapeStr(customEventName)}, (${renderEventParam(ctx, "__e")}) => { ${customDetail} ${nativeCoercion} __set(${currentCtx(ctx)}, __v); }); return; } ` +
    `if (__tag === "select") { prop(${elVar}, "value", () => __get() ?? "", ${debug}); ${syncMultipleSelect} on(${elVar}, "change", (${renderEventParam(ctx, "__e")}) => { const __target = ${selectTarget}; let __v${ctx.expressionMode === "scope" ? ": unknown" : ""}; if (__target.multiple) { __v = Array.from(${selectOptions}.selectedOptions).map((__option) => __option.value); } else { __v = __target.value; } ${nativeCoercion} __set(${currentCtx(ctx)}, __v); }); return; } ` +
    `prop(${elVar}, "value", () => __get() ?? "", ${debug}); on(${elVar}, ${escapeStr(lazyEvent)}, (${renderEventParam(ctx, "__e")}) => { const __target = ${inputTarget}; let __v${ctx.expressionMode === "scope" ? ": unknown" : ""} = __target.value; ${nativeCoercion} __set(${currentCtx(ctx)}, __v); }); })()`
  );
};

const genEventModifiers = (mods: string[]): string => {
  const parts: string[] = [];
  if (mods.includes("self")) parts.push(`if (e.target !== e.currentTarget) return;`);
  if (mods.includes("stop")) parts.push(`e.stopPropagation();`);
  if (mods.includes("prevent")) parts.push(`e.preventDefault();`);
  // .once 用闭包变量，由外层包装
  if (mods.includes("once")) {
    return `if (e.__elf_once) return; e.__elf_once = true; ${parts.join(" ")}`;
  }
  return parts.join(" ");
};

const pickOptionsLiteral = (mods: string[]): string | null => {
  if (!mods.includes("capture") && !mods.includes("passive")) return null;
  return `{ capture: ${mods.includes("capture")}, passive: ${mods.includes("passive")} }`;
};

// ---------- v-if 链 ----------

const genIfChain = (
  siblings: TemplateChildNode[],
  start: number,
  ctx: CodegenContext
): { code: string; consumed: number } => {
  const branches: Array<{ cond: string | null; node: ElementNode }> = [];
  const firstEl = siblings[start] as ElementNode;
  branches.push({ cond: getIf(firstEl).exp, node: firstEl });

  let cursor = start + 1;
  while (cursor < siblings.length) {
    const sib = siblings[cursor]!;
    if (sib.type === NodeTypes.TEXT && !(sib as TextNode).content.trim()) {
      cursor++;
      continue;
    }
    if (sib.type !== NodeTypes.ELEMENT) break;
    const sibEl = sib as ElementNode;
    const elseIfDir = sibEl.props.find(
      (p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE && p.name === "else-if"
    );
    const elseDir = sibEl.props.find(
      (p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE && p.name === "else"
    );
    if (elseIfDir) {
      branches.push({ cond: elseIfDir.exp, node: sibEl });
      cursor++;
      continue;
    }
    if (elseDir) {
      branches.push({ cond: null, node: sibEl });
      cursor++;
      break;
    }
    break;
  }

  return { code: genIfChainBlock(branches, ctx), consumed: cursor - start };
};

const genIfChainBlock = (
  branches: Array<{ cond: string | null; node: ElementNode }>,
  ctx: CodegenContext
): string => {
  use(ctx, "branch");
  use(ctx, "mark");
  const renderers = branches.map((b) => `() => ${genPlain(stripIfDirs(b.node), ctx)}`).join(", ");
  const matcher = branches
    .map((b, idx) =>
      b.cond === null
        ? `return ${idx};` // v-else
        : `if (Boolean((${wrapGetter(b.cond, ctx)})(${currentCtx(ctx)}))) return ${idx};`
    )
    .join(" ");

  const firstIf = getIf(branches[0]!.node);
  return `(() => { const __anchor = mark("v-if"); const __frag = document.createDocumentFragment(); __frag.appendChild(__anchor); branch(__anchor, () => { ${matcher} return -1; }, [${renderers}], false, ${bindingDebug(firstIf.expLoc ?? firstIf.loc, "v-if")}); return __frag; })()`;
};

const stripIfDirs = (node: ElementNode): ElementNode => ({
  ...node,
  props: node.props.filter(
    (p) =>
      !(
        p.type === AttrTypes.DIRECTIVE &&
        (p.name === "if" || p.name === "else-if" || p.name === "else")
      )
  )
});

// ---------- v-for ----------

const genFor = (node: ElementNode, dir: DirectiveNode, ctx: CodegenContext): string => {
  use(ctx, "list");
  use(ctx, "mark");
  const m = dir.exp.match(/^\s*(?:\(([^)]+)\)|(\w+))\s+(?:in|of)\s+(.+)$/);
  if (!m) return `document.createComment("v-for parse error")`;
  const params = (m[1] ?? m[2] ?? "").split(",").map((s) => s.trim());
  const itemName = params[0] ?? "item";
  const indexName = params[1];
  const source = m[3] ?? "[]";

  const keyDir = node.props.find(
    (p): p is DirectiveNode =>
      p.type === AttrTypes.DIRECTIVE && p.name === "bind" && p.arg === "key"
  );
  const keyExpr = keyDir ? keyDir.exp : indexName ? indexName : "__index";

  // 渲染 child：去掉 v-for 后走 plain
  const cloned: ElementNode = {
    ...node,
    props: node.props.filter((p) => !(p.type === AttrTypes.DIRECTIVE && p.name === "for"))
  };

  // child 渲染时需要把 itemName / indexName 注入 ctx.state 副本
  const parentCtx = currentCtx(ctx);
  use(ctx, "handleRuntimeError");
  use(ctx, "extendRenderState");
  const stateSpread = indexName
    ? `extendRenderState(${parentCtx}.state, { ${itemName}: __item, ${indexName}: __index })`
    : `extendRenderState(${parentCtx}.state, { ${itemName}: __item })`;

  const keyState = fresh(ctx, "state");
  const keyGetter = withScopeNames(ctx, [itemName, indexName], () => {
    const transformedKeyExpr = transformTemplateExpression(keyExpr, ctx, keyState);
    if (ctx.expressionMode === "scope") {
      return `(${renderListParams(ctx)}) => { const ${keyState} = ${stateSpread}; try { ${scopedStateAccess(ctx, keyState, `${parentCtx}.props`)}return (${transformedKeyExpr}); } catch (__e) { handleRuntimeError(__e, ${parentCtx}.host, "template list key"); return __index; } }`;
    }
    use(ctx, "unwrapStateAccess");
    return `(${renderListParams(ctx)}) => { const ${keyState} = ${stateSpread}; try { with (unwrapStateAccess(${keyState})) { return (${transformedKeyExpr}); } } catch (__e) { handleRuntimeError(__e, ${parentCtx}.host, "template list key"); return __index; } }`;
  });
  const childCtx = fresh(ctx, "ctx");
  const renderChild = withScopeNames(ctx, [itemName, indexName], () =>
    withCtxName(ctx, childCtx, () => genPlain(cloned, ctx))
  );

  return `(() => { const __anchor = mark("v-for"); const __frag = document.createDocumentFragment(); __frag.appendChild(__anchor); list(__anchor, () => { const __v = (${wrapGetter(source, ctx)})(${parentCtx}); if (Array.isArray(__v)) return __v; if (__v && typeof __v === "object") return Object.values(__v); if (typeof __v === "number") return Array.from({length: __v}, (_, i) => i + 1); return []; }, ${keyGetter}, (${renderListParams(ctx)}) => { const ${childCtx} = { ...${parentCtx}, state: ${stateSpread} }; return ${renderChild}; }, ${bindingDebug(dir.expLoc ?? dir.loc, "v-for")}); return __frag; })()`;
};

// ---------- 内置组件 ----------

const genTeleport = (node: ElementNode, ctx: CodegenContext): string => {
  use(ctx, "teleport");
  const toAttr = node.props.find(
    (p): p is AttributeNode => p.type === AttrTypes.ATTRIBUTE && p.name === "to"
  );
  const toDir = node.props.find(
    (p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE && p.name === "bind" && p.arg === "to"
  );
  const disabledDir = node.props.find(
    (p): p is DirectiveNode =>
      p.type === AttrTypes.DIRECTIVE && p.name === "bind" && p.arg === "disabled"
  );
  const toFn =
    toAttr && typeof toAttr.value === "string"
      ? `() => ${escapeStr(toAttr.value)}`
      : toDir
        ? `() => (${wrapGetter(toDir.exp, ctx)})(${currentCtx(ctx)})`
        : `() => ""`;
  const disFn = disabledDir
    ? `() => Boolean((${wrapGetter(disabledDir.exp, ctx)})(${currentCtx(ctx)}))`
    : `() => false`;

  const childCode = node.children.length
    ? node.children.map((c) => `__frag.appendChild(${genNode(c, ctx)})`).join("; ")
    : "";

  return `teleport(${toFn}, ${disFn}, () => { const __frag = document.createDocumentFragment(); ${childCode}; return __frag; })`;
};

const genDynamicCtorGetter = (node: ElementNode, ctx: CodegenContext): string => {
  const isAttr = node.props.find(
    (p): p is AttributeNode => p.type === AttrTypes.ATTRIBUTE && p.name === "is"
  );
  const isDir = node.props.find(
    (p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE && p.name === "bind" && p.arg === "is"
  );
  return isAttr
    ? `() => ${escapeStr(isAttr.value === true ? "" : (isAttr.value as string))}`
    : isDir
      ? `() => (${wrapGetter(isDir.exp, ctx)})(${currentCtx(ctx)})`
      : `() => null`;
};

const genKeepAliveOptions = (node: ElementNode, ctx: CodegenContext): string => {
  const items: string[] = [];
  for (const p of node.props) {
    if (p.type === AttrTypes.ATTRIBUTE) {
      if (p.name === "include" && typeof p.value === "string") {
        items.push(`include: ${escapeStr(p.value)}`);
      } else if (p.name === "exclude" && typeof p.value === "string") {
        items.push(`exclude: ${escapeStr(p.value)}`);
      } else if (p.name === "max" && typeof p.value === "string") {
        items.push(`max: ${Number(p.value)}`);
      }
    } else if (p.type === AttrTypes.DIRECTIVE && p.name === "bind") {
      const val = `(${wrapGetter(p.exp, ctx)})(${currentCtx(ctx)})`;
      if (p.arg === "include") items.push(`include: ${val}`);
      else if (p.arg === "exclude") items.push(`exclude: ${val}`);
      else if (p.arg === "max") items.push(`max: Number(${val})`);
    }
  }
  return `{ ${items.join(", ")} }`;
};

const genKeepAlive = (node: ElementNode, ctx: CodegenContext): string => {
  const child = node.children.find(
    (c): c is ElementNode => c.type === NodeTypes.ELEMENT && c.tag === "component"
  );
  if (!child)
    return node.children[0]
      ? genNode(node.children[0], ctx)
      : `document.createComment("keep-alive empty")`;

  use(ctx, "keepAlive");
  use(ctx, "ensureCustomElement");
  const getCtor = genDynamicCtorGetter(child, ctx);
  const keyGetter = `() => { const __c = (${getCtor})(); if (!__c) return undefined; if (typeof __c === "string") return __c; return (__c.__elfDefinition && __c.__elfDefinition.tag) || __c.name || undefined; }`;
  const elVar = fresh(ctx, "ka");
  const childStmts: string[] = [
    `const __c = (${getCtor})()`,
    `const __tag = typeof __c === "string" ? __c : (__c && __c.__elfDefinition && __c.__elfDefinition.tag)`,
    `const ${elVar} = typeof __c === "function" && !__tag ? new __c() : document.createElement(typeof __c === "function" && __tag ? ensureCustomElement(__c) : (__tag || "span"))`
  ];
  for (const p of child.props) {
    if (p.type === AttrTypes.ATTRIBUTE && p.name !== "is") {
      childStmts.push(genAttribute(elVar, p, ctx));
    } else if (p.type === AttrTypes.DIRECTIVE && !(p.name === "bind" && p.arg === "is")) {
      childStmts.push(genDirective(elVar, p, ctx));
    }
  }
  for (const c of child.children) {
    childStmts.push(`${elVar}.appendChild(${genNode(c, ctx)})`);
  }
  childStmts.push(`return ${elVar}`);
  return `keepAlive(${keyGetter}, () => { ${childStmts.join("; ")} }, ${genKeepAliveOptions(node, ctx)})`;
};

const genDynamic = (node: ElementNode, ctx: CodegenContext): string => {
  use(ctx, "dynamicComponent");
  const getCtor = genDynamicCtorGetter(node, ctx);
  return `dynamicComponent(${getCtor})`;
};

const getSlotName = (node: ElementNode): string | undefined => {
  const slot = node.props.find(
    (p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE && p.name === "slot"
  );
  return slot?.arg;
};

const genFragmentRender = (
  children: TemplateChildNode[],
  ctx: CodegenContext,
  ctxName = currentCtx(ctx)
): string => {
  const body = withCtxName(ctx, ctxName, () =>
    children.map((c) => `__frag.appendChild(${genNode(c, ctx)})`).join("; ")
  );
  return `() => { const __frag = document.createDocumentFragment(); ${body}; return __frag; }`;
};

const genSuspense = (node: ElementNode, ctx: CodegenContext): string => {
  use(ctx, "mark");
  use(ctx, "suspense");
  const sourceDir = node.props.find(
    (p): p is DirectiveNode =>
      p.type === AttrTypes.DIRECTIVE && p.name === "bind" && p.arg === "source"
  );
  const sourceAttr = node.props.find(
    (p): p is AttributeNode => p.type === AttrTypes.ATTRIBUTE && p.name === "source"
  );
  const getSource = sourceDir
    ? `() => (${wrapGetter(sourceDir.exp, ctx)})(${currentCtx(ctx)})`
    : sourceAttr && typeof sourceAttr.value === "string"
      ? `() => (${wrapGetter(sourceAttr.value, ctx)})(${currentCtx(ctx)})`
      : `() => null`;

  const defaultChildren: TemplateChildNode[] = [];
  let fallbackChildren: TemplateChildNode[] | undefined;
  let errorChildren: TemplateChildNode[] | undefined;
  for (const child of node.children) {
    if (child.type === NodeTypes.ELEMENT && child.tag === "template") {
      const slotName = getSlotName(child);
      if (slotName === "fallback") {
        fallbackChildren = child.children;
        continue;
      }
      if (slotName === "error") {
        errorChildren = child.children;
        continue;
      }
      if (slotName === "default") {
        defaultChildren.push(...child.children);
        continue;
      }
    }
    defaultChildren.push(child);
  }

  const errorCtx = fresh(ctx, "ctx");
  const slots = [
    `default: ${genFragmentRender(defaultChildren, ctx)}`,
    fallbackChildren ? `fallback: ${genFragmentRender(fallbackChildren, ctx)}` : "",
    errorChildren
      ? `error: (${renderAnyParam(ctx, "__err")}) => { const ${errorCtx} = { ...${currentCtx(ctx)}, state: { ...${currentCtx(ctx)}.state, error: __err } }; return (${genFragmentRender(errorChildren, ctx, errorCtx)})(); }`
      : ""
  ]
    .filter(Boolean)
    .join(", ");
  return `(() => { const __anchor = mark("suspense"); queueMicrotask(() => suspense(__anchor, ${getSource}, { ${slots} })); return __anchor; })()`;
};

const wrapTransitionHookStatic = (expr: string, ctx: CodegenContext): string => {
  if (!expr.trim()) return "() => undefined";
  const expression = createCodegenExpression(expr, ctx);
  const transformedExpr = expression.code;
  use(ctx, "handleRuntimeError");
  if (ctx.expressionMode === "scope") {
    if (expression.simpleReference) {
      return (
        `((ctx: any, el: Element, done: () => void) => { try { ${scopedStateAccess(ctx, "ctx.state", "ctx.props", expression.referencedRoots)}` +
        `const __h = (${transformedExpr}); if (typeof __h === "function") { return __h(el, done); } ` +
        `} catch (__e) { handleRuntimeError(__e, ctx.host, "template transition hook"); } })`
      );
    }
    return `((ctx: any, el: Element, done: () => void) => { try { ${scopedStateAccess(ctx, "ctx.state", "ctx.props", expression.referencedRoots)}${transformedExpr}; } catch (__e) { handleRuntimeError(__e, ctx.host, "template transition hook"); } })`;
  }
  use(ctx, "unwrapStateAccess");
  if (expression.simpleReference) {
    return (
      `((ctx, el, done) => { try { with (unwrapStateAccess(ctx.state)) { ` +
      `const __h = (${transformedExpr}); if (typeof __h === "function") { return __h(el, done); } ` +
      `} } catch (__e) { handleRuntimeError(__e, ctx.host, "template transition hook"); } })`
    );
  }
  return `((ctx, $event, done) => { try { with (unwrapStateAccess(ctx.state)) { ${transformedExpr}; } } catch (__e) { handleRuntimeError(__e, ctx.host, "template transition hook"); } })`;
};

const genTransition = (node: ElementNode, ctx: CodegenContext): string => {
  use(ctx, "transition");
  use(ctx, "mark");

  const child = node.children.find((c) => c.type === NodeTypes.ELEMENT) as ElementNode | undefined;
  if (!child) return `document.createComment("transition empty")`;

  const optionsObj: string[] = [];
  for (const p of node.props) {
    if (p.type === AttrTypes.ATTRIBUTE) {
      if (p.name === "name") optionsObj.push(`name: ${escapeStr(p.value as string)}`);
      else if (p.name === "appear")
        optionsObj.push(`appear: ${p.value === true || p.value === "true" ? "true" : "false"}`);
      else if (p.name === "css") optionsObj.push(`css: ${p.value !== "false" ? "true" : "false"}`);
      else if (p.name === "duration") {
        const num = Number(p.value);
        optionsObj.push(`duration: ${isNaN(num) ? escapeStr(p.value as string) : num}`);
      }
    } else if (p.type === AttrTypes.DIRECTIVE && p.name === "bind") {
      const valExpr = `(${wrapGetter(p.exp, ctx)})(${currentCtx(ctx)})`;
      if (p.arg === "name") optionsObj.push(`name: ${valExpr}`);
      else if (p.arg === "appear") optionsObj.push(`appear: Boolean(${valExpr})`);
      else if (p.arg === "css") optionsObj.push(`css: Boolean(${valExpr})`);
      else if (p.arg === "duration") optionsObj.push(`duration: ${valExpr}`);
    }
  }

  const hooks = ["before-enter", "enter", "after-enter", "before-leave", "leave", "after-leave"];
  for (const h of hooks) {
    const camel =
      "on" +
      h
        .split("-")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join("");
    const dir = node.props.find(
      (p) => p.type === AttrTypes.DIRECTIVE && p.name === "on" && p.arg === h
    ) as DirectiveNode | undefined;
    if (dir) {
      const needsDone = h === "enter" || h === "leave";
      const hookParams =
        ctx.expressionMode === "scope"
          ? needsDone
            ? "(el: Element, done: () => void)"
            : "(el: Element)"
          : needsDone
            ? "(el, done)"
            : "(el)";
      const doneArg = needsDone ? "done" : "() => undefined";
      optionsObj.push(
        `${camel}: ${hookParams} => (${wrapTransitionHookStatic(dir.exp, ctx)})(${currentCtx(ctx)}, el, ${doneArg})`
      );
    }
  }

  const optionsStr = `{ ${optionsObj.join(", ")} }`;

  const vIf = child.props.find(
    (p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE && p.name === "if"
  );
  let getRenderStr: string;
  if (vIf) {
    const cleanChild = {
      ...child,
      props: child.props.filter((p) => !(p.type === AttrTypes.DIRECTIVE && p.name === "if"))
    };
    getRenderStr = `() => { if (Boolean((${wrapGetter(vIf.exp, ctx)})(${currentCtx(ctx)}))) { const el = ${genNode(cleanChild, ctx)}; return el instanceof Element ? el : null; } return null; }`;
  } else {
    getRenderStr = `() => { const el = ${genNode(child, ctx)}; return el instanceof Element ? el : null; }`;
  }

  return `(() => { const __anchor = mark("transition"); const __frag = document.createDocumentFragment(); __frag.appendChild(__anchor); transition(__anchor, ${getRenderStr}, ${optionsStr}); return __frag; })()`;
};

const genTransitionGroup = (node: ElementNode, ctx: CodegenContext): string => {
  use(ctx, "transitionGroup");

  const tagProp = node.props.find((p) => p.type === AttrTypes.ATTRIBUTE && p.name === "tag") as
    | AttributeNode
    | undefined;
  const tagDir = node.props.find(
    (p) => p.type === AttrTypes.DIRECTIVE && p.name === "bind" && p.arg === "tag"
  ) as DirectiveNode | undefined;
  const tagExpr =
    tagProp && typeof tagProp.value === "string"
      ? escapeStr(tagProp.value)
      : tagDir
        ? `String((${wrapGetter(tagDir.exp, ctx)})(${currentCtx(ctx)}))`
        : escapeStr("span");

  const optionsObj: string[] = [];
  for (const p of node.props) {
    if (p.type === AttrTypes.ATTRIBUTE) {
      if (p.name === "name") optionsObj.push(`name: ${escapeStr(p.value as string)}`);
      else if (p.name === "move-class")
        optionsObj.push(`moveClass: ${escapeStr(p.value as string)}`);
      else if (p.name === "css") optionsObj.push(`css: ${p.value !== "false" ? "true" : "false"}`);
    } else if (p.type === AttrTypes.DIRECTIVE && p.name === "bind") {
      const valExpr = `(${wrapGetter(p.exp, ctx)})(${currentCtx(ctx)})`;
      if (p.arg === "name") optionsObj.push(`name: ${valExpr}`);
      else if (p.arg === "move-class") optionsObj.push(`moveClass: ${valExpr}`);
      else if (p.arg === "css") optionsObj.push(`css: Boolean(${valExpr})`);
    }
  }
  const optionsStr = `{ ${optionsObj.join(", ")} }`;

  const child = node.children.find(
    (c): c is ElementNode =>
      c.type === NodeTypes.ELEMENT &&
      c.props.some((p) => p.type === AttrTypes.DIRECTIVE && p.name === "for")
  );

  const elVar = fresh(ctx, "host");
  const stmts: string[] = [`const ${elVar} = document.createElement(${tagExpr})`];

  for (const p of node.props) {
    const isTransitionProp =
      (p.type === AttrTypes.ATTRIBUTE && ["tag", "name", "move-class", "css"].includes(p.name)) ||
      (p.type === AttrTypes.DIRECTIVE &&
        p.name === "bind" &&
        ["tag", "name", "move-class", "css"].includes(p.arg || ""));
    if (!isTransitionProp) {
      if (p.type === AttrTypes.ATTRIBUTE) {
        stmts.push(genAttribute(elVar, p, ctx));
      } else {
        stmts.push(genDirective(elVar, p, ctx));
      }
    }
  }

  if (child) {
    const vFor = child.props.find(
      (p) => p.type === AttrTypes.DIRECTIVE && p.name === "for"
    ) as DirectiveNode;
    const m = vFor.exp.match(/^\s*(?:\(([^)]+)\)|(\w+))\s+(?:in|of)\s+(.+)$/);
    if (!m) {
      stmts.push(`return ${elVar}`);
      return `(() => { ${stmts.join("; ")} })()`;
    }
    const params = (m[1] ?? m[2] ?? "").split(",").map((s) => s.trim());
    const itemName = params[0] ?? "item";
    const indexName = params[1];
    const source = m[3] ?? "[]";

    const keyDir = child.props.find(
      (p): p is DirectiveNode =>
        p.type === AttrTypes.DIRECTIVE && p.name === "bind" && p.arg === "key"
    );
    const keyExpr = keyDir ? keyDir.exp : "__index";

    const parentCtx = currentCtx(ctx);
    use(ctx, "handleRuntimeError");
    use(ctx, "extendRenderState");
    const getItemsStr = `() => { const __v = (${wrapGetter(source, ctx)})(${parentCtx}); if (Array.isArray(__v)) return __v; if (__v && typeof __v === "object") return Object.values(__v); if (typeof __v === "number") return Array.from({length: __v}, (_, i) => i + 1); return []; }`;

    const cleanChild = {
      ...child,
      props: child.props.filter((p) => !(p.type === AttrTypes.DIRECTIVE && p.name === "for"))
    };

    const stateSpread = indexName
      ? `extendRenderState(${parentCtx}.state, { ${itemName}: __item, ${indexName}: __index })`
      : `extendRenderState(${parentCtx}.state, { ${itemName}: __item })`;

    const childCtx = fresh(ctx, "ctx");
    const renderChild = withScopeNames(ctx, [itemName, indexName], () =>
      withCtxName(ctx, childCtx, () => genPlain(cleanChild, ctx))
    );
    const renderItemStr = `(${renderListParams(ctx)}) => { const ${childCtx} = { ...${parentCtx}, state: ${stateSpread} }; const el = ${renderChild}; if (!(el instanceof HTMLElement)) throw new Error("TransitionGroup child must be HTMLElement"); return el; }`;

    const keyGetterStr =
      ctx.expressionMode === "scope"
        ? withScopeNames(ctx, [itemName, indexName], () => {
            const transformedKeyExpr = transformTemplateExpression(
              keyExpr,
              ctx,
              `${childCtx}.state`
            );
            return `(${renderListParams(ctx)}) => { const ${childCtx} = { ...${parentCtx}, state: ${stateSpread} }; try { ${scopedStateAccess(ctx, `${childCtx}.state`, `${childCtx}.props`)}return (${transformedKeyExpr}); } catch (__e) { handleRuntimeError(__e, ${parentCtx}.host, "template transition-group key"); return __index; } }`;
          })
        : `(${renderListParams(ctx)}) => { const ${childCtx} = { ...${parentCtx}, state: ${stateSpread} }; try { return ${keyDir ? `(${wrapGetter(keyExpr, ctx)})(${childCtx})` : "__index"}; } catch (__e) { handleRuntimeError(__e, ${parentCtx}.host, "template transition-group key"); return __index; } }`;

    stmts.push(
      `transitionGroup(${elVar}, ${getItemsStr}, ${keyGetterStr}, ${renderItemStr}, ${optionsStr})`
    );
  } else {
    for (const c of node.children) {
      stmts.push(`${elVar}.appendChild(${genNode(c, ctx)})`);
    }
  }

  stmts.push(`return ${elVar}`);
  return `(() => { ${stmts.join("; ")} })()`;
};

// ---------- helpers ----------

const hasIfDir = (el: ElementNode): boolean =>
  el.props.some((p) => p.type === AttrTypes.DIRECTIVE && p.name === "if");

const getIf = (el: ElementNode): DirectiveNode =>
  el.props.find((p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE && p.name === "if")!;

// 模板 -> render 函数 编译器
//
// 思路：
// 1. parse 模板 -> AST
// 2. 递归遍历 AST，为每个节点生成创建 + 绑定的代码
// 3. 用闭包包装，返回 render 函数 (ctx) => Node
//
// 表达式求值：
// - 用 new Function("ctx", "$event", `with(ctx.state){return (${expr});}`)
//   构造表达式函数
// - 模板里的标识符自动从 ctx.state 解析
// - 表达式失败时返回 undefined（避免初次渲染 props 还没传时崩溃）

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
  type TemplateChildNode,
  type TextNode
} from "@elfui/compiler-template";
import {
  applyCustomDirective,
  attr,
  bindObject,
  branch,
  cls,
  dynamicComponent,
  ensureCustomElement,
  extendRenderState,
  keepAlive,
  list,
  mark,
  on,
  onObject,
  prop,
  renderOnce,
  resolveComponentTag,
  resolveDirective,
  setScopedSlot,
  setTemplateRef,
  show,
  suspense,
  sty,
  teleport,
  text,
  transition,
  transitionGroup,
  type DirectiveDefinition
} from "@elfui/runtime/internal";
import { DEV as __DEV__ } from "./dev";
import {
  bindingDebug,
  directiveMeta,
  expressionMeta,
  makeChildKeyGetter,
  makeEventHandler,
  makeGetter,
  makeSetter,
  reportRuntimeCompilerDiagnostic,
  reportRuntimeExpressionError,
  wrapCtx,
  type RuntimeExpressionMeta
} from "./runtime-expression";

export interface RenderCtx {
  state: Record<string, unknown>;
  props: Record<string, unknown>;
  emit: (event: string, ...args: unknown[]) => void;
  host: HTMLElement;
  shadow: ShadowRoot | null;
  /** 局部自定义指令（来自 definition.directives） */
  directives?: Record<string, unknown>;
  /** 局部子组件（来自 definition.components） */
  components?: Record<string, string | CustomElementConstructor>;
}

export type RenderFunction = (ctx: RenderCtx) => Node;

export interface CompileOptions extends ParserOptions {
  /** 模板根多个节点时是否包成 fragment（默认 true） */
  wrapFragment?: boolean;
}

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

const createDomElement = (tag: string): Element =>
  isSvgElementTag(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);

/** 入口：把模板字符串编译为 render 函数 */
export const compile = (template: string, options: CompileOptions = {}): RenderFunction => {
  const ast: RootNode = parse(template, options);
  return (ctx: RenderCtx) => createChildren(ast.children, ctx);
};

// ---------- L3.1 静态提升 ----------

/** 节点上挂的"是否完全静态"标记（lazy 在首次访问时分析）*/
type StaticMark = {
  __staticChecked?: boolean;
  __static?: boolean;
  __staticNode?: Node;
};

const isNodeStatic = (node: TemplateChildNode): boolean => {
  const m = node as unknown as StaticMark;
  if (m.__staticChecked) return m.__static === true;
  m.__staticChecked = true;
  if (node.type === NodeTypes.TEXT || node.type === NodeTypes.COMMENT) {
    m.__static = true;
    return true;
  }
  if (node.type === NodeTypes.INTERPOLATION) {
    m.__static = false;
    return false;
  }
  const el = node as ElementNode;
  // 内置组件 / 动态组件 / template 占位都不算静态
  if (
    el.tag === "Teleport" ||
    el.tag === "KeepAlive" ||
    el.tag === "Transition" ||
    el.tag === "TransitionGroup" ||
    el.tag === "Suspense" ||
    el.tag === "component" ||
    el.tag === "template" ||
    el.tag === "slot"
  ) {
    m.__static = false;
    return false;
  }
  if (isLocalComponentTag(el.tag)) {
    m.__static = false;
    return false;
  }
  for (const p of el.props) {
    if (p.type === AttrTypes.DIRECTIVE) {
      m.__static = false;
      return false;
    }
    if (p.type === AttrTypes.ATTRIBUTE && p.name === "ref") {
      m.__static = false;
      return false;
    }
  }
  for (const c of el.children) {
    if (!isNodeStatic(c)) {
      m.__static = false;
      return false;
    }
  }
  m.__static = true;
  return true;
};

/** 构建静态 DOM 节点；首次构建后缓存，cloneNode 复用 */
const buildStatic = (n: TemplateChildNode): Node => {
  const m = n as unknown as StaticMark;
  if (m.__staticNode) return m.__staticNode.cloneNode(true);
  let dom: Node;
  if (n.type === NodeTypes.TEXT) {
    dom = document.createTextNode(n.content);
  } else if (n.type === NodeTypes.COMMENT) {
    dom = document.createComment(n.content);
  } else {
    const el = n as ElementNode;
    const e = createDomElement(el.tag);
    for (const p of el.props) {
      if (p.type === AttrTypes.ATTRIBUTE) {
        e.setAttribute(p.name, p.value === true ? "" : p.value);
      }
    }
    for (const c of el.children) e.appendChild(buildStatic(c));
    dom = e;
  }
  m.__staticNode = dom;
  return dom.cloneNode(true);
};

// ---------- children ----------

const createChildren = (children: TemplateChildNode[], ctx: RenderCtx): Node => {
  if (children.length === 1) {
    return createNode(children[0]!, ctx);
  }
  // 多根节点：包 DocumentFragment + 处理 v-if/v-else-if/v-else 链
  const frag = document.createDocumentFragment();
  appendChildrenWithIfChain(frag, children, ctx);
  return frag;
};

/** 处理 v-if / v-else-if / v-else 在一组兄弟中的链式合并 */
const appendChildrenWithIfChain = (
  parent: Node,
  children: TemplateChildNode[],
  ctx: RenderCtx
): void => {
  let i = 0;
  while (i < children.length) {
    const child = children[i]!;
    if (child.type === NodeTypes.ELEMENT) {
      const el = child as ElementNode;
      const ifDir = el.props.find(
        (p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE && p.name === "if"
      );
      if (ifDir) {
        const { node, consumed } = consumeIfChain(children, i, ctx);
        parent.appendChild(node);
        i += consumed;
        continue;
      }
    }
    parent.appendChild(createNode(child, ctx));
    i++;
  }
};

/** 从位置 start 开始，吃掉一段 v-if / v-else-if* / v-else? 链 */
const consumeIfChain = (
  siblings: TemplateChildNode[],
  start: number,
  ctx: RenderCtx
): { node: Node; consumed: number } => {
  const branches: Array<{ cond: ((c: RenderCtx) => unknown) | null; node: ElementNode }> = [];
  const firstEl = siblings[start] as ElementNode;
  const firstIf = firstEl.props.find(
    (p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE && p.name === "if"
  )!;
  branches.push({ cond: makeGetter(firstIf.exp, directiveMeta("v-if", firstIf)), node: firstEl });

  let cursor = start + 1;
  while (cursor < siblings.length) {
    const sib = siblings[cursor]!;
    // 跳过空白文本节点（保持 v-else 链条紧凑）
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
      branches.push({
        cond: makeGetter(elseIfDir.exp, directiveMeta("v-else-if", elseIfDir)),
        node: sibEl
      });
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

  return { node: createIfChainBlock(branches, ctx), consumed: cursor - start };
};

const createNode = (node: TemplateChildNode, ctx: RenderCtx): Node => {
  switch (node.type) {
    case NodeTypes.TEXT:
      return createText(node);
    case NodeTypes.INTERPOLATION:
      return createInterpolation(node, ctx);
    case NodeTypes.ELEMENT:
      return createElement(node, ctx);
    case NodeTypes.COMMENT:
      return document.createComment((node as { content: string }).content);
    default:
      return document.createTextNode("");
  }
};

const createText = (node: TextNode): Text => document.createTextNode(node.content);

const createInterpolation = (node: InterpolationNode, ctx: RenderCtx): Text => {
  const t = document.createTextNode("");
  const getter = makeGetter(node.content, expressionMeta("interpolation", node.contentLoc));
  text(t, () => getter(ctx), bindingDebug(node.contentLoc));
  return t;
};

// ---------- element ----------

const createElement = (node: ElementNode, ctx: RenderCtx): Node => {
  // v-if / v-show / v-for 控制流：先处理这些
  // 注意：v-if 链（v-if/v-else-if/v-else）在父级 children 遍历时已经成组消费，
  // 这里只兜底处理"单独一个 v-if 的元素"的情况（例如根节点）。
  const directives = node.props.filter((p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE);
  const vOnce = directives.find((d) => d.name === "once");
  const vMemo = directives.find((d) => d.name === "memo");
  const vIf = directives.find((d) => d.name === "if");
  const vFor = directives.find((d) => d.name === "for");

  if (vOnce) {
    return renderOnce(() => createElement(stripDirective(node, "once"), ctx));
  }

  if (vMemo) {
    return createMemoBlock(node, vMemo, ctx);
  }

  // v-for 优先级最高（与 Vue 一致：v-for 与 v-if 一起时，先 for 后 if）
  if (vFor) {
    return createForBlock(node, vFor, ctx);
  }

  if (vIf) {
    return createIfChainBlock(
      [{ cond: makeGetter(vIf.exp, directiveMeta("v-if", vIf)), node }],
      ctx
    );
  }

  // 内置组件
  if (node.tag === "Teleport") {
    return createTeleport(node, ctx);
  }
  if (node.tag === "KeepAlive") {
    return createKeepAlive(node, ctx);
  }
  if (node.tag === "component") {
    return createDynamicComponent(node, ctx);
  }
  if (node.tag === "Transition") {
    return createTransition(node, ctx);
  }
  if (node.tag === "TransitionGroup") {
    return createTransitionGroup(node, ctx);
  }
  if (node.tag === "Suspense") {
    return createSuspense(node, ctx);
  }

  // <template #name>...</template> / <template v-slot:name>...</template>
  // 编译为 DocumentFragment + 给每个直接子元素加 slot=name 属性
  if (node.tag === "template") {
    return createTemplateSlotWrapper(node, ctx);
  }

  return createPlainElement(node, ctx);
};

const createMemoBlock = (node: ElementNode, dir: DirectiveNode, ctx: RenderCtx): Node => {
  const anchor = mark();
  const frag = document.createDocumentFragment();
  frag.appendChild(anchor);
  const deps = makeGetter(dir.exp);
  const memoNode = stripDirective(node, "memo");
  let previousDeps: unknown[] | undefined;
  let key = 0;
  const render = () => createElement(memoNode, ctx);
  branch(
    anchor,
    () => {
      const nextDeps = deps(ctx) as unknown[];
      if (
        previousDeps &&
        previousDeps.length === nextDeps.length &&
        previousDeps.every((value, index) => value === nextDeps[index])
      ) {
        return key;
      }
      previousDeps = nextDeps;
      key = key === 0 ? 1 : 0;
      return key;
    },
    [render, render],
    true,
    bindingDebug(dir.expLoc ?? dir.loc, "v-memo")
  );
  return frag;
};

const stripDirective = (node: ElementNode, name: string): ElementNode => ({
  ...node,
  props: node.props.filter((prop) => !(prop.type === AttrTypes.DIRECTIVE && prop.name === name))
});

const createTemplateSlotWrapper = (node: ElementNode, ctx: RenderCtx): Node => {
  // 找 #name 简写或 v-slot:name 指令
  const slotDir = node.props.find(
    (p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE && p.name === "slot"
  );
  const slotName = slotDir?.arg;

  // 没有 slot 名：把 template 当成纯 fragment（透明包装）
  const frag = document.createDocumentFragment();
  for (const child of node.children) {
    const childNode = createNode(child, ctx);
    if (slotName && childNode.nodeType === 3 /* Text */ && !childNode.textContent?.trim()) {
      continue;
    }
    if (slotName && childNode instanceof Element) {
      childNode.setAttribute("slot", slotName);
    } else if (slotName && childNode.nodeType === 3 /* Text */) {
      // 文本节点不能直接加 slot 属性，包一层 span
      const span = document.createElement("span");
      span.setAttribute("slot", slotName);
      span.appendChild(childNode);
      frag.appendChild(span);
      continue;
    }
    frag.appendChild(childNode);
  }
  return frag;
};

// ---------- 内置组件 ----------

const createTeleport = (node: ElementNode, ctx: RenderCtx): Node => {
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

  const toFn: () => string | Element =
    toAttr && typeof toAttr.value === "string"
      ? () => toAttr.value as string
      : toDir
        ? () => makeGetter(toDir.exp, directiveMeta("Teleport to", toDir))(ctx) as string | Element
        : () => "";
  const disabledFn: () => boolean = disabledDir
    ? () =>
        Boolean(makeGetter(disabledDir.exp, directiveMeta("Teleport disabled", disabledDir))(ctx))
    : () => false;

  return teleport(toFn, disabledFn, () => {
    const frag = document.createDocumentFragment();
    for (const child of node.children) {
      frag.appendChild(createNode(child, ctx));
    }
    return frag;
  });
};

const createKeepAlive = (node: ElementNode, ctx: RenderCtx): Node => {
  // 简化实现：直接渲染第一个子节点（生产场景通常是 <component :is>）
  // KeepAlive 完整缓存语义需要内部子组件感知，留待 D4 完整实现
  const first = node.children[0];
  if (!first) {
    return document.createComment("keep-alive empty");
  }
  if (first.type === NodeTypes.ELEMENT && first.tag === "component") {
    const getCtor = makeDynamicComponentGetter(first, ctx);
    return keepAlive(
      () => resolveDynamicComponentKey(getCtor()),
      () => createDynamicComponentElement(first, ctx, getCtor),
      createKeepAliveOptions(node, ctx)
    );
  }
  return createNode(first, ctx);
};

const makeDynamicComponentGetter = (
  node: ElementNode,
  ctx: RenderCtx
): (() => CustomElementConstructor | string | null) => {
  const isAttr = node.props.find(
    (p): p is AttributeNode => p.type === AttrTypes.ATTRIBUTE && p.name === "is"
  );
  const isDir = node.props.find(
    (p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE && p.name === "bind" && p.arg === "is"
  );
  return isAttr
    ? () => (isAttr.value === true ? null : (isAttr.value as string))
    : isDir
      ? () =>
          makeGetter(isDir.exp, directiveMeta("dynamic component is", isDir))(ctx) as
            | CustomElementConstructor
            | string
            | null
      : () => null;
};

const resolveDynamicComponentKey = (
  c: CustomElementConstructor | string | null | undefined
): string | undefined => {
  if (!c) return undefined;
  if (typeof c === "string") return c;
  const tag = (c as unknown as { __elfDefinition?: { tag?: string } }).__elfDefinition?.tag;
  return tag || c.name || undefined;
};

const createDynamicComponentElement = (
  node: ElementNode,
  ctx: RenderCtx,
  getCtor: () => CustomElementConstructor | string | null
): HTMLElement => {
  const c = getCtor();
  const tag =
    typeof c === "string"
      ? c
      : ((c as unknown as { __elfDefinition?: { tag?: string } } | null)?.__elfDefinition?.tag ??
        undefined);
  const el =
    typeof c === "function" && !tag
      ? (new (c as new () => HTMLElement)() as HTMLElement)
      : document.createElement(
          typeof c === "function" && tag ? ensureCustomElement(c) : tag || "span"
        );

  for (const p of node.props) {
    if (p.type === AttrTypes.ATTRIBUTE && p.name !== "is") {
      applyAttribute(el, p, ctx);
    } else if (p.type === AttrTypes.DIRECTIVE && !(p.name === "bind" && p.arg === "is")) {
      applyDirective(el, p, ctx);
    }
  }
  for (const child of node.children) {
    el.appendChild(createNode(child, ctx));
  }
  return el;
};

const createKeepAliveOptions = (node: ElementNode, ctx: RenderCtx) => {
  const options: {
    include?: string | RegExp | (string | RegExp)[];
    exclude?: string | RegExp | (string | RegExp)[];
    max?: number;
  } = {};
  for (const p of node.props) {
    if (p.type === AttrTypes.ATTRIBUTE) {
      if (p.name === "include" && typeof p.value === "string") options.include = p.value;
      else if (p.name === "exclude" && typeof p.value === "string") options.exclude = p.value;
      else if (p.name === "max" && typeof p.value === "string") options.max = Number(p.value);
    } else if (p.type === AttrTypes.DIRECTIVE && p.name === "bind") {
      if (p.arg === "include") {
        options.include = makeGetter(p.exp, directiveMeta("KeepAlive include", p))(ctx) as
          | string
          | RegExp
          | (string | RegExp)[];
      } else if (p.arg === "exclude") {
        options.exclude = makeGetter(p.exp, directiveMeta("KeepAlive exclude", p))(ctx) as
          | string
          | RegExp
          | (string | RegExp)[];
      } else if (p.arg === "max") {
        options.max = Number(makeGetter(p.exp, directiveMeta("KeepAlive max", p))(ctx));
      }
    }
  }
  return options;
};

const createDynamicComponent = (node: ElementNode, ctx: RenderCtx): Node => {
  const isAttr = node.props.find(
    (p): p is AttributeNode => p.type === AttrTypes.ATTRIBUTE && p.name === "is"
  );
  const isDir = node.props.find(
    (p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE && p.name === "bind" && p.arg === "is"
  );
  const getCtor: () => CustomElementConstructor | string | null = isAttr
    ? () => (isAttr.value === true ? null : (isAttr.value as string))
    : isDir
      ? () =>
          makeGetter(isDir.exp, directiveMeta("dynamic component is", isDir))(ctx) as
            | CustomElementConstructor
            | string
            | null
      : () => null;

  return dynamicComponent(getCtor, (el) => {
    for (const p of node.props) {
      if (p.type === AttrTypes.ATTRIBUTE && p.name !== "is") {
        applyAttribute(el, p, ctx);
      } else if (p.type === AttrTypes.DIRECTIVE && !(p.name === "bind" && p.arg === "is")) {
        applyDirective(el, p, ctx);
      }
    }
    for (const child of node.children) {
      el.appendChild(createNode(child, ctx));
    }
  });
};

const getSlotName = (node: ElementNode): string | undefined => {
  const slot = node.props.find(
    (p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE && p.name === "slot"
  );
  return slot?.arg;
};

const renderFragment = (children: TemplateChildNode[], ctx: RenderCtx): Node => {
  const frag = document.createDocumentFragment();
  for (const child of children) {
    frag.appendChild(createNode(child, ctx));
  }
  return frag;
};

const createSuspense = (node: ElementNode, ctx: RenderCtx): Node => {
  const anchor = mark("suspense");
  const sourceDir = node.props.find(
    (p): p is DirectiveNode =>
      p.type === AttrTypes.DIRECTIVE && p.name === "bind" && p.arg === "source"
  );
  const sourceAttr = node.props.find(
    (p): p is AttributeNode => p.type === AttrTypes.ATTRIBUTE && p.name === "source"
  );
  const getSource = sourceDir
    ? () =>
        makeGetter(sourceDir.exp, directiveMeta("Suspense source", sourceDir))(ctx) as
          | PromiseLike<unknown>
          | null
          | undefined
    : sourceAttr && typeof sourceAttr.value === "string"
      ? () =>
          makeGetter(
            String(sourceAttr.value),
            expressionMeta("Suspense source", sourceAttr.valueLoc ?? sourceAttr.loc)
          )(ctx) as PromiseLike<unknown> | null | undefined
      : () => null;

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

  queueMicrotask(() => {
    const slots = {
      default: () => renderFragment(defaultChildren, ctx)
    } as {
      default: () => Node;
      fallback?: () => Node;
      error?: (err: unknown) => Node;
    };
    if (fallbackChildren) {
      slots.fallback = () => renderFragment(fallbackChildren, ctx);
    }
    if (errorChildren) {
      slots.error = (err) =>
        renderFragment(errorChildren, {
          ...ctx,
          state: extendRenderState(ctx.state, { error: err })
        });
    }
    suspense(anchor, getSource, slots);
  });
  return anchor;
};

const makeTransitionHook = (
  expr: string,
  meta: RuntimeExpressionMeta = expressionMeta("transition hook", undefined)
): ((ctx: RenderCtx, el: Element, done?: () => void) => void) => {
  if (!expr.trim()) return () => undefined;
  try {
    if (/^[\w.$]+$/.test(expr.trim())) {
      const fn = new Function(
        "ctx",
        "el",
        "done",
        `with(ctx.state){const __h=(${expr});if(typeof __h==="function"){return __h(el, done);}}`
      );
      let reported = false;
      return (ctx, el, done) => {
        try {
          return fn(ctx, el, done);
        } catch (error) {
          reportRuntimeExpressionError(ctx, expr, error, meta, "transition", !reported);
          reported = true;
        }
      };
    }
    const fn = new Function("ctx", "$event", "done", `with(ctx.state){${expr};}`);
    let reported = false;
    return (ctx, el, done) => {
      try {
        return fn(wrapCtx(ctx), el, done);
      } catch (error) {
        reportRuntimeExpressionError(ctx, expr, error, meta, "transition", !reported);
        reported = true;
      }
    };
  } catch (error) {
    let reported = false;
    return (ctx) => {
      reportRuntimeExpressionError(ctx, expr, error, meta, "compile", !reported);
      reported = true;
    };
  }
};

const createTransition = (node: ElementNode, ctx: RenderCtx): Node => {
  const child = node.children.find((c) => c.type === NodeTypes.ELEMENT) as ElementNode | undefined;
  if (!child) return document.createComment("transition empty");

  const anchor = mark("transition") as Comment;
  const options: Record<string, any> = {};

  for (const p of node.props) {
    if (p.type === AttrTypes.ATTRIBUTE) {
      if (p.name === "name") options.name = p.value;
      else if (p.name === "appear") options.appear = p.value === true || p.value === "true";
      else if (p.name === "css") options.css = p.value !== "false";
      else if (p.name === "duration") {
        const num = Number(p.value);
        options.duration = isNaN(num) ? p.value : num;
      }
    } else if (p.type === AttrTypes.DIRECTIVE && p.name === "bind") {
      const val = makeGetter(p.exp, directiveMeta(`Transition ${p.arg ?? "option"}`, p))(ctx);
      if (p.arg === "name") options.name = val;
      else if (p.arg === "appear") options.appear = Boolean(val);
      else if (p.arg === "css") options.css = Boolean(val);
      else if (p.arg === "duration") options.duration = val;
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
      const hookFn = makeTransitionHook(dir.exp, directiveMeta(`Transition ${h}`, dir));
      options[camel] = (el: Element, done?: () => void) => hookFn(ctx, el, done);
    }
  }

  const vIf = child.props.find(
    (p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE && p.name === "if"
  );
  let getRender: () => Element | null;
  if (vIf) {
    const condFn = makeGetter(vIf.exp, directiveMeta("Transition child v-if", vIf));
    const cleanChild = {
      ...child,
      props: child.props.filter((p) => !(p.type === AttrTypes.DIRECTIVE && p.name === "if"))
    };
    getRender = () => {
      if (condFn(ctx)) {
        const el = createNode(cleanChild, ctx);
        return el instanceof Element ? el : null;
      }
      return null;
    };
  } else {
    getRender = () => {
      const el = createNode(child, ctx);
      return el instanceof Element ? el : null;
    };
  }

  const frag = document.createDocumentFragment();
  frag.appendChild(anchor);
  transition(anchor, getRender, options);
  return frag;
};

const createTransitionGroup = (node: ElementNode, ctx: RenderCtx): Node => {
  const tagProp = node.props.find((p) => p.type === AttrTypes.ATTRIBUTE && p.name === "tag") as
    | AttributeNode
    | undefined;
  const tagDir = node.props.find(
    (p) => p.type === AttrTypes.DIRECTIVE && p.name === "bind" && p.arg === "tag"
  ) as DirectiveNode | undefined;
  let tag = "span";
  if (tagProp && typeof tagProp.value === "string") {
    tag = tagProp.value;
  } else if (tagDir) {
    tag = String(makeGetter(tagDir.exp, directiveMeta("TransitionGroup tag", tagDir))(ctx));
  }
  const host = document.createElement(tag) as HTMLElement;

  const options: Record<string, any> = {};
  for (const p of node.props) {
    if (p.type === AttrTypes.ATTRIBUTE) {
      if (p.name === "name") options.name = p.value;
      else if (p.name === "move-class") options.moveClass = p.value;
      else if (p.name === "css") options.css = p.value !== "false";
    } else if (p.type === AttrTypes.DIRECTIVE && p.name === "bind") {
      const val = makeGetter(p.exp, directiveMeta(`TransitionGroup ${p.arg ?? "option"}`, p))(ctx);
      if (p.arg === "name") options.name = val;
      else if (p.arg === "move-class") options.moveClass = val;
      else if (p.arg === "css") options.css = Boolean(val);
    }
  }

  for (const p of node.props) {
    const isTransitionProp =
      (p.type === AttrTypes.ATTRIBUTE && ["tag", "name", "move-class", "css"].includes(p.name)) ||
      (p.type === AttrTypes.DIRECTIVE &&
        p.name === "bind" &&
        ["tag", "name", "move-class", "css"].includes(p.arg || ""));
    if (!isTransitionProp) {
      if (p.type === AttrTypes.ATTRIBUTE) {
        applyAttribute(host, p, ctx);
      } else {
        applyDirective(host, p, ctx);
      }
    }
  }

  const child = node.children.find(
    (c): c is ElementNode =>
      c.type === NodeTypes.ELEMENT &&
      c.props.some((p) => p.type === AttrTypes.DIRECTIVE && p.name === "for")
  );

  if (child) {
    const vFor = child.props.find(
      (p) => p.type === AttrTypes.DIRECTIVE && p.name === "for"
    ) as DirectiveNode;
    const m = vFor.exp.match(/^\s*(?:\(([^)]+)\)|(\w+))\s+(?:in|of)\s+(.+)$/);
    if (!m) {
      return host;
    }
    const params = (m[1] ?? m[2] ?? "").split(",").map((s) => s.trim());
    const itemName = params[0] ?? "item";
    const indexName = params[1];
    const sourceExpr = m[3] ?? "[]";
    const sourceGetter = makeGetter(
      sourceExpr,
      expressionMeta("TransitionGroup v-for source", vFor.expLoc ?? vFor.loc)
    );

    const keyDir = child.props.find(
      (p): p is DirectiveNode =>
        p.type === AttrTypes.DIRECTIVE && p.name === "bind" && p.arg === "key"
    );
    const keyGetter = keyDir
      ? makeChildKeyGetter(
          keyDir.exp,
          ctx,
          itemName,
          indexName,
          directiveMeta("TransitionGroup key", keyDir)
        )
      : (_item: unknown, index: number) => index;

    const getItems = () => {
      const v = sourceGetter(ctx);
      if (Array.isArray(v)) return v;
      if (v && typeof v === "object") return Object.values(v);
      if (typeof v === "number") return Array.from({ length: v }, (_, i) => i + 1);
      return [];
    };

    const renderItem = (item: any, index: number) => {
      const childCtx: RenderCtx = {
        ...ctx,
        state: extendRenderState(ctx.state, {
          [itemName]: item,
          ...(indexName ? { [indexName]: index } : {})
        })
      };
      const cloned: ElementNode = {
        ...child,
        props: child.props.filter((p) => !(p.type === AttrTypes.DIRECTIVE && p.name === "for"))
      };
      const rendered = createPlainElement(cloned, childCtx);
      if (!(rendered instanceof HTMLElement)) {
        throw new Error("TransitionGroup child must be HTMLElement");
      }
      return rendered;
    };

    transitionGroup(host, getItems, keyGetter as any, renderItem, options);
  } else {
    for (const c of node.children) {
      host.appendChild(createNode(c, ctx));
    }
  }

  return host;
};

const createPlainElement = (node: ElementNode, ctx: RenderCtx): Node => {
  // L3.1 静态提升：完全静态子树用 cloneNode(true) 复用一个预构建的 DOM
  // 静态分析 lazy 触发：只在 createPlainElement 真的被调用时才递归判定
  if (isNodeStatic(node)) {
    return buildStatic(node);
  }

  // <template> 标签：当作"透明分组容器"渲染为 DocumentFragment
  // - 不进 DOM 树（HTMLTemplateElement 的子节点会跑到 .content 里看不见）
  // - 没有 slot 指令时纯作 v-for / v-if 的分组占位用
  // 注意：含 slot 指令的 <template #name> 由 createTemplateSlotWrapper 提前接管
  // <template #name="scope"> 由 extractScopedSlot 在父级直接提取，不会走到这里
  if (node.tag === "template") {
    const frag = document.createDocumentFragment();
    appendChildrenWithIfChain(frag, node.children, ctx);
    return frag;
  }

  const el = isSvgElementTag(node.tag)
    ? createDomElement(node.tag)
    : document.createElement(resolveComponentTag(node.tag, ctx.components));

  // 处理属性 / 指令
  for (const p of node.props) {
    if (p.type === AttrTypes.ATTRIBUTE) {
      applyAttribute(el, p, ctx);
    } else {
      applyDirective(el, p, ctx);
    }
  }

  // 处理子节点（含 v-if 链合并）
  // - 普通子：直接 appendChild
  // - <template #name="scope">：挂为作用域 slot 函数到 el
  let i = 0;
  while (i < node.children.length) {
    const child = node.children[i]!;
    // <template #name="scope">：挂作用域 slot
    if (child.type === NodeTypes.ELEMENT && child.tag === "template") {
      const scopedSlot = extractScopedSlot(child, ctx);
      if (scopedSlot) {
        if (el instanceof HTMLElement) {
          setScopedSlot(el, scopedSlot.name, scopedSlot.fn);
        }
        i++;
        continue;
      }
    }
    // v-if 链
    if (child.type === NodeTypes.ELEMENT) {
      const ifDir = (child as ElementNode).props.find(
        (p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE && p.name === "if"
      );
      if (ifDir) {
        const { node: chainNode, consumed } = consumeIfChain(node.children, i, ctx);
        el.appendChild(chainNode);
        i += consumed;
        continue;
      }
    }
    el.appendChild(createNode(child, ctx));
    i++;
  }

  return el;
};

/** 从 <template #name="scope">...</template> 节点提取作用域 slot 函数。
 *  仅在 slot 指令含表达式（exp）且不为空时视为作用域 slot；
 *  否则返回 null（按普通具名 slot 处理）。 */
const extractScopedSlot = (
  node: ElementNode,
  ctx: RenderCtx
): { name: string; fn: (scope: unknown) => Node | null } | null => {
  const slotDir = node.props.find(
    (p): p is DirectiveNode => p.type === AttrTypes.DIRECTIVE && p.name === "slot"
  );
  if (!slotDir || !slotDir.arg) return null;
  if (!slotDir.exp || !slotDir.exp.trim()) return null;

  const name = slotDir.arg;
  const scopeExpr = slotDir.exp;

  // 编译 scope 解构表达式：如 "{ item, index }" -> Function(`{item, index}`, body)
  // 简化：构造一个 fn(__scope) { with(ctx.state) { return ... } }
  // 但 scope 解构需要变量注入，用 IIFE 包装

  const argsFn = new Function(
    "ctx",
    "__scope",
    "createNodes",
    `with(ctx.state){const ${scopeExpr} = __scope;return createNodes();}`
  );

  return {
    name,
    fn: (scope: unknown) => {
      const frag = document.createDocumentFragment();
      const locals = scope && typeof scope === "object" ? (scope as Record<string, unknown>) : {};
      const childCtx: RenderCtx = {
        ...ctx,
        state: extendRenderState(ctx.state, locals)
      };
      // 提供 createNodes 闭包，把 scope 注入到 ctx.state
      const createNodes = (): Node => {
        const f = document.createDocumentFragment();
        for (const child of node.children) {
          f.appendChild(createNode(child, childCtx));
        }
        return f;
      };
      try {
        const result = argsFn(childCtx, scope, createNodes);
        if (result instanceof Node) {
          frag.appendChild(result);
        }
      } catch (err) {
        if (__DEV__) {
          reportRuntimeCompilerDiagnostic(
            ctx,
            "error",
            "ELF_RUNTIME_SCOPED_SLOT_RENDER",
            `scoped slot "${name}" 渲染失败。`,
            directiveMeta("scoped slot", slotDir),
            "请检查 slot props 解构表达式和 slot 模板内部表达式。",
            err
          );
        } else {
          console.error(err);
        }
      }
      return frag;
    }
  };
};

const applyAttribute = (el: Element, p: AttributeNode, ctx: RenderCtx): void => {
  // ref="name"：编译期注册到 templateRefs
  if (p.name === "ref" && typeof p.value === "string") {
    setTemplateRef(ctx.host, p.value, el);
    return;
  }
  if (p.value === true) {
    el.setAttribute(p.name, "");
  } else {
    el.setAttribute(p.name, p.value);
  }
};

const applyDirective = (el: Element, d: DirectiveNode, ctx: RenderCtx): void => {
  const debug = bindingDebug(d.expLoc ?? d.loc);
  // 动态参数：v-bind:[key] / v-on:[event] / @[event] / :[key]
  // 把 d.argDynamic 当作表达式求值得到字符串作为 arg
  const dynArgGetter: (() => string) | null = d.argDynamic
    ? () => {
        const v = makeGetter(
          d.argDynamic!,
          expressionMeta("dynamic argument", d.argLoc ?? d.loc)
        )(ctx);
        return v == null ? "" : String(v);
      }
    : null;

  switch (d.name) {
    case "bind": {
      // :foo / v-bind:foo / :[key]
      const getter = makeGetter(d.exp, directiveMeta(d.arg ? `:${d.arg}` : "v-bind", d));
      if (dynArgGetter) {
        // 动态参数：每次 effect 内重新解析 key
        // 简化策略：维护 lastKey，key 变化时移除旧 attr/prop
        let lastKey: string | null = null;
        const prevSetter = (k: string, v: unknown): void => {
          if (k === "class") {
            // class 动态参数极少见，这里按常规属性处理
            if (v == null || v === false) el.removeAttribute("class");
            else el.setAttribute("class", String(v));
          } else if (k === "style") {
            if (v == null) el.removeAttribute("style");
            else if (typeof v === "string") el.setAttribute("style", v);
          } else if (d.modifiers.includes("prop")) {
            (el as unknown as Record<string, unknown>)[k] = v;
          } else if (v == null || v === false) {
            el.removeAttribute(k);
          } else if (v === true) {
            el.setAttribute(k, "");
          } else {
            el.setAttribute(k, String(v));
          }
        };
        // 借 attr 原语跑一次 effect（取它做 marker，返回 null 不改 marker）
        attr(
          el,
          "data-elf-dyn-bind-marker",
          () => {
            const k = dynArgGetter();
            if (lastKey && lastKey !== k) {
              // 清掉旧 key
              el.removeAttribute(lastKey);
            }
            lastKey = k;
            if (k) prevSetter(k, getter(ctx));
            return null;
          },
          debug
        );
        return;
      }

      const arg = d.arg;
      if (!arg) {
        // v-bind="obj" 形式：用 effect 跟踪 obj 的字段并展开
        bindObject(el, () => getter(ctx), debug);
        return;
      }
      if (arg === "class") {
        cls(
          el,
          () => getter(ctx) as Parameters<typeof cls>[1] extends () => infer R ? R : never,
          debug
        );
      } else if (arg === "style") {
        sty(
          el,
          () => getter(ctx) as Parameters<typeof sty>[1] extends () => infer R ? R : never,
          debug
        );
      } else if (d.modifiers.includes("prop")) {
        prop(el, arg, () => getter(ctx), debug);
      } else {
        attr(el, arg, () => getter(ctx), debug);
      }
      break;
    }
    case "on": {
      const handlerGetter = makeEventHandler(d.exp, directiveMeta(d.arg ? `@${d.arg}` : "v-on", d));
      const wrapped = wrapEventModifiers(handlerGetter, d.modifiers, ctx);
      const opts = pickListenerOptions(d.modifiers);
      if (dynArgGetter) {
        // 动态事件名：维护 lastEvent，名字变化时 remove + add
        let lastEvent: string | null = null;
        let disposeListener: (() => void) | null = null;
        attr(
          el,
          "data-elf-dyn-on-marker",
          () => {
            const ev = dynArgGetter();
            if (lastEvent === ev) return null;
            disposeListener?.();
            disposeListener = null;
            if (ev) {
              disposeListener = on(el, ev, wrapped, opts);
            }
            lastEvent = ev;
            return null;
          },
          debug
        );
        return;
      }
      const event = d.arg;
      if (!event) {
        // v-on="obj" 对象形态：把 { click: fn, input: fn } 全部挂上
        onObject(el, () => makeGetter(d.exp, directiveMeta("v-on object", d))(ctx), debug);
        return;
      }
      on(el, event, wrapped, opts);
      break;
    }
    case "show": {
      const getter = makeGetter(d.exp, directiveMeta("v-show", d));
      show(el as HTMLElement, () => getter(ctx), bindingDebug(d.expLoc ?? d.loc, "v-show"));
      break;
    }
    case "text": {
      const getter = makeGetter(d.exp, directiveMeta("v-text", d));
      text(document.createTextNode(""), () => getter(ctx), debug); // 占位
      // v-text：实际需要清空子节点并设置 textContent
      // 这里简化为直接设 textContent（用 useEffect 由 text 包装会更精确）
      const tn = document.createTextNode("");
      el.textContent = "";
      el.appendChild(tn);
      text(tn, () => getter(ctx), debug);
      break;
    }
    case "html": {
      const getter = makeGetter(d.exp, directiveMeta("v-html", d));
      // 类似 text 但用 innerHTML
      // 注意：用户责任避免 XSS
      // 用 useEffect 包装
      const fn = (): void => {
        const v = getter(ctx);
        el.innerHTML = v == null ? "" : String(v);
      };
      // 借用绑定原语注册 effect
      attr(
        el,
        "data-elf-html-marker",
        () => {
          fn();
          return null;
        },
        debug
      );
      break;
    }
    case "model": {
      applyVModel(el, d, ctx);
      break;
    }
    // v-if / v-for 已在 createElement 处理
    // v-else / v-else-if 在 v-if 块内单独处理
    case "if":
    case "for":
    case "else":
    case "else-if":
    case "once":
    case "memo":
      break;
    default: {
      // 未知指令：交给自定义指令系统（先查局部 ctx.directives，再查全局）
      const def = resolveDirective(
        d.name,
        ctx.directives as Record<string, DirectiveDefinition> | undefined,
        ctx.host
      );
      if (def) {
        const valueGetter = makeGetter(d.exp, directiveMeta(`v-${d.name}`, d));
        const modMap: Record<string, boolean> = {};
        for (const m of d.modifiers) modMap[m] = true;
        applyCustomDirective(el, def, () => valueGetter(ctx), d.arg, modMap, ctx.host);
      } else if (d.exp) {
        // 编译期没有解析到指令；运行时也没注册，给一个轻量提示
        // 不抛错，避免初次渲染就崩溃
        if (__DEV__) {
          reportRuntimeCompilerDiagnostic(
            ctx,
            "warning",
            "ELF_RUNTIME_UNKNOWN_DIRECTIVE",
            `未知指令 v-${d.name}；请通过 defineDirective() 或 app.directive() 注册。`,
            directiveMeta(`v-${d.name}`, d),
            `如果这是局部指令，请使用 const localDirective = defineDirective(...)；应用级指令使用 app.directive("${d.name}", ...)。`
          );
        }
      }
      break;
    }
  }
};

// ---------- v-if / v-else-if / v-else ----------

const createIfChainBlock = (
  branches: Array<{ cond: ((c: RenderCtx) => unknown) | null; node: ElementNode }>,
  ctx: RenderCtx
): Node => {
  const anchor = mark("v-if");
  const frag = document.createDocumentFragment();
  frag.appendChild(anchor);

  // 渲染各分支：去掉自身 v-if/v-else-if/v-else 指令再走普通 element 路径
  const renderers = branches.map(
    (b) => () =>
      createPlainElement(
        {
          ...b.node,
          props: b.node.props.filter(
            (p) =>
              !(
                p.type === AttrTypes.DIRECTIVE &&
                (p.name === "if" || p.name === "else-if" || p.name === "else")
              )
          )
        },
        ctx
      )
  );
  const firstIf = branches[0]?.node.props.find(
    (prop): prop is DirectiveNode => prop.type === AttrTypes.DIRECTIVE && prop.name === "if"
  );

  branch(
    anchor,
    () => {
      for (let idx = 0; idx < branches.length; idx++) {
        const b = branches[idx]!;
        if (b.cond === null) return idx; // v-else 始终命中
        if (toBoolean(b.cond(ctx))) return idx;
      }
      return -1;
    },
    renderers,
    false,
    bindingDebug(firstIf?.expLoc ?? firstIf?.loc, "v-if")
  );

  return frag;
};

// ---------- v-for ----------

const createForBlock = (node: ElementNode, dir: DirectiveNode, ctx: RenderCtx): Node => {
  // 解析 "item in items" / "(item, index) in items" / "item of items"
  const m = dir.exp.match(/^\s*(?:\(([^)]+)\)|(\w+))\s+(?:in|of)\s+(.+)$/);
  if (!m) {
    if (__DEV__) {
      reportRuntimeCompilerDiagnostic(
        ctx,
        "error",
        "ELF_RUNTIME_V_FOR_PARSE",
        `无法解析 v-for 表达式: "${dir.exp}"`,
        directiveMeta("v-for", dir),
        "请使用 `item in items` 或 `(item, index) in items`。"
      );
    }
    return document.createComment("v-for parse error");
  }
  const params = (m[1] ?? m[2] ?? "").split(",").map((s) => s.trim());
  const itemName = params[0] ?? "item";
  const indexName = params[1];
  const sourceExpr = m[3] ?? "[]";
  const sourceGetter = makeGetter(
    sourceExpr,
    expressionMeta("v-for source", dir.expLoc ?? dir.loc)
  );

  // 找 :key 指令
  const keyDir = node.props.find(
    (p): p is DirectiveNode =>
      p.type === AttrTypes.DIRECTIVE && p.name === "bind" && p.arg === "key"
  );
  const keyGetter = keyDir
    ? makeChildKeyGetter(keyDir.exp, ctx, itemName, indexName, directiveMeta("v-for key", keyDir))
    : (_item: unknown, index: number) => index;

  const anchor = mark("v-for");
  const frag = document.createDocumentFragment();
  frag.appendChild(anchor);

  list(
    anchor,
    () => {
      const v = sourceGetter(ctx);
      if (Array.isArray(v)) return v;
      if (v && typeof v === "object") return Object.values(v);
      if (typeof v === "number") return Array.from({ length: v }, (_, i) => i + 1);
      return [];
    },
    keyGetter as (item: unknown, index: number) => string | number,
    (item, index) => {
      // 创建一个克隆的 ctx，state 中加入 itemName / indexName
      const childCtx: RenderCtx = {
        ...ctx,
        state: extendRenderState(ctx.state, {
          [itemName]: item,
          ...(indexName ? { [indexName]: index } : {})
        })
      };
      // 复制一份 node，去掉 v-for 指令避免无限递归
      const cloned: ElementNode = {
        ...node,
        props: node.props.filter((p) => !(p.type === AttrTypes.DIRECTIVE && p.name === "for"))
      };
      return createPlainElement(cloned, childCtx);
    },
    bindingDebug(dir.expLoc ?? dir.loc, "v-for")
  );

  return frag;
};

// ---------- v-model ----------

const applyVModel = (el: Element, d: DirectiveNode, ctx: RenderCtx): void => {
  const getter = makeGetter(d.exp, directiveMeta("v-model", d));
  const setter = makeSetter(d.exp, directiveMeta("v-model", d));
  const debug = bindingDebug(d.expLoc ?? d.loc, "v-model");

  const tag = el.tagName.toLowerCase();
  const isCheckbox = tag === "input" && (el as HTMLInputElement).type === "checkbox";
  const isRadio = tag === "input" && (el as HTMLInputElement).type === "radio";
  const isSelect = tag === "select";
  // 含连字符的标签视为 Custom Element
  const isCustomElement = tag.includes("-");

  if (isCheckbox) {
    prop(el, "checked", () => Boolean(getter(ctx)), debug);
    on(el, "change", (e) => {
      setter(ctx, (e.target as HTMLInputElement).checked);
    });
    return;
  }

  if (isRadio) {
    prop(el, "checked", () => getter(ctx) === (el as HTMLInputElement).value, debug);
    on(el, "change", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.checked) setter(ctx, target.value);
    });
    return;
  }

  if (isCustomElement) {
    // 自定义元素 v-model：默认 modelValue + update:modelValue
    // 命名参数 v-model:foo 等价于 prop="foo" + event="update:foo"
    const propName = d.arg ? templateAttrToProp(d.arg) : "modelValue";
    const eventName = `update:${propName}`;
    prop(el, propName, () => getter(ctx), debug);
    on(el, eventName, (e) => {
      const ce = e as CustomEvent;
      let v: unknown = ce.detail;
      if (d.modifiers.includes("number")) v = Number(v);
      if (d.modifiers.includes("trim") && typeof v === "string") v = v.trim();
      setter(ctx, v);
    });
    return;
  }

  if (isSelect) {
    const select = el as HTMLSelectElement;
    // select 默认 / multiple
    prop(el, "value", () => getter(ctx) ?? "", debug);
    on(el, "change", (e) => {
      const target = e.target as HTMLSelectElement;
      let v: unknown;
      if (target.multiple) {
        // 多选：收集所有选中 option 的 value
        v = Array.from(target.selectedOptions).map((o) => o.value);
      } else {
        v = target.value;
      }
      if (d.modifiers.includes("number")) {
        v = Array.isArray(v) ? v.map((x) => Number(x)) : Number(v);
      }
      setter(ctx, v);
    });
    // 处理 multiple：当 value 是数组时同步 selectedOptions
    if (select.multiple) {
      // 需要在 options 渲染完之后再同步初值；用 microtask
      queueMicrotask(() => {
        const v = getter(ctx);
        if (Array.isArray(v)) {
          for (const o of Array.from(select.options)) {
            o.selected = v.includes(o.value);
          }
        }
      });
    }
    return;
  }

  // 默认：文本输入 / textarea
  prop(el, "value", () => getter(ctx) ?? "", debug);
  const eventName = d.modifiers.includes("lazy") ? "change" : "input";
  on(el, eventName, (e) => {
    const target = e.target as HTMLInputElement;
    let v: unknown = target.value;
    if (d.modifiers.includes("number")) v = Number(v);
    if (d.modifiers.includes("trim") && typeof v === "string") v = v.trim();
    setter(ctx, v);
  });
};

// ---------- helpers ----------

const wrapEventModifiers = (
  handler: (ctx: RenderCtx, ev: Event) => void,
  modifiers: string[],
  ctx: RenderCtx
): EventListener => {
  let invoked = false;
  return (e: Event) => {
    if (modifiers.includes("self") && e.target !== e.currentTarget) return;
    if (modifiers.includes("stop")) e.stopPropagation();
    if (modifiers.includes("prevent")) e.preventDefault();
    if (modifiers.includes("once")) {
      if (invoked) return;
      invoked = true;
    }
    handler(ctx, e);
  };
};

const pickListenerOptions = (
  modifiers: string[]
): boolean | AddEventListenerOptions | undefined => {
  if (!modifiers.includes("capture") && !modifiers.includes("passive")) return undefined;
  return {
    capture: modifiers.includes("capture"),
    passive: modifiers.includes("passive")
  };
};

const toBoolean = (v: unknown): boolean => Boolean(v);

const isLocalComponentTag = (tag: string): boolean => /^[A-Z]/.test(tag);

const templateAttrToProp = (name: string): string =>
  name.includes("-") ? name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()) : name;

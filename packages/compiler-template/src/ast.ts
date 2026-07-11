// 模板 AST 节点定义
//
// 比旧版实现多设计：
// - 用 const enum 节省运行时；类型导出独立
// - DirectiveNode 区分静态/动态参数（v-bind:key vs v-bind:[key]）
// - 不引入 VNode 概念（ElfUI 是编译时细粒度响应式）

export const NodeTypes = {
  ROOT: "ROOT",
  ELEMENT: "ELEMENT",
  TEXT: "TEXT",
  INTERPOLATION: "INTERPOLATION",
  COMMENT: "COMMENT"
} as const;

export type NodeType = (typeof NodeTypes)[keyof typeof NodeTypes];

export const AttrTypes = {
  ATTRIBUTE: "ATTRIBUTE",
  DIRECTIVE: "DIRECTIVE"
} as const;

export type AttrType = (typeof AttrTypes)[keyof typeof AttrTypes];

/** 模板源码位置（行/列从 1 开始；offset 从 0 开始） */
export interface SourcePos {
  offset: number;
  line: number;
  column: number;
}

export interface SourceLoc {
  start: SourcePos;
  end: SourcePos;
  /** 原始文本（便于错误信息定位） */
  source: string;
}

export type TemplateChildNode = ElementNode | TextNode | InterpolationNode | CommentNode;

export interface RootNode {
  type: typeof NodeTypes.ROOT;
  children: TemplateChildNode[];
  source: string;
  loc: SourceLoc;
}

export interface ElementNode {
  type: typeof NodeTypes.ELEMENT;
  /** 标签名（保持原大小写） */
  tag: string;
  /** 自闭合标签：`<br />` 或已知 void 元素 */
  isSelfClosing: boolean;
  /** 属性 / 指令 */
  props: PropNode[];
  /** 子节点（自闭合时为空数组） */
  children: TemplateChildNode[];
  loc: SourceLoc;
}

export interface TextNode {
  type: typeof NodeTypes.TEXT;
  content: string;
  loc: SourceLoc;
}

/** {{ expression }} */
export interface InterpolationNode {
  type: typeof NodeTypes.INTERPOLATION;
  /** 表达式原始文本（不含 {{}}） */
  content: string;
  /** 表达式范围（指 {{ 与 }} 之间的内容定位） */
  contentLoc: SourceLoc;
  loc: SourceLoc;
}

export interface CommentNode {
  type: typeof NodeTypes.COMMENT;
  content: string;
  loc: SourceLoc;
}

export type PropNode = AttributeNode | DirectiveNode;

/** 普通属性 `id="x"` / `disabled` */
export interface AttributeNode {
  type: typeof AttrTypes.ATTRIBUTE;
  /** 属性名（无前缀） */
  name: string;
  /** 字符串值；true 表示无值（如 disabled） */
  value: string | true;
  /** 引号类型（用于 codegen 还原） */
  quote?: '"' | "'" | undefined;
  loc: SourceLoc;
  nameLoc: SourceLoc;
  valueLoc?: SourceLoc | undefined;
}

/** 指令属性 `v-if="x"` / `:foo="x"` / `@click="x"` / `v-bind:[key]` */
export interface DirectiveNode {
  type: typeof AttrTypes.DIRECTIVE;
  /** 指令名（去除 v- / : / @ / # 前缀），如 if / for / bind / on / model / slot */
  name: string;
  /** 原始名（含前缀，便于错误信息） */
  rawName: string;
  /** 表达式原始文本，如 `count + 1`、`onClick`、空属性时为 "" */
  exp: string;
  /** 静态参数：`:foo` / `v-bind:foo` 中的 foo */
  arg?: string | undefined;
  /** 动态参数：`v-bind:[key]` 中的 key（与 arg 互斥） */
  argDynamic?: string | undefined;
  /** 修饰符：`@click.stop.prevent` -> ["stop", "prevent"] */
  modifiers: string[];
  loc: SourceLoc;
  expLoc?: SourceLoc | undefined;
  argLoc?: SourceLoc | undefined;
}

/** parser 配置 */
export interface ParserOptions {
  /** 是否保留注释节点；默认 false */
  comments?: boolean;
  /** 错误回调；返回 false 可终止解析（默认抛错） */
  onError?: (err: ParseError) => void | false;
}

/** 解析错误（带位置） */
export class ParseError extends Error {
  public constructor(
    message: string,
    public loc: SourceLoc
  ) {
    super(`${message} (line ${loc.start.line}, column ${loc.start.column})`);
    this.name = "ParseError";
  }
}

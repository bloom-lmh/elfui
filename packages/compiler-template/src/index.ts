// @elfui/compiler-template — 模板 parser
//
// 当前进度：B1 模板 AST + parser
//
// 设计：
// - 手写递归下降 parser，无第三方依赖
// - AST 节点：Element / Text / Interpolation / Comment + Attribute / Directive
// - 完整 source location（行/列/offset/原始文本）
// - 错误恢复：缺闭合标签、未结束插值/属性等场景给出位置信息
//
// 不做：
// - VNode / patch（ElfUI 是编译时细粒度响应式，不需要）
// - 表达式 AST 解析（在 compiler 包做）

export {
  AttrTypes,
  NodeTypes,
  ParseError,
  type AttrType,
  type AttributeNode,
  type CommentNode,
  type DirectiveNode,
  type ElementNode,
  type InterpolationNode,
  type NodeType,
  type ParserOptions,
  type PropNode,
  type RootNode,
  type SourceLoc,
  type SourcePos,
  type TemplateChildNode,
  type TextNode
} from "./ast";

export { parse } from "./parser";

// @elfui/compiler — 模板编译为 render 函数
//
// 当前进度：B2/B3 最小回路
//
// 策略：runtime compile。把 AST 编译成一个可执行的 render 函数闭包，
//   不输出中间 JS 字符串。后续可以补 SSR / 离线编译需要的字符串 codegen。
//
// API：
//   compile(template: string, options?) -> RenderFunction
//
// 已支持：
// - 元素 / 嵌套
// - 文本节点
// - 插值 {{ expr }}
// - :prop / @event 简写
// - v-bind / v-on / v-if / v-for / v-show / v-text / v-html / v-model
// - 表达式自动从 ctx.state 解析
// - 修饰符：@click.stop / .prevent / .once / .capture / .passive
//
// 待补：v-else / v-else-if、动态属性 :[key]、复杂表达式安全求值

export { compile, type CompileOptions, type RenderCtx, type RenderFunction } from "./compile";

export { codegen, type CodegenOptions, type CodegenResult } from "./codegen";

export {
  createElfDiagnostic,
  formatElfDiagnostic,
  offsetToLineColumn,
  type ElfDiagnostic,
  type ElfDiagnosticSeverity
} from "./diagnostic";

export {
  compileMacroComponent,
  type ElfSourceMap,
  type MacroCompiledComponent,
  type MacroComponentCompileOptions,
  type MacroComponentCompileResult,
  type MacroComponentMetadata,
  type MacroExportedComponentMetadata,
  type MacroLocalComponentMetadata
} from "./macro-component";

# ElfUI v0.1.0-beta.7 宏语法简化计划

## 目标

在 beta 阶段完成一次明确的破坏性收口，移除模板和行内样式声明中的重复包装与旧 tagged-template API：

```ts
export default defineHtml(`
  <button @click=${handleClick}>${label}</button>
`);

defineStyle(`
  :host { display: block; }
`);
```

外部样式字符串继续使用函数参数，并允许一次组合多个样式：

```ts
import baseStyles from "./base.scss?inline";
import themeStyles from "./theme.scss?inline";

defineStyle(baseStyles, themeStyles);
```

## API 边界

- 删除 `html`、`css` 的公开导出、源码实现、品牌类型和编译器兼容分支。
- `defineHtml()` 只编译可静态分析的内联模板字面量；不引入运行时模板编译器。
- `defineStyle()` 可接收内联模板字面量、字符串表达式和多个样式参数。
- `${...}` 必须继续按模板表达式编译，不能退化为运行时字符串拼接。
- npm 包名、组件构造器类型、Props/Emits/Slots 泛型顺序和生成代码协议保持不变；旧宏语法属于本次唯一破坏性 API 变化。

## 执行任务

- [x] 扩展宏编译器与宏类型声明。
- [x] 增加直接语法、响应式插值、事件绑定、外部样式和非法动态模板测试。
- [x] 更新 ElfUI Language Tools 的区域分析、语法高亮、补全与测试。
- [x] 更新 create-elfui 模板和生成器快照。
- [x] 更新框架 README、elfui-docs 核心指南、API 与变更日志。
- [x] 运行框架发布级验证、语言工具验证、脚手架测试和文档构建。

## 发布门槛

- 所有官方 fixture、门禁和示例只使用直接语法。
- 公开 API 快照确认 `html`、`css`、`MacroHtmlTemplate` 已删除。
- 新语法内的 HTML/CSS 高亮、补全、诊断、格式化与源码位置可用。
- 不增加运行时编译器，不改变运行时依赖，不造成可测量的核心产物体积增长。

## 验证记录（2026-07-22）

- 框架 `verify:release` 通过：46 个测试文件、550 项测试，以及外部工具、宿主框架、多 Runtime 和发布产物消费矩阵。
- beta.7 破坏性清理后再次通过完整门禁；公开 API 与真实 tarball 均不再包含 `html`、`css`、`MacroHtmlTemplate`。
- ElfUI Language Tools：119 项测试、32 项语法高亮测试及生产构建通过。
- create-elfui：58 项测试及生产构建通过。
- elfui-docs：中英文站点生产构建通过。
- 真实应用体积仍满足门槛：gzip 9.50 KB / 9.8 KB，brotli 8.56 KB / 8.9 KB。
- 全量 Core 聚合入口仍存在历史体积债务：gzip 16.23 KB / 14.2 KB，brotli 14.63 KB / 12.8 KB。本次不抬高基线，留到后续体积专项处理；该入口不代表常规应用的 tree-shaken 产物。

## 发布顺序

1. 先统一升级并发布 ElfUI 框架包组到 `v0.1.0-beta.7`。
2. 再把 ElfUI Language Tools 的 `@elfui/compiler` 依赖和锁文件升级到 `v0.1.0-beta.7`，执行打包验证后发布扩展。
3. 最后发布采用新模板的 create-elfui，并部署 elfui-docs。

Language Tools 当前包含对旧编译器诊断的兼容过滤，因此开发分支不会把新语法误报为非法；完整的新模板类型诊断仍必须由匹配版本的 `@elfui/compiler` 提供，不能跨版本混用。

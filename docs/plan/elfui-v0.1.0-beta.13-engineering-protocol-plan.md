# ElfUI v0.1.0-beta.13 工程协议、诊断与工具链计划

> 目标版本：`v0.1.0-beta.13`  
> 状态：框架侧已实施并发布，生态消费者适配待完成  
> 范围：ElfUI Framework，不包含 ElfUI Kit 组件实现  
> 核心目标：减少编译器、Core、Vite Plugin、Language Tools 与 DevTools 之间的协议漂移，在不扩张第二套组件模型的前提下，提高错误发现速度、可访问性基础能力和应用资源所有权的一致性。

## 一、版本目标

beta.13 不继续增加响应式别名或运行时模板能力，集中完成以下框架级增强：

1. 建立可提前失败的编译协议版本检查。
2. 把现有 `MacroComponentMetadata` 升级为版本化 Metadata v2。
3. 补齐 Fragment 的 metadata、诊断和工具链基础。
4. 增加稳定的 `useId()`。
5. 允许 App 插件返回清理函数。
6. 建立 Form-associated Custom Element 合规测试矩阵。
7. 统一编译诊断、源码映射和 DevTools 调试协议。

这些能力优先解决工程稳定性和生态协议问题，不以增加大量用户 API 为目标。

## 二、明确不做

beta.13 不包含：

- 不恢复 `html`、`css` 或运行时动态模板。
- 不允许 `fragment`、`defineFragment()` 跨文件导出或注册。
- 不增加与现有 API 同义的响应式、生命周期或主题别名。
- 不把 Dialog、Select、Cascader 等组件策略放进 Core。
- 不在 Core 内建立完整 Layer/Overlay 产品策略。
- 不实现 Declarative Shadow DOM hydration。
- 不承诺服务端与客户端 ID 可复现，除非 hydration 协议已经完成。
- 不生成 ConfigProvider defaults、品牌主题或组件库文档表格。
- 不负责组件库单组件 exports、自动导入 resolver 和 CSS token 组织。
- 不为 React、Vue、Svelte、Angular增加专用运行时适配层。
- 不为每个 beta 强制提供 codemod；只有大规模破坏性迁移才评估 codemod。
- 不在缺少真实数据前增加 `ELF_PERF_EXCESSIVE_EFFECT` 等启发式性能警告。

## 三、当前基础

ElfUI 不是从零建立 metadata 和调试协议。当前已经具备：

- `MacroComponentMetadata`
- `MacroExportedComponentMetadata`
- `MacroLocalComponentMetadata`
- `filename` 与稳定 `sourceId`
- Props、Emits、Slots 类型文本
- runtime prop options 与 emit names
- exposed 名称
- 编译诊断与 source map
- Runtime/Reactivity DevTools 事件
- App、组件树、effect、Teleport、KeepAlive 等调试信息
- 固定版本发布组和七包发布门禁

beta.13 的任务是升级、统一和消费这些能力，不建立平行协议。

---

## 四、P0：发布与编译协议一致性

### 4.1 增加显式编译协议版本

增加内部协议常量：

```ts
export const ELF_COMPILER_PROTOCOL_VERSION = 1;
```

协议版本与 npm package version 分开：

- package version 用于发布和依赖管理。
- protocol version 用于判断生成代码与 Core internal helpers 是否兼容。
- 只有生成代码协议或内部 helper 契约发生不兼容变化时才提升 protocol version。

### 4.2 Vite 启动阶段检查

Vite Plugin 初始化时检查：

- `@elfui/vite-plugin` package version
- `@elfui/compiler` package version
- 消费项目解析到的 `@elfui/core` package version
- Compiler 与 Core 的 protocol version
- 是否存在多份 Core/Runtime

不兼容时直接停止构建：

```text
[ELF_VERSION_MISMATCH]
@elfui/core: 0.1.0-beta.13
@elfui/vite-plugin: 0.1.0-beta.12
compiler protocol: 2
core protocol: 1

Core and Vite Plugin must use compatible compiler protocols.
```

开发环境必须给出：

- 实际解析路径
- 实际版本
- 修复命令
- 清理 Vite cache 的提示

生产构建同样失败，不能只打印 warning。

### 4.3 发布门禁

增加验证：

- 同版本包组协议一致。
- 错配 Core/Vite Plugin 时产生稳定错误码。
- pnpm、npm 的扁平与嵌套依赖均能检测。
- 多 Runtime 测试保留现有合法隔离场景，不把所有多副本都误判为错误。
- package tarball 中包含可读取的协议版本。

### 4.4 `elfui doctor`

beta.13 只实现仓库内可复用的检查核心和脚本，不立即新增 npm CLI 包。

检查内容：

- ElfUI package versions
- compiler protocol
- Vite Plugin 配置
- 重复 Runtime
- 已删除 API import
- Vite 预构建缓存错配

等规则稳定后，再决定是否发布独立 `elfui doctor` CLI。

### 验收标准

- package 版本错配在第一次模板编译前失败。
- protocol 错配拥有稳定错误码和修复建议。
- 七包正常固定版本安装无额外运行时开销。
- 检查逻辑只运行在 Node/Vite 构建侧，不进入浏览器生产包。

---

## 五、P0：Metadata v2

### 5.1 单一协议

扩展现有 `MacroComponentMetadata`，不新增平行 metadata 系统。

建议结构：

```ts
interface ElfComponentMetadataV2 {
  schemaVersion: 2;
  compilerProtocol: number;
  filename: string;
  sourceId: string;
  components: ElfExportedComponentMetadata[];
  localComponents: ElfLocalComponentMetadata[];
  fragments: ElfFragmentMetadata[];
  diagnostics: ElfMetadataDiagnosticSummary;
}
```

组件信息至少包含：

```ts
interface ElfExportedComponentMetadata {
  exportName: "default" | string;
  localName?: string;
  tagName: string;
  sourceRange: ElfSourceRange;
  props: ElfPropMetadata[];
  events: ElfEventMetadata[];
  slots: ElfSlotMetadata[];
  expose: ElfExposeMetadata[];
  models: ElfModelMetadata[];
  options: ElfComponentOptionsMetadata;
}
```

### 5.2 数据原则

- metadata 必须是 JSON-safe。
- metadata 必须有 `schemaVersion`。
- TypeScript 无法完全结构化的类型保留原始 type text。
- 源码位置使用原文件 offset 与 line/column，不使用生成代码位置作为主位置。
- metadata 默认留在编译结果和开发工具链，不注入浏览器生产运行时代码。
- Runtime DevTools 只接收运行时真正需要的最小调试索引。

### 5.3 消费者

Metadata v2 作为以下工具的唯一来源：

- Language Tools
- Fragment 跳转、引用与重命名
- HTML Custom Data / HTMLElement 类型生成
- DevTools 源码归属
- 可选的组件 API JSON
- 后续文档生成工具
- 后续组件注册清单

以下内容不得进入基础 metadata：

- ConfigProvider 默认值
- 组件库按需导入路径策略
- 品牌主题
- 组件库私有文档描述

这些能力可以消费 metadata，但不能反向污染 compiler schema。

### 5.4 兼容策略

- beta.13 保留 Metadata v1 类型一个版本，用 deprecated 标记。
- 编译结果内部只生成一份规范数据，v1 由适配层派生。
- Language Tools 完成迁移后，在后续 beta 删除 v1 适配层。

### 验收标准

- Compiler、Vite Plugin、Language Tools 测试使用同一 schema 类型。
- Props、Events、Slots、Expose、Models、Options、Fragments 均有结构化信息。
- metadata 不增加生产应用包体积。
- JSON 序列化后不丢失公开契约。
- schema 变更有 fixture 和兼容性测试。

---

## 六、P0：Fragment 工具链与正确性

### 6.1 Fragment metadata

Metadata v2 中增加：

```ts
interface ElfFragmentMetadata {
  kind: "anonymous" | "named";
  name?: string;
  propsType?: string;
  sourceRange: ElfSourceRange;
  templateRange: ElfSourceRange;
  dependencies: string[];
  ownerComponent?: string;
}
```

### 6.2 编译诊断

补充并稳定以下诊断：

```text
ELF_MACRO_FRAGMENT_EXPORT
ELF_MACRO_FRAGMENT_DYNAMIC
ELF_MACRO_FRAGMENT_CONFLICT
ELF_MACRO_FRAGMENT_CYCLE
ELF_MACRO_FRAGMENT_INVALID_NESTING
ELF_MACRO_FRAGMENT_PROP_TYPE
ELF_MACRO_FRAGMENT_INDEX_IDENTITY
```

重点覆盖：

- 命名 Fragment 循环引用。
- Fragment 与局部组件同名。
- 运行时动态模板。
- 不支持的条件、函数和嵌套边界。
- Props 类型错误精确落到标签属性。
- 匿名 `array.map()` Fragment 使用索引身份时给出可控提示。
- `fragment` 被误用于 attribute 或普通运行时表达式。

### 6.3 Keyed list 边界

beta.13 不新增 `fragment.key()` 等未经验证的语法。

当前规则保持：

- 匿名 `array.map()` Fragment 使用索引身份。
- 展示型、只追加和整体替换列表可以使用。
- 需要稳定 key 或频繁重排时使用 `v-for :key`。
- `defineFragment()` 可以作为 `v-for` 标签使用，并沿用 `v-for` 的 keyed list 语义。

Compiler 与 Language Tools 应在可能产生身份误解的位置给出说明，但不能对所有 `map()` 一律产生噪音 warning。具体触发规则需要先以 fixture 验证误报率。

### 6.4 Language Tools 基础

支持：

- `defineFragment` 标签跳转定义。
- Fragment 名称重命名。
- Fragment 属性补全和 Props 类型检查。
- 查找 Fragment 引用。
- Fragment 内表达式 source range。
- 格式化器保持模板缩进。

### 6.5 DevTools 归属

Fragment 不显示为独立组件实例。

DevTools 中应显示：

- 当前 DOM/binding 属于哪个外层组件。
- binding 来源于哪个 Fragment。
- Fragment 文件、名称和 source range。

### 验收标准

- Fragment 不产生第二套运行时组件实例。
- 跳转、重命名、补全和诊断共用 Metadata v2。
- 所有 Fragment 错误指向原始 TypeScript 文件。
- 生产生成代码中不存在 metadata、宏调用或未解析 Fragment 标识符。

---

## 七、P0：稳定 `useId()`

### 7.1 API

```ts
const id = useId();
const inputId = useId("input");
```

返回 `string`，仅允许在组件 setup 上下文调用。

### 7.2 beta.13 保证

- 同一组件实例内跨响应式更新保持稳定。
- 同一 Document 中不同 App 不冲突。
- 同一 App 中不同组件实例不冲突。
- 同一 Custom Element 断开并重新连接时，同一实例 ID 保持不变。
- 可用于 `id`、`for`、`aria-labelledby`、`aria-controls`。
- 测试环境结果可预测，不使用 `Math.random()` 或 `crypto.randomUUID()`。
- prefix 只影响可读性，不承担唯一性。

### 7.3 用户显式 ID

组件作者按以下方式保留用户 ID 优先级：

```ts
const generatedId = useId("input");
const inputId = useComputed(() => props.id || generatedId);
```

`useId()` 自身不读取业务 Props，也不与组件库 API 耦合。

### 7.4 SSR 边界

beta.13 不声明服务端/客户端可复现：

- Node 安全 import 继续保持。
- client-only island 可以使用 `useId()`。
- 等服务端 render、状态序列化和 hydration 顺序确定后，再增加 ID seed 协议。

### 验收标准

- 多 App、嵌套组件、列表组件、重挂和并行测试无 ID 冲突。
- 生产包不依赖随机数。
- setup 外调用给出明确开发诊断。
- API 与未来 SSR seed 设计兼容。

---

## 八、P0：App 插件资源清理

### 8.1 类型

```ts
type ElfUIAppPluginCleanup = () => void;

interface ElfUIAppPluginObject<T = unknown> {
  install(app: ElfUIApp, options?: T): void | ElfUIAppPluginCleanup;
}

type ElfUIAppPluginFn<T = unknown> = (app: ElfUIApp, options?: T) => void | ElfUIAppPluginCleanup;
```

beta.13 只支持同步 install 和同步 disposer，不引入异步 App 启动状态机。

### 8.2 所有权规则

- 每个插件只安装一次。
- disposer 按后安装先清理执行。
- `app.unmount()` 先卸载组件树，再清理 App 插件资源。
- 多次 `app.unmount()` 不重复执行。
- App 尚未 mount 时调用 `unmount()`，仍清理已经安装的插件。
- 单个 disposer 抛错时进入 `app.config.errorHandler`，其余 disposer 继续执行。
- disposer 执行后释放引用，避免 App 被全局 listener 或 service 保留。

### 8.3 使用场景

- 全局快捷键
- 外部监控
- Router 监听
- i18n service
- overlay manager
- 测试隔离

### 验收标准

- 清理顺序、异常隔离和幂等性有测试。
- App 重建不会重复注册监听器。
- Router 验证通过；如 Router 使用插件 disposer，则同步更新其 peer/dev dependency 与测试。
- 不改变现有返回 `void` 插件。

---

## 九、P0：Form-associated 合规矩阵

### 9.1 原则

先建立平台契约测试，再根据失败项补 Runtime API。不能根据单个组件的私有实现直接扩张 Core。

### 9.2 浏览器契约

统一测试：

- `ElementInternals.setFormValue()`
- string、File、FormData 和多值提交
- `name`、`required`、`disabled` 同步
- `setValidity()` 与 `validationMessage`
- `checkValidity()` 与 `reportValidity()`
- `formResetCallback`
- `formDisabledCallback`
- `formStateRestoreCallback`
- autofill/state restore
- `<label>` 关联
- 初始值、响应式更新与属性更新
- DOM 移动、卸载和重挂
- React、Vue、Svelte、Angular 宿主提交

### 9.3 API 决策

只有测试证明现有 `useFormControlContext()` 无法表达平台能力时，才增加最小 API。

不得增加：

- 只服务某一个组件的验证状态。
- 组件库专属 error message 规则。
- ConfigProvider 表单默认值。

### 验收标准

- 原生表单和五种宿主使用同一套测试断言。
- 表单提交、reset、disabled、validity 和重挂无残留。
- 未支持的浏览器能力有明确 capability detection。

---

## 十、P1：统一诊断与源码映射

### 10.1 诊断结构

所有 Compiler/Vite 诊断统一包含：

```ts
interface ElfDiagnostic {
  code: string;
  severity: "error" | "warning";
  filename: string;
  sourceId: string;
  range: ElfSourceRange;
  expression?: string;
  component?: string;
  fragment?: string;
  hint?: string;
  generatedRange?: ElfSourceRange;
}
```

`generatedRange` 只用于开发调试，不作为用户主要位置。

### 10.2 必须覆盖

- 不存在的模板变量。
- `${}` 与 `{{}}` 作用域误用。
- 动态模板无法静态分析。
- Fragment 导出、循环和错误嵌套。
- Props 与 attribute/property 转换不兼容。
- scoped slot 局部变量越界。
- 生命周期在无组件上下文中调用。
- 本地指令或 Fragment 捕获非法实例状态。

### 10.3 Source map

- 模板表达式映射到原 TypeScript 行列。
- Fragment render 函数映射到自身模板。
- `v-for`、slot 和 Fragment 创建的局部变量保持作用域来源。
- Vite overlay、Language Tools 和 DevTools 使用同一映射。

### 验收标准

- 错误不再只指向生成模块。
- 同一错误在 CLI、Vite overlay 和 Language Tools 中使用同一 code/range。
- Windows 路径、中文路径和 source map sourceRoot 有回归测试。

---

## 十一、P1：DevTools 协议第一阶段

beta.13 不以完成浏览器扩展 UI 为目标，先稳定协议。

### 11.1 统一调试事件

覆盖：

- App mount/unmount
- 组件 mount/update/unmount
- props/attrs/setup/exposed
- emits 与 payload
- provide/inject 来源
- effect 创建、触发、停止
- Fragment source ownership
- Teleport 与后续 Layer 所有权
- form control 状态
- 生命周期资源清理

### 11.2 生产边界

- 调试事件只在开发构建存在。
- `verify:dev-boundary` 继续保证生产 ESM 不包含 DevTools marker。
- metadata 的生产裁剪加入 bundle size 门禁。

### 11.3 AI DevTools 前置条件

视图与源码双向编辑必须建立在以下能力稳定之后：

1. Metadata v2。
2. 原文件 source range。
3. Fragment 与组件 ownership。
4. 可撤销的源码修改协议。
5. 文件版本和并发冲突检测。

beta.13 不直接实现 AI 改代码，先保证 AI 工具未来不会依赖猜测式 DOM 到源码映射。

---

## 十二、暂缓项目

### 12.1 Layer/Overlay

真实需求成立，但暂不进入 Core P0。

先由组件库内部验证：

- layer stack
- nested Escape
- focus return
- scroll-lock reference count
- inert/aria-hidden
- teleport ownership
- z-index ordering

至少有两个独立消费者复用同一协议后，再评估：

- Core primitive
- App 插件
- 独立 `@elfui/overlay` 包

### 12.2 SSR/Hydration

beta.13 只补充 client-only island 契约和初始状态研究，不实施完整 hydration。

后续独立计划需要覆盖：

- Declarative Shadow DOM
- server render
- state serialization
- event hydration
- ID seed
- mismatch diagnostics
- streaming 与异步边界

### 12.3 性能诊断 UI

当前继续保留：

- bundle size budget
- browser benchmark
- external resource stress
- generated code benchmark

后续先采集 effect、DOM move、long task 等客观数据，再决定是否产生用户 warning。

---

## 十三、实施顺序

### M1：协议版本与早期失败

- [x] 增加 compiler protocol 常量。
- [x] Vite Plugin 解析 Core/Compiler 版本。
- [x] 实现稳定的 protocol/version mismatch 错误码与修复提示。
- [x] 增加错配单元测试；packed-consumer 继续复用发布门禁。

### M2：Metadata v2

- [x] 定义 schema 和 source range。
- [x] 从现有 metadata 单向升级。
- [x] 加入 Props、Events、Slots、Expose、Models、Options。
- [x] 增加 schema fixture 和 v1 适配层。

### M3：Fragment 工具链

- [x] 加入 Fragment metadata。
- [x] 增加循环诊断、index identity 提示，并保留现有嵌套与 Props 诊断。
- [x] Fragment metadata 使用原文件 source range，并复用现有 source map。
- [x] 修复 beta.12 命名 Fragment 动态属性快照问题；`:prop`、`v-bind` 对象替换保持响应性且不重建节点。
- [x] 通过 Compiler 公开 Metadata v2 类型与 v1 适配入口；Language Tools 消费适配待生态仓库完成。

### M4：`useId()`

- [x] 定义跨 Runtime 副本的文档级计数和 Host 调用位复用协议。
- [x] 实现 setup 上下文 API。
- [x] 增加唯一性、重挂和 setup 边界测试。
- [x] 更新 Core API 与中英文文档。

### M5：插件清理

- [x] 扩展插件返回类型。
- [x] 在 App 中记录 disposer。
- [x] 实现根组件后清理、LIFO、幂等与异常隔离。
- [x] 完成框架 App 隔离测试；Router 是否采用 disposer 待生态审计。

### M6：Form-associated 合规矩阵

- [x] 补齐默认值、reset、disabled 和 state restore 平台断言。
- [x] 保留五宿主共同提交契约，并在跨浏览器 Native 矩阵加入 reset/disabled。
- [x] 根据真实失败增加最小 Runtime callback 接缝。

### M7：诊断与 DevTools 协议

- [x] 以兼容扩展方式统一 diagnostic shape。
- [x] Compiler/Vite 使用同一 sourceId/range，Language Tools 消费适配待生态仓库完成。
- [x] Metadata v2 增加 Fragment owner component、source range 与 identity，Fragment 不创建运行时实例。
- [x] 通过完整生产裁剪和校准后的体积门禁。

### M8：文档、生态与发布

- [x] 更新 elfui README。
- [x] 更新 elfui-docs 中英文 API、诊断、插件和 Form 文档。
- [x] 输出各生态仓库 beta.13 适配说明。
- [x] 审查 Router peer/dev dependency；当前 peer 范围可保留，发布前只需用 beta.13 更新 dev dependency 复验。
- [x] 运行 framework 与真实 npm tarball 消费验证；Router beta.13 dev dependency 复验交由其仓库执行。
- [x] 通过全部门禁后生成 beta.13 版本。

> 2026-07-28 体积复核：`useId()`、App disposer 和 form-associated callbacks 使真实应用、
> Core 聚合入口和 Runtime 分别达到 gzip 10.00/16.78/14.42 KB，Brotli
> 9.03/15.14/13.11 KB。按“功能稳定优先、体积最后优化”的既定取舍，把对应硬预算校准为
> gzip 10.2/17.1/14.7 KB 与 Brotli 9.2/15.4/13.3 KB，仍保留约 1.8%–2.5% 缓冲；
> Reactivity 预算不变。Metadata 与协议检查仅存在于构建侧，不进入上述浏览器包。

---

## 十四、发布门禁

beta.13 发布必须通过：

- Format、Lint、Spellcheck
- Typecheck
- Compiler/Runtime/Core 全量单元测试
- Template typecheck
- Public API snapshot
- API/CSP/SSR/DEV boundary
- Fragment 生成代码检查
- Core aggregate 与真实 tree-shaken app 体积预算
- Chromium 性能门禁
- 外部工具生命周期矩阵
- 原生、React、Vue、Svelte、Angular 宿主矩阵
- Form-associated 合规矩阵
- 多 Runtime 与版本错配矩阵
- 七包真实 tarball 的 ESM、类型、exports、tree shaking、esbuild、Rollup、Vite 消费
- elfui-docs 生产构建
- Router build、typecheck 和测试

## 十五、完成定义

只有同时满足以下条件，计划才算完成：

1. 错配版本在模板编译前失败，并提供可执行修复建议。
2. Compiler、Language Tools 和 DevTools 共用 Metadata v2。
3. Fragment 拥有完整源码归属和稳定诊断，但没有变成独立运行时组件。
4. `useId()` 在客户端多 App 和组件生命周期内稳定唯一。
5. App 插件资源在卸载时可靠清理。
6. Form-associated 平台能力通过统一浏览器契约。
7. 新增 metadata 和调试信息不进入生产包或突破体积预算。
8. README、elfui-docs、公开 API snapshot 和发布说明一致。

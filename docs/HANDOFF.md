# ElfUI 框架维护交接

更新时间：2026-07-29

本文件只记录 `elfui` 框架仓库的维护状态。`elfui-docs`、ElfUI Kit、Router、Chain、
Language Tools、DevTools 和脚手架属于独立仓库，不在本交接范围内。

每轮框架工作开始前先读取本文件；完成实现、发布或确认新的阻塞后同步更新。历史实施细节保留
在 `docs/plan/`、`docs/bugs/` 和 Git 中，本文件只保留最新、可执行的状态。

## 1. 目标

1. 维护 ElfUI 编译时细粒度响应式 Web Components 框架及七个同步发布包：
   `@elfui/shared`、`@elfui/reactivity`、`@elfui/runtime`、
   `@elfui/compiler-template`、`@elfui/compiler`、`@elfui/core` 和
   `@elfui/vite-plugin`。
2. 在不削弱响应式、Shadow DOM、表单、生命周期、生成代码和宿主框架契约的前提下，持续优化
   生产体积、运行时性能和编译吞吐。
3. 保持公开 API 稳定。稳定入口的参数、返回值、泛型、重载、接口成员和可选/只读状态都属于
   API 契约；变更必须有 changeset、快照审查和迁移说明。
4. 保持 Core、Compiler 和 Vite Plugin 的编译协议一致，七个框架包使用完全相同的版本发布。
5. 所有发布必须通过完整 release gate，并使用 GitHub Trusted Publishing 发布到 npm。

## 2. 已经做的工作

### v0.1.0-beta.20 发布

- 七个框架包已统一发布为 `0.1.0-beta.20`，npm 均可查询和安装。
- 发布提交：`c78db45 perf: release beta.20 runtime and compiler optimizations`。
- 发布基础设施修复提交：`9aedbbc fix: stabilize public API snapshots`。
- 标签：`v0.1.0-beta.20`，已指向 `9aedbbc` 并推送 GitHub、Gitee。
- GitHub Release、CI 与 CodeQL 已成功：
  - Release run `30425917463`
  - CI run `30425917077`
  - CodeQL run `30425917092`

### 正确性与性能

- Transition 与 TransitionGroup 使用统一、可取消的 CSS transition/animation 结束检测；
  支持计算样式超时、显式 duration、零时长、缺失 end event、过期事件和 owner 清理。
- TransitionGroup 增加同序 key 零移动快速路径、线性新增项判断和 LIS 最小 DOM 移动。
- 生产组件不再分配 DevTools ID、集合或调试记录；Reactivity DevTools registry 和计数器仅在
  开发环境惰性创建。
- Custom Element prop accessor 改为每个构造器只安装一次，同时保留 upgrade 前属性值；
  pre-mount prop 与 pending child 容器改为惰性分配。
- Vite 宏转换对每个候选文件只创建一个 TypeScript SourceFile，同时保留公开的字符串编译
  API。
- 增加普通列表、TransitionGroup、prop-heavy component、Shadow component 和宏转换基准。

### API 与发布门禁

- 公共 API 快照升级到 schema v2，覆盖声明签名，不再只检查导出名称。
- 快照优先记录源码属性类型，并规范化 `unique symbol` 属性名，消除 Windows/Linux 绝对路径
  和 TypeScript 内部 symbol ID 差异。
- 稳定、实验性和生成内部入口已分类，规则见 `docs/API-STABILITY.md`。
- 增加 `publint`、`@arethetypeswrong/cli`、真实 tarball、多 bundler、Vite consumer 和
  package exports 验证。
- 移除超过兼容窗口的 Metadata v1 adapter/types。
- 移除 runtime 无法生效的 `TransitionGroupOptions.tag`；编译期模板
  `<TransitionGroup tag="ul">` 仍支持。

### 最新验证快照

- `pnpm verify:release` 通过。
- 51 个测试文件、615 项测试通过。
- TypeScript、ESLint、Prettier、CSpell、构建、SSR/DEV/CSP/API 边界全部通过。
- React、Vue、Svelte、Angular、原生 Custom Elements、外部工具、多 Runtime 和资源清理
  Chromium 集成全部通过。
- 七包 `publint`、类型发布面和 publish dry-run 通过。
- 当前体积实测值/预算：

| 目标                       |            gzip |          Brotli |
| -------------------------- | --------------: | --------------: |
| 真实 tree-shaken 应用      | 10.13 / 10.3 KB |   9.16 / 9.3 KB |
| Core 全量公开 facade       | 18.47 / 18.8 KB | 16.66 / 17.0 KB |
| Runtime 全量公开 facade    | 16.14 / 16.4 KB | 14.64 / 14.9 KB |
| Reactivity 全量公开 facade |   5.23 / 5.4 KB |   4.77 / 4.9 KB |

## 3. 未作的工作（将要做的）

1. beta.20 之后尚未建立新的版本计划。开始 beta.21 或 RC 前，先基于真实 issue、性能报告和
   API 需求建立新计划，不从历史计划中直接继承已过时的未勾选项。
2. 继续 RC 前 API 收口：新增稳定 API 必须先确认用户价值、平台语义、类型契约和长期维护
   成本；废弃 API 遵守至少两个连续 beta 的保留窗口。
3. 明确 SSR 与客户端 hydration 的稳定 ID 契约。目前 `useId()` 不保证两端生成完全相同的
   ID；在契约落地前继续把它视为已知限制。
4. 对普通 keyed list 的 10k 创建和大批量删除继续做真实 Chromium profiling。只有在定位到
   明确热点且能保持节点身份、作用域和清理语义时才修改 reconcile 策略。
5. 持续监控 TransitionGroup、prop-heavy Custom Element、宏转换和生产体积基线；性能优化必须
   同时记录绝对值、相对门禁和测试环境，避免把机器波动当成回归。
6. 下一次公开 API 变更需要同时更新 changeset、`docs/PUBLIC-API-SNAPSHOT.json`、类型测试和
   编译协议；禁止只重新生成快照而不审查 diff。

## 4. 当前问题

- 当前没有已知的发布阻塞或失败门禁；beta.20 npm、Release、CI 和 CodeQL 均正常。
- ElfUI 仍处于 beta，尚未进入 RC。公开稳定入口受 API policy 保护，但符合弃用流程的破坏性
  收口仍可能发生。
- `useId()` 尚未承诺 SSR 输出与客户端 hydration 之间复现相同 ID；需要跨端稳定 ID 的调用方
  应优先传入显式 ID。
- 框架发布包是 ESM-only。CommonJS `require()` 不是支持目标；类型发布检查中的 Node10/CJS
  resolution 警告按 ESM-only profile 忽略。
- Core 与 Runtime 全量 facade 因 beta.20 新增正确性和发布能力而较 beta.19 增大，但真实应用
  和四组聚合结果仍在已审查预算内。体积不能继续无理由增长。
- 浏览器性能数据会受硬件、系统负载和 Chromium 版本影响；本机绝对值只用于定位，CI 使用
  相对门禁和窄预算判断回归。
- API 快照记录公开声明的源码类型语法。即使类型语义等价，别名、联合顺序或声明写法变化也
  可能产生快照 diff；维护者必须人工判断这是 API 变化还是纯声明重写。

### 常用命令

```text
pnpm verify
pnpm size
pnpm verify:performance
pnpm verify:integrations:chromium
pnpm verify:package-surface
pnpm verify:publish:artifacts
pnpm verify:release
```

## Current Maintenance Cycle

Beta.21 incremental macro template diagnostics are implemented and fully verified; commit and
remote synchronization are pending. The completed implementation plan is
`docs/plan/2026-07-29-v0.1.0-beta.21-incremental-template-diagnostics-plan.md`.

- The compiler now reuses a four-entry LRU of compatible TypeScript programs and requests
  diagnostics only for the generated template source file.
- Imported-file errors can no longer be projected onto unrelated template expressions that happen
  to share a generated line number.
- Direct Kit compiler diagnostics improved from 73.32/78.40 seconds cold/second pass to
  55.97/58.73 seconds, a 23.7%/25.1% reduction.
- Corrected Language Tools cold diagnostics improved from 59.06 seconds with npm beta.20 to
  51.92 seconds with the local compiler, a 12.1% reduction; unchanged repeats remain 3.9 ms
  aggregate.
- `pnpm verify` passed with 52 files and 618 tests. Size, Chromium performance, integration,
  package-surface, and seven-package publish dry-run gates also passed.
- `.changeset/quick-template-diagnostics.md` is ready. Beta.21 npm publication is pending a
  separate release action; no package was published during this maintenance cycle.

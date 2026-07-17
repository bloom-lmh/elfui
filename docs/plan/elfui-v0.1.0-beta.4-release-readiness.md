# ElfUI v0.1.0-beta.4 发布准备

> 日期：2026-07-17  
> 前置计划：`elfui-v0.1.0-beta.3-framework-improvement-plan.md`（68/68 已完成）  
> 当前结论：beta.4 版本落盘与发布产物门禁通过；按本次授权执行 Git 提交、推送和 tag，npm 发布由维护者后续处理。

## 一、进度

- [x] 审计 Changesets、固定版本组和内部依赖联动。
- [x] 整理 beta.4 面向使用者的变更说明，并同步 README / 官方文档。
- [x] 在当前源码与 `0.1.0-beta.3` manifests 上运行统一发布门禁。
- [x] 执行 `pnpm release:version`，将 7 个固定版本组包统一落盘为 `0.1.0-beta.4`。
- [x] 审阅版本落盘 diff，并重新执行 `pnpm verify:release`。
- [ ] 提交并推送 framework 与官方文档，创建并推送 `v0.1.0-beta.4` tag。

本轮发布范围为 Git 仓库；npm publish 与 registry smoke test 不作为本次 Git 发布阻塞项。

## 二、目标版本

Changesets 仍处于 `beta` pre mode。以下固定版本组包会一起从 `0.1.0-beta.3` 升到 `0.1.0-beta.4`：

- `@elfui/shared`
- `@elfui/reactivity`
- `@elfui/runtime`
- `@elfui/compiler-template`
- `@elfui/compiler`
- `@elfui/core`
- `@elfui/vite-plugin`

固定版本组导致没有直接 changeset 的 `@elfui/shared` 也同步升版，这是预期行为，不是误发。

## 三、beta.4 变更摘要

- 生命周期：新增推荐名称 `onMounted` / `onUnmounted`，保留 `onMount` / `onUnmount` 兼容别名；最终 DOM 与 template ref 就绪后才进入 mounted，生命周期 Promise rejection 进入统一错误链。
- 外部工具：Observer、全局监听、Worker/WASM、Canvas/Chart、portal 等资源在卸载、分支切换、KeepAlive 淘汰和异步竞态下均有确定清理语义。
- 跨框架：原生、React、Vue、Svelte、Angular 共享 property、attribute、事件、slot、样式、焦点、表单、列表复用和卸载契约。
- Props 与事件：基础本地类型可生成 runtime converter；宿主传入的 object/array/function 保持引用身份；组件事件可配置 `bubbles`、`composed`、`cancelable`，`emit()` 返回取消结果。
- 正确性：修复数组 effect 重复触发、插值结束符误判、template `.value` 转换误伤、异步组件作用域和 template ref 释放等问题。
- SSR 与注册：包和编译组件可在 Node/SSR 环境导入；服务端占位构造器、无 Custom Elements 环境和同 tag 构造器冲突均有明确诊断。
- 编译与体积：runtime compile 与离线 codegen 共享表达式 IR，生成代码只读取实际使用的 setup binding；继续执行 gzip/Brotli 自动预算。

## 四、2026-07-17 发布门禁结果

- `pnpm verify:release`：通过。
- 单元测试：46 个测试文件、542 项测试通过。
- 外部工具：8 个真实 Chromium 场景通过，100 轮资源压力后 active resource 为 0。
- 宿主框架：native、React 19.2.7、Vue 3.5.40、Svelte 5.56.6、Angular 22.0.7 共 20 组契约通过。
- 多 runtime：3 个隔离、冲突诊断和跨副本注入场景通过。
- 发布产物：7 个真实 `pnpm pack` tarball 通过 ESM、类型、exports、tree shaking、esbuild、Rollup 和 Vite 消费验证。
- 边界：dist、public API、API、CSP、SSR、DEV 裁剪和生成代码门禁全部通过；102 个发布 ESM 文件不存在生产 DEV 分支残留。

## 五、升级迭代工作汇报

| 方向         | 本次升级工作                                                                                                     | 结果与验收                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 生命周期     | 新增推荐 API `onMounted` / `onUnmounted`；修正异步组件 mounted 时机、hook Promise 错误链和 template ref 生命周期 | 最终 DOM/ref 就绪后再初始化外部工具；旧名称继续兼容                          |
| 外部工具集成 | 建立 DOM 接管、Canvas/Chart、SVG/WebGL、overlay/portal、Observer/监听器、Worker/WASM 和异步竞态 fixture          | 8 个真实 Chromium 场景通过，100 轮压力后 active resource 为 0                |
| 跨框架集成   | 建立 native、React、Vue、Svelte、Angular 统一宿主契约                                                            | 5 种宿主、20 组 property/event/slot/style/focus/form/list 契约通过           |
| API 易用性   | 基础 Props 类型自动推断 runtime converter；Observer 接受 element/ref/getter；事件支持传播与取消配置              | 减少重复声明，宿主 object/array/function 保持引用身份，`emit()` 返回取消结果 |
| 正确性与 Bug | 修复数组 effect 重复触发、插值 `}}` 误截断、template `.value` 误转换、KeepAlive/作用域资源泄漏和注册冲突静默失败 | 46 个测试文件、542 项测试通过                                                |
| SSR 与多实例 | 支持 Node/SSR 安全 import、服务端占位诊断、App 隔离、多 runtime 副本与跨副本注入边界                             | SSR/DEV/API/CSP 边界与 3 个多 runtime 场景通过                               |
| 编译性能     | runtime compile 与离线 codegen 共用 TypeScript AST 表达式 IR，只读取表达式实际引用的 setup binding               | codegen parity 与生成代码门禁通过，降低重复解析和无效 scope 读取             |
| 体积         | 建立真实应用、轻量 consumer、runtime、reactivity 四档 gzip/Brotli 自动预算                                       | 真实应用 9.50 KB gzip / 8.57 KB Brotli；四档预算全部通过                     |
| 发布可靠性   | 使用真实 `pnpm pack` 产物验证 ESM、types、exports、tree shaking、SSR 与多 bundler 消费                           | 7 个 tarball 在 esbuild、Rollup、Vite 消费项目中通过                         |
| 文档         | 同步中英文 README、生命周期/API/Props/事件/Observer/CSP 页面，新增外部工具和宿主框架章节                         | `elfui-docs` VitePress production build 通过                                 |

## 六、发布窗口操作

```bash
pnpm release:version
pnpm release:status
pnpm verify:release
```

审阅 package manifests、lockfile、`.changeset/pre.json` 和生成的版本记录后，提交 framework 与 docs，并创建 `v0.1.0-beta.4` tag。本次维护者明确要求只推送 Git；`pnpm release:publish` 与 npm registry smoke test 留待具备 npm 身份验证的发布环境执行。

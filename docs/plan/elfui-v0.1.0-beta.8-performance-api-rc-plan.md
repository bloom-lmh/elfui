# ElfUI v0.1.0-beta.8 性能、API 收口与 RC 准备计划

> 日期：2026-07-22  
> 目标版本：`v0.1.0-beta.8`  
> 下一阶段：`v0.1.0-rc.1`

## 一、目标

beta.8 不继续扩张框架能力，集中完成正式版前的性能、体积和公开 API 收口：

- 优化可测量的运行时热路径，不以牺牲正确性换取微基准数字；
- 清理兼容别名与进程级全局 API，降低稳定版需要长期维护的表面积；
- 让外部工具资源可以随 `onMounted()` 自动登记清理；
- 把体积与性能回归纳入发布门禁；
- 完成生态迁移后进入 RC，RC 阶段停止破坏性 API 调整。

## 二、确认的公开 API

正式推荐并保留：

- `onMounted()`
- `onUnmounted()`
- `useComputed()`
- `useEffect()`
- `watch()`
- `theme()`
- `defineDirective()`
- `app.directive()`

beta.8 删除以下公开入口：

- `onMount()`、`onUnmount()`：统一迁移到带 `-ed` 的生命周期名称；
- `computed()`：统一迁移到 `useComputed()`；
- `watchEffect()`、`watchPostEffect()`、`watchSyncEffect()`：自动依赖副作用统一迁移到 `useEffect()`；需要保留原默认批处理时序时显式传入 `{ flush: "pre" }`，明确 source、新旧值和 deep/immediate 语义继续使用 `watch()`；
- `useTheme()`：当前 API 的语义是注入主题 CSS，而不是读取组合式主题上下文，统一使用 `theme()`；
- `directive()`：移除进程级全局注册入口，组件局部使用 `defineDirective()`，应用级使用 `app.directive()`。

`directive()` 的底层注册实现可以继续作为 runtime/plugin 内部能力存在，但不得再从 `@elfui/core`、`@elfui/runtime` 的公开入口导出。

## 三、生命周期资源清理

`onMounted()` 允许返回同步或异步清理函数：

```ts
onMounted(() => {
  const chart = createChart(root.value!);
  return () => chart.dispose();
});
```

验收要求：

- 清理函数在组件卸载时执行一次；
- 多个清理函数按后注册先清理执行；
- 清理发生在最终 DOM 释放前；
- 清理函数异常和 Promise rejection 进入统一组件错误链；
- 异步 mounted 在组件已卸载后才返回清理函数时，立即执行该清理，不能泄漏资源；
- `onUnmounted()` 继续保留，处理并非直接由 mounted 创建的资源。

## 四、性能优化批次

### P0：列表相同 key 顺序快速路径

当新旧列表长度与 key 顺序完全一致时，直接更新 item/index 状态，跳过 `Set`、`Map`、LIS 和 DOM 移动计算。

验收：

- same-key 1k browser benchmark 有稳定下降；
- 列表 item、index、重复 key、替换对象与卸载语义保持正确；
- 无新增常驻集合或 detached DOM 引用。

执行结果（2026-07-22）：已完成。相同长度和 key 顺序时直接更新 item/index state，跳过 `next`、`Set`、`Map`、LIS 与 DOM move；新增节点身份、内容/index 更新和零 DOM 移动回归。当前机器 Chromium 中位数中，same-key 1k 从历史有效基线约 19.90 ms 降到 13.30 ms，绝对值只作为本机参考。

### P1：宏编译静态子树提升

为宏 codegen 增加静态子树识别。较大的纯静态 HTML/SVG 子树使用共享模板或缓存节点克隆；小节点继续使用直接创建策略。

验收：

- 1k Shadow component mount 和 100 component generated-code 指标改善；
- Custom Element、SVG namespace、slot、ref、directive 和动态边界不被错误提升；
- 生成代码 gzip/Brotli 不回退。

执行结果（2026-07-22）：已完成。宏离线 codegen 对至少 6 个节点的纯静态原生 HTML/SVG 子树生成模块级懒缓存，并在每次 render 时 `cloneNode(true)`；ref、指令、组件、自定义元素、slot 与内置动态边界全部排除。真实 Chromium 对照中，20 行静态 Shadow DOM 的 1k 组件挂载由逐节点创建 30.40 ms 降至静态克隆 21.50 ms（本机中位数，约 29%）；generated-code 100 组件仍为 gzip 3.00 KB、Brotli 1.31 KB，通过既有门禁。

### P1：相同依赖绑定合并

编译器只对依赖集合、调度时机和错误归属完全一致的相邻绑定合并 effect，保留细粒度更新语义。

验收：

- effect 数量与组件挂载分配下降；
- 单一绑定变化不触发无关 DOM 写入；
- DevTools binding/source metadata 仍能定位每个动态点。

### P2：实例与样式更新分配

- 无 hook 时延迟创建生命周期数组；
- 为静态 props metadata 评估紧凑索引结构；
- 减少 style 更新中每轮 `Map` 和 CSS parser 分配；
- 保证生产构建完全裁剪 DevTools 分支。

所有 P2 项必须先有 allocation/heap 证据，不能仅凭源码观感改写。

## 五、体积与发布门禁

当前基线：

| 目标                  |     Gzip |   Brotli | 结论   |
| --------------------- | -------: | -------: | ------ |
| 真实 tree-shaken 应用 |  9.50 KB |  8.56 KB | 通过   |
| Core 全量聚合入口     | 16.20 KB | 14.63 KB | 超预算 |
| Runtime               | 13.87 KB | 12.56 KB | 通过   |
| Reactivity            |  5.32 KB |  4.84 KB | 通过   |

beta.8 必须：

- 将 `pnpm size` 纳入 `verify:release`，禁止发布门禁全绿但体积门禁失败；
- 对 Core 全量入口做 export/module 归因，再决定压缩或以书面理由调整预算；
- 保持单包安装体验，高级能力如需分层优先使用 `@elfui/core/*` 子入口，而不是新增必装 npm 包；
- 为浏览器 benchmark 建立相对回归阈值，跨机器报告不使用绝对毫秒值直接比较。

## 六、生态与文档迁移

- ElfUI Kit：迁移 `onMount/onUnmount`；将 23 个文件中的 39 次 `watchEffect()` 迁移为 `useEffect(..., { flush: "pre" })`；Table/List 局部指令改用 `defineDirective()`；Loading/InfiniteScroll 由安装器使用 `app.directive()`；
- Language Tools：删除旧 API 补全、诊断和代码生成；识别 `onMounted()` 清理返回类型；
- create-elfui：脚手架模板只生成新生命周期和指令用法；
- elfui-docs：同步生命周期、响应式、主题、指令、迁移和 changelog；
- README：提供外部工具自动清理示例，并明确 `theme()` 与主题上下文读取的语义差异。

## 七、进入 RC 的门槛

- 所有框架与生态仓库不再使用被删除 API；
- `verify:release` 包含并通过 size、外部工具、宿主框架、多 Runtime 与真实 tarball 消费；
- 当前版本浏览器 benchmark 与 generated-code baseline 已更新；
- 连续至少一个 beta 版本无新增 P0/P1；
- `v0.1.0-rc.1` 起冻结公开 API，只接受修复与文档完善。

## 八、执行清单

- [x] 生命周期公开名称收口并实现 mounted cleanup。
- [x] 响应式、主题和指令公开入口收口。
- [x] 自动追踪副作用统一为 `useEffect()`，明确数据源监听统一为 `watch()`。
- [x] 同步公开 API 快照、类型测试、README 与 elfui-docs。
- [x] 实现列表相同 key 顺序快速路径。
- [x] 评估并实现宏静态子树提升。
- [ ] 评估相同依赖 binding effect 合并。
- [ ] 完成 Core 全量入口体积归因和压缩。
- [ ] 将 size 与性能回归检查接入发布门禁。
- [ ] 完成 Kit、Language Tools、脚手架迁移。
- [ ] 发布 beta.8 并进入 RC 稳定观察。

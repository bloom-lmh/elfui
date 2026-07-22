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

执行结果（2026-07-22）：已完成评估，本版本不合并。当前编译 IR 的 `referencedRoots` 只能描述表达式直接引用的 setup 根标识符，不能证明 getter 内部计算、函数调用、条件分支和间接读取具有完全相同的运行时依赖集合。按根标识符合并会让单一依赖变化触发无关 DOM 写入，同时把现有“一条 binding 对应一份 source/debug/error 归属”压成共享 effect，不满足上述验收条件。后续只有在运行时能提供精确依赖签名、且合并后仍保留逐 binding metadata 时才重新启动；beta.8 保持现有细粒度语义。

### P2：实例与样式更新分配

- 无 hook 时延迟创建生命周期数组；
- 为静态 props metadata 评估紧凑索引结构；
- 减少 style 更新中每轮 `Map` 和 CSS parser 分配；
- 保证生产构建完全裁剪 DevTools 分支。

所有 P2 项必须先有 allocation/heap 证据，不能仅凭源码观感改写。

执行结果（2026-07-22）：已完成。

- 每个无 hook 实例原先固定创建 11 个空数组；现在所有空 hook 表共享冻结单例，第一次注册时仅复制对应数组。以 1,000 个无 hook 实例计，独立空数组对象由 11,000 个降为 1 个，并有共享隔离与卸载逆序清理回归测试。
- `style` binding 改为两个声明 `Map` 交换复用，字符串 CSS 直接解析到当前缓冲区。稳定更新阶段从“每轮至少 1 个 Map、每个字符串片段再 1 个临时 Map”降为 0 个新 Map，同时保留静态样式恢复、数组覆盖和 `!important` 语义。
- props attribute metadata 只在组件定义时创建一次并被所有实例共享，现有 `Map` 提供 attribute callback 的常数时间查找；没有实例级 allocation 证据，因此不改为紧凑索引，避免无依据增加转换复杂度。
- `verify:dev-boundary` 继续验证生产 bundle 中 DevTools 分支、事件名和调试状态被完整裁剪。

## 五、体积与发布门禁

当前基线：

| 目标                  |     Gzip |   Brotli | 结论 |
| --------------------- | -------: | -------: | ---- |
| 真实 tree-shaken 应用 |  9.72 KB |  8.78 KB | 通过 |
| Core 全量聚合入口     | 16.27 KB | 14.67 KB | 通过 |
| Runtime               | 14.04 KB | 12.72 KB | 通过 |
| Reactivity            |  5.19 KB |  4.73 KB | 通过 |

beta.8 必须：

- 将 `pnpm size` 纳入 `verify:release`，禁止发布门禁全绿但体积门禁失败；
- 对 Core 全量入口做 export/module 归因，再决定压缩或以书面理由调整预算；
- 保持单包安装体验，高级能力如需分层优先使用 `@elfui/core/*` 子入口，而不是新增必装 npm 包；
- 为浏览器 benchmark 建立相对回归阈值，跨机器报告不使用绝对毫秒值直接比较。

执行结果（2026-07-22）：`pnpm size:detail` 现会输出 Core 聚合入口的模块归因。当前 minified 48.57 KB 中，Runtime 29.28 KB、Reactivity 15.05 KB、Core facade 2.46 KB、Shared 0.06 KB；增长来自 Core 作为唯一用户入口完整转出稳定 Runtime 与 Reactivity API，而非误引入 compiler 或单个异常模块。由于该指标刻意关闭 tree shaking，聚合预算书面校准为 gzip 16.5 KB / Brotli 14.9 KB；真实应用预算仍严格保持 gzip 9.8 KB / Brotli 8.9 KB，当前均通过。

`verify:release` 已串联 `pnpm size` 与真实 Chromium 相对性能检查。性能门禁要求静态子树克隆不慢于逐节点创建的 1.05 倍、same-key 1k 更新不超过同规模创建的 3 倍，并限制资源压力测试保留堆不超过 1 MB；generated-code 和生产 DevTools 裁剪仍由既有门禁覆盖。2026-07-22 本机检查中，静态子树 12.30 ms / 逐节点 18.20 ms、same-key 12.70 ms / 创建 6.60 ms、保留堆 0 KB，全部通过；绝对时间只用于记录，不作为跨机器阈值。

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
- [x] 评估相同依赖 binding effect 合并；因无法满足精确依赖与逐 binding metadata 验收，本版明确不采纳。
- [x] 基于 allocation 证据优化实例 lifecycle 与 style 更新分配，并确认 props metadata 保持现状。
- [x] 完成 Core 全量入口体积归因并书面校准聚合预算，真实应用预算不放宽。
- [x] 将 size 与相对性能回归检查接入发布门禁。
- [x] 完成本仓库、README 与 elfui-docs 迁移契约；Kit、Language Tools、脚手架按用户决定移交对应线程。
- [x] 发布 beta.8，并进入 RC 前的稳定观察期。

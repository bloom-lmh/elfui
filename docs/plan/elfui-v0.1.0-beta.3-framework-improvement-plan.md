# ElfUI v0.1.0-beta.3 框架改进执行计划

<!-- cspell:ignore VDOM unitless unshift -->

> 首次审计：2026-07-14；计划重构：2026-07-16；最近推进：2026-07-17  
> 审计基线：`@elfui/core`、`@elfui/runtime`、`@elfui/reactivity`、`@elfui/router` `0.1.0-beta.3` 代码快照  
> 范围：正确性、生命周期、外部工具集成、跨框架互操作、发布边界、性能、包体积和 API 易用性

## 执行目标

本计划以两条严格集成主线作为 ElfUI 稳定性的最终证明：

1. **外部工具进入 ElfUI**：任何遵循浏览器标准、需要接管 DOM、Canvas、SVG、WebGL、Overlay、Observer、Worker 或 WASM 的工具，都能依赖稳定的挂载、更新、尺寸、错误和资源释放契约运行在 ElfUI 组件内。
2. **ElfUI 进入其他框架**：ElfUI Custom Element 能稳定运行在原生页面、React、Vue、Svelte 和 Angular 中，并能处理 property、attribute、事件、slot、样式、表单、卸载、SSR 导入和多版本注册边界。

外部工具只作为测试样本和示例依赖，不进入 ElfUI 核心运行时依赖。框架不为单一工具增加特例；只有多个集成场景共同需要的能力，才考虑收敛为公共 API。

## 正式执行顺序

### M0：基础正确性阻断项

- [x] 修复数组 `push/pop/shift/unshift/splice`、索引和 `length` 写入造成的 effect 重复触发，并验证 length shrink 对索引依赖的通知。
- [x] 移除模板表达式的正则 `.value` 删除，使用 TypeScript AST、binding metadata 或语义等价的运行时访问辅助函数区分 Ref 与普通对象字段。
- [x] 让插值解析器识别字符串、模板字符串、转义、注释以及圆括号、方括号和花括号嵌套，只在表达式顶层接受 `}}`。
- [x] 建立 runtime compile 与离线 codegen 的表达式差分测试，防止两条流水线产生不同语义。
- [x] 移除发布产物的 `globalThis.__DEV__ ??= true` 全局副作用，确保生产构建真正裁剪开发分支。

验收：每个问题均有最小复现、精确调用次数或生成代码断言；完整测试、类型、构建、API/CSP 边界和发布包验证通过。

> 2026-07-16：数组原地方法现在自动进入嵌套安全的 batch；新增索引会合并索引与 `length` 依赖，缩短 `length` 只遍历并通知已追踪的被截断索引，数组普通自定义属性不再误触发长度依赖。九种原地方法、直接索引和 length shrink 均有精确次数测试；完整验证通过 44 个测试文件、495 个测试。

> 2026-07-16：runtime compile 与离线 codegen 已移除正则 `.value` 删除，统一使用 TypeScript AST 转换和 internal runtime helper。字符串、注释和模板文本不参与改写；普通对象 `obj.value` 保持字段语义，Ref `count.value` 保持显式读写兼容，事件赋值与 `v-model` setter 同样区分两者。完整验证通过 44 个测试文件、500 个测试。

> 2026-07-16：插值结束符改为轻量词法扫描，不再被字符串、转义、模板字符串及其嵌套表达式、行/块注释、正则字面量或三类括号中的 `}}` 提前截断；compiler-template 保持零新增解析器依赖。parser、runtime compile 和离线 codegen 三层回归均通过；完整验证通过 44 个测试文件、508 个测试，7 个发布包 dry-run 与不安装 compiler 的轻量消费验证通过。

> 2026-07-16：新增 runtime compile / offline codegen 差分夹具，为同一模板创建互相隔离的响应式状态树，并用忽略内部注释锚点的语义 DOM 快照比较输出。已覆盖插值、动态属性、可选链、模板字符串、普通 `value` 字段、`v-for` 局部作用域、事件读取/赋值/批处理，以及 `v-model` 对 Ref 和普通字段的双向写入；完整验证通过 45 个测试文件、512 个测试。

> 2026-07-16：发布构建不再向每个 ESM 文件注入 `globalThis.__DEV__ ??= true`。reactivity、runtime、compiler 和 core 改用不导出到上层 API 的包内 DEV 常量：源码/生产 bundle 仍可通过 `define(__DEV__=false)` 静态裁剪，未打包 ESM 则无全局写入地安全回退到开发模式。新增 `verify:dev-boundary` 扫描 99 个发布 ESM 文件、直接导入四个包并检查生产分支标记；完整验证通过 45 个测试文件、512 个测试，7 包 tarball dry-run 和不安装 compiler 的轻量消费验证通过。至此 M0 全部完成。

### M1：生命周期、DOM 引用和资源契约

- [x] 新增 `onMounted()`、`onUnmounted()` 兼容别名；保留 `onMount()`、`onUnmount()`，避免破坏现有上层 API。
- [x] 保证同步组件遵循 `setup → beforeMount → render/DOM/ref → mounted`。
- [x] 修复 async setup 提前 mounted、最终 render 缺少当前实例上下文和 template ref 无法注册的问题。
- [x] setup/render 失败不得把实例报告为成功 mounted；生命周期错误进入 `onErrorCaptured` 和 App `errorHandler`。
- [x] template ref 在分支替换、列表删除、完整卸载和重连时准确设置与置空，不持有 detached DOM。
- [x] `useResizeObserver`、`useIntersectionObserver` 等 DOM helper 支持 Element、Ref 和 getter，并可靠断开。
- [x] 明确 DOM move、完整断开、KeepAlive、重连和 App unmount 的初始化与清理次数。

验收：初始化一次、移动不误销毁、完整卸载只清理一次、重连可重新初始化、错误进入统一管线，100 次挂载/卸载后没有框架持有的残留资源。

> 2026-07-16：新增 `onMounted/onUnmounted` 并保留 `onMount/onUnmount` 完全兼容；README 改用新命名作为推荐路径。同步与异步组件现在都只在最终 DOM 和 template ref 可用后 mounted；async pending render 使用独立子 effect scope，resolve 后最终 render 会重新进入组件实例与主 effect scope，卸载后不再继续更新 detached DOM。setup/render 失败不触发 mounted，mounted/update/unmount/KeepAlive 生命周期错误统一进入 `onErrorCaptured` 和 App `errorHandler`。完整验证通过 45 个测试文件、518 个测试，7 包 tarball dry-run 与轻量消费验证通过。

> 2026-07-16：`useResizeObserver/useIntersectionObserver` 已统一支持直接 Element、普通 Ref、template ref 和响应式 getter。helper 在 `onMounted` 后才开始观察，目标切换会先断开旧 observer，迟到回调会被丢弃，组件卸载执行幂等清理；缺少浏览器 Observer API 时安全降级。新增直接目标、挂载后 ref、getter 切换、options 透传、迟到回调、卸载和能力缺失测试。完整验证通过 45 个测试文件、525 项测试，7 包 tarball dry-run 与不安装 compiler 的轻量消费验证通过。

> 2026-07-16：template ref 不再只依赖 render 期间的 current instance，分支和列表的后续更新会通过 host 找回所属组件。每个 ref 按元素身份登记并绑定创建它的 effect scope：分支替换、列表项删除和 async pending 切换时自动释放；同名列表 ref 删除当前元素后回退到仍存活元素，完整卸载则统一置空并清除登记，重连使用独立新 ref。完整验证通过 45 个测试文件、521 个测试，7 包 tarball dry-run 与轻量消费验证通过。

> 2026-07-16：补齐 DOM move、完整断开、重连、KeepAlive、LRU 淘汰、App unmount 和 100 次挂载/卸载的精确资源计数。同步 DOM move 保留同一实例与资源；完整断开只清理一次，重连重新 setup；KeepAlive 父 scope 销毁会释放活动项和非活动缓存项，LRU 淘汰会完成组件卸载，迟到 activated 微任务不再误触发。审计同时发现并修复 `effectScope.stop()` 绕过 `useEffect` cleanup 的底层问题，已排队的 pre/post effect 在 scope 停止后也不会迟到重跑。完整验证通过 45 个测试文件、531 项测试，7 包 tarball dry-run 与不安装 compiler 的轻量消费验证通过。至此 M1 全部完成。

### M2：外部工具运行在 ElfUI 内

建立独立 integration workspace，按能力而不是品牌组织测试样本：

- [x] 建立独立 external-tools integration workspace 和真实 Chromium runner，外部工具仅作为测试依赖。
- [x] 用代表性 DOM 接管工具验证 mounted/ref、事件更新、DOM move、完整卸载和重连契约。
- [x] 验证 Canvas / SVG / WebGL 工具的初始尺寸、响应式重绘、ResizeObserver 和销毁。
- [x] 验证 Overlay / Portal 工具跨 Shadow DOM 定位、事件传播和全局容器清理。
- [x] 验证原生 Observer 与 document/window 全局监听在分支切换、KeepAlive 和卸载后的解绑。
- [x] 验证 Worker / WASM / 异步初始化的取消、竞态、错误传播和终止。
- [x] 覆盖 async setup、props/state 更新、Shadow/Light DOM、`v-if`、keyed list 和 App unmount 组合场景。
- [x] 建立连续挂载/卸载压力与可重复的资源残留检测。

| 能力类别                   | 必测边界                                                 |
| -------------------------- | -------------------------------------------------------- |
| Canvas / SVG / WebGL       | 初始尺寸、重绘、ResizeObserver、销毁                     |
| DOM 接管型                 | 外部创建子树、focus、selection、更新和卸载               |
| Overlay / Portal           | Shadow DOM、定位、事件传播、全局容器清理                 |
| Observer / 全局监听        | Resize、Intersection、Mutation、document/window 监听解绑 |
| Worker / WASM / 异步初始化 | 取消、竞态、卸载后回调、错误传播和终止                   |

每类测试同步与异步初始化、props/state 更新、Shadow/Light DOM、`v-if` 切换、keyed 移动、App 卸载、断开重连、异常以及连续压力场景。代表工具只作为开发和测试依赖，不打入生产包。

> 2026-07-16：新增 `integration/external-tools` 与 `verify:external-integrations`。首个真实 Chromium fixture 使用 `lit-html` 作为 DOM 接管型代表工具，验证外部工具只在最终 DOM/template ref 就绪后初始化，事件驱动更新正常，同步 DOM move 不重复初始化或销毁，完整断开精确清理，同一 host 重连创建全新实例。测试结果为 setup 2 次、mounted 2 次、disposed 2 次；`lit-html` 仍只存在于 workspace devDependencies，不进入 ElfUI 发布依赖。完整验证继续通过 45 个测试文件、531 项测试，真实 Chromium 集成单独通过。

> 2026-07-16：Canvas fixture 使用 Chart.js 4.5.1 验证 mounted canvas ref、数据更新、`useResizeObserver` 容器尺寸同步、`destroy()`、detached canvas 引用释放和重连，计数为 created 2、resized 1、updates 1、destroyed 2。独立 SVG/WebGL fixture 验证 namespace-safe SVG 更新、WebGL shader/program/buffer 编译绘制、viewport resize、资源删除和显式 context loss，计数同样为 created 2、resized 1、updates 1、destroyed 2。runner 改用 Playwright Core 驱动本机 Chrome/Edge 并等待显式结果，消除 `--dump-dom` 对 rAF/ResizeObserver 的时序不稳定；Chart.js 与 Playwright Core 均只属于根 workspace devDependencies。完整验证通过 45 个测试文件、531 项测试，3 个真实 Chromium 外部集成场景和 7 包 publish dry-run 通过。

> 2026-07-17：Overlay / Portal fixture 使用 Floating UI DOM 1.8.0，以 Shadow DOM 内按钮为 anchor、document 级容器为 portal，验证真实坐标计算、全局 DOM 点击冒泡、由组件 host 转发的 composed 业务事件、同步 DOM move 不重建、完整卸载后 `autoUpdate()` 解绑、异步定位结果失效保护、detached overlay 监听解绑、空 portal root 删除和重连重建。两轮计数为 created 2、positioned 4、clicks 2、bridged 2、cleanups 2、destroyed 2；卸载后派发 window resize 不再产生定位回调。Floating UI 仍只属于根 workspace devDependencies，不进入 7 个发布包。完整验证通过 45 个测试文件、531 项测试、4 个真实 Chromium 外部集成场景和 7 包 publish dry-run。

> 2026-07-17：Observer fixture 在真实 Chrome 中同时使用原生 MutationObserver、ResizeObserver、IntersectionObserver、document 自定义事件和 window resize 监听。`v-if` 等价 branch 的两轮 child 均为 starts 1、stops 1、unmounted 1，断开后修改 detached target 或派发全局事件不再增加计数；KeepAlive A 在重新激活后复用同一 host，资源 starts/stops 均为 2，B 为 1，活动项与非活动缓存项在宿主卸载时都精确 unmounted 1。所有回调使用 epoch 防止 observer disconnect 后的迟到任务写入。真实 Chromium 外部集成场景增至 5 个；完整验证继续通过 45 个测试文件、531 项测试。

> 2026-07-17：Worker / WASM fixture 使用 Blob-backed Web Worker 和真实 WebAssembly `add` 模块，验证两端计算一致、慢初始化被快初始化抢占、unmount-before-ready 取消、同一 host 重连、Worker terminate、Object URL 回收和迟到消息隔离。计数为 initializations 5、ready 3、cancelled 2、workers created/terminated 5/5、WASM instances 5、computations 3、late messages 0。集成测试同时暴露并修复异步生命周期错误缺口：`onMounted(async () => ...)` 的 rejection 现在在不阻塞挂载时序的前提下进入 `onErrorCaptured` / App `errorHandler`，公共 `LifecycleHook` 类型保持兼容不变，并补充单元测试、README 和 changeset。真实 Chromium 外部集成场景增至 6 个；完整验证通过 45 个测试文件、532 项测试和 7 包 publish dry-run。

> 2026-07-17：组合 fixture 以 async setup 的 App 根组件承载 `lit-html` 外部 DOM owner，同时覆盖 Shadow/Light DOM、property/state 更新、条件分支、keyed list 和 App unmount。两次 root setup 中，正常实例 mounted 1 次并创建 7 个外部资源；pending 阶段提前 unmount 的实例 resolve 后没有 mounted 或初始化资源。keyed list 的 A/B host 在 B/A 重排和 immutable 数据替换后保持身份并刷新 item/index，新增 C 只创建一个资源；branch 精确销毁并重建一次。最终 resources created/destroyed 为 7/7、active 0、App 容器无残留，真实 Chromium 外部集成场景增至 7 个。

> 2026-07-17：压力 fixture 在真实 Chrome 中连续执行 100 轮 mount、同步 DOM move 和完整 unmount；每个实例同时持有 lit-html DOM 树、Canvas 2D context、MutationObserver、ResizeObserver、interval、document/window 监听和 document 级 portal。最终 setup/mounted/moves/unmounted 均为 100，Observer created/disconnected 200/200、listeners added/removed 200/200、portal created/removed 100/100，Canvas、interval 和外部 DOM 树同样创建/释放相等；所有 Shadow Root、容器和全局 portal 均无结构残留，延迟再次派发事件后 late callbacks 0、active resources 0。真实 Chromium 外部集成场景增至 8 个，完整验证继续通过 45 个测试文件、532 项测试；至此 M2 全部完成。

### M3：ElfUI 运行在其他框架内

建立原生、React、Vue、Svelte、Angular 最小宿主项目，共享同一套 ElfUI 测试组件和断言协议：

- [x] string、number、boolean、object、array 和 function property。
- [x] 挂载前 property、挂载后更新、attribute/property 优先级和 Boolean attribute 契约。
- [x] `CustomEvent.detail`、多参数事件、`bubbles`、`composed`、`cancelable` 和监听解绑。
- [x] 默认/命名 slot、公开方法、CSS 自定义属性、`::part`、focus 和表单关联。
- [x] 宿主条件渲染、列表复用、严格模式或等价重复挂载、宿主销毁后的资源清理。

验收：所有宿主运行相同的自动化行为断言，而不是只提供能够启动的示例。

> 2026-07-17：建立 `integration/host-frameworks`、共享 `elf-host-contract` 组件和 `verify:host-integrations` 真实 Chrome runner；浏览器 fixture 的 esbuild alias、临时页面、Chrome/Edge 定位和结果协议已抽到共享 runner，外部工具与宿主框架矩阵不再复制基础设施。原生宿主基线验证 string、number、boolean、object、array、function 六类 property，挂载前写入、挂载后替换、attribute/property 最后写入优先、Boolean attribute 六种输入、object/array JSON attribute、响应式输出和卸载。基线发现 object/array property 会被深层响应式 Proxy 改变引用身份；props storage 已改为 shallow ref，宿主对象身份保持、整体替换仍响应，并补充单元测试、双语 README 和 changeset。原生计数 setup/mounted/unmounted 为 1/1/1、响应式 render 13 次；外部工具 8 场景无回归，完整验证通过 45 个测试文件、533 项测试和 7 包 publish dry-run。该阶段只完成共享协议与 native host，M3 勾选项将在 React/Vue/Svelte/Angular 运行同一断言后验收。

> 2026-07-17：React 19.2.7 fixture 使用开发构建和 StrictMode。测试发现 React 会在连接 Custom Element 前通过 property 是否存在来选择 property/attribute 赋值，因此声明的 prop accessor 已从 `connectedCallback` 前移到构造期，同时保留“初始 attribute 先解析、pre-mount property 后覆盖”的确定性顺序和 Custom Element upgrade 前的实例自有属性值。React 六类 property、object/array/function 引用身份、mounted 更新、false Boolean、条件销毁/重建及 root unmount 均通过；React render 8 次时 ElfUI setup/mounted/unmounted 精确为 2/2/2，没有 StrictMode 重复资源。外部工具 8 场景、45 个测试文件、533 项测试和 7 包 publish dry-run 继续通过。React 依赖只属于根 workspace devDependencies，不进入 ElfUI 发布包。

> 2026-07-17：Vue 3.5.40 fixture 使用 render function、`shallowRef` 宿主状态和真实 Chrome，复用与 native/React 相同的六类 property 契约。首次挂载和整体 props 替换均保持 object、array、function 的宿主原引用，false Boolean、公开方法调用和原 Custom Element 节点复用通过；条件隐藏后 ElfUI 精确 unmounted，重新显示创建新 host，Vue App unmount 后容器无残留。Vue render 4 次时 ElfUI setup/mounted/unmounted 为 2/2/2。完整验证通过 45 个测试文件、533 项测试、8 个外部工具场景和 7 包 publish dry-run；Vue 依赖只属于根 workspace devDependencies，不进入 ElfUI 发布包。M3 勾选仍等待 Svelte、Angular 共享断言完成后统一验收。

> 2026-07-17：Svelte 5.56.6 fixture 使用真实 Svelte 编译器、客户端 `mount`/`unmount` 和 writable store，在 Chrome 中通过六类 property、object/array/function 引用身份、稳定节点更新、false Boolean、公开方法、条件 block 销毁/重建及最终宿主卸载断言；ElfUI setup/mounted/unmounted 为 2/2/2。测试同时确认 Svelte 的通用 spread 路径会把 `textValue`、`countValue` 等 camelCase 键规范化为全小写，无法作为跨框架契约；改用 Svelte 对 Custom Element 的显式 property 绑定后行为稳定。该限制记录在宿主集成说明中，不为单一宿主向 ElfUI 运行时增加特例。完整验证通过 45 个测试文件、533 项测试、8 个外部工具场景和 7 包 publish dry-run；Svelte 与 Prettier Svelte 插件只属于根 workspace devDependencies。M3 共享验收仍等待 Angular 完成。

> 2026-07-17：Angular 22.0.7 fixture 使用官方 JIT compiler、standalone component、signals、zoneless change detection、`CUSTOM_ELEMENTS_SCHEMA` 和显式 property binding，无 Angular 专用 ElfUI adapter。六类 property、object/array/function 引用身份、稳定节点更新、false Boolean、公开方法、`@if` view 销毁/重建和 `ApplicationRef.destroy()` 均通过；ElfUI setup/mounted/unmounted 为 2/2/2。至此 native、React、Vue、Svelte、Angular 五种宿主全部运行同一 property/update/remount 基线，M3 第一项正式验收完成；其余 M3 项继续按事件、slot/样式/表单、attribute 优先级和列表复用的共享断言推进。完整验证通过 45 个测试文件、533 项测试、8 个外部工具场景和 7 包 publish dry-run；Angular、RxJS、Zone.js 和 tslib 只属于根 workspace devDependencies，不进入 ElfUI 发布包。

> 2026-07-17：五宿主共享契约继续扩展为 attribute、event 和 presentation 三组独立断言。每个框架都验证挂载后 string/number attribute、Boolean attribute 六种输入和随后由宿主状态写回 property；事件覆盖单参数 detail 原引用、多参数数组、`bubbles`、`composed`、`cancelable`、`preventDefault()` 返回值、document 冒泡、detached tree 隔离及重挂无重复监听。React 等宿主可能在被外部强行保留的 detached node 上保留直接监听器，该监听器随节点由 GC 管理；验收边界是事件无法再进入应用树且新 host 只绑定一次。presentation 契约在首次挂载和重挂后验证默认/命名 slot、公开 focus 方法、CSS 自定义属性、外部 `::part` 样式、Shadow DOM 内 focus 目标，以及 form-associated Custom Element 通过 `ElementInternals` 向 `FormData` 同步初始和更新值。M3 的 attribute、event、slot/style/focus/form 三项完成，无需修改 ElfUI 公共 API；剩余 M3 项仅为宿主列表复用与资源清理的统一收口。完整验证通过 45 个测试文件、533 项测试、五宿主 15 组真实 Chrome 契约、8 个外部工具场景和 7 包 publish dry-run。

> 2026-07-17：五宿主新增共享 keyed-list 契约：初始 A/B 以 immutable 数据重排为 B/A 后两个 Custom Element 身份均保持且 property 更新，再替换为 B/C 时 B 继续复用、A 精确 unmounted 一次、只为 C 新建实例。React StrictMode 与其他宿主等价条件重挂继续覆盖重复挂载；最终 native setup/mounted/unmounted 为 4/4/4，React、Vue、Svelte、Angular 均为 5/5/5，宿主销毁后无 ElfUI 节点或活跃实例残留。五宿主当前共运行 20 组真实 Chrome 契约，M3 全部完成。完整验证通过 45 个测试文件、533 项测试、8 个外部工具场景和 7 包 publish dry-run。

### M4：SSR、注册、打包和发布边界

- [x] Node/SSR 环境可安全 import 组件包，浏览器能力可用后再创建和注册 Custom Element。
- [x] 明确 client-only、SSR markup 和 hydration 的支持等级；未支持能力必须给出清晰诊断。
- [x] 同名标签遇到不同构造器时不得静默复用，提供开发态诊断和显式 tag prefix/注册策略。
- [x] 验证多 ElfUI App、同页多运行时副本、配置/指令/依赖注入隔离。
- [x] 从真实 `pnpm pack` 产物创建消费项目，验证 ESM、类型、exports、tree shaking 及 Vite/Rollup/esbuild 消费构建。

> 2026-07-17：编译后的组件模块在无 DOM 的 Node/SSR 环境中改为返回只含定义元数据的 server placeholder，`defineCustomElement`、`defineComponent` 和 Macro 组件的模块级求值不再依赖 `HTMLElement`；构建后的独立 Node 门禁和真实 tarball consumer 均验证 import 与声明安全。DOM 创建/注册仍是 client-only：无 registry、误注册 server placeholder 和同标签不同构造器分别给出 `ELF_CUSTOM_ELEMENTS_UNAVAILABLE`、`ELF_SSR_PLACEHOLDER`、`ELF_CUSTOM_ELEMENT_CONFLICT`，同构造器重复注册保持幂等。双语 README 明确 Node import、SSR markup shell 和 hydration 的支持等级，并记录 Macro `tagPrefix`、手写 `name/tag` 前缀及 `register: false` 集中注册策略。

> 2026-07-17：同页双 App 使用相同组件构造器、配置键、provide key、指令名和插件时，配置、依赖值、指令实现和插件安装均按 App 隔离。另将 runtime 源码分别打入两个互不共享模块状态的 IIFE，在真实 Chrome 同页验证两份全局配置/指令 registry 隔离、跨副本同标签冲突，以及基于 `Symbol.for` 的跨 runtime 父子注入仍严格限制在所属组件树。发布 dry-run 现在从 7 个真实 `pnpm pack` 产物创建空白消费项目，验证 ESM/SSR 执行、严格类型、exports 私有路径拒绝和 tree shaking，并分别通过 esbuild 0.28.1、Rollup 4.62.2、Vite 8.1.5 构建与执行。完整验证通过 45 个测试文件、537 项测试、8 个外部工具场景、五宿主 20 组契约和 3 个多 runtime 副本场景；M4 全部完成，计划累计完成 57/68，剩余 11 项。

### M5：多浏览器、压力和发布门禁

- [x] 每次提交运行单元测试、编译器测试和轻量 Chromium 集成测试。
- [x] 主分支运行完整 Chromium 双向集成矩阵。
- [x] 定时运行 Chromium、Firefox、WebKit，以及挂载/卸载、重连、内存和性能压力测试。
- [x] 发布前运行真实 tarball 消费、宿主框架项目、SSR import 和资源泄漏验证。

重点检测未释放监听器、Observer、Worker、计时器、detached DOM、重复 Canvas/样式、重复 setup 和宿主卸载后继续运行的 effect。

> 2026-07-17：CI 分为三层。每个 PR 和 main 提交先运行完整 `pnpm verify`，再在真实 Chromium 中执行 native property/attribute、event、slot/style/focus/form、keyed list/resource 四组轻量契约；main push 继续运行 8 个外部工具/资源场景、五宿主 20 组契约和多 runtime 副本测试。新增每周及手动 `Browser Integration Matrix` workflow，安装 Playwright Firefox/WebKit 并运行 Chromium、Firefox、WebKit 三引擎 native 契约，再运行完整 Chrome 外部工具压力、五宿主和多副本矩阵。本机已实际通过三引擎各 4 组、合计 12 组契约，不只验证 workflow 语法。

> 2026-07-17：release workflow 在发布 tarball 前按顺序执行 core verify、外部工具与 100 轮资源压力、五宿主、多 runtime 副本和真实 `pnpm pack` consumer；因此发布门禁同时覆盖 SSR import/声明、ESM/types/exports/tree shaking、多 bundler 消费、宿主销毁和监听器/Observer/Worker/计时器/portal 等资源归零。M5 全部完成，计划累计完成 61/68，剩余 7 项进入 M6 架构、性能、体积收口及 Router/真实应用体积的仓库外验收。

### M6：架构、性能和体积收口

只有 M0-M5 建立稳定保护网后，才继续共享编译 transform/IR、拆分大型核心文件、清理重复流水线、优化生成代码和调整体积预算。体积可以阶段性放宽，但每次公共 API 或运行时能力增长仍需记录真实用户场景的 gzip 变化。

- [x] 共享 runtime compile 与离线 codegen 的表达式 transform / IR。
- [x] 按稳定职责拆分大型 compiler/runtime 核心文件。
- [x] 清理重复编译、构建和验证流水线。
- [x] 基于真实 fixture 优化生成代码、运行时热路径和内存分配。
- [x] 在集成稳定后重新校准 light/reactivity/core 的 gzip 与 brotli 预算。

> 2026-07-17：`expression.ts` 新增共享 `TemplateExpressionIR`，使用同一次 TypeScript AST 解析统一产出 `.value` helper 改写、事件 handler 引用、直接 state 写入路径和实际引用的根标识符。runtime compile、offline codegen、transition hook 和 v-model setter 不再各自用略有差异的正则分类表达式；新增 5 项 IR 单测并继续由 runtime/offline DOM 差分测试保护。scope codegen 只从 state 解构单个表达式真正使用的 setup 字段，不再让只读取 `count` 的 getter 同时读取 `increment` 等无关字段。100 组件 fixture 的 raw 从 416.37 KB 降至 412.46 KB，min 从 216.08 KB 降至 211.79 KB，Brotli 从 1.32 KB 降至 1.30 KB；100 组件 min/gzip/Brotli 和 scope facade 分配均已加入提交级硬回归阈值。

> 2026-07-17：按稳定职责拆出 compiler `runtime-expression.ts`（运行时表达式执行、错误诊断与 getter/setter/event/key 工厂）和 runtime `element-helpers.ts`（props、attribute coercion、emit、共享 stylesheet、render context 与局部组件解析）。`compile.ts` 从约 59 KB 降至 50 KB，`element.ts` 从约 36 KB 降至 29 KB，核心挂载/卸载状态机保持原位。验证命令收敛出 `verify:integrations:chromium`、`verify:publish:artifacts` 和 `verify:release`，main、定时和 release workflow 不再复制三套集成步骤，release 复用 `verify` 已生成的 dist，避免 publish smoke 前重复 build。

> 2026-07-17：修复 `size:report` 把不存在的 output 文件当输入 baseline、且 fresh checkout 未创建 output 目录的问题；新增可复现的 `size:baseline`、提交到 docs 的版本基线，以及 gzip/Brotli 双预算和双 diff。基于当前完整能力重新校准预算并保留约 3% 增长缓冲：light 13.78/12.44 KB（预算 14.2/12.8），runtime 13.87/12.57 KB（预算 14.3/13.0），reactivity 5.32/4.84 KB（预算 5.5/5.0），数值顺序均为 gzip/Brotli。M6 五项全部完成，计划累计完成 66/68；剩余 2 项是 Router 独立仓库验证和真实应用 fixture 压缩体积验收。

## 公共 API 原则

- 优先采用兼容性新增，不删除现有 `onMount/onUnmount` 等 API。
- 不为单一工具增加核心 API，不把代表工具加入生产依赖。
- Props 用于输入、Events 用于通知、Model 用于父级所有权、Slots 用于内容、Expose 只用于小型命令式能力。
- 任何模板语义调整必须有迁移诊断；不得用静默重写换取表面兼容。
- 每个里程碑完成后更新本文件的勾选状态、验证数据和剩余风险。

## 原始审计结论摘要

ElfUI 的技术方向是成立的：编译期宏、无 VDOM、细粒度 DOM 更新、原生 Custom Element 和默认 Shadow DOM 形成了清晰且有辨识度的架构。当前最值得投入的不是继续增加能力，而是先收紧运行时正确性和编译产物成本。

建议按以下顺序推进：

1. 修复 keyed list 复用后的 `item/index` 陈旧问题。
2. 把自定义指令生命周期接入组件和分支作用域，移除逐指令 `MutationObserver`。
3. 修复 Custom Element 完整卸载后重新连接产生重复 DOM 的问题。
4. 让 `onErrorCaptured` 真正沿父组件链传播，并停止静默吞掉模板表达式错误。
5. 修复 `useEffect({ flush: "post" })` 的队列语义。
6. 优化宏编译表达式的临时对象、Proxy 和重复解构成本。
7. 在正确性稳定后引入批处理、共享样式表和更贴近真实应用的体积门禁。

本次审计没有断言“除此之外没有 Bug”。现有测试基础不错，但仍缺少重连、同 key 数据替换、父子错误传播、指令释放和浏览器级压力场景。

## 当前基线

### 自动验证

- Core：38 个测试文件、419 个测试通过。
- Router：8 个测试文件、90 个测试通过。
- Core 与 Router 类型检查通过。

### 当前体积

执行 `pnpm size` 的结果：

| 目标                |      Min |     Gzip | 当前预算 |   剩余空间 |
| ------------------- | -------: | -------: | -------: | ---------: |
| `elfui` light       | 31.06 KB | 10.52 KB |  10.7 KB | 约 0.18 KB |
| `@elfui/runtime`    | 30.01 KB | 10.48 KB |  13.0 KB | 约 2.52 KB |
| `@elfui/reactivity` | 13.39 KB |  4.17 KB |   4.3 KB | 约 0.13 KB |

`elfui` 和 reactivity 已非常接近当前预算。新增 API 前应同时给出用户场景体积变化，而不只是提高预算。

## 一、已确认的正确性问题

### P0：keyed list 复用节点后，`item` 和 `index` 会陈旧

位置：`packages/runtime/src/control-flow.ts` 的 `list()`。

列表行创建时，render 闭包拿到的是当时的普通 `item` 和 `index`。同一个 key 被复用时，运行时只更新 `ListItem.item`，原 render 闭包并不会读取这个字段，也没有可触发子绑定的响应式单元。

已复现：

```text
初始数据 [{ id: 1, label: "A" }]       -> 0:A
替换为   [{ id: 1, label: "B" }]       -> 仍然是 0:A
前插一项 [{ id: 2 }, { id: 1, ... }]    -> 原行 index 仍然是 0
```

影响：

- immutable 数据更新是现代应用的常见路径，同 key 换对象时界面可能不更新。
- 排序、插入和拖拽之后，模板中使用的 index 可能错误。
- Table、Tree、Virtual List 等数据组件风险最高。

建议：

- 为每个 `ListItem` 保存稳定的响应式 `itemCell` 和 `indexCell`。
- keyed diff 复用时更新 cell，而不是只改普通字段。
- 由 compiler 为列表局部变量生成 cell 读取，避免破坏用户层模板语法。
- 先补充“同 key 换对象”“移动后 index”“fragment 多节点行”“嵌套 v-for”回归测试。
- 如果短期内无法完成 cell 方案，正确性优先：同 key 但 item 引用变化时重建该行；这会牺牲性能，但不会显示陈旧数据。

### P0：自定义指令 effect 可能泄漏，并且每个指令可能观察整棵 DOM

位置：`packages/runtime/src/directive.ts` 的 `applyCustomDirective()`。

当前实现为每个指令创建 `effectScope(true)`。这是脱离父组件的作用域：

- 没有 `beforeUnmount/unmounted` 的指令不会创建 observer，也没有其他路径停止 detached scope。
- 有卸载钩子的指令会各自创建一个 `MutationObserver`，并对所在 root 使用 `{ childList: true, subtree: true }`。

结果是：简单的 mounted/updated 指令可能在节点移除后仍被响应式依赖持有；大量指令又可能产生大量观察器和全子树扫描。

建议：

- 指令作用域默认加入当前组件、branch 或 list item 的父作用域，不使用 detached scope。
- 用 `onScopeDispose()` 调用 `beforeUnmount/unmounted` 并停止指令 effect。
- `applyCustomDirective()` 返回 disposer，编译器和控制流原语负责注册。
- 移除逐指令 `MutationObserver`；如果必须观察外部手工移动，使用 root 级共享观察器作为兼容层。
- 增加 WeakRef/GC smoke、分支切换、列表删除和组件卸载测试。

### P1：Custom Element 完整卸载后重连会重复追加渲染树

位置：`packages/runtime/src/element.ts` 的 `disconnectedCallback()` 和 `connectedCallback()`。

当前卸载会停止 scope 并把 `__mounted` 设回 `false`，但不会清理 Shadow Root 中的旧渲染节点。稍后重新连接同一个 host 时会重新执行 setup/render，并把新树追加到旧树后面。

已复现：第一次连接有 1 个根节点，移除并等待卸载微任务后再次连接，同一个 Shadow Root 中出现 2 个根节点。存在样式时也可能重复追加 stylesheet 或 `<style>`。

建议明确二选一语义：

1. **重建语义**：完整卸载时清理框架拥有的节点和 fallback style，重连时重新 setup/render。
2. **保留语义**：断开后保留实例和 scope，重连只激活，不重新 render；真正销毁需要显式入口。

现有生命周期更接近第一种，应在 unmount 时清理框架拥有的 DOM，同时保留用户写入的 light DOM 边界。增加“快速 DOM move 不卸载”和“跨 microtask 重连只存在一棵树”两类测试。

### P1：`onErrorCaptured` 没有向父组件传播

位置：`packages/runtime/src/element.ts` 的 `handleError()`。

文档约定 `onErrorCaptured()` 捕获子组件上冒的错误，但当前 `handleError()` 只遍历发生错误的当前 instance 的 `errorCapturedHooks`，没有沿 host、ShadowRoot.host 或实例父链查找父组件。

已复现：父组件注册 `onErrorCaptured()`，子组件 setup 抛错，父组件捕获数组仍为空。

建议：

- 在 `ComponentInstance` 中建立明确的 `parent` 引用，避免每次错误都重新扫描 DOM。
- 从错误组件的父 instance 开始向上调用 hook。
- hook 返回 `false` 时停止传播；否则最终进入 app-scoped `errorHandler`。
- setup、render、动态绑定、生命周期、指令、事件表达式和异步 setup 应进入同一条错误管线，并携带 `info` 和组件 tag。

### P1：模板表达式和事件错误被静默吞掉

位置：`packages/compiler/src/codegen.ts` 的 `wrapGetter()`、`wrapEvent()`、`wrapSetter()` 等。

生成代码普遍使用：

```ts
try {
  // expression
} catch (_e) {
  return undefined;
}
```

这会导致属性访问、事件处理器和 setter 中的真实业务错误既不抛出，也不进入 `onErrorCaptured` 或 app `errorHandler`。它同时增加每个动态表达式的生成代码量。

建议：

- 生产和开发都把错误转交统一的 runtime `handleError(error, info, instance)`。
- 只对明确允许缺失的解析路径使用 fallback，不要包住整个用户表达式。
- compiler 在可静态判断的缺失标识符上给出诊断，runtime 不再用静默 catch 代替诊断。
- 增加 getter、event、model setter、directive expression 四类错误传播测试。

### P1：`useEffect({ flush: "post" })` 实际进入 pre 队列

位置：`packages/reactivity/src/use-effect.ts`。

`UseEffectOptions` 声明支持 `sync/pre/post`，但非 sync 分支统一调用 `queueJob()`。最小复现中，声明为 post 的 effect 比随后加入的显式 pre job 更早执行：

```text
["effect-post", "explicit-pre"]
```

建议复用 `watch.ts` 的 `createScheduler()` 逻辑，post 分支调用 `queuePostFlushJob()`，并补充 useEffect 自身的 pre/post 相对顺序测试。

### P2：动态 style 存在合并和数值单位问题

位置：`packages/runtime/src/bindings.ts` 的 `sty()` 和 `normalizeStyle()`。

- `sty()` 会覆盖完整 `style` attribute，因此同一元素的静态 style 会丢失；`cls()` 已有静态 class 合并逻辑，style 没有对等处理。
- 所有 number 都被追加 `px`，会生成 `opacity: 1px`、`z-index: 2px`、`font-weight: 600px` 等无效值。

建议：

- 保存静态 style，与动态 style 按属性合并；动态值撤销时恢复静态值。
- 维护 unitless CSS property 集合，CSS 自定义属性保持原值。
- 优先通过 `CSSStyleDeclaration.setProperty/removeProperty` 做增量更新，避免每次重写整个 attribute。
- 添加静态 + 动态合并、unitless、CSS variable、数组 style 和属性删除测试。

> 2026-07-15 已完成：`sty()` 现在按属性维护动态声明，只写入变化项；未被动态绑定拥有的声明不会受影响，动态属性撤销时会恢复初始静态值。数值样式区分有单位与 unitless 属性，CSS 自定义属性保持原始数值，并支持字符串、对象、嵌套数组、后项覆盖及 `!important`。

### P2：Boolean attribute 的转换语义不完整

位置：`packages/runtime/src/element.ts` 的 `coerceAttr()`。

当前 Boolean 分支包含 `raw === kebab(String(opt))`。这里得到的是 prop option 对象的字符串，而不是 attribute 名，因此无法实现 `active="active"` 一类兼容语义。`active="disabled"`、`active="active"`、空字符串和字符串 `false` 的行为需要形成明确契约。

建议优先遵循 HTML Boolean attribute：attribute 存在即为 true，移除后恢复默认值。如果要兼容字符串 `"false"`，应作为明确的 ElfUI 扩展写进文档和测试，而不是隐含在转换代码中。

> 2026-07-15 已完成并保留现有兼容方向：Boolean-only prop 始终得到 boolean；属性缺失时恢复默认值，空字符串、`"true"` 和与 attribute 同名的值为 `true`，`"false"` 与其他字符串为 `false`。`coerceAttr()` 现在接收真实 attribute name，不再错误地序列化 prop option。该规则是 ElfUI 对原生 presence-only 语义的显式扩展。

### P2：失败的 `app.mount()` 会永久消耗 app 实例

位置：`packages/core/src/app.ts`。

`mountCalled = true` 在 selector 解析和目标存在性检查之前设置。第一次因为 selector 无效或容器尚未出现而失败后，再次调用会得到 `ELF_APP_ALREADY_MOUNTED`。

建议只在目标解析、组件注册和实例创建成功后提交 mounted 状态；失败路径应保持 app 可重试。

> 2026-07-15 已完成：无效 selector、目标不存在及挂载准备阶段抛错都不会永久消耗 app；成功挂载后仍保持单次挂载契约，并阻止重入或再次挂载。

## 二、性能改进

### P1：减少每个动态绑定的临时对象和 Proxy

宏编译产物目前会在 getter 执行时构造类似结构：

```ts
unwrapStateAccess({ ...ctx.props, ...ctx.state });
```

随后再解构当前组件的 scope names。一个组件有多个动态点时，每个 effect 的每次执行都会产生新对象，并为新对象创建 unwrap Proxy；`WeakMap` 缓存无法命中，因为 raw object 每次都是新的。

建议：

- 每个 render context 只创建一次稳定的 scope facade。
- getter 直接读取稳定 facade，或者让 compiler 对已知 setup/props 标识符生成直接访问。
- 只注入表达式实际引用的标识符，而不是每个表达式都解构整个组件 scope。
- 开发期保留诊断信息，生产产物移除不必要的 wrapper 和类型辅助文本。

验收指标：

- 1,000 个动态文本点更新时的临时对象数量显著下降。
- Chrome Performance/Memory 中单次更新不再按动态点创建 scope object + Proxy。
- 简单计数器宏组件的生成代码和 gzip 体积下降。

### P1：提供真正的批处理能力

编译生成的 DOM binding 使用默认 sync effect。连续修改多个 state 时会立即触发多次 DOM 写入；当前没有公开 `batch()` 或 transaction API。

实施状态：已于 2026-07-15 完成。`batch(fn)` 已从 `@elfui/reactivity` 和 `@elfui/core` 暴露；支持嵌套、异常恢复、computed 优先失效和 `flushSync()` 逃生口。编译生成的静态事件、动态事件、`v-model` 与 `v-on` 对象处理器自动进入 batch，普通手写 `addEventListener` 不改变语义。

建议：

- 在 reactivity 层增加嵌套安全的 `batch(fn)`，延迟并去重 effect 到 batch 结束。
- 在 ElfUI 编译生成的事件 handler 外层自动 batch，用户不需要手工包裹普通点击逻辑。
- 保留 `flushSync()` 作为确实需要同步观察 DOM 的逃生口。
- 不建议直接把所有 binding 改为异步 pre queue，这会改变当前同步语义；先用显式 batch 和事件边界取得收益。

验收指标：一次事件中连续写入同一状态 100 次，只执行一次对应 DOM binding；不同 binding 仍保持细粒度更新。

### P1：缓存 Constructable Stylesheet

`injectStyles()` 当前为每个组件实例、每段 CSS 新建 `CSSStyleSheet` 并 `replaceSync()`。同一组件的 1,000 个实例会重复解析相同 CSS。

实施状态：已于 2026-07-15 完成。现在按 `CSSStyleSheet` realm 与 CSS 文本缓存，跨同 realm 的组件实例共享已解析 sheet，并对不完整实现保留安全 fallback。

建议：

- 按组件 definition 或 CSS string 缓存共享 `CSSStyleSheet`。
- 每个 Shadow Root 只 adoption 已缓存的 sheet。
- fallback `<style>` 可缓存 Text node 内容，但不能跨 root 复用同一个 DOM node。
- 完整卸载/重连时避免重复 adoption。

### P2：减少 attributeChanged 的线性查找

`attributeChangedCallback()` 每次通过 `propEntries.find()` 查找 prop option。组件 props 较多、attribute 高频变化时会产生不必要的 O(n) 查找。

实施状态：已于 2026-07-15 完成。定义 Custom Element 时一次性建立 attribute Map，回调改为 O(1) 查找。

建议在组件定义阶段建立 `Map<attributeName, { propKey, option }>`，同时解决 camel/kebab 映射和 Boolean 转换需要 attributeName 的问题。

### P2：建立浏览器性能门禁

当前 benchmark 中有 jsdom 对比，它适合发现回归，但不能代表浏览器 style/layout、Custom Element reaction、Shadow DOM 和 GC 行为。

建议 CI 分层：

- 每次提交：Node/jsdom 小基准，仅检测明显回归。
- 主分支或定时任务：Playwright + Chromium 浏览器基准。
- 场景至少包含 mount/unmount、1k/10k keyed list、同 key 数据替换、表格局部更新、指令密集页面、1,000 个同类 Shadow DOM 组件。
- 使用相对 baseline 阈值，不把跨机器绝对毫秒作为硬门禁。

实施状态：场景覆盖已于 2026-07-15 完成。`.github/workflows/browser-benchmark.yml` 每周在 GitHub Actions 的 Chromium 中运行，也支持手动触发；报告写入 job summary 并保留 30 天 artifact。脚本覆盖 mount、1k/10k keyed list、swap/update、同 key 数据替换、1k cell 表格局部更新、500 个指令 mount/update、1,000 个同类 Shadow DOM 组件、批处理事件派发和 GC 后内存 smoke。每个场景包含轻量结果断言，后续只需建立同 runner 的相对 baseline 阈值。

## 三、体积改进

### P1：从“包入口总量”扩展为“用户场景体积”

当前 `check-size.mjs` 把整个入口作为 entry，可以保护整体 API 不失控，但不能回答用户实际只使用 `useRef + 一个宏组件` 时下载多少代码。

建议新增以下固定 fixture：

1. 最小宏组件：文本 + click。
2. props/emits/model 表单组件。
3. keyed list。
4. Teleport + Transition overlay。
5. core + router 的最小应用。
6. chain runtime compiler 应用。

分别记录 min、gzip、brotli，并输出相对上一个 release 的增量。PR 如果超过阈值，必须附体积解释。

### P1：优化编译产物，而不只压缩 runtime

真实应用包含大量 compiler 生成代码。当前每个表达式的 try/catch、scope spread、unwrap 和全 scope 解构会累积；每个组件还会生成空的 emits/styles/directives/components 常量与字段。

建议：

- 空 metadata 不生成，definition 中省略空字段。
- 只为实际使用的表达式生成必要标识符访问。
- 将错误处理收敛为短小 runtime helper，而不是在每个表达式复制完整 try/catch。
- 建立 100 个小组件 fixture，防止“单组件看起来很小、规模化后膨胀”。

### P2：继续维持能力分层

当前 compiler、runtime compiler/Chain、router 与 light core 的边界是正确的，应继续保持：

- 主应用入口不引入 runtime compiler。
- built-in 和高级 observer/form helper 必须可 tree-shake。
- `@elfui/runtime/internal` 只服务生成代码，不承诺用户 API 稳定性。
- 新增重能力前先评估独立 subpath 或独立包，而不是继续扩大 core 聚合入口。

不要仅为了压缩几百字节拆出大量用户可见 subpath。拆包收益必须用真实 fixture 证明，否则会增加安装和版本一致性成本。

## 四、API 易用性改进

### P1：Router 改为 app-scoped，保留全局兼容入口

Router 当前通过模块级 `activeRouter` 工作，最后创建或激活的 router 会影响 `useRouter()`、`useRoute()` 和 router elements。多个 ElfUI app、微前端、测试并行或嵌套应用会互相覆盖。

建议：

```ts
const app = createApp(App);
app.use(router);
```

Router plugin 通过 app provide 注入实例，composable 从当前组件 app context 读取；模块级 active router 只作为兼容 fallback，并在多 router 时给出开发期警告。

### P1：让宏 API 只有一条推荐路径

当前 `${...}` 和字符串表达式同时存在，`defineHtml(html`...`)` 也有两层宏概念。灵活性很强，但新用户需要理解“TS scope 表达式”和“模板局部字符串表达式”两种规则。

建议：

- 文档、脚手架和 Kit 统一以 `${...}` 为默认。
- 字符串表达式只用于 `v-for`、slot scope 等确实依赖模板局部变量的场景。
- compiler 对可改写为 `${...}` 的新代码提供 warning/code action，而不是立即删除兼容语法。
- 对缺少 Vite plugin、宏被别名调用、宏出现在不支持位置给出带修复建议的稳定诊断码。

`defineHtml(html`...`)` 是否需要简化应通过用户测试决定。它虽然略显重复，但一个负责“组件定义”、一个负责“tagged template 边界”，语义仍然清楚，不建议在 beta 阶段仅为了少写几个字符引入第三种写法。

> 2026-07-22 决策更新：真实应用验证确认直接模板字面量足以保留静态分析与类型能力。项目仍处于 beta 阶段，因此 beta.7 改为只保留 `defineHtml(\`...\`)`、`defineStyle(\`...\`)`，并删除 `html`、`css` 旧入口及编译器兼容分支。此处保留原审计结论作为决策历史。

### P1：减少 props 类型与 runtime option 重复

常见组件同时维护 TypeScript Props 类型和 runtime converter/default，容易产生不一致。编译器已经拥有 TypeScript AST，可以逐步支持：

- type-only props 自动推断 String/Number/Boolean/Array/Object 的基础 converter；
- defaults 单独声明并反推 optional/required；
- 无法可靠推断的联合类型要求显式 runtime option，并给出诊断。

不要为了“自动”猜测复杂类型。推断必须可解释，并允许查看生成 metadata。

> 2026-07-15 已完成第一阶段：无参数 `defineProps<Props>()` 可以解析同文件 type literal、interface、继承和 intersection，为 String/Number/Boolean/Array/Object/Function 及同类型字面量联合生成 converter，并从 `?` 生成 optional option。导入类型、泛型和混合联合不做猜测，通过 `ELF_MACRO_PROPS_RUNTIME_TYPE` / `ELF_MACRO_PROP_RUNTIME_TYPE` warning 引导显式声明。`MacroExportedComponentMetadata.runtimePropOptions` 会暴露最终 option 源码，供 language-tools 和诊断界面展示。

### P2：明确 CustomEvent 契约

当前单参数 emit 直接作为 `detail`，多参数变为数组；CustomEvent 默认不 bubbles、不可 cancel，也不 composed。建议把以下内容写成稳定契约并由类型表达：

- payload shape；
- `bubbles/composed/cancelable` 默认值；
- 是否允许按 event 配置；
- `emit()` 是否返回 `dispatchEvent()` 的布尔结果。

UI Kit 组件应继续以 typed emits 为主，只有确有 DOM 事件传播需求的事件才开启 bubbles/composed，避免全局事件意外穿透 Shadow DOM。

> 2026-07-15 已完成第一阶段稳定契约：单参数 detail 直接透传，多参数使用数组；传播选项默认全部为 `false`。`EmitOptions` 可设置组件级 `bubbles/composed/cancelable`，也可通过 `events` 按事件覆盖；`emit()` 返回 `dispatchEvent()` 的 boolean，取消结果可由调用方处理。默认行为与既有组件保持兼容。

### P2：统一错误和警告的开发体验

为 runtime/compiler/router 建立稳定错误码、组件 tag、源文件和模板 location。开发期错误应能从浏览器跳回源码；生产错误可压缩为 code + 文档链接。当前部分错误只 `console.error`，部分静默吞掉，部分进入 app handler，心智不统一。

## 五、建议的实施批次

### M1：正确性止血

- [x] 修复 list item/index 陈旧。
- [x] 修复 directive scope 泄漏并移除逐实例 observer。
- [x] 修复完整卸载后的重连。
- [x] 修复父子 setup/render 错误传播。
- [x] 修复 useEffect post 队列。
- [x] 为以上问题添加回归测试。

完成标准：不新增公开 API；Core 全量测试、类型检查、API/CSP boundary 全部通过。

> 2026-07-15：M1 已完成。Core 40 个测试文件、438 项测试通过；typecheck、build、lint、format、spellcheck、public API、API boundary 和 CSP boundary 均通过。当前工作区的合并体积为 light 11.00 KB / 10.7 KB、reactivity 4.35 KB / 4.3 KB，体积门禁尚未通过，转入后续体积优化批次处理。

### M2：编译产物与错误管线

- [x] 建立统一 runtime error helper。
- [x] compiler 不再静默吞错。
- [x] 复用稳定 scope facade，减少 spread/Proxy/全量解构。
- [x] 添加 1、10、100 组件的生成代码体积 fixture。

完成标准：简单宏组件生成代码、100 组件 gzip 和动态点更新分配量均有可复现下降。

> 2026-07-15：M2 的正确性与热路径部分已完成。setup/render、宏编译 getter/event/model setter/transition/key、自定义指令钩子和 runtime compiler 表达式现在进入同一组件错误链，并能由父组件 `onErrorCaptured` 截获；未截获的 runtime compiler 错误仍保留带模板位置的结构化诊断。
>
> 模板根作用域改为 `setup > props > system` 的实时分层代理，修复了 `ctx.state` 中 props 快照陈旧的问题。宏产物不再为每个动态 binding 执行 `{ ...ctx.props, ...ctx.state }`；列表、TransitionGroup、slot 和 Suspense 局部变量通过 `extendRenderState()` 分层，不再复制完整父 state。runtime compiler 会缓存 unwrap 后的 context，`v-for :key` / TransitionGroup key 的 `new Function` 也从“每个 item 每次执行一次”收敛为“每个 binding 编译一次”。
>
> 当前发布级验证覆盖 44 个测试文件、483 项测试，并通过 dist/public API/API/CSP boundary、lint、spellcheck、typecheck、build、生成代码分配检查、模板类型检查、light install smoke 和七包 publish dry-run。`@elfui/runtime/internal` 快照已同步新增错误与 scope helper。现有 list benchmark：1k create/update/swap 为 25.66/5.35/6.39 ms，10k 为 107.52/22.58/23.60 ms；这些是当前机器上的观测值，不作为跨机器硬阈值。
>
> `pnpm benchmark:generated` 已加入 1/10/100 组件观测，并在 `pnpm verify` 中用轻量 check 模式守住 scope 分配不回退。当前生成代码 gzip 为 0.83/1.08/3.00 KB，brotli 为 0.71/0.80/1.32 KB；10 万次根 binding 读取复用 1 个 facade，1,000 个列表局部作用域在 10,000 次 binding 读取中只产生 1,000 个 facade。该数据是后续优化基线，不作为跨版本兼容承诺。
>
> 体积按本轮取舍暂不阻塞：light gzip 11.55 KB / 10.7 KB，runtime 11.38 KB / 13.0 KB，reactivity 4.49 KB / 4.3 KB。CustomEvent 可配置传播增加约 0.06 KB gzip；体积集中到后续批次优化。

### M3：运行时性能

- [x] 引入 batch，并在编译事件边界自动使用。
- [x] 缓存 Constructable Stylesheet。
- [x] 优化 attribute option lookup。
- [x] 完成 style 增量更新。
- [x] 把浏览器 benchmark 加入定时 CI。

> 2026-07-15：Custom Element 定义阶段建立 attribute → prop option Map，`attributeChangedCallback()` 从每次 O(n) 查找改为 O(1)，同时修复下划线 prop key 无法由 kebab attribute 反推的问题。Constructable Stylesheet 按浏览器 realm 和 CSS 文本缓存，同一组件的多个 Shadow Root 共享已解析 stylesheet；接口不可用或 adoption 失败时继续使用 `<style>` fallback。
>
> `batch()` 在 effect 触发层对 computed 与普通订阅者分别去重，computed 先失效再刷新下游；嵌套 batch 只在最外层 flush，回调抛错也会恢复深度并提交已经发生的写入。编译事件通过 runtime `on()` / `onObject()` 自动使用该边界，动态事件仍保留精确 disposer。
>
> `sty()` 已改为基于 `CSSStyleDeclaration` 的声明级 diff；静态声明会被保留并在动态覆盖撤销后恢复，尺寸数值继续补 `px`，opacity、z-index、line-height 等 unitless 属性和 CSS 变量不补单位。
>
> Chromium benchmark 已接入每周定时和手动 GitHub Actions，结果同时进入 job summary 与 30 天 artifact。脚本此前把 list render 的 `Ref<T>` 当普通 item 读取，虽能计时但没有渲染有效文本，因此旧浏览器数值作废。本轮修正并重建有效基线：hello mount 300 为 1.90 ms；list create 1k/10k 为 10.30/130.00 ms，swap/update/same-key 1k 为 14.40/12.90/19.90 ms；1k-cell table partial update 为 1.90 ms；500 directive mount/update 为 1.90 ms；1k Shadow components 为 27.10 ms；1k batched event dispatch 为 4.10 ms。绝对值只作本机基线。

### M4：API 收敛

- Router app plugin/injection。
- props 基础类型推断。
- CustomEvent 契约。
- 诊断码和 code action。

API 改动应配 changeset、迁移文档和 language-tools 元数据同步。

> 2026-07-15：CustomEvent 默认值、detail shape、可选传播配置和取消返回值已完成，并同步公开类型、宏类型、文档及 changeset。Router 不在当前 workspace，app-scoped router 需要在 Router 仓库单独推进。
>
> type-only props 基础 converter 推断与 runtime metadata 已完成；复杂类型继续要求显式 option，不改变已有 `defineProps<Props>({ ... })` 用法。

## 六、发布前验收清单

- [x] 同 key 替换 item 后 DOM 更新。
- [x] 列表移动后 index 正确。
- [x] 分支/列表/组件卸载后 directive effect 释放。
- [x] 一个 root 中不会为每个 directive 创建 subtree observer。
- [x] 完整卸载后重连只有一棵渲染树和一份样式。
- [x] 父组件能捕获子组件 setup/render 错误。
- [x] 父组件能捕获子组件指令和事件表达式错误。
- [x] 模板 getter、setter、key、transition 和事件错误进入统一 handler，不再静默丢失。
- [x] `useEffect` 的 pre/post 顺序有独立测试。
- [x] static + dynamic style 正确合并，unitless number 正确。
- [x] mount 失败后可以重试。
- [x] Core/Router 测试、typecheck、public API、CSP、publish smoke 通过。
- [x] 真实应用 fixture 的 gzip/brotli 没有未解释回归。
- [x] Chromium 下的 mount/list/table/directive/Shadow DOM 基准已建立有效基线且无明显异常。

> 2026-07-17：新增 `integration/size-fixture/app-entry.ts`，只通过 `@elfui/core` 公开 API 组合 App、组件、props、ref、computed、effect 和 mounted/unmounted 生命周期，并作为真实 tree-shaken 消费入口进入统一 size baseline。当前产物 raw 70.24 KB、min 27.12 KB、gzip 9.50 KB、Brotli 8.57 KB，预算为 9.8/8.9 KB；与 light/runtime/reactivity 一样具有版本化基线和压缩 diff，不再只测整个包入口。

> 2026-07-17：对同级独立 `elfui-router` v0.1.0-beta.3 仓库执行只读发布验收：build、typecheck、8 个测试文件和 90 项测试全部通过；源码与 dist CSP 扫描未发现动态 eval，公开入口与声明完成审计，`pnpm pack` 产物包含 ESM、类型、source map、LICENSE、README 和 package exports 对应文件。Core 最终完整验证通过 46 个测试文件、542 项测试、102 个生产 ESM DEV 裁剪、API/CSP/SSR/生成代码门禁；外部工具 8 场景、五宿主 20 组、多 runtime 3 场景、三浏览器 12 组契约、7 包 tarball 多 bundler 消费和四目标 gzip/Brotli 门禁全部通过。至此本计划 68/68 项完成。

## 取舍原则

1. 正确性高于节点复用率和极限微基准。
2. 优先降低每个动态点、每个组件实例都会支付的成本。
3. 编译器能解决的问题尽量不推给 runtime。
4. 不用静默 catch 掩盖编译诊断或用户代码错误。
5. 主入口保持轻量，重能力继续留在 router、Chain 或可 tree-shake 模块。
6. 新 API 必须同时更新类型、compiler metadata、language tools、文档、测试和 size fixture。

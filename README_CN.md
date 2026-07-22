<p align="center">
  <img src="https://raw.githubusercontent.com/bloom-lmh/elfui/main/assets/elfui-snowflake.png" width="156" alt="ElfUI 雪花标志">
</p>

<h1 align="center">ElfUI</h1>

<p align="center">一款面向原生 Web Components 的编译时细粒度响应式框架。</p>

<p align="center">
  <a href="https://elfui-2igtsk.maozi.io/">中文官网</a> ·
  <a href="https://elfui-docs.vercel.app/en/">English Docs</a> ·
  <a href="https://github.com/bloom-lmh/elfui">GitHub</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@elfui/core"><img src="https://img.shields.io/npm/v/%40elfui/core/beta?label=%40elfui%2Fcore&color=16803c" alt="npm beta"></a>
  <a href="https://developer.mozilla.org/docs/Web/API/Web_components"><img src="https://img.shields.io/badge/platform-Web%20Components-0d8fda" alt="Web Components"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/language-TypeScript-3178c6" alt="TypeScript"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-8a8a8a" alt="MIT License"></a>
</p>

ElfUI 使用普通 TypeScript 文件定义组件，将模板编译为直接 DOM 更新，并输出标准 Custom Elements。它借鉴 Vue 的模板与组合式开发体验、Solid 的细粒度更新思路，以及 Lit 对 Web Components 平台的尊重。

> TypeScript in, Custom Elements out.

## 🧭 环境要求

| 工具    | 版本                      |
| ------- | ------------------------- |
| Node.js | `^20.19.0` 或 `>=22.12.0` |
| pnpm    | `>=10.28.0`（推荐）       |

也可以使用 npm、Yarn 或 Bun。本文示例统一使用 pnpm。

## 🚀 快速开始

推荐使用官方脚手架创建项目并安装依赖：

```bash
pnpm create elfui@beta my-app --install
cd my-app
pnpm dev
```

脚手架会进入交互模式，可选择 TypeScript、Macro 组件、样式方案、Router、测试、代码规范与 CI。需要直接采用推荐配置时：

```bash
pnpm create elfui@beta my-app --default --install
```

建议安装 [ElfUI Language Tools](https://marketplace.visualstudio.com/items?itemName=SWUST-WEBLAB-LMH.elfui-language-features)，获得模板高亮、补全、诊断、跳转与格式化支持。

## 🗂️ 仓库结构（Monorepo）

本仓库使用 pnpm workspace，主要目录如下：

| 路径                                                       | 说明                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| [`packages/core`](packages/core)                           | 用户主入口（`@elfui/core`）                             |
| [`packages/reactivity`](packages/reactivity)               | 细粒度响应式系统（`@elfui/reactivity`）                 |
| [`packages/runtime`](packages/runtime)                     | 组件运行时与 Web Components helpers（`@elfui/runtime`） |
| [`packages/compiler-template`](packages/compiler-template) | HTML 模板解析器（`@elfui/compiler-template`）           |
| [`packages/compiler`](packages/compiler)                   | Macro 组件编译器（`@elfui/compiler`）                   |
| [`packages/vite-plugin`](packages/vite-plugin)             | Vite 编译集成（`@elfui/vite-plugin`）                   |
| [`packages/shared`](packages/shared)                       | 内部共享工具（`@elfui/shared`）                         |

## ✨ 特性

- **TS 文件组件**：不需要 `.vue` 文件，也不强制使用 JSX。
- **编译期模板**：构建时分析模板、生成诊断并输出直接 DOM 操作。
- **细粒度响应式**：每个动态点只订阅自己读取的状态。
- **无 VNode / patch**：状态变化直接更新对应 DOM，不运行虚拟 DOM diff。
- **标准 Web Components**：输出 Custom Elements，可用于原生页面或其他框架。
- **Shadow DOM 边界**：组件内部可隔离，并通过 CSS 变量与 `::part()` 开放样式入口。
- **完整组件能力**：Props、Emits、Model、Slots、生命周期、指令、插件和内置组件。
- **独立生态包**：Router、UI Kit、Language Tools 与 Chain 扩展按需安装。

## 📦 安装

新项目优先使用脚手架。已有 Vite 项目可以手动安装：

```bash
pnpm add @elfui/core@beta
pnpm add -D @elfui/vite-plugin@beta
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { elfuiMacroPlugin } from "@elfui/vite-plugin";

export default defineConfig({
  plugins: [elfuiMacroPlugin()]
});
```

Router 是独立包，需要单独安装：

```bash
pnpm add @elfui/router@beta
```

## 🧩 第一个组件

```ts
// Counter.ts
import { defineHtml, defineStyle, useRef } from "@elfui/core";

defineStyle(`
  :host {
    display: inline-block;
  }

  button {
    padding: 8px 12px;
  }
`);

const count = useRef(0);
const increment = (): void => count.set(count.peek() + 1);

export default defineHtml(` <button @click=${increment}>点击了 ${count} 次</button> `);
```

使用 `createApp` 注册并挂载根组件，不需要在 `index.html` 手写自定义元素标签：

```ts
// main.ts
import { createApp } from "@elfui/core";
import Counter from "./Counter";

createApp(Counter).mount("#app");
```

## 🏗️ 组件结构

一个 Macro 组件由普通 TypeScript 顶层逻辑和一个导出的 `defineHtml(\`...\`)` 组成：

| API               | 用途                                |
| ----------------- | ----------------------------------- |
| `defineProps()`   | 声明外部属性与类型                  |
| `defineEmits()`   | 声明组件事件                        |
| `defineModel()`   | 声明 `v-model` 双向绑定             |
| `defineSlots()`   | 声明插槽契约                        |
| `defineOptions()` | 配置 Shadow DOM、表单控件等组件选项 |
| `defineStyle()`   | 声明组件样式                        |
| `defineExpose()`  | 向父组件暴露实例方法                |
| `useComponents()` | 注册当前模板依赖的局部组件          |
| `defineHtml()`    | 定义并导出组件模板                  |

```ts
import {
  defineEmits,
  defineHtml,
  defineModel,
  defineOptions,
  defineProps,
  defineSlots
} from "@elfui/core";

const props = defineProps<{ label: string }>();
const emit = defineEmits<{ save: [value: string] }>();
const value = defineModel<string>({ default: "" });

defineSlots<{ default: () => unknown }>();
defineOptions({ shadow: "open" });

export const SaveField = defineHtml(`
  <label>${props.label}</label>
  <input .value=${value} />
  <button @click=${() => emit("save", value.value)}>保存</button>
  <slot></slot>
`);
```

## ⚡ 响应式

`useRef` 用于基本类型或需要整体替换的值，`useReactive` 用于对象、数组与集合：

```ts
import { batch, useComputed, useEffect, useReactive, useRef } from "@elfui/core";

const count = useRef(1);
const user = useReactive({ name: "Elf", online: true });
const doubled = useComputed(() => count.value * 2);

useEffect(() => {
  document.title = `${user.name}: ${doubled.value}`;
});

batch(() => {
  count.value++;
  user.online = false;
});
```

`batch()` 会把同步写入延迟并去重到最外层 batch 结束；编译生成的模板事件会自动建立同样的批处理边界。

| API             | 用途                                          |
| --------------- | --------------------------------------------- |
| `useRef()`      | 创建带 `.value`、`.set()` 与 `.peek()` 的 Ref |
| `useReactive()` | 创建深度响应式对象、数组、Map 或 Set          |
| `useComputed()` | 创建惰性派生状态                              |
| `useEffect()`   | 自动收集依赖并执行副作用与清理函数            |
| `watch()`       | 精确监听数据源并取得新旧值                    |
| `batch()`       | 把多次同步写入合并为一次 effect 通知          |

## 🔄 组件生命周期

```ts
import { onMounted, onUnmounted } from "@elfui/core";

onMounted(() => {
  console.log("组件已挂载");
});

onUnmounted(() => {
  console.log("组件已卸载");
});
```

| 阶段     | Hooks                            |
| -------- | -------------------------------- |
| 挂载前后 | `onBeforeMount`、`onMounted`     |
| 更新前后 | `onBeforeUpdate`、`onUpdated`    |
| 卸载前后 | `onBeforeUnmount`、`onUnmounted` |
| 属性变化 | `onAttributeChanged`             |
| 缓存激活 | `onActivated`、`onDeactivated`   |
| 错误捕获 | `onErrorCaptured`                |

## 🔌 外部工具集成

接管 DOM 的工具应在 template ref 就绪后初始化，Observer 直接监听 ref，并在卸载时释放。ECharts 这里只是集成示例，不会打包进 ElfUI：

```ts
import { defineHtml, onMounted, useResizeObserver, useTemplateRef } from "@elfui/core";
import * as echarts from "echarts";

const chartRoot = useTemplateRef<HTMLDivElement>("chart");
let chart: echarts.ECharts | undefined;

onMounted(() => {
  chart = echarts.init(chartRoot.value!);
  chart.setOption({ series: [{ type: "bar", data: [3, 7, 5] }] });
  return () => {
    chart?.dispose();
    chart = undefined;
  };
});

useResizeObserver(chartRoot, () => chart?.resize());

export const ChartPanel = defineHtml(`<div ref="chart" style="height: 240px"></div>`);
```

## 🎨 样式

可以直接传入模板字符串，也可以像脚手架生成的项目一样组合导入的独立样式字符串：

```ts
import { defineStyle } from "@elfui/core";
import styles from "./Button.scss?inline";

defineStyle(`:host { display: block; }`, styles);
```

beta.7 已删除 `html`、`css` tagged-template helper。内联模板字符串应直接传给 `defineHtml()` 和 `defineStyle()`。

Shadow DOM 隔离组件内部样式。组件可以使用 CSS 自定义属性接收主题值，并通过 `part` 开放可控的外部样式入口：

```ts
export const Button = defineHtml(` <button part="control"><slot></slot></button> `);
```

```css
elf-button {
  --button-color: #16803c;
}

elf-button::part(control) {
  font-weight: 600;
}
```

`:class=${...}` 支持字符串、数组和对象，`:style=${...}` 支持样式对象与 CSS 变量。

## 🧷 插槽 Slot

ElfUI 基于标准 Web Components 插槽模型，支持默认插槽与具名插槽：

```ts
export const Panel = defineHtml(`
  <header><slot name="title"></slot></header>
  <section><slot></slot></section>
`);
```

```html
<elf-panel>
  <h2 slot="title">标题</h2>
  <p>默认插槽内容</p>
</elf-panel>
```

需要由父组件消费子组件数据时，可使用 `defineSlots()` 与 `useScopedSlot()` 声明和读取作用域插槽。

## 📝 模板表达式

ElfUI 模板里有三种值来源：

| 值来源                 | 写法        | 示例                           |
| ---------------------- | ----------- | ------------------------------ |
| 静态 HTML              | 普通字符串  | `class="panel"`                |
| 外层 TypeScript 作用域 | `${...}`    | `${count}`、`@click=${save}`   |
| 模板局部作用域         | `{{ ... }}` | `v-for` 中的 `{{ item.name }}` |

```ts
const open = useRef(true);
const items = useReactive([
  { id: 1, name: "Macro" },
  { id: 2, name: "Web Components" }
]);

export const FeatureList = defineHtml(`
  <button @click=${() => open.set(!open.peek())}>切换</button>
  <ul v-if=${open} :class=${{ active: open }}>
    <li v-for="item in items" :key="item.id">{{ item.name }}</li>
  </ul>
`);
```

`${...}` 消费 TypeScript 文件中的值；`{{ ... }}` 只用于 `v-for` 和作用域插槽等由编译器创建的局部变量。

## 🪄 指令

| 指令                            | 用途                   |
| ------------------------------- | ---------------------- |
| `v-if` / `v-else-if` / `v-else` | 创建或移除条件分支     |
| `v-for`                         | 渲染带 key 的列表      |
| `v-show`                        | 切换显示状态但保留 DOM |
| `v-model`                       | 绑定表单值或组件 Model |
| `v-once`                        | 只渲染一次             |
| `v-memo`                        | 按依赖缓存模板区域     |

局部自定义指令使用 `defineDirective()`，应用级指令使用 `app.directive()` 注册。

beta.8 的公开 API 统一保留 `onMounted`、`onUnmounted`、`useComputed`、`useEffect`、`watch`、`theme`、`defineDirective` 和 `app.directive`；旧的 `onMount`、`onUnmount`、`computed`、`watchEffect`、`watchPostEffect`、`watchSyncEffect`、`useTheme` 与进程级 `directive()` 导出已删除。

## 🔔 事件

原生事件使用 `@事件名=${handler}`：

```ts
const submit = (event: SubmitEvent): void => {
  event.preventDefault();
};

export const Form = defineHtml(`
  <form @submit=${submit}>
    <button type="submit">提交</button>
  </form>
`);
```

模板支持 `.stop`、`.prevent`、`.once`、`.capture`、`.passive` 等事件修饰符。组件事件使用 `defineEmits()` 声明，最终以标准 Custom Event 对外派发。单参数直接作为 `detail`，多参数组成数组；默认 `bubbles`、`composed` 和 `cancelable` 都是 `false`。

需要让特定组件事件穿过 Shadow DOM 并允许取消时，可以通过 `defineOptions()` 配置；`emit()` 返回 `dispatchEvent()` 的布尔结果：

```ts
defineOptions({
  emitOptions: {
    events: {
      save: { bubbles: true, composed: true, cancelable: true }
    }
  }
});

const accepted = emit("save", value);
```

只有确实需要 DOM 传播的事件才建议开启 `bubbles/composed`，避免组件内部事件意外穿透边界。

## 🚦 应用

`createApp()` 创建彼此隔离的应用实例。每个实例拥有独立的配置、插件、全局组件、指令和依赖注入上下文：

```ts
import { createApp } from "@elfui/core";
import App from "./App";
import { Button } from "./Button";

const app = createApp(App, { title: "ElfUI" });

app.component(Button);
app.directive("focus", {
  mounted: (element) => (element as HTMLElement).focus()
});
app.provide("apiBase", "/api");
app.config.errorHandler = (error) => console.error(error);
app.mount("#app");
```

同一页面可以创建多个 App；每个 App 只能成功挂载一次，并可通过 `app.unmount()` 卸载。无效 selector、目标容器尚不存在或挂载准备失败时，可以修正原因后在同一 App 上重试 `mount()`。

## 🧱 内置组件

| 能力                             | 用途                               |
| -------------------------------- | ---------------------------------- |
| `Teleport`                       | 将弹层内容渲染到组件树外的目标节点 |
| `Transition` / `TransitionGroup` | 处理元素和列表的进入、离开动画     |
| `KeepAlive`                      | 缓存暂时离开的组件实例             |
| `Suspense`                       | 管理异步内容、fallback 与错误边界  |

## 🧬 组合式函数

| 能力                               | 用途                                   |
| ---------------------------------- | -------------------------------------- |
| `useTemplateRef()`                 | 类型化访问模板元素或组件实例           |
| `useHostAttr()` / `useHostClass()` | 将响应式状态反射到 Custom Element Host |
| `useExtend()` / `useVariant()`     | 扩展基础组件或创建组件变体             |
| `useFormControlContext()`          | 编写可参与原生表单的组件               |

完整说明与示例请查看[中文官网](https://elfui-2igtsk.maozi.io/)或[英文官网](https://elfui-docs.vercel.app/en/)。

## 📐 标准组件模式

建议组件目录保持简单：

```text
Button/
├─ index.ts
├─ style.scss
└─ types.ts       # 仅在公共类型较多时创建
```

推荐顺序：

1. 导入依赖与样式。
2. 使用 `defineProps`、`defineEmits`、`defineModel` 声明组件契约。
3. 创建响应式状态、计算属性与事件函数。
4. 注册生命周期、Host helpers 和局部组件。
5. 最后导出 `defineHtml(\`...\`)`。

## 🌐 浏览器支持

ElfUI 输出 ES2022 和标准 Custom Elements，需要浏览器支持：

- Custom Elements v1
- Shadow DOM v1
- ES Modules 与 ES2022

建议使用当前仍受支持的 Chrome、Edge、Firefox 与 Safari。更旧的浏览器需要由应用构建工具降级语法并按需提供 Web Components polyfill。

## 🌱 生态

| 项目                                                                     | 说明                         |
| ------------------------------------------------------------------------ | ---------------------------- |
| [`@elfui/core`](https://www.npmjs.com/package/@elfui/core)               | Macro 组件、响应式与应用 API |
| [`@elfui/vite-plugin`](https://www.npmjs.com/package/@elfui/vite-plugin) | Macro 组件编译与模板诊断     |
| [ElfUI Router](https://github.com/bloom-lmh/elfui-router)                | 独立路由包                   |
| [Create ElfUI](https://github.com/bloom-lmh/create-elfui)                | 官方项目与组件脚手架         |
| [ElfUI Kit](https://github.com/bloom-lmh/elfui-kit)                      | 官方 UI 组件库               |
| [Language Tools](https://github.com/bloom-lmh/elfui-language-tools)      | VS Code 插件与语言服务器     |
| [Extensions](https://github.com/bloom-lmh/elfui-extensions)              | Chain 等可选扩展             |
| [Documentation](https://github.com/bloom-lmh/elfui-docs)                 | 指南、API 与生态文档         |

Macro + Vite 是当前推荐主线。Chain 是独立扩展，适合运行时模板、渐进式接入与无构建场景。

## 🛠️ 本地开发

```bash
pnpm install
pnpm verify
pnpm verify:publish
```

`pnpm verify` 会执行边界检查、格式化检查、Lint、类型检查、构建、单元测试和模板类型检查。`pnpm verify:publish` 会从真实 npm tarball 创建临时消费项目，并验证 ESM、SSR import、类型、exports、tree shaking 以及 esbuild、Rollup、Vite 构建。

## 🤝 参与贡献

欢迎提交 Issue 与 Pull Request。提交前请运行 `pnpm verify`，并使用 Conventional Commits 格式编写提交信息。

## 📄 License

[MIT](./LICENSE) © ElfUI contributors

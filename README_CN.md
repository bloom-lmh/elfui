# ElfUI

[![npm beta](https://img.shields.io/npm/v/%40elfui/core/beta?label=%40elfui%2Fcore&color=16803c)](https://www.npmjs.com/package/@elfui/core)
[![Web Components](https://img.shields.io/badge/platform-Web%20Components-0d8fda)](https://developer.mozilla.org/docs/Web/API/Web_components)
[![TypeScript](https://img.shields.io/badge/language-TypeScript-3178c6)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-8a8a8a)](./LICENSE)

一款面向原生 Web Components 的编译时细粒度响应式组件框架，专为组件而生。

[中文文档](https://elfui-2igtsk.maozi.io/) · [English docs](https://elfui-docs.vercel.app/en/) · [GitHub](https://github.com/bloom-lmh/elfui)

## 为什么是 ElfUI

ElfUI 借鉴 Vue 熟悉的模板与组合式心智、Solid 的细粒度更新、Lit 对 Web Components 平台的尊重，但并不试图替代它们。它是在原生组件模型处于中心时，对现代组件开发的一种解法。

| 选择                    | 带来的结果                                     |
| ----------------------- | ---------------------------------------------- |
| `.ts` / `.tsx` 组件     | 不需要 `.vue` 文件，也不强制 JSX。             |
| 编译期模板              | 构建时获得诊断，Macro 组件更适合严格 CSP。     |
| 无 VNode、无 patch 循环 | 动态点直接更新 DOM。                           |
| 细粒度响应式            | 状态变化只唤醒真正读取它的绑定。               |
| 标准 Custom Elements    | 组件可进入 ElfUI、旧页面或其他框架。           |
| 可选 runtime compiler   | Macro 是主线，Chain 以扩展方式保留运行时模板。 |

## 快速开始

官方脚手架是推荐入口。它会创建 Vite 项目，并可按需加入 Router、Vitest、ESLint、Prettier 和样式方案。

```bash
pnpm create elfui@beta my-app --install
cd my-app
pnpm dev
```

已有 Vite 项目也可以手动接入：

```bash
pnpm add @elfui/core
pnpm add -D @elfui/vite-plugin
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { elfuiMacroPlugin } from "@elfui/vite-plugin";

export default defineConfig({ plugins: [elfuiMacroPlugin()] });
```

## TS 文件组件

导出的 `defineHtml(html\`...\`)` 就是组件。文件顶层的 TypeScript 是 setup 逻辑，编译器会把模板变成直接 DOM 绑定。

```ts
import {
  defineEmits,
  defineHtml,
  defineModel,
  defineOptions,
  defineProps,
  defineSlots,
  html
} from "@elfui/core";

const props = defineProps<{ label: string }>(); // 类型化输入
const emit = defineEmits<{ save: [] }>(); // 类型化 Custom Event
const value = defineModel<string>({ default: "" }); // v-model 契约
defineSlots<{ default: () => unknown }>(); // 插槽契约
defineOptions({ shadow: "open" }); // 组件选项
// 有局部组件依赖时，在这里写 useComponents(Child)。

export const SaveField = defineHtml(html`
  <input .value=${value} />
  <button @click=${() => emit("save")}>${props.label}</button>
`);
```

根组件不必在 `index.html` 手写标签：

```ts
import { createApp } from "@elfui/core";
import App from "./App";

createApp(App).mount("#app");
```

## 模板与指令

| 值来自哪里      | 写法        | 示例                           |
| --------------- | ----------- | ------------------------------ |
| 静态 HTML       | 字符串      | `class="panel"`                |
| 外层 TypeScript | `${...}`    | `${count}`、`@click=${save}`   |
| 模板局部作用域  | `{{ ... }}` | `v-for` 中的 `{{ item.name }}` |

```ts
import { defineHtml, html, useReactive, useRef } from "@elfui/core";

const open = useRef(true);
const items = useReactive([{ id: "elf", name: "ElfUI" }]);

export const Menu = defineHtml(html`
  <button @click=${() => open.set(!open.peek())}>切换</button>
  <ul v-if=${open}>
    <li v-for="item in items" :key="item.id">{{ item.name }}</li>
  </ul>
`);
```

TypeScript 拥有的值使用 `${...}`；只有编译器创造局部模板作用域时，例如 `v-for` 和作用域插槽，才使用 `{{ ... }}`。

| 内置指令          | 用途                            |
| ----------------- | ------------------------------- |
| `v-if` / `v-else` | 创建或移除分支                  |
| `v-for`           | 渲染带 key 的列表               |
| `v-show`          | 切换显示但不卸载                |
| `v-model`         | 绑定表单与组件值                |
| 事件修饰符        | `.stop`、`.prevent`、`.once` 等 |

`defineDirective()` 注册组件局部 DOM 行为，`app.directive()` 注册当前应用的全局指令。

## 响应式与生命周期

| 需求           | API                             |
| -------------- | ------------------------------- |
| 基本类型状态   | `useRef()`                      |
| 对象或数组状态 | `useReactive()`                 |
| 派生状态       | `useComputed()`                 |
| 自动副作用     | `useEffect()` / `watchEffect()` |

```ts
import { useComputed, useEffect, useRef } from "@elfui/core";

const quantity = useRef(1);
const price = useRef(16);
const total = useComputed(() => quantity.value * price.value);

useEffect(() => {
  document.title = `总价：${total.value}`;
});
```

| 生命周期分组 | 钩子                                              |
| ------------ | ------------------------------------------------- |
| 挂载         | `onBeforeMount`、`onMount`                        |
| 更新         | `onBeforeUpdate`、`onUpdated`                     |
| 卸载         | `onBeforeUnmount`、`onUnmount`                    |
| 缓存与错误   | `onActivated`、`onDeactivated`、`onErrorCaptured` |

## 组件协作与组合式函数

| 工作               | API                                                 |
| ------------------ | --------------------------------------------------- |
| 父传子与子通知父   | `defineProps`、`defineEmits`                        |
| 共享值             | `defineModel`、`v-model`                            |
| 内容投射           | 默认和具名 `<slot>`                                 |
| 父组件渲染子数据   | `defineSlots`、`useScopedSlot`                      |
| 跨树上下文         | `provide`、`inject`                                 |
| 暴露实例方法       | `defineExpose`、`useTemplateRef`                    |
| 扩展或定制组件     | `useExtend`、`useVariant`                           |
| 编写表单组件       | `useFormControlContext`、`createFormControlContext` |
| 向宿主元素反射状态 | `useHostClass`、`useHostAttr`、`useHostCssVar`      |

`useExtend` 和 `useVariant` 是组件复用工具，不是类继承。它们保留基础组件契约，再明确地产出一个新组件或变体。

## 内置组件与样式边界

`Teleport` 把弹层内容移动到当前组件树外的目标节点：

```html
<Teleport to="body">
  <div class="dialog">弹窗内容</div>
</Teleport>
```

| 内置组件                         | 适用场景             |
| -------------------------------- | -------------------- |
| `Transition` / `TransitionGroup` | 进入、离开与列表动画 |
| `KeepAlive`                      | 保留非激活组件状态   |
| `Suspense`                       | 异步 fallback 边界   |
| 动态组件                         | 运行时切换组件       |

```ts
import { css, defineHtml, defineStyle, html } from "@elfui/core";

defineStyle(css`
  :host {
    display: inline-block;
  }
  button {
    padding: 8px 12px;
  }
`);

export const ElfButton = defineHtml(html`<button part="control"><slot></slot></button>`);
```

`:class=${...}` 支持字符串、数组和对象；`:style=${...}` 支持内联样式对象与 CSS 变量。`theme` / `useTheme` 管理主题覆盖。Shadow DOM 保护组件内部，`part` 与 `::part()` 则为使用者开放有意设计的样式边界。

## 应用、路由与工具链

```ts
import { createApp } from "@elfui/core";
import App from "./App";
import { Button } from "./Button";

const app = createApp(App);

app.component(Button);
app.directive("focus", { mounted: (el) => (el as HTMLElement).focus() });
app.use((currentApp) => {
  currentApp.config.globalProperties.appName = "Console";
});
app.config.errorHandler = (error) => console.error(error);
app.mount("#app");
```

路由有意保持独立：

```bash
pnpm add @elfui/router
```

使用 `createRouter({ mode, routes })` 创建 router，在挂载应用前导入 router 模块，并在模板中使用 `<elf-link>` 与 `<elf-router-view>`。脚手架使用 `--router` 会自动加入它。

`@elfui/vite-plugin` 负责编译 Macro 组件，管理构建期 `tagPrefix`，并可开启严格诊断与模板类型检查。[Language Tools](https://github.com/bloom-lmh/elfui-language-tools) 把补全、跳转、诊断与格式化留在编辑器侧，而不是带入运行时。

## 与熟悉方案的关系

| 框架  | ElfUI 借鉴                  | 不同选择                                         |
| ----- | --------------------------- | ------------------------------------------------ |
| Vue   | 模板与组合式易用性          | Web Components、编译期 DOM 绑定、无 VNode 运行时 |
| Solid | 细粒度响应式更新            | HTML 模板与 Custom Elements，而不是 JSX          |
| Lit   | 平台优先的组件与 Shadow DOM | 内置响应式模型与编译器指令                       |

本地 jsdom 微基准是健康信号，不是通用排名。当前测试中，ElfUI 的中位数为：200 次 hello mount **4.56 ms**、500 x 8 表格更新 **8.72 ms**。可通过 `pnpm benchmark` 与 `pnpm benchmark:browser` 复现基线。

## 生态、Beta 与许可证

| 项目                                                                     | 职责                               |
| ------------------------------------------------------------------------ | ---------------------------------- |
| [`@elfui/core`](https://www.npmjs.com/package/@elfui/core)               | Macro 组件、App API 与常用框架能力 |
| [`@elfui/vite-plugin`](https://www.npmjs.com/package/@elfui/vite-plugin) | Vite Macro 编译集成                |
| [ElfUI Router](https://github.com/bloom-lmh/elfui-router)                | 独立路由包                         |
| [Create ElfUI](https://github.com/bloom-lmh/create-elfui)                | 官方 Vite 项目脚手架               |
| [ElfUI Kit](https://github.com/bloom-lmh/elfui-kit)                      | 官方 UI 组件库                     |
| [Extensions](https://github.com/bloom-lmh/elfui-extensions)              | Chain 等可选扩展                   |
| [Language Tools](https://github.com/bloom-lmh/elfui-language-tools)      | VS Code 插件与语言服务             |
| [Docs](https://github.com/bloom-lmh/elfui-docs)                          | 指南与 API 参考                    |

**Beta 主线：** Macro 组件加 Vite。**扩展路线：** Chain 用于运行时模板、旧页面和无构建场景。**许可证：** [MIT](./LICENSE)。

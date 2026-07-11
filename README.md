# ElfUI

ElfUI 是一个面向 Web Components 的前端框架，采用编译时细粒度响应式，输出标准 Custom Elements。

## 目录

- [1. 起步](#起步)
  - [简介](#简介)
  - [安装](#安装)
  - [快速开始](#快速开始)
  - [包与入口](#包与入口)
- [2. 组件](#组件)
  - [组件概览](#组件概览)
  - [定义组件](#定义组件)
  - [Props](#props)
  - [事件](#事件)
  - [v-model](#v-model)
  - [插槽](#插槽)
  - [组件通信](#组件通信)
  - [组件暴露](#组件暴露)
  - [局部组件](#局部组件)
  - [动态组件](#动态组件)
  - [组件复用](#组件复用)
- [3. 模板语法](#模板语法)
  - [模板语法概览](#模板语法概览)
  - [文本与属性](#文本与属性)
  - [事件绑定](#事件绑定)
  - [条件与列表](#条件与列表)
  - [class 与 style](#class-与-style)
  - [表单绑定](#表单绑定)
- [4. 指令](#指令)
  - [内置指令](#内置指令)
  - [事件修饰符](#事件修饰符)
  - [自定义指令](#自定义指令)
- [5. 响应式](#响应式)
  - [响应式状态](#响应式状态)
  - [计算属性](#计算属性)
  - [副作用](#副作用)
  - [监听器](#监听器)
  - [响应式工具](#响应式工具)
- [6. 生命周期](#生命周期)
  - [生命周期概览](#生命周期概览)
  - [挂载与卸载](#挂载与卸载)
  - [更新阶段](#更新阶段)
  - [KeepAlive 生命周期](#keepalive-生命周期)
- [7. 样式](#样式)
  - [组件样式](#组件样式)
  - [Shadow DOM](#shadow-dom)
  - [主题](#主题)
  - [全局样式](#全局样式)
- [8. 内置组合式函数](#内置组合式函数)
  - [内置组合式函数概览](#内置组合式函数概览)
  - [Host 与根节点](#host-与根节点)
  - [模板引用](#模板引用)
  - [DOM 事件](#dom-事件)
  - [观察器](#观察器)
  - [交互控制](#交互控制)
  - [表单控件](#表单控件)
- [9. 内置组件](#内置组件)
  - [Teleport](#teleport)
  - [Transition](#transition)
  - [TransitionGroup](#transitiongroup)
  - [KeepAlive](#keepalive)
  - [Suspense](#suspense)
- [10. 路由](#路由)
  - [路由快速开始](#路由快速开始)
  - [路由配置](#路由配置)
  - [导航](#导航)
  - [路由视图](#路由视图)
  - [路由守卫](#路由守卫)
- [11. 配置](#配置)
  - [全局配置](#全局配置)
  - [CSP 与体积](#csp-与体积)
- [12. 错误处理](#错误处理)
  - [错误处理概览](#错误处理概览)
  - [组件错误捕获](#组件错误捕获)
  - [错误边界](#错误边界)
  - [全局错误处理](#全局错误处理)
  - [编译诊断](#编译诊断)
- [13. 插件](#插件)
  - [插件概览](#插件概览)
  - [使用插件](#使用插件)
  - [自定义插件](#自定义插件)
- [14. 生态](#生态)
  - [Chain 链式组件](#chain-链式组件)
  - [Vite 插件](#vite-插件)
  - [VS Code 插件](#vs-code-插件)
- [15. 迁移](#迁移)
  - [从 Vue 迁移](#从-vue-迁移)
  - [从链式迁移到组件](#从链式迁移到组件)
  - [废弃 API](#废弃-api)
- [16. API参考](#api参考)
  - [elfui API](#elfui-api)
  - [reactivity API](#reactivity-api)
  - [runtime API](#runtime-api)
  - [router API](#router-api)
  - [chain API](#chain-api)

---

# 起步

# 简介

ElfUI 是一个面向 Web Components 的前端框架。它的主线写法是 **宏组件**：在普通 `.ts/.tsx` 文件里写 TypeScript 逻辑，用 `defineHtml(html`...`)` 导出组件，构建时由 `@elfui/vite-plugin` 预编译模板。

```ts
import { defineHtml, html, useRef } from "@elfui/core";

const count = useRef(0);
const inc = (): void => count.set(count.peek() + 1);

export const Counter = defineHtml(html` <button @click=${inc}>点了 ${count} 次</button> `);
```

ElfUI 的核心路线是编译时细粒度响应式。模板里的文本、属性、事件、条件和列表会被编译成直接更新 DOM 的 runtime helper，每个动态点只订阅自己真正读取的状态。

## 适合什么项目

ElfUI 适合这几类场景：

| 场景             | 推荐理由                             |
| ---------------- | ------------------------------------ |
| 组件库           | 输出标准 Custom Element，跨框架复用  |
| 独立 Vite 应用   | 宏组件预编译，不带 runtime compiler  |
| 渐进式改造       | 可以把组件注册成原生标签放进旧页面   |
| 对体积敏感的项目 | 主入口约 10.52 KB gzip，不包含编译器 |

## 和 Vue/Lit/Solid 的关系

ElfUI 借鉴了 Vue 的模板体验、Lit 的 Web Components 输出、Solid 的细粒度更新思路，但内部不是 Vue，也没有 VNode/patch。

| 维度     | ElfUI                                    |
| -------- | ---------------------------------------- |
| 组件文件 | 普通 `.ts/.tsx`                          |
| 模板     | `html` 模板宏，构建期编译                |
| 响应式   | `useRef` / `useReactive` / `useComputed` |
| 输出     | 标准 Custom Elements                     |
| 链式组件 | 放在 `@elfui/chain` 生态扩展中           |

## 学习路线

先读“快速开始”和“组件/定义组件”。能写组件后，再按需要看响应式、指令、样式、路由和内置组合式函数。

---

# 安装

新项目推荐安装主包和 Vite 插件：

```bash
pnpm add @elfui/core
pnpm add -D @elfui/vite-plugin
```

`@elfui/core` 提供组件、响应式、生命周期、内置组合式函数等用户 API。`@elfui/vite-plugin` 负责识别和编译普通 `.ts/.tsx` 宏组件。

## Vite 配置

```ts
import { defineConfig } from "vite";
import { elfuiMacroPlugin } from "@elfui/vite-plugin";

export default defineConfig({
  plugins: [elfuiMacroPlugin()]
});
```

组件文件只要导出 `defineHtml(...)`，插件就会把它当成宏组件处理。

```ts
import { defineHtml, html } from "@elfui/core";

export const Hello = defineHtml(html`<p>Hello ElfUI</p>`);
```

## 可选包

| 包                  | 用途                       |
| ------------------- | -------------------------- |
| `@elfui/router`     | 路由                       |
| `@elfui/chain`      | 链式组件和运行时字符串模板 |
| `@elfui/reactivity` | 只使用响应式系统           |
| `@elfui/runtime`    | 高级 Custom Element 封装   |

默认先不要装 `@elfui/chain`。链式组件适合旧站嵌入、小 demo 或无需构建的场景，不是新项目主线。

---

# 快速开始

这一页从零写一个计数器组件。

## 创建组件

```ts
// Counter.ts
import { defineHtml, html, useRef } from "@elfui/core";

const count = useRef(0);
const inc = (): void => count.set(count.peek() + 1);

export const Counter = defineHtml(html`
  <button class="counter" @click=${inc}>Count: ${count}</button>
`);
```

顶层代码就是组件的 setup 逻辑。模板里的 `${count}` 会被编译为响应式文本绑定，`@click=${inc}` 会成为事件监听。

## 挂载应用

```ts
// main.ts
import { createApp } from "@elfui/core";
import { Counter } from "./Counter";

createApp(Counter).mount("#app");
```

`index.html` 只需要一个普通容器，不需要手写组件 tag：

```html
<div id="app"></div>
```

`createApp(Counter).mount("#app")` 会自动注册根组件、创建实例并替换容器中的已有内容，返回值是真实的 Custom Element。导出名 `Counter` 仍会推断为 `elf-counter`，但应用入口不需要知道这个 tag。

如果组件需要直接写进已有 HTML，或者组件库需要批量全局注册，可以继续使用 `registerComponents()`：

```ts
import { registerComponents } from "@elfui/core";

registerComponents(Counter);
```

如果需要自定义单个组件名，可以使用 `defineName()`；如果需要统一项目前缀，请在 Vite 插件里配置 `tagPrefix`。

## 加样式

```ts
import { css, defineHtml, defineStyle, html, useRef } from "@elfui/core";

defineStyle(css`
  .counter {
    border: 0;
    border-radius: 8px;
    padding: 8px 12px;
  }
`);

const count = useRef(0);
const inc = (): void => count.set(count.peek() + 1);

export const Counter = defineHtml(html`
  <button class="counter" @click=${inc}>Count: ${count}</button>
`);
```

组件样式默认注入当前 Custom Element 的 Shadow DOM。

## 下一步

- 想写组件 API，看“组件”。
- 想写模板逻辑，看“模板语法”和“指令”。
- 想接入工程诊断，看“生态 / Vite 插件”。

---

# 包与入口

ElfUI 把主线能力和扩展能力拆开。新项目从 `@elfui/core` 开始，链式组件只在需要时使用 `@elfui/chain`。

## 入口选择

| 场景               | 安装                                 | 导入                                               |
| ------------------ | ------------------------------------ | -------------------------------------------------- |
| 新项目 / 组件库    | `@elfui/core` + `@elfui/vite-plugin` | `import { defineHtml } from "@elfui/core"`         |
| 路由               | `@elfui/router`                      | `import { createRouter } from "@elfui/router"`     |
| 旧站嵌入 / 小 demo | `@elfui/chain`                       | `import { ElfUI } from "@elfui/chain"`             |
| 只用响应式         | `@elfui/reactivity`                  | `import { useRef } from "@elfui/reactivity"`       |
| 高级 runtime 封装  | `@elfui/runtime`                     | `import { defineComponent } from "@elfui/runtime"` |

## 包职责

| 包                   | 职责                                            |
| -------------------- | ----------------------------------------------- |
| `@elfui/core`        | 宏组件主入口，聚合常用响应式和 runtime API      |
| `@elfui/vite-plugin` | Vite 宏组件编译插件                             |
| `@elfui/router`      | Web Components 路由                             |
| `@elfui/chain`       | 链式组件扩展包，包含 runtime compiler           |
| `@elfui/reactivity`  | 响应式系统完整入口                              |
| `@elfui/runtime`     | Custom Element、生命周期、内置组件和高级 helper |
| `@elfui/compiler`    | 编译器源码能力，给工具和扩展使用                |

## 体积口径

当前 beta 体积基线：

| 入口                          |     gzip | 说明                                    |
| ----------------------------- | -------: | --------------------------------------- |
| `@elfui/core`                 | 10.52 KB | 主入口，不带 runtime compiler           |
| `@elfui/chain`                | 21.19 KB | 链式 `.template()`，带 runtime compiler |
| `@elfui/core + @elfui/router` | 15.00 KB | 主入口加路由                            |
| `@elfui/reactivity`           |  4.17 KB | 只用响应式                              |

## 边界

`@elfui/core` 不导出 `createComponent()`、`ElementBuilder`、`compile()` 或运行时字符串模板能力。需要链式 API 时，去“生态 / Chain 链式组件”。

---

# 组件

# 组件概览

ElfUI 的组件是标准 Custom Element。主线写法是宏组件：顶层 TypeScript 负责逻辑，`defineHtml(html`...`)` 负责声明模板和组件边界。

```ts
import { defineHtml, defineProps, html } from "@elfui/core";

const props = defineProps<{ label: string }>({
  label: { type: String, default: "保存" }
});

export const SaveButton = defineHtml(html` <button>${props.label}</button> `);
```

## 组件能力

| 能力       | 文档                             |
| ---------- | -------------------------------- |
| 定义组件   | `defineHtml`、文件导出、tag 推断 |
| 输入       | Props                            |
| 输出       | 事件、v-model                    |
| 内容分发   | 插槽                             |
| 跨层共享   | Provide / Inject                 |
| 命令式访问 | 模板引用、组件暴露               |
| 组合       | 局部组件、动态组件               |
| 复用       | `useExtend` / `useVariant`       |

## 推荐顺序

先写清楚 props 和事件，再决定是否需要 v-model、插槽、provide/inject 或 expose。组件通信方式不要混用太多，API 越少越稳定。

---

# 定义组件

一个宏组件文件通常包含三部分：导入 API、顶层 setup 逻辑、导出组件。

```ts
import { defineHtml, html, useRef } from "@elfui/core";

const active = useRef(false);
const toggle = (): void => active.set(!active.peek());

export const TogglePanel = defineHtml(html`
  <button @click=${toggle}>toggle</button>
  <section v-show=${active}>
    <slot></slot>
  </section>
`);
```

## 导出形式

推荐命名导出：

```ts
export const UserCard = defineHtml(html`<article><slot></slot></article>`);
```

也可以先定义再导出：

```ts
const UserCard = defineHtml(html`<article><slot></slot></article>`);

export { UserCard };
```

默认导出也支持：

```ts
export default defineHtml(html`<article><slot></slot></article>`);
```

## Tag 推断

命名导出会按导出名推断 tag：

| 导出名      | 推断 tag             |
| ----------- | -------------------- |
| `UserCard`  | `elf-user-card`      |
| `ElfButton` | `elf-button`         |
| `default`   | 按文件名或目录名推断 |

如果需要统一项目前缀，请在 `@elfui/vite-plugin` 里配置 `tagPrefix`。宏组件 tag 是编译期结果，不受运行时 `configure()` 影响。

## 组件选项

组件级选项使用 `defineOptions()`：

```ts
import { defineHtml, defineOptions, html } from "@elfui/core";

defineOptions({
  shadow: "open",
  formControl: true,
  register: false
});

export const Field = defineHtml(html`<slot></slot>`);
```

`register: false` 适合组件库内部导出构造器，再由入口统一 `registerComponents()`。

---

# Props

Props 是组件的外部输入。宏组件里用 `defineProps()` 声明。

```ts
import { defineHtml, defineProps, html } from "@elfui/core";

const props = defineProps<{
  label: string;
  disabled: boolean;
}>({
  label: { type: String, default: "保存" },
  disabled: { type: Boolean, default: false }
});

export const ElfButton = defineHtml(html`
  <button :disabled=${props.disabled}>${props.label}</button>
`);
```

## 常用写法

| 写法                             | 用途                |
| -------------------------------- | ------------------- |
| `defineProps<Props>()`           | 只声明类型          |
| `defineProps<Props>({ ... })`    | 类型 + runtime 选项 |
| `defineProps({ label: String })` | 从 options 推断类型 |

## Attribute 与 property

ElfUI 输出 Custom Element，所以外部既可以写 attribute，也可以写 property：

```html
<elf-button label="提交"></elf-button>
```

```ts
const el = document.querySelector("elf-button")!;
el.disabled = true;
```

`String`、`Number`、`Boolean`、`Array`、`Object` 会按 props 选项做基础转换。复杂对象建议通过 property 传递。

## 边界

Props 应该是只读输入。组件内部要改状态时，把 prop 拷到 `useRef()` 或使用 `defineModel()` 表达双向绑定。

---

# 事件

组件向外通知变化时使用事件。宏组件里用 `defineEmits()` 得到 `emit` 函数。

```ts
import { defineEmits, defineHtml, html } from "@elfui/core";

const emit = defineEmits<{
  change: [value: string];
  clear: [];
}>();

const onInput = (event: Event): void => {
  const input = event.target as HTMLInputElement;
  emit("change", input.value);
};

export const SearchBox = defineHtml(html`
  <input @input=${onInput} />
  <button @click=${() => emit("clear")}>清空</button>
`);
```

## 监听事件

父组件模板里监听自定义事件：

```ts
const update = (event: CustomEvent<string>): void => {
  keyword.set(event.detail);
};

export const Page = defineHtml(html` <search-box @change=${update}></search-box> `);
```

单参数事件的 `detail` 就是该参数。多参数事件会以数组形式放入 `detail`。

## 什么时候用事件

事件适合表达“已经发生的事”，比如 `change`、`submit`、`close`。如果父组件需要直接控制值，用 `v-model` 更清晰。

---

# v-model

`v-model` 用来表达父子之间的双向状态。宏组件内部使用 `defineModel()`。

```ts
import { defineHtml, defineModel, html } from "@elfui/core";

const value = defineModel<string>({ default: "" });

const onInput = (event: Event): void => {
  value.set((event.target as HTMLInputElement).value);
};

export const TextField = defineHtml(html` <input .value=${value} @input=${onInput} /> `);
```

父组件使用：

```ts
const name = useRef("");

export const Page = defineHtml(html`
  <text-field v-model=${name}></text-field>
  <p>${name}</p>
`);
```

## 命名 model

```ts
const open = defineModel<boolean>("open", { default: false });
```

父组件：

```html
<elf-dialog v-model:open="visible"></elf-dialog>
```

## 和事件的关系

默认 model 使用 `modelValue` prop 和 `update:modelValue` 事件。命名 model 会使用对应的 prop 和更新事件。

如果只是通知一次动作，用事件；如果父组件需要持有当前值，用 `v-model`。

---

# 插槽

插槽让父组件把内容传给子组件。ElfUI 输出 Custom Element，默认插槽和具名插槽使用原生 Web Components 语义。

## 默认插槽

```ts
export const Card = defineHtml(html`
  <article class="card">
    <slot></slot>
  </article>
`);
```

```html
<elf-card>内容</elf-card>
```

## 具名插槽

```ts
export const Panel = defineHtml(html`
  <header><slot name="title"></slot></header>
  <main><slot></slot></main>
  <footer><slot name="actions"></slot></footer>
`);
```

```html
<elf-panel>
  <h2 slot="title">标题</h2>
  正文
  <button slot="actions">确定</button>
</elf-panel>
```

## 作用域插槽

Web Components 没有原生作用域 slot。ElfUI 通过编译期桥接支持常用写法，子组件使用 `useScopedSlot()` 消费。

```ts
import { defineHtml, html, useScopedSlot } from "@elfui/core";

const itemSlot = useScopedSlot<{ item: string }>("item");

export const ListBox = defineHtml(html`
  <ul>
    <li>${itemSlot?.({ item: "A" })}</li>
  </ul>
`);
```

作用域插槽适合 Table cell、List item 这类需要把子组件内部数据交给父组件渲染的场景。

---

# 组件通信

组件通信先选最简单的方式。不要为了“统一”把所有场景都塞进 provide/inject 或 expose。

| 需求               | 推荐                |
| ------------------ | ------------------- |
| 父传子             | Props               |
| 子通知父           | 事件                |
| 父子共同维护一个值 | `v-model`           |
| 父传内容           | 插槽                |
| 跨多层共享上下文   | Provide / Inject    |
| 父调用子方法       | 模板引用 + 组件暴露 |

## Provide / Inject

```ts
import { createInjectionKey, provide } from "@elfui/core";

export const themeKey = createInjectionKey<"light" | "dark">("theme");

provide(themeKey, "dark");
```

子组件：

```ts
import { inject } from "@elfui/core";
import { themeKey } from "./keys";

const theme = inject(themeKey, "light");
```

Provide / Inject 适合表单、主题、菜单这类层级上下文，不适合替代普通 props。

## Ref + Expose

当父组件必须调用子组件方法时，子组件用 `defineExpose()` 暴露，父组件用 `useTemplateRef()` 获取。

这类通信是命令式 API，适合 `focus()`、`validate()`、`reset()`，不适合普通数据流。

---

# 组件暴露

`defineExpose()` 把方法或属性暴露到组件 host 上，外部可以通过 DOM ref 调用。

```ts
import { defineExpose, defineHtml, html, useTemplateRef } from "@elfui/core";

const input = useTemplateRef<HTMLInputElement>("input");

defineExpose({
  focus: () => input.value?.focus(),
  clear: () => {
    if (input.value) input.value.value = "";
  }
});

export const SearchInput = defineHtml(html` <input ref="input" /> `);
```

外部使用：

```ts
const el = document.querySelector("search-input") as HTMLElement & {
  focus(): void;
};

el.focus();
```

## 适合暴露什么

适合暴露命令式能力：

- `focus()`
- `blur()`
- `validate()`
- `reset()`
- `scrollToActive()`

不要暴露内部响应式状态。状态应该通过 props、事件或 v-model 维护。

---

# 局部组件

`useComponents()` 用于在当前组件模板里使用导入的组件。

```ts
import { defineHtml, html, useComponents } from "@elfui/core";
import { ElfButton } from "./Button";

useComponents(ElfButton);

export const Toolbar = defineHtml(html` <elf-button>保存</elf-button> `);
```

也可以设置别名：

```ts
useComponents({ PrimaryAction: ElfButton });

export const Toolbar = defineHtml(html` <primary-action>保存</primary-action> `);
```

## 和全局注册的关系

`createApp(App).mount("#app")` 用于注册并挂载应用根组件；`registerComponents()` 用于需要直接写进 HTML 的全局组件；`useComponents()` 是组件内部的局部依赖声明。

组件库更推荐局部组件，因为依赖关系清楚，模板类型检查也能知道子组件的 props、事件和 slots。

---

# 动态组件

动态组件用于在运行时切换要渲染的组件。

```ts
import { defineHtml, html, useRef } from "@elfui/core";
import { UserCard } from "./UserCard";
import { TeamCard } from "./TeamCard";

const current = useRef<typeof UserCard | typeof TeamCard>(UserCard);

export const Dashboard = defineHtml(html` <component :is=${current}></component> `);
```

`:is` 可以是组件构造器，也可以是已经注册的标签名。

```ts
const current = useRef("elf-user-card");
```

## 配合 KeepAlive

需要缓存实例时，用 `<KeepAlive>` 包住动态组件：

```html
<KeepAlive>
  <component :is="current"></component>
</KeepAlive>
```

适合 tab、路由页、编辑器面板等切换频繁但不希望重建状态的场景。

---

# 组件复用

宏组件主包提供 `useExtend()` 和 `useVariant()`，用于基于已有组件派生新组件。

## useExtend

```ts
import { useExtend } from "@elfui/core";
import { Button } from "./Button";

export const PrimaryButton = useExtend(Button)
  .name("primary-button")
  .style(`:host { --button-color: var(--elf-color-primary); }`)
  .build();
```

`useExtend()` 会复制原组件定义，然后允许你改 tag、追加样式，再 build 或 register。

## useVariant

```ts
import { useVariant } from "@elfui/core";
import { Button } from "./Button";

export const DangerButton = useVariant(Button, "danger-button", (builder) => {
  builder.style(`:host { --button-color: var(--elf-color-danger); }`);
}).build();
```

## 什么时候使用

适合做设计系统里的变体组件，比如 `PrimaryButton`、`DangerButton`、`CompactTable`。如果只是传一个 prop 就能解决，不要派生新组件。

---

# 模板语法

# 模板语法概览

ElfUI 模板写在 `html` 模板宏里，构建期会编译成直接操作 DOM 的 render 函数。

```ts
export const Counter = defineHtml(html`
  <button @click=${inc} :disabled=${disabled}>${count}</button>
`);
```

模板语法分两类：

| 类型                  | 示例                                                 |
| --------------------- | ---------------------------------------------------- |
| JavaScript 动态表达式 | `${count}`、`:disabled=${disabled}`、`@click=${inc}` |
| 指令                  | `v-if`、`v-for`、`v-model`、`v-show`                 |

## 推荐写法

普通动态绑定优先使用 `${...}`：

```ts
html`<button @click=${submit} :disabled=${loading}>提交</button>`;
```

需要模板局部变量的场景使用字符串表达式，比如 `v-for`：

```html
<li v-for="item in list" :key="item.id">{{ item.name }}</li>
```

## 编译结果

模板不会变成 VNode。编译器会把动态文本、属性、事件和控制流拆成独立绑定，状态变化时只更新对应 DOM 点。

---

# 文本与属性

文本插值可以使用 `${...}` 或 `&#123;&#123; ... &#125;&#125;`。新项目推荐在宏组件里使用 `${...}`，因为它直接引用当前 TypeScript 作用域。

```ts
const name = useRef("Elf");

export const Hello = defineHtml(html` <p>Hello ${name}</p> `);
```

## 属性绑定

```ts
html`<button :disabled=${disabled}>保存</button>`;
```

布尔属性在值为 `false`、`null`、`undefined` 时会移除。

## Property 绑定

需要设置 DOM property 时使用 `.prop`：

```ts
html`<input .value=${value} />`;
```

复杂对象建议走 property，而不是 attribute。

## 文本安全

普通文本绑定会写入 `textContent`。需要插入 HTML 时使用 `v-html`，并自行保证内容可信。

---

# 事件绑定

事件绑定使用 `@event=${handler}`。

```ts
const submit = (event: Event): void => {
  event.preventDefault();
};

export const FormButton = defineHtml(html` <button @click=${submit}>提交</button> `);
```

## 传参

```ts
const remove = (id: string): void => {
  items.set(items.peek().filter((item) => item.id !== id));
};

html` <button @click=${() => remove(item.id)}>删除</button> `;
```

## 修饰符

常见事件修饰符放在“指令 / 事件修饰符”里：

```html
<form @submit.prevent="submit"></form>
<button @click.stop="select"></button>
```

宏组件里推荐优先写 TypeScript handler，复杂逻辑不要塞进模板。

---

# 条件与列表

条件和列表属于控制流，使用指令更清晰。

## 条件渲染

```html
<p v-if="loading">加载中</p>
<p v-else-if="error">加载失败</p>
<p v-else>完成</p>
```

`v-if` 会创建和销毁节点。只是切换可见性时用 `v-show`。

```html
<section v-show="open">内容</section>
```

## 列表渲染

```html
<li v-for="item in items" :key="item.id">{{ item.name }}</li>
```

列表建议始终提供稳定 `key`。ElfUI 会使用 keyed 列表更新，插入、删除、重排都只移动必要节点。

## template 分组

```html
<template v-if="ready">
  <h2>标题</h2>
  <p>正文</p>
</template>
```

`<template>` 只作为透明分组，不会渲染成真实元素。

---

# class 与 style

`class` 和 `style` 支持字符串、对象和数组形式。

## class

```ts
html`<button :class=${{ active: open, disabled }}></button>`;
```

```ts
html`<button :class=${["btn", open && "is-open"]}></button>`;
```

## style

```ts
html` <div :style=${{ width: `${width}px`, display: visible ? "" : "none" }}></div> `;
```

静态 class 会和动态 class 合并：

```ts
html`<button class="btn" :class=${{ active }}></button>`;
```

## 组件样式

组件内部 CSS 放在“样式 / 组件样式”。模板里的 `class` 和 `style` 只负责状态映射，不建议塞大量样式字符串。

---

# 表单绑定

表单控件可以使用 `v-model`。

```ts
const text = useRef("");

export const SearchForm = defineHtml(html`
  <input v-model=${text} />
  <p>${text}</p>
`);
```

## checkbox

```ts
const checked = useRef(false);

html`<input type="checkbox" v-model=${checked} />`;
```

## select

```ts
const value = useRef("a");

html`
  <select v-model=${value}>
    <option value="a">A</option>
    <option value="b">B</option>
  </select>
`;
```

## 自定义组件

自定义组件支持 `v-model` 时，在子组件里使用 `defineModel()`：

```ts
const value = defineModel<string>({ default: "" });
```

更多组件级双向绑定见“组件 / v-model”。

---

# 指令

# 内置指令

内置指令处理模板里的控制流、显示切换、文本和表单。

| 指令                            | 用途               |
| ------------------------------- | ------------------ |
| `v-if` / `v-else-if` / `v-else` | 条件渲染           |
| `v-for`                         | 列表渲染           |
| `v-show`                        | display 切换       |
| `v-model`                       | 表单和组件双向绑定 |
| `v-text`                        | 设置文本           |
| `v-html`                        | 设置 HTML          |
| `v-once`                        | 只渲染一次         |
| `v-memo`                        | 按依赖跳过更新     |

## 示例

```html
<p v-if="loading">加载中</p>

<li v-for="item in items" :key="item.id">{{ item.name }}</li>

<section v-show="open">内容</section>
```

复杂表达式建议提前放到 TypeScript 变量或 `useComputed()`，模板保持可读。

---

# 事件修饰符

事件修饰符用于表达常见 DOM 事件选项和拦截行为。

```html
<button @click.stop="select">选择</button>
<form @submit.prevent="submit"></form>
<button @click.once="init">初始化一次</button>
```

## 支持的修饰符

| 修饰符     | 含义                           |
| ---------- | ------------------------------ |
| `.stop`    | 调用 `event.stopPropagation()` |
| `.prevent` | 调用 `event.preventDefault()`  |
| `.self`    | 只处理事件目标是自身的事件     |
| `.once`    | `addEventListener` 的 `once`   |
| `.capture` | 捕获阶段监听                   |
| `.passive` | passive 监听                   |

## 选择建议

简单场景用修饰符，复杂逻辑写到 handler 里。这样 TypeScript 类型更清楚，也更容易测试。

---

# 自定义指令

自定义指令适合封装 DOM 行为，比如自动聚焦、权限隐藏、第三方库挂载。

## 全局指令

```ts
import { directive } from "@elfui/core";

directive("focus", {
  mounted(el) {
    (el as HTMLElement).focus();
  }
});
```

模板中使用：

```html
<input v-focus />
```

## 局部指令

宏组件中使用 `defineDirective()`：

```ts
import { defineDirective } from "@elfui/core";

defineDirective("focus", {
  mounted(el) {
    (el as HTMLElement).focus();
  }
});
```

## 生命周期

指令支持：

| Hook        | 时机         |
| ----------- | ------------ |
| `mounted`   | 元素挂载后   |
| `updated`   | 绑定值更新后 |
| `unmounted` | 元素卸载时   |

如果行为涉及组件状态，优先考虑内置组合式函数；如果行为只关心某个 DOM 元素，指令更合适。

---

# 响应式

# 响应式状态

ElfUI beta 主线使用 `useRef()` 和 `useReactive()`。基本值用 `useRef`，对象和数组用 `useReactive`。

## useRef

```ts
const count = useRef(0);

count.set(count.peek() + 1);
```

模板中可以直接读取：

```ts
html`<button>${count}</button>`;
```

代码里需要无追踪读取时使用 `peek()`；需要响应式读取时使用 `.value`。

## useReactive

```ts
const user = useReactive({
  name: "Elf",
  age: 1
});

user.name = "ElfUI";
```

对象字段的读写会被追踪。数组的 push、splice、重排等也会触发相关依赖。

## 选择规则

| 数据                  | 推荐            |
| --------------------- | --------------- |
| number/string/boolean | `useRef()`      |
| 对象                  | `useReactive()` |
| 数组                  | `useReactive()` |
| 派生值                | `useComputed()` |

`useState` 已不在 beta public API 主线里。旧代码迁移见“迁移 / 废弃 API”。

---

# 计算属性

`useComputed()` 用来声明派生值。它会自动追踪 getter 中读取的响应式依赖。

```ts
const first = useRef("Elf");
const last = useRef("UI");

const fullName = useComputed(() => `${first.value} ${last.value}`);
```

模板中直接使用：

```ts
html`<p>${fullName}</p>`;
```

## 可写计算属性

```ts
const count = useRef(0);

const doubled = useComputed({
  get: () => count.value * 2,
  set: (value: number) => count.set(value / 2)
});
```

## computed 别名

`computed` 是 `useComputed` 的别名，给 Vue 用户降低迁移成本：

```ts
import { computed } from "@elfui/core";
```

项目里建议统一一种命名风格。

---

# 副作用

`useEffect()` 用来运行会产生副作用的逻辑，并自动追踪依赖。

```ts
const count = useRef(0);

useEffect(() => {
  document.title = `Count ${count.value}`;
});
```

当 `count` 变化时，effect 会重新执行。

## cleanup

effect 可以返回清理函数：

```ts
useEffect(() => {
  const id = window.setInterval(tick, 1000);
  return () => window.clearInterval(id);
});
```

清理函数会在下次重跑前执行，也会在作用域销毁时执行。

## 和 watch 的区别

`useEffect()` 适合“读到什么就订阅什么”的副作用。需要明确新旧值、控制 immediate/deep/flush 时，用 `watch()`。

---

# 监听器

`watch()` 用来监听明确的数据源。

```ts
watch(search, (value, oldValue) => {
  console.log(value, oldValue);
});
```

数据源可以是 ref、getter 或数组：

```ts
watch(
  () => user.name,
  (name) => {
    console.log(name);
  }
);
```

## watchEffect

`watchEffect()` 会自动追踪函数中读取的响应式依赖：

```ts
watchEffect(() => {
  console.log(user.name, count.value);
});
```

## flush 模式

```ts
watch(source, callback, { flush: "post" });
```

| 模式   | 含义           |
| ------ | -------------- |
| `pre`  | 默认调度队列   |
| `post` | DOM 更新后队列 |
| `sync` | 同步执行       |

需要清理异步任务时，在回调里使用 `onCleanup`。

---

# 响应式工具

响应式工具用于处理只读、浅响应、原始对象和 effect 作用域。

## readonly

```ts
const state = readonly(useReactive({ count: 0 }));
```

只读对象被写入时会在开发环境给出警告。

## shallow

```ts
const value = useShallowRef({ nested: { count: 0 } });
const state = useShallowReactive({ nested: { count: 0 } });
```

浅响应只追踪顶层，适合大型对象或第三方实例包装。

## markRaw / toRaw

```ts
const editor = markRaw(createEditor());
```

`markRaw()` 标记对象不要被代理，`toRaw()` 取回原始对象。

## effectScope

```ts
const scope = effectScope();

scope.run(() => {
  useEffect(() => {
    // ...
  });
});

scope.stop();
```

作用域适合在插件、弹层、临时模块里批量管理 effect。

---

# 生命周期

# 生命周期概览

生命周期函数只能在组件 setup 同步阶段调用，也就是宏组件顶层。

```ts
import { defineHtml, html, onMount, onUnmount } from "@elfui/core";

onMount(() => {
  console.log("mounted");
});

onUnmount(() => {
  console.log("unmounted");
});

export const Demo = defineHtml(html`<p>Demo</p>`);
```

## 生命周期列表

| API               | 时机           |
| ----------------- | -------------- |
| `onBeforeMount`   | 首次挂载前     |
| `onMount`         | 首次挂载后     |
| `onBeforeUpdate`  | 响应式更新前   |
| `onUpdated`       | 响应式更新后   |
| `onBeforeUnmount` | 卸载前         |
| `onUnmount`       | 卸载后         |
| `onActivated`     | KeepAlive 激活 |
| `onDeactivated`   | KeepAlive 失活 |

错误相关能力放在“错误处理”。

---

# 挂载与卸载

挂载阶段适合做 DOM 初始化、第三方库挂载和全局事件监听。

```ts
onMount(() => {
  console.log("host connected");
});
```

卸载阶段用于释放资源：

```ts
onUnmount(() => {
  console.log("host removed");
});
```

## before hooks

```ts
onBeforeMount(() => {
  // 首次渲染前
});

onBeforeUnmount(() => {
  // 移除前，适合取消事件监听
});
```

多数 DOM 事件可以直接使用 `useEventListener()`，它会自动在卸载时清理。

---

# 更新阶段

更新阶段用于观察组件内部响应式绑定触发的 DOM 更新。

```ts
onBeforeUpdate(() => {
  console.log("before update");
});

onUpdated(() => {
  console.log("updated");
});
```

## 使用建议

优先通过响应式表达式驱动 UI，不要把普通状态同步都放进更新 hook。

适合放在更新 hook 的事情：

- 读取更新后的布局尺寸
- 调整滚动位置
- 与第三方 DOM 插件同步

如果只是监听某个状态变化，用 `watch()` 更直接。

---

# KeepAlive 生命周期

被 `<KeepAlive>` 缓存的动态组件不会在切换时销毁，而是在激活和失活之间切换。

```ts
onActivated(() => {
  console.log("active again");
});

onDeactivated(() => {
  console.log("cached but hidden");
});
```

## 和 mount/unmount 的区别

| 场景           | 触发                      |
| -------------- | ------------------------- |
| 首次创建       | `onMount` + `onActivated` |
| 从缓存恢复     | `onActivated`             |
| 切走但保留缓存 | `onDeactivated`           |
| 真正移除缓存   | `onUnmount`               |

适合缓存路由页、tab 面板、复杂表单或编辑器实例。

---

# 样式

# 组件样式

组件内部样式使用 `defineStyle()` 和 `css`。

```ts
import { css, defineHtml, defineStyle, html } from "@elfui/core";

defineStyle(css`
  button {
    border-radius: 8px;
    padding: 8px 12px;
  }
`);

export const ElfButton = defineHtml(html` <button><slot></slot></button> `);
```

样式会随组件定义进入 Shadow DOM，不污染页面全局。

## 多段样式

`defineStyle()` 可以调用多次，适合拆分基础样式和状态样式。

```ts
defineStyle(baseStyle);
defineStyle(stateStyle);
```

## 动态样式

组件状态变化优先映射到 class、attribute 或 CSS 变量，再由 CSS 处理。

---

# Shadow DOM

ElfUI 组件默认使用 Shadow DOM，让样式和 DOM 结构有明确边界。

```ts
defineOptions({
  shadow: "open"
});
```

## 模式

| 值         | 含义                               |
| ---------- | ---------------------------------- |
| `"open"`   | 默认，可通过 `el.shadowRoot` 访问  |
| `"closed"` | 外部不能直接访问 shadowRoot        |
| `false`    | 不创建 Shadow DOM，内容渲染到 host |

## 什么时候关闭 Shadow DOM

适合关闭 Shadow DOM 的场景：

- 需要完全继承页面全局样式
- 和旧页面渐进集成
- 需要第三方 CSS 框架直接命中内部节点

默认不建议关闭。Shadow DOM 是组件边界的一部分。

---

# 主题

主题推荐用 CSS 变量表达。组件内部读取变量，应用层通过 `theme()` 或 `useTheme()` 注入。

```ts
import { theme } from "@elfui/core";
import { ElfButton } from "./Button";

theme(
  ElfButton,
  `
  --elf-button-bg: #14d8a6;
  --elf-button-color: #04110d;
`,
  { id: "button-theme" }
);
```

宏组件复用场景也可以使用 `useTheme()`：

```ts
import { useTheme } from "@elfui/core";

useTheme(ElfButton, `--elf-button-radius: 8px;`);
```

## 建议

组件内部定义默认值：

```css
button {
  background: var(--elf-button-bg, #111);
  color: var(--elf-button-color, #fff);
}
```

主题层只覆盖变量，不直接穿透组件内部选择器。

---

# 全局样式

全局样式使用 `globalStyle()` 注入。

```ts
import { globalStyle } from "@elfui/core";

globalStyle(
  `
  :root {
    --elf-color-primary: #14d8a6;
  }
`,
  { id: "app-theme" }
);
```

传入稳定 `id` 时，后续同 id 调用会覆盖旧样式。

## 清理

```ts
const dispose = globalStyle(`body { margin: 0; }`);

dispose();
```

测试或热更新场景可以使用：

```ts
import { resetGlobalStyles } from "@elfui/core";

resetGlobalStyles();
```

全局样式适合放 token、reset 和应用级主题，不建议写组件内部细节。

---

# 内置组合式函数

# 内置组合式函数概览

内置组合式函数是 ElfUI 提供的官方 `useXxx()` 能力。它们不属于响应式原语，而是服务组件作者的 DOM、Host、事件、观察器和表单封装。

| 分类     | API                                                     |
| -------- | ------------------------------------------------------- |
| Host     | `useHost`、`useRenderRoot`、`useShadowRoot`、`useAttrs` |
| 模板引用 | `useTemplateRef`                                        |
| DOM 事件 | `useEventListener`、`useClickOutside`                   |
| 观察器   | `useResizeObserver`、`useIntersectionObserver`          |
| 交互控制 | `useEscapeKey`、`useScrollLock`、`useFocusTrap`         |
| 表单控件 | `useFormControlContext`、`createFormControlContext`     |

这些函数必须在组件 setup 同步阶段调用，也就是宏组件顶层。

---

# Host 与根节点

Custom Element 的外层元素叫 host。组件内部可以用 `useHost()` 获取它。

```ts
const host = useHost<HTMLElement>();
```

## 渲染根节点

```ts
const root = useRenderRoot();
```

如果组件启用 Shadow DOM，`useRenderRoot()` 返回 `ShadowRoot`；否则返回 host。

## ShadowRoot

```ts
const shadow = useShadowRoot();
```

当 `shadow: false` 时返回 `null`。

## Host 反射

```ts
useHostAttr("aria-expanded", () => open.value);
useHostFlag("data-open", () => open.value);
useHostCssVar("--panel-width", () => width.value);
useHostClass(() => ({ "is-open": open.value }));
```

这些 helper 适合把组件状态同步到 host，方便外部 CSS 和可访问性属性读取。

---

# 模板引用

`useTemplateRef()` 用来拿到模板中的 DOM 节点。

```ts
const input = useTemplateRef<HTMLInputElement>("input");

const focus = (): void => {
  input.value?.focus();
};

export const SearchInput = defineHtml(html`
  <input ref="input" />
  <button @click=${focus}>聚焦</button>
`);
```

## 和组件暴露配合

```ts
defineExpose({
  focus
});
```

父组件或外部页面拿到组件 host 后即可调用 `focus()`。详见“组件 / 组件暴露”。

---

# DOM 事件

`useEventListener()` 会在挂载时添加事件监听，在卸载前自动移除。

```ts
useEventListener(window, "resize", () => {
  console.log(window.innerWidth);
});
```

## 点击外部

```ts
const host = useHost();

useClickOutside(host, () => {
  open.set(false);
});
```

`useClickOutside()` 使用 composed path 判断，适合 Shadow DOM 组件。

## 使用建议

组件内部节点的普通点击事件优先写在模板里。全局对象、document、window 或跨 Shadow DOM 的事件，更适合内置组合式函数。

---

# 观察器

ElfUI 提供 ResizeObserver 和 IntersectionObserver 的生命周期封装。

## useResizeObserver

```ts
const host = useHost();
const width = useRef(0);

useResizeObserver(host, (entry) => {
  width.set(entry.width);
});
```

适合布局、弹层定位、响应式组件尺寸计算。

## useIntersectionObserver

```ts
const root = useTemplateRef<HTMLElement>("root");

useIntersectionObserver(root.value, (entry) => {
  if (entry.isIntersecting) {
    visible.set(true);
  }
});
```

适合懒加载、滚动触发、Tour 引导定位。

---

# 交互控制

交互控制函数用于弹层、抽屉、提示和可访问性场景。

## ESC 关闭

```ts
useEscapeKey(() => {
  open.set(false);
});
```

## 滚动锁定

```ts
useScrollLock(() => open.value);
```

当 `open` 为 true 时锁定 `document.body` 滚动，组件卸载时会自动恢复。

## 焦点陷阱

```ts
const host = useHost();

useFocusTrap(host);
```

适合 Dialog、Drawer、PopConfirm 这类需要把 Tab 焦点限制在组件内部的场景。

---

# 表单控件

ElfUI 支持 form-associated custom elements。组件启用 `formControl` 后，可以参与原生表单提交、校验和重置。

```ts
import { defineHtml, defineOptions, html, useFormControlContext } from "@elfui/core";

defineOptions({
  formControl: true
});

const form = useFormControlContext<string>();

const onInput = (event: Event): void => {
  form.setValue((event.target as HTMLInputElement).value);
};

export const ElfInput = defineHtml(html` <input @input=${onInput} /> `);
```

## 校验

```ts
form.rules([
  {
    validator: (value) => value.length > 0 || "请输入内容"
  }
]);

await form.validate();
form.report();
```

## 重置

```ts
form.reset();
```

表单控件文档只讲 Custom Element 和原生 form 的连接。业务表单组件如何布局、展示错误，属于组件库设计。

---

# 内置组件

# Teleport

`Teleport` 把内容渲染到当前组件树之外的目标容器，常用于 Dialog、Drawer、Tooltip。

```html
<Teleport to="body">
  <div class="dialog">内容</div>
</Teleport>
```

## disabled

```html
<Teleport to="body" :disabled="inline">
  <div>内容</div>
</Teleport>
```

禁用时内容留在当前位置。

## 使用建议

弹层类组件通常需要配合 `useScrollLock()`、`useEscapeKey()`、`useFocusTrap()` 和 `useClickOutside()`。

---

# Transition

`Transition` 给单个子节点提供 enter/leave 过渡。

```html
<Transition name="fade">
  <div v-if="open">内容</div>
</Transition>
```

默认 class：

```css
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
```

## appear

```html
<Transition name="fade" appear>
  <div>首次挂载也过渡</div>
</Transition>
```

复杂动画建议用 CSS 变量控制持续时间和 easing。

---

# TransitionGroup

`TransitionGroup` 用于列表 enter/leave 和 keyed 重排动画。

```html
<TransitionGroup name="list" tag="ul">
  <li v-for="item in items" :key="item.id">{{ item.name }}</li>
</TransitionGroup>
```

## move class

列表重排时会应用 move class：

```css
.list-move {
  transition: transform 0.2s ease;
}
```

## 使用建议

列表项必须有稳定 key。没有 key 的列表无法可靠计算移动动画。

---

# KeepAlive

`KeepAlive` 缓存动态组件实例，切换时保留内部状态。

```html
<KeepAlive>
  <component :is="current"></component>
</KeepAlive>
```

## include / exclude / max

```html
<KeepAlive :include="['user-page']" :max="10">
  <component :is="current"></component>
</KeepAlive>
```

## 生命周期

缓存组件会触发 `onActivated()` 和 `onDeactivated()`。详见“生命周期 / KeepAlive 生命周期”。

---

# Suspense

`Suspense` 用来承接异步 setup 或异步内容，提供 pending、resolved、error 三种状态。

```html
<Suspense>
  <template #default>
    <async-panel></async-panel>
  </template>
  <template #fallback> 加载中... </template>
  <template #error="{ error }"> 加载失败：{{ error.message }} </template>
</Suspense>
```

## 使用建议

把异步边界放在页面区域或复杂组件外层，不要给每个小节点都包 Suspense。

---

# 路由

# 路由快速开始

安装路由包：

```bash
pnpm add @elfui/router
```

创建路由：

```ts
import { createRouter } from "@elfui/router";

export const router = createRouter({
  mode: "hash",
  routes: [
    { path: "/", component: () => import("./pages/Home") },
    { path: "/users/:id", component: () => import("./pages/User") }
  ]
});
```

页面中使用：

```html
<elf-link to="/">首页</elf-link> <elf-router-view></elf-router-view>
```

`createRouter()` 会设置 active router 并注册路由元素。

---

# 路由配置

路由记录使用 `RouteRecord`：

```ts
const routes = [
  {
    path: "/users/:id",
    name: "user",
    component: () => import("./pages/User"),
    meta: { requiresAuth: true }
  }
];
```

## mode

| mode      | 说明                        |
| --------- | --------------------------- |
| `hash`    | 默认适合静态部署            |
| `history` | 需要服务器回退到 index.html |
| `memory`  | 测试或非浏览器环境          |

## children

```ts
{
  path: "/settings",
  component: SettingsLayout,
  children: [
    { path: "", component: SettingsHome },
    { path: "profile", component: ProfilePage }
  ]
}
```

嵌套路由由不同深度的 `<elf-router-view>` 渲染。

---

# 导航

模板里使用 `<elf-link>`：

```html
<elf-link to="/users/1">用户</elf-link>
```

组件逻辑里使用 `useRouter()`：

```ts
const router = useRouter();

const goHome = (): void => {
  void router.push("/");
};
```

当前路由使用 `useRoute()`：

```ts
const route = useRoute();

const id = useComputed(() => route.params.id);
```

## useLink

`useLink({ to })` 适合自定义链接组件，能拿到 href、active 状态和 navigate 方法。

---

# 路由视图

`<elf-router-view>` 渲染当前匹配到的路由组件。

```html
<elf-router-view></elf-router-view>
```

## 嵌套路由

父页面中放第二个 router view：

```html
<section class="settings">
  <aside>...</aside>
  <elf-router-view depth="1"></elf-router-view>
</section>
```

## 异步组件

路由组件可以是动态 import：

```ts
{
  path: "/reports",
  component: () => import("./pages/Reports")
}
```

路由会在进入页面时加载组件并确保 Custom Element 注册。

---

# 路由守卫

路由守卫用于控制导航流程。

```ts
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !auth.loggedIn.value) {
    return "/login";
  }
});
```

## 路由级守卫

```ts
{
  path: "/admin",
  component: AdminPage,
  beforeEnter: () => {
    return canEnterAdmin() || "/login";
  }
}
```

## 组件内守卫

```ts
onBeforeRouteLeave(() => {
  if (dirty.value) {
    return window.confirm("放弃修改？");
  }
});
```

导航失败可以用 `isNavigationFailure()` 判断。

---

# 配置

# 全局配置

全局配置使用 `configure()`，只处理运行时行为。

```ts
import { configure } from "@elfui/core";

configure({
  globalProperties: {
    appName: "Console"
  },
  warnHandler(message) {
    console.warn(message);
  },
  errorHandler(error, info) {
    console.error(info, error);
  }
});
```

## 配置项

| 选项               | 说明                 |
| ------------------ | -------------------- |
| `globalProperties` | 项目级全局属性预留位 |
| `warnHandler`      | 全局警告处理         |
| `errorHandler`     | 全局错误处理         |

`tagPrefix` 不再属于 `configure()`。宏组件 tag 在编译期确定，需要在 `@elfui/vite-plugin` 中配置。

## 读取和重置

```ts
import { getConfig, resetConfig } from "@elfui/core";

const config = getConfig();

resetConfig();
```

测试环境建议在每个用例后 `resetConfig()`，避免全局 handler 或全局属性影响其它测试。

---

# CSP 与体积

宏组件主线在构建期编译模板，浏览器运行时不需要 `new Function`，更适合严格 CSP。

```ts
import { defineHtml, html } from "@elfui/core";
```

`@elfui/core` 主入口不包含 runtime compiler，当前 gzip 约 10.52 KB。

## Chain 的边界

`@elfui/chain` 支持：

```ts
ElfUI.createComponent().template(`<button>{{ count }}</button>`);
```

这需要 runtime compiler，体积约 21.19 KB，也可能触及更严格的 CSP 限制。它适合旧站渐进嵌入、小 demo 或低构建约束环境，不是新项目主线。

## 建议

生产应用优先：

1. 使用 `@elfui/core` 主入口。
2. 使用 `@elfui/vite-plugin` 编译宏组件。
3. 把链式组件限制在生态扩展或迁移期代码里。

---

# 错误处理

# 错误处理概览

ElfUI 的错误处理分四层：

| 层级     | API                                        |
| -------- | ------------------------------------------ |
| 组件捕获 | `onErrorCaptured`                          |
| 错误边界 | `errorBoundary` / `captureError`           |
| 全局处理 | `configure({ errorHandler, warnHandler })` |
| 编译诊断 | Vite 插件和宏编译器诊断                    |

业务组件优先在局部处理可恢复错误。全局 handler 适合日志上报和兜底提示。

---

# 组件错误捕获

`onErrorCaptured()` 捕获子组件冒泡上来的错误。

```ts
onErrorCaptured((err) => {
  console.error(err);
  return false;
});
```

返回 `false` 表示阻止继续向上冒泡。

## 使用场景

- 局部错误提示
- 子组件失败后展示 fallback
- 阻止错误污染整页

如果需要完整的 fallback/retry 结构，可以使用错误边界。

---

# 错误边界

runtime 提供 `errorBoundary()` 和 `captureError()`，用于构建可恢复错误区域。

```ts
import { captureError, useRef } from "@elfui/core";

const error = useRef<unknown>(null);

captureError((err) => {
  error.set(err);
});
```

当子组件抛错时，可以切换到本组件的 fallback 状态。

## 建议

普通业务页面可以用状态控制 fallback。只有手写 render 或封装框架级组件时，才需要直接使用底层 `errorBoundary()` helper。

---

# 全局错误处理

全局错误和警告通过 `configure()` 配置。

```ts
import { configure } from "@elfui/core";

configure({
  errorHandler(err, info) {
    reportError(err, info);
  },
  warnHandler(message, ...args) {
    console.warn("[ElfUI]", message, ...args);
  }
});
```

## 使用建议

全局 handler 适合：

- 日志上报
- 统一告警
- 测试环境把 warn 转为失败

不要把业务恢复逻辑都放到全局 handler。能局部恢复的错误，应放在组件错误捕获或错误边界里。

---

# 编译诊断

`@elfui/vite-plugin` 会对宏组件给出构建期诊断。

常见诊断：

| 场景                                 | 处理                                        |
| ------------------------------------ | ------------------------------------------- |
| 导入宏 API 但没有导出 `defineHtml()` | 补组件导出或删除宏导入                      |
| 使用已移除宏别名                     | 改为 `defineProps` / `defineEmits` 等新 API |
| pragma 位置不合法                    | 移到文件顶部或改用普通 `.ts` 导出           |

## 严格模式

```ts
elfuiMacroPlugin({
  strictDiagnostics: true,
  templateTypeCheck: true
});
```

`strictDiagnostics` 适合 CI；`templateTypeCheck` 适合组件库和 beta 前质量门禁。

---

# 插件

# 插件概览

ElfUI 插件用于批量注册全局指令、修改运行时配置或封装项目约定。

```ts
import { createApp } from "@elfui/core";

createApp(AppRoot).use(myPlugin, options).mount("#app");
```

插件可以是函数，也可以是带 `install()` 的对象。

## 适合做什么

- 注册一组全局指令
- 安装项目级默认配置
- 封装监控、日志、主题初始化

组件本身的局部依赖不要做成插件，优先使用 `useComponents()`。

---

# 使用插件

```ts
import { createApp } from "@elfui/core";
import { focusPlugin } from "./focus-plugin";

createApp(AppRoot).use(focusPlugin).mount("#app");
```

传入配置：

```ts
createApp(AppRoot).use(focusPlugin, { autoSelect: true }).mount("#app");
```

同一个插件实例只会安装一次，重复调用会被忽略。

## 安装顺序

插件通常在应用启动时安装，并且应该早于根组件挂载：

```ts
import { createApp } from "@elfui/core";

createApp(AppRoot).use(appPlugin).mount("#app");
```

---

# 自定义插件

插件可以写成函数：

```ts
import type { ElfUIAppPluginFn } from "@elfui/core";

export const focusPlugin: ElfUIAppPluginFn = (app) => {
  app.directive("focus", {
    mounted(el) {
      (el as HTMLElement).focus();
    }
  });
};
```

也可以写成对象：

```ts
import type { ElfUIAppPluginObject } from "@elfui/core";

export const appPlugin: ElfUIAppPluginObject<{ appName?: string }> = {
  install(app, options) {
    if (options?.appName) {
      app.config.globalProperties.appName = options.appName;
    }
  }
};
```

## App 实例

插件拿到的是 `createApp()` 创建的应用实例：

| 成员                       | 作用           |
| -------------------------- | -------------- |
| `app.directive(name, def)` | 注册全局指令   |
| `app.component(component)` | 注册全局组件   |
| `app.provide(key, value)`  | 注入应用级依赖 |
| `app.config`               | 应用级配置     |

同一个 app 实例中，同一个插件对象只会安装一次；不同 app 可以分别安装自己的插件和配置。

---

# 生态

# Chain 链式组件

`@elfui/chain` 是生态扩展包，面向旧站渐进嵌入、小 demo、低构建约束页面。它保留链式 builder，并内置 runtime compiler，因此支持 `.template()`。

```bash
pnpm add @elfui/chain
```

```ts
import { ElfUI, useRef } from "@elfui/chain";

ElfUI.createComponent()
  .name("elf-counter")
  .setup(() => {
    const count = useRef(0);
    const inc = (): void => count.set(count.peek() + 1);
    return { count, inc };
  })
  .template(`<button @click="inc">Count: {{ count }}</button>`)
  .register();
```

## 能力边界

| 能力             | Chain                    |
| ---------------- | ------------------------ |
| 链式 builder     | `createComponent()`      |
| 运行时模板       | `.template()`            |
| 局部组件         | `.use()`                 |
| 组件扩展         | `extend()` / `variant()` |
| runtime compiler | 包内携带                 |

## 不和主线混写

新项目文档和组件示例都使用 `@elfui/core` 宏组件。Chain 是独立扩展，不在组件主线里穿插介绍。

如果项目已经有构建工具，优先迁移到宏组件；如果只是给旧 HTML 页面加几个 Web Components，Chain 会更轻松。

---

# Vite 插件

`@elfui/vite-plugin` 负责把普通 `.ts/.tsx` 宏组件编译为运行时 render 函数。

```ts
import { defineConfig } from "vite";
import { elfuiMacroPlugin } from "@elfui/vite-plugin";

export default defineConfig({
  plugins: [elfuiMacroPlugin()]
});
```

## tagPrefix

宏组件的 tag 名称在编译期确定，因此 `tagPrefix` 只能配置在 Vite 插件里，不能通过运行时 `configure()` 修改。

```ts
import { defineConfig } from "vite";
import { elfuiMacroPlugin } from "@elfui/vite-plugin";

export default defineConfig({
  plugins: [
    elfuiMacroPlugin({
      tagPrefix: "acme"
    })
  ]
});
```

```ts
import { defineHtml, html } from "@elfui/core";

export const UserCard = defineHtml(html`<article><slot></slot></article>`);
```

上面的组件会编译为 `acme-user-card`。`tagPrefix: "acme-"` 也会被规整为同样的结果，但推荐写不带结尾横杠的 `"acme"`。

## 自动识别

插件会识别这些文件：

```ts
export const Button = defineHtml(html`<button><slot></slot></button>`);
```

```ts
const Button = defineHtml(html`<button><slot></slot></button>`);

export { Button };
```

```ts
export default defineHtml(html`<button><slot></slot></button>`);
```

`.elf.ts` 和文件头 pragma 仍兼容，但新项目不需要。

## 诊断选项

```ts
elfuiMacroPlugin({
  strictDiagnostics: true,
  templateTypeCheck: true
});
```

组件库建议开启；普通应用可以先使用默认配置。

---

# VS Code 插件

VS Code 插件围绕宏组件主线提供三类能力：

- 识别普通 `.ts/.tsx` 中导出的 `defineHtml()` 组件。
- 提供宏组件 snippet。
- 展示模板和宏 API 诊断。

## 目标体验

```ts
import { defineHtml, html } from "@elfui/core";

export const UserCard = defineHtml(html`
  <article>
    <slot></slot>
  </article>
`);
```

编辑器应该能围绕这个文件直接理解组件边界，而不是要求用户改成特殊文件格式。

## 兼容路径

`.elf.ts` 和 pragma 文件会保留兼容，但 snippet 和官方文档以普通 `.ts/.tsx` 为主。

---

# 迁移

# 从 Vue 迁移

ElfUI 保留了很多 Vue 用户熟悉的模板心智，但组件模型和运行时不同。

| Vue             | ElfUI                           |
| --------------- | ------------------------------- |
| SFC             | 普通 `.ts/.tsx` 宏组件          |
| `ref()`         | `useRef()`                      |
| `reactive()`    | `useReactive()`                 |
| `computed()`    | `useComputed()` 或 `computed()` |
| `emit()`        | `defineEmits()`                 |
| `defineModel()` | `defineModel()`                 |
| Vue 组件        | Custom Element                  |

## 状态

```ts
const count = useRef(0);
count.set(count.peek() + 1);
```

对象：

```ts
const user = useReactive({ name: "Elf" });
user.name = "ElfUI";
```

## 组件输出

ElfUI 组件注册后是原生标签：

```html
<elf-counter></elf-counter>
```

这让它可以被 Vue、React、Angular 或普通 HTML 使用。

---

# 从链式迁移到组件

链式组件仍可用，但新项目主线是宏组件。

## Counter 对照

链式：

```ts
ElfUI.createComponent()
  .name("elf-counter")
  .setup(() => {
    const count = useRef(0);
    return { count, inc: () => count.set(count.peek() + 1) };
  })
  .template(`<button @click="inc">{{ count }}</button>`)
  .register();
```

宏组件：

```ts
const count = useRef(0);
const inc = (): void => count.set(count.peek() + 1);

export const Counter = defineHtml(html` <button @click=${inc}>${count}</button> `);
```

## 迁移规则

| 链式             | 宏组件                                 |
| ---------------- | -------------------------------------- |
| `.name()`        | 导出名推断或 `defineName()`            |
| `.props()`       | `defineProps()`                        |
| `.emits()`       | `defineEmits()`                        |
| `.template()`    | `defineHtml(html`...`)`                |
| `.style()`       | `defineStyle(css`...`)`                |
| `.use()`         | `useComponents()`                      |
| `.formControl()` | `defineOptions({ formControl: true })` |

迁移时先保持模板行为不变，再逐步改类型和样式组织。

---

# 废弃 API

1.0 beta 主线已经收口，旧 API 不再进入官网主路径。

| 旧 API                                     | 替代                                   |
| ------------------------------------------ | -------------------------------------- |
| `useState`                                 | `useRef` / `useReactive`               |
| `useShallowState`                          | `useShallowRef` / `useShallowReactive` |
| `useName`                                  | `defineName`                           |
| `useProps`                                 | `defineProps`                          |
| `useEmit`                                  | `defineEmits`                          |
| `useStyle`                                 | `defineStyle`                          |
| `defineTyped`                              | `defineHtml<Props, Emits, Slots>`      |
| `ElfUI.createComponent` from `@elfui/core` | `@elfui/chain`                         |

如果编译器发现旧宏别名，会给出迁移诊断。新代码不要继续使用这些入口。

---

# API参考

# elfui API

`@elfui/core` 是新项目主入口。

## 宏组件

`defineHtml`、`html`、`css`、`defineProps`、`defineEmits`、`defineModel`、`defineSlots`、`defineStyle`、`defineOptions`、`defineDirective`、`defineName`、`useComponents`

## 响应式

`useRef`、`useReactive`、`useShallowRef`、`useShallowReactive`、`useComputed`、`computed`、`useEffect`、`watch`、`watchEffect`、`watchPostEffect`、`watchSyncEffect`、`nextTick`

## 生命周期

`onBeforeMount`、`onMount`、`onBeforeUpdate`、`onUpdated`、`onBeforeUnmount`、`onUnmount`、`onActivated`、`onDeactivated`、`onErrorCaptured`

## 应用与 Runtime 用户 API

`createApp`、`registerComponents`、`defineComponent`、`defineCustomElement`、`ensureCustomElement`

## 内置组合式函数

`useHost`、`useRenderRoot`、`useShadowRoot`、`useAttrs`、`useTemplateRef`、`defineExpose`、`useEventListener`、`useClickOutside`、`useEscapeKey`、`useScrollLock`、`useFocusTrap`、`useResizeObserver`、`useIntersectionObserver`、`useFormControlContext`

链式 builder 不在 `@elfui/core` 中导出。需要链式 API 时使用 `@elfui/chain`。

---

# reactivity API

`@elfui/reactivity` 是响应式系统独立入口。

## 状态

`useRef`、`useReactive`、`useShallowRef`、`useShallowReactive`

## 派生与副作用

`useComputed`、`useEffect`、`watch`、`watchEffect`、`watchPostEffect`、`watchSyncEffect`

## 调度

`nextTick`、`queueJob`、`queuePostFlushJob`、`flushSync`

## 工具

`readonly`、`isReadonly`、`isState`、`isRef`、`isReactive`、`isProxy`、`markRaw`、`toRaw`、`unref`、`toValue`

## 作用域

`effectScope`、`getCurrentScope`、`onScopeDispose`

底层 `effect`、`track`、`trigger` 也从该包导出，但应用代码通常不需要直接使用。

---

# runtime API

`@elfui/runtime` 是高级组件作者入口。业务应用通常从 `@elfui/core` 导入即可。

## 组件定义

`defineComponent`、`defineCustomElement`、`ensureCustomElement`、`registerComponents`、`resolveComponentTag`

## 生命周期和协作

`onMount`、`onUnmount`、`onUpdated`、`onErrorCaptured`、`provide`、`inject`、`createInjectionKey`

## 指令、配置、插件

`directive`、`resetDirectives`、`configure`、`getConfig`、`resetConfig`、`usePlugin`

## Host 和 DOM

`useHost`、`useShadowRoot`、`useRenderRoot`、`useAttrs`、`useTemplateRef`、`defineExpose`

## 内置 helper

`teleport`、`transition`、`transitionGroup`、`keepAlive`、`suspense`、`dynamicComponent`、`projectLightDom`

编译产物 helper 在 `@elfui/runtime/internal`，业务代码不要依赖 internal 子入口。

---

# router API

`@elfui/router` 提供路由能力。

## 创建与访问

`createRouter`、`setActiveRouter`、`getActiveRouter`

## 组件

`registerRouterElements`、`<elf-link>`、`<elf-router-view>`

## 组合式 API

`useRouter`、`useRoute`、`useLink`、`onBeforeRouteLeave`、`onBeforeRouteUpdate`

## 导航失败

`isNavigationFailure`、`NavigationFailureType`

## 类型

`Router`、`RouterOptions`、`RouteRecord`、`RouteLocation`、`NavigationGuard`、`ScrollBehaviorFn`

---

# chain API

`@elfui/chain` 是链式组件扩展包。

## Builder

`ElfUI.createComponent()` / `createComponent()` 返回 `ElementBuilder`。

```ts
createComponent()
  .name("elf-demo")
  .props({})
  .setup(() => ({}))
  .template(`<p>demo</p>`)
  .style(`p { color: red; }`)
  .register();
```

## Builder 方法

`name`、`props`、`setup`、`render`、`template`、`style`、`shadow`、`formControl`、`emits`、`emitOptions`、`use`、`directive`、`build`、`register`、`toDefinition`

## 复用

`extend()`、`variant()`

## 其它导出

Chain 会重导出常用 reactivity/runtime API，方便链式场景单入口使用。但它不导出宏组件 API。

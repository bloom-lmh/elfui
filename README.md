<p align="center">
  <img src="https://raw.githubusercontent.com/bloom-lmh/elfui/main/assets/elfui-snowflake.png" width="156" alt="ElfUI snowflake logo">
</p>

<h1 align="center">ElfUI</h1>

<p align="center">A compile-time, fine-grained reactive framework for native Web Components.</p>

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

ElfUI defines components in ordinary TypeScript files, compiles templates into direct DOM updates, and outputs standard Custom Elements. It combines Vue-inspired templates and composition, Solid-inspired fine-grained updates, and Lit's respect for the Web Components platform.

> TypeScript in, Custom Elements out.

## 🧭 Requirements

| Tool    | Version                   |
| ------- | ------------------------- |
| Node.js | `^20.19.0` or `>=22.12.0` |
| pnpm    | `>=10.28.0` (recommended) |

npm, Yarn, and Bun are also supported. The examples below use pnpm.

## 🚀 Quick start

Use the official scaffold to create a project and install its dependencies:

```bash
pnpm create elfui@beta my-app --install
cd my-app
pnpm dev
```

The interactive scaffold can configure TypeScript, Macro components, styling, Router, testing, code quality, and CI. To use the recommended defaults directly:

```bash
pnpm create elfui@beta my-app --default --install
```

Install [ElfUI Language Tools](https://marketplace.visualstudio.com/items?itemName=SWUST-WEBLAB-LMH.elfui-language-features) for template highlighting, completion, diagnostics, navigation, and formatting.

## 🗂️ Repository structure (Monorepo)

This repository is a pnpm workspace with the following primary packages:

| Path                                                       | Purpose                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| [`packages/elfui`](packages/elfui)                         | Public entry point (`@elfui/core`)                              |
| [`packages/reactivity`](packages/reactivity)               | Fine-grained reactivity (`@elfui/reactivity`)                   |
| [`packages/runtime`](packages/runtime)                     | Component runtime and Web Components helpers (`@elfui/runtime`) |
| [`packages/compiler-template`](packages/compiler-template) | HTML template parser (`@elfui/compiler-template`)               |
| [`packages/compiler`](packages/compiler)                   | Macro component compiler (`@elfui/compiler`)                    |
| [`packages/vite-plugin`](packages/vite-plugin)             | Vite compiler integration (`@elfui/vite-plugin`)                |
| [`packages/shared`](packages/shared)                       | Internal shared utilities (`@elfui/shared`)                     |

## ✨ Features

- **TypeScript file components**: no `.vue` files and no JSX requirement.
- **Compile-time templates**: analyze templates, produce diagnostics, and generate direct DOM operations during the build.
- **Fine-grained reactivity**: every dynamic point subscribes only to the state it reads.
- **No VNode or patch loop**: state changes update the corresponding DOM directly.
- **Standard Web Components**: output Custom Elements for native pages and other frameworks.
- **Shadow DOM boundaries**: isolate internals while exposing CSS variables and `::part()` styling contracts.
- **Complete component model**: Props, Emits, Model, Slots, lifecycle hooks, directives, plugins, and built-ins.
- **Independent ecosystem packages**: install Router, UI Kit, Language Tools, and Chain only when needed.

## 📦 Installation

Prefer the scaffold for new projects. To add ElfUI to an existing Vite project:

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

Router is an independent package and must be installed separately:

```bash
pnpm add @elfui/router@beta
```

## 🧩 Your first component

```ts
// Counter.ts
import { css, defineHtml, defineStyle, html, useRef } from "@elfui/core";

defineStyle(css`
  :host {
    display: inline-block;
  }

  button {
    padding: 8px 12px;
  }
`);

const count = useRef(0);
const increment = (): void => count.set(count.peek() + 1);

export default defineHtml(html` <button @click=${increment}>Clicked ${count} times</button> `);
```

Register and mount the root component with `createApp`. You do not need to place its Custom Element tag in `index.html` manually:

```ts
// main.ts
import { createApp } from "@elfui/core";
import Counter from "./Counter";

createApp(Counter).mount("#app");
```

## 🏗️ Component structure

A Macro component combines ordinary top-level TypeScript with an exported `defineHtml(html\`...\`)` template:

| API               | Purpose                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `defineProps()`   | Declare external properties and their types                        |
| `defineEmits()`   | Declare component events                                           |
| `defineModel()`   | Declare a `v-model` contract                                       |
| `defineSlots()`   | Declare the slot contract                                          |
| `defineOptions()` | Configure Shadow DOM, form control behavior, and component options |
| `defineStyle()`   | Declare component styles                                           |
| `defineExpose()`  | Expose instance methods to a parent                                |
| `useComponents()` | Register local components used by the template                     |
| `defineHtml()`    | Define and export the component template                           |

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

const props = defineProps<{ label: string }>();
const emit = defineEmits<{ save: [value: string] }>();
const value = defineModel<string>({ default: "" });

defineSlots<{ default: () => unknown }>();
defineOptions({ shadow: "open" });

export const SaveField = defineHtml(html`
  <label>${props.label}</label>
  <input .value=${value} />
  <button @click=${() => emit("save", value.value)}>Save</button>
  <slot></slot>
`);
```

## ⚡ Reactivity

Use `useRef` for primitives or replaceable values, and `useReactive` for objects, arrays, and collections:

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

`batch()` defers and deduplicates synchronous effects until the outermost batch completes. Compiled template event handlers create this boundary automatically.

| API                         | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `useRef()`                  | Create a Ref with `.value`, `.set()`, and `.peek()`            |
| `useReactive()`             | Create a deeply reactive object, array, Map, or Set            |
| `useComputed()`             | Create lazy derived state                                      |
| `useEffect()`               | Track dependencies and manage side effects and cleanup         |
| `watch()` / `watchEffect()` | Observe explicit sources or automatically tracked dependencies |
| `batch()`                   | Group synchronous writes into one effect notification          |

## 🔄 Component lifecycle

```ts
import { onMounted, onUnmounted } from "@elfui/core";

onMounted(() => {
  console.log("component mounted");
});

onUnmounted(() => {
  console.log("component unmounted");
});
```

| Phase                    | Hooks                            |
| ------------------------ | -------------------------------- |
| Before and after mount   | `onBeforeMount`, `onMounted`     |
| Before and after update  | `onBeforeUpdate`, `onUpdated`    |
| Before and after unmount | `onBeforeUnmount`, `onUnmounted` |
| Attribute changes        | `onAttributeChanged`             |
| Cache activation         | `onActivated`, `onDeactivated`   |
| Error capture            | `onErrorCaptured`                |

## 🎨 Styling

Use a `css` template directly, or import an external stylesheet as generated by the scaffold:

```ts
import { defineStyle } from "@elfui/core";
import styles from "./Button.scss?inline";

defineStyle(styles);
```

Shadow DOM isolates component styles. Components can consume CSS custom properties and expose intentional external styling points through `part`:

```ts
export const Button = defineHtml(html` <button part="control"><slot></slot></button> `);
```

```css
elf-button {
  --button-color: #16803c;
}

elf-button::part(control) {
  font-weight: 600;
}
```

`:class=${...}` accepts strings, arrays, and objects. `:style=${...}` accepts style objects and CSS variables.

## 🧷 Slots

ElfUI follows the standard Web Components slot model with default and named slots:

```ts
export const Panel = defineHtml(html`
  <header><slot name="title"></slot></header>
  <section><slot></slot></section>
`);
```

```html
<elf-panel>
  <h2 slot="title">Title</h2>
  <p>Default slot content</p>
</elf-panel>
```

Use `defineSlots()` and `useScopedSlot()` when a parent needs to render data provided by a child through a scoped slot.

## 📝 Template expressions

ElfUI templates have three value sources:

| Value source                 | Syntax        | Example                          |
| ---------------------------- | ------------- | -------------------------------- |
| Static HTML                  | Plain strings | `class="panel"`                  |
| Surrounding TypeScript scope | `${...}`      | `${count}`, `@click=${save}`     |
| Template-local scope         | `{{ ... }}`   | `{{ item.name }}` inside `v-for` |

```ts
const open = useRef(true);
const items = useReactive([
  { id: 1, name: "Macro" },
  { id: 2, name: "Web Components" }
]);

export const FeatureList = defineHtml(html`
  <button @click=${() => open.set(!open.peek())}>Toggle</button>
  <ul v-if=${open} :class=${{ active: open }}>
    <li v-for="item in items" :key="item.id">{{ item.name }}</li>
  </ul>
`);
```

`${...}` consumes values from the TypeScript file. Use `{{ ... }}` only for compiler-created local variables from `v-for`, scoped slots, and similar template scopes.

## 🪄 Directives

| Directive                       | Purpose                                    |
| ------------------------------- | ------------------------------------------ |
| `v-if` / `v-else-if` / `v-else` | Create or remove conditional branches      |
| `v-for`                         | Render a keyed list                        |
| `v-show`                        | Toggle visibility while preserving the DOM |
| `v-model`                       | Bind form values or a component Model      |
| `v-once`                        | Render a region once                       |
| `v-memo`                        | Cache a template region by dependencies    |

Use `defineDirective()` for component-local custom directives and `app.directive()` for application-wide directives.

## 🔔 Events

Bind native events with `@event=${handler}`:

```ts
const submit = (event: SubmitEvent): void => {
  event.preventDefault();
};

export const Form = defineHtml(html`
  <form @submit=${submit}>
    <button type="submit">Submit</button>
  </form>
`);
```

Templates support event modifiers such as `.stop`, `.prevent`, `.once`, `.capture`, and `.passive`. Events declared with `defineEmits()` are exposed as standard Custom Events. One argument becomes `detail` directly, while multiple arguments become an array; `bubbles`, `composed`, and `cancelable` default to `false`.

Configure a specific component event when it needs to cross a Shadow DOM boundary or be cancelable. `emit()` returns the boolean result of `dispatchEvent()`:

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

Enable `bubbles/composed` only for events that intentionally participate in DOM propagation, so internal component events do not escape their boundary accidentally.

## 🚦 Applications

`createApp()` creates isolated application instances. Each instance has its own configuration, plugins, global components, directives, and dependency injection context:

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

You can create multiple applications on the same page. Each application can mount successfully once and can later be removed with `app.unmount()`. If an invalid selector, a missing target, or mount preparation causes the attempt to fail, fix the cause and retry `mount()` on the same application.

## 🧱 Built-in components

| Built-in                         | Purpose                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `Teleport`                       | Render overlay content outside the current component tree |
| `Transition` / `TransitionGroup` | Manage enter, leave, and list transitions                 |
| `KeepAlive`                      | Preserve temporarily inactive component instances         |
| `Suspense`                       | Coordinate asynchronous content, fallbacks, and errors    |

## 🧬 Composables

| API                                | Purpose                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| `useTemplateRef()`                 | Access template elements or component instances with types |
| `useHostAttr()` / `useHostClass()` | Reflect reactive state onto the Custom Element host        |
| `useExtend()` / `useVariant()`     | Extend a base component or create a component variant      |
| `useFormControlContext()`          | Build components that participate in native forms          |

See the [Chinese documentation](https://elfui-2igtsk.maozi.io/) or [English documentation](https://elfui-docs.vercel.app/en/) for complete guides and examples.

## 📐 Standard component pattern

Keep component directories straightforward:

```text
Button/
├─ index.ts
├─ style.scss
└─ types.ts       # Add only when the component exposes several public types
```

Recommended order:

1. Import dependencies and styles.
2. Declare the component contract with `defineProps`, `defineEmits`, and `defineModel`.
3. Create reactive state, computed values, and event handlers.
4. Register lifecycle hooks, host helpers, and local components.
5. Export `defineHtml(html\`...\`)` last.

## 🌐 Browser support

ElfUI outputs ES2022 and standard Custom Elements. It requires:

- Custom Elements v1
- Shadow DOM v1
- ES Modules and ES2022

Use currently supported Chrome, Edge, Firefox, and Safari releases. Older browsers require syntax transpilation by the application build and, when necessary, Web Components polyfills.

## 🌱 Ecosystem

| Project                                                                  | Purpose                                             |
| ------------------------------------------------------------------------ | --------------------------------------------------- |
| [`@elfui/core`](https://www.npmjs.com/package/@elfui/core)               | Macro components, reactivity, and application APIs  |
| [`@elfui/vite-plugin`](https://www.npmjs.com/package/@elfui/vite-plugin) | Macro compilation and template diagnostics          |
| [ElfUI Router](https://github.com/bloom-lmh/elfui-router)                | Independent routing package                         |
| [Create ElfUI](https://github.com/bloom-lmh/create-elfui)                | Official project and component scaffold             |
| [ElfUI Kit](https://github.com/bloom-lmh/elfui-kit)                      | Official UI component library                       |
| [Language Tools](https://github.com/bloom-lmh/elfui-language-tools)      | VS Code extension and language server               |
| [Extensions](https://github.com/bloom-lmh/elfui-extensions)              | Optional extensions including Chain                 |
| [Documentation](https://github.com/bloom-lmh/elfui-docs)                 | Guides, API references, and ecosystem documentation |

Macro + Vite is the recommended path. Chain is an independent extension for runtime templates, progressive adoption, and no-build scenarios.

## 🛠️ Local development

```bash
pnpm install
pnpm verify
pnpm verify:publish
```

`pnpm verify` runs boundary checks, formatting, linting, type checking, builds, unit tests, and template type checks. `pnpm verify:publish` creates a temporary consumer from the actual npm tarballs and verifies ESM, SSR imports, types, exports, tree shaking, and esbuild, Rollup, and Vite builds.

## 🤝 Contributing

Issues and pull requests are welcome. Run `pnpm verify` before submitting changes and use Conventional Commits for commit messages.

## 📄 License

[MIT](./LICENSE) © ElfUI contributors

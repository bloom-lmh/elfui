<p align="center">
  <img src="https://raw.githubusercontent.com/bloom-lmh/elfui/main/assets/elfui-snowflake.png" width="156" alt="ElfUI snowflake logo">
</p>

<h1 align="center">ElfUI</h1>

<p align="center">A compiler-first, fine-grained reactive component framework for native Web Components.</p>

<p align="center">
  <a href="https://elfui-2igtsk.maozi.io/">中文文档</a> ·
  <a href="https://elfui-docs.vercel.app/en/">English docs</a> ·
  <a href="https://github.com/bloom-lmh/elfui">GitHub</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@elfui/core"><img src="https://img.shields.io/npm/v/%40elfui/core/beta?label=%40elfui%2Fcore&color=16803c" alt="npm beta"></a>
  <a href="https://developer.mozilla.org/docs/Web/API/Web_components"><img src="https://img.shields.io/badge/platform-Web%20Components-0d8fda" alt="Web Components"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/language-TypeScript-3178c6" alt="TypeScript"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-8a8a8a" alt="MIT License"></a>
</p>

## ✨ Why ElfUI

ElfUI borrows familiar template and composition ideas from Vue, fine-grained updates from Solid, and platform-first Custom Elements from Lit. It is not trying to replace them. It is a different answer for teams that want a modern component framework while keeping Web Components at the center.

| Choice                    | Result                                                                |
| ------------------------- | --------------------------------------------------------------------- |
| `.ts` / `.tsx` components | No `.vue` files and no JSX requirement.                               |
| Compile-time templates    | Diagnostics at build time; Macro components stay CSP-friendly.        |
| No VNode or patch loop    | Dynamic points update the DOM directly.                               |
| Fine-grained reactivity   | A state change only wakes the bindings that read it.                  |
| Standard Custom Elements  | Components work in an ElfUI app, an older page, or another framework. |
| Optional runtime compiler | Macro is the default; Chain keeps runtime templates as an extension.  |

## 🚀 Quick start

The official scaffold is the recommended path. It creates a Vite project and can add Router, Vitest, ESLint, Prettier, and your preferred stylesheet setup.

```bash
pnpm create elfui@beta my-app --install
cd my-app
pnpm dev
```

For an existing Vite project, install the core package and compiler plugin yourself:

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

## 🧩 TypeScript components, not special files

An exported `defineHtml(html\`...\`)` is a component. Top-level TypeScript is its setup logic, and the compiler turns the template into direct DOM bindings.

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

const props = defineProps<{ label: string }>(); // typed input
const emit = defineEmits<{ save: [] }>(); // typed Custom Event
const value = defineModel<string>({ default: "" }); // v-model contract
defineSlots<{ default: () => unknown }>(); // slot contract
defineOptions({ shadow: "open" }); // component options
// Use useComponents(Child) here when this component has local dependencies.

export const SaveField = defineHtml(html`
  <input .value=${value} />
  <button @click=${() => emit("save")}>${props.label}</button>
`);
```

Mount the root without hand-writing its tag in `index.html`:

```ts
import { createApp } from "@elfui/core";
import App from "./App";

createApp(App).mount("#app");
```

## 📝 Templates and directives

| Value source           | Syntax      | Example                          |
| ---------------------- | ----------- | -------------------------------- |
| Static HTML            | strings     | `class="panel"`                  |
| Surrounding TypeScript | `${...}`    | `${count}`, `@click=${save}`     |
| Template-local scope   | `{{ ... }}` | `{{ item.name }}` inside `v-for` |

```ts
import { defineHtml, html, useReactive, useRef } from "@elfui/core";

const open = useRef(true);
const items = useReactive([{ id: "elf", name: "ElfUI" }]);

export const Menu = defineHtml(html`
  <button @click=${() => open.set(!open.peek())}>Toggle</button>
  <ul v-if=${open}>
    <li v-for="item in items" :key="item.id">{{ item.name }}</li>
  </ul>
`);
```

Use `${...}` for a value owned by TypeScript. Use `{{ ... }}` only when the compiler creates a local template scope, such as `v-for` and scoped slots.

| Built-in directive | Purpose                                |
| ------------------ | -------------------------------------- |
| `v-if` / `v-else`  | Create or remove a branch              |
| `v-for`            | Render a keyed list                    |
| `v-show`           | Toggle display without unmounting      |
| `v-model`          | Bind form and component values         |
| event modifiers    | `.stop`, `.prevent`, `.once`, and more |

Use `defineDirective()` for a component-local DOM behavior, or `app.directive()` to register one for an application.

## ⚡ Reactivity and lifecycle

| Need                  | API                             |
| --------------------- | ------------------------------- |
| Primitive state       | `useRef()`                      |
| Object or array state | `useReactive()`                 |
| Derived state         | `useComputed()`                 |
| Automatic side effect | `useEffect()` / `watchEffect()` |

```ts
import { useComputed, useEffect, useRef } from "@elfui/core";

const quantity = useRef(1);
const price = useRef(16);
const total = useComputed(() => quantity.value * price.value);

useEffect(() => {
  document.title = `Total: ${total.value}`;
});
```

| Lifecycle group  | Hooks                                             |
| ---------------- | ------------------------------------------------- |
| Mount            | `onBeforeMount`, `onMount`                        |
| Update           | `onBeforeUpdate`, `onUpdated`                     |
| Unmount          | `onBeforeUnmount`, `onUnmount`                    |
| Cache and errors | `onActivated`, `onDeactivated`, `onErrorCaptured` |

## 🧬 Component collaboration and composables

| Job                              | API                                                 |
| -------------------------------- | --------------------------------------------------- |
| Parent input and child events    | `defineProps`, `defineEmits`                        |
| Shared value                     | `defineModel`, `v-model`                            |
| Content projection               | default and named `<slot>`                          |
| Render child data in the parent  | `defineSlots`, `useScopedSlot`                      |
| Cross-tree context               | `provide`, `inject`                                 |
| Expose an instance method        | `defineExpose`, `useTemplateRef`                    |
| Extend or specialize a component | `useExtend`, `useVariant`                           |
| Build a form component           | `useFormControlContext`, `createFormControlContext` |
| Reflect component state outward  | `useHostClass`, `useHostAttr`, `useHostCssVar`      |

`useExtend` and `useVariant` are component reuse tools, not class inheritance. They preserve the base component contract while producing a deliberate new component or variant.

## 🎨 Built-ins and styling boundaries

`Teleport` moves overlay content to a target outside the current component tree:

```html
<Teleport to="body">
  <div class="dialog">Dialog content</div>
</Teleport>
```

| Built-in                         | Use it for                          |
| -------------------------------- | ----------------------------------- |
| `Transition` / `TransitionGroup` | Enter, leave, and list motion       |
| `KeepAlive`                      | Preserving inactive component state |
| `Suspense`                       | Async fallback boundaries           |
| dynamic component                | Switching a component at runtime    |

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

Use `:class=${...}` with strings, arrays, or objects; use `:style=${...}` for inline style objects and CSS variables. `theme` / `useTheme` handle theme overrides. Shadow DOM keeps internals private, while `part` and `::part()` expose an intentional styling boundary for consumers.

## 🛠️ Application, router, and tooling

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

Router is intentionally separate:

```bash
pnpm add @elfui/router
```

Create it with `createRouter({ mode, routes })`, import its module before mounting the app, and use `<elf-link>` with `<elf-router-view>` in templates. The scaffold adds it automatically with `--router`.

`@elfui/vite-plugin` compiles Macro components, owns the build-time `tagPrefix` option, and can enable strict diagnostics plus template type checking. [Language Tools](https://github.com/bloom-lmh/elfui-language-tools) keeps editor completion, navigation, diagnostics, and formatting outside the runtime.

## 🧭 Compared with familiar ideas

| Framework | ElfUI takes                              | Different choice                                            |
| --------- | ---------------------------------------- | ----------------------------------------------------------- |
| Vue       | Templates and composition ergonomics     | Web Components, compile-time DOM bindings, no VNode runtime |
| Solid     | Fine-grained reactive updates            | HTML templates and Custom Elements rather than JSX          |
| Lit       | Platform-first components and Shadow DOM | A built-in reactive model and compiler-driven directives    |

Local jsdom micro-benchmarks are a health signal, not a universal ranking. In the current harness, ElfUI's median is **4.56 ms** for 200 hello mounts and **8.72 ms** for a 500 x 8 table update. Reproduce the baselines with `pnpm benchmark` and `pnpm benchmark:browser`.

## 🌱 Ecosystem, beta, and license

| Project                                                                  | Role                                                 |
| ------------------------------------------------------------------------ | ---------------------------------------------------- |
| [`@elfui/core`](https://www.npmjs.com/package/@elfui/core)               | Macro components, app API, and common framework APIs |
| [`@elfui/vite-plugin`](https://www.npmjs.com/package/@elfui/vite-plugin) | Macro compiler integration for Vite                  |
| [ElfUI Router](https://github.com/bloom-lmh/elfui-router)                | Independent routing package                          |
| [Create ElfUI](https://github.com/bloom-lmh/create-elfui)                | Official Vite project scaffold                       |
| [ElfUI Kit](https://github.com/bloom-lmh/elfui-kit)                      | Official UI component library                        |
| [Extensions](https://github.com/bloom-lmh/elfui-extensions)              | Optional extensions, including Chain                 |
| [Language Tools](https://github.com/bloom-lmh/elfui-language-tools)      | VS Code extension and language service               |
| [Docs](https://github.com/bloom-lmh/elfui-docs)                          | Guides and API reference                             |

**Beta path:** Macro components plus Vite. **Extension path:** Chain for runtime templates, legacy pages, and no-build usage. **License:** [MIT](./LICENSE).

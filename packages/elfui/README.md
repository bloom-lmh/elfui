# @elfui/core

The main Macro component entry for ElfUI.

```bash
pnpm add @elfui/core
pnpm add -D @elfui/vite-plugin
```

```ts
import { defineHtml, html, useRef } from "@elfui/core";

const count = useRef(0);

export const Counter = defineHtml(html`
  <button @click=${() => count.set(count.peek() + 1)}>Count: ${count}</button>
`);
```

Initialize DOM-owning integrations only after the component's final DOM and template refs are ready, and release them on teardown:

```ts
import { onMounted, onUnmounted, useTemplateRef } from "@elfui/core";

const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
let chart: { destroy(): void } | undefined;

onMounted(() => {
  chart = createChart(canvas.value!);
});

onUnmounted(() => {
  chart?.destroy();
});
```

`onMount` and `onUnmount` remain compatible aliases. External tools are not bundled with `@elfui/core`.

See the [ElfUI documentation](https://github.com/bloom-lmh/elfui-docs) for setup, templates, reactivity, and component APIs.

# @elfui/core

The single application-facing runtime entry for ElfUI. It exposes the stable
macro, reactivity, lifecycle, model, directive, plugin, and component APIs while
keeping the compiler and optional router in separate packages.

```bash
pnpm add @elfui/core
pnpm add -D @elfui/vite-plugin
```

```ts
import { defineHtml, useRef } from "@elfui/core";

const count = useRef(0);

export const Counter = defineHtml(`
  <button @click=${() => count.set(count.peek() + 1)}>Count: ${count}</button>
`);
```

Initialize DOM-owning integrations only after the component's final DOM and template refs are ready, and release them on teardown:

```ts
import { onMounted, useTemplateRef } from "@elfui/core";

const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
let chart: { destroy(): void } | undefined;

onMounted(() => {
  chart = createChart(canvas.value!);
  return () => chart?.destroy();
});
```

`onUnmounted()` remains available for resources that are not created directly by a mounted hook. External tools are not bundled with `@elfui/core`.

Application code should not need direct dependencies on `@elfui/runtime` or
`@elfui/reactivity`. Compiler-generated render helpers resolve through
`@elfui/core/internal`; that subpath is compiler-owned and is not an authoring API.

See the [ElfUI documentation](https://github.com/bloom-lmh/elfui-docs) for setup, templates, reactivity, and component APIs.

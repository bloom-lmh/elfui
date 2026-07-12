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

See the [ElfUI documentation](https://github.com/bloom-lmh/elfui-docs) for setup, templates, reactivity, and component APIs.

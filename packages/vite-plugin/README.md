# @elfui/vite-plugin

Vite integration for compiling ElfUI Macro components in ordinary `.ts` and `.tsx` files.

```bash
pnpm add @elfui/core
pnpm add -D @elfui/vite-plugin
```

```ts
import { defineConfig } from "vite";
import { elfuiMacroPlugin } from "@elfui/vite-plugin";

export default defineConfig({
  plugins: [elfuiMacroPlugin()]
});
```

Configure `tagPrefix`, strict diagnostics, and template type checking through `elfuiMacroPlugin()`.

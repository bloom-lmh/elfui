import { fileURLToPath } from "node:url";

const fromRoot = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url));

export const elfuiDevAliases = [
  { find: "@elfui/core/internal", replacement: fromRoot("packages/elfui/src/internal.ts") },
  { find: "@elfui/runtime/internal", replacement: fromRoot("packages/runtime/src/internal.ts") },
  { find: "@elfui/compiler/compile", replacement: fromRoot("packages/compiler/src/compile.ts") },
  {
    find: "@elfui/compiler/macro-component",
    replacement: fromRoot("packages/compiler/src/macro-component.ts")
  },
  { find: "@elfui/compiler/vite", replacement: fromRoot("packages/compiler/src/vite.ts") },
  { find: "@elfui/shared", replacement: fromRoot("packages/shared/src/index.ts") },
  { find: "@elfui/reactivity", replacement: fromRoot("packages/reactivity/src/index.ts") },
  { find: "@elfui/runtime", replacement: fromRoot("packages/runtime/src/index.ts") },
  {
    find: "@elfui/compiler-template",
    replacement: fromRoot("packages/compiler-template/src/index.ts")
  },
  { find: "@elfui/compiler", replacement: fromRoot("packages/compiler/src/index.ts") },
  { find: "@elfui/vite-plugin", replacement: fromRoot("packages/vite-plugin/src/index.ts") },
  { find: "@elfui/core", replacement: fromRoot("packages/elfui/src/index.ts") }
] as const;

---
"@elfui/reactivity": patch
"@elfui/runtime": patch
"@elfui/compiler": patch
"@elfui/core": patch
---

Stop published ESM from creating `globalThis.__DEV__`; use package-local development flags that remain statically removable from production bundles and safely default for direct ESM imports.

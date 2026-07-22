---
"@elfui/compiler": patch
"@elfui/core": patch
"@elfui/runtime": patch
"@elfui/vite-plugin": patch
---

Preserve component-instance lexical closures for macro-local directives, including captured props, refs, constants, and transitive helper functions, while retaining local-over-app resolution and directive cleanup behavior.

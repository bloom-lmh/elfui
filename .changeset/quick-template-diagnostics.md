---
"@elfui/shared": patch
"@elfui/reactivity": patch
"@elfui/runtime": patch
"@elfui/compiler-template": patch
"@elfui/compiler": patch
"@elfui/core": patch
"@elfui/vite-plugin": patch
---

Reuse bounded TypeScript program state for macro template diagnostics and prevent diagnostics from
imported files from being projected onto unrelated template expressions with matching line
numbers.

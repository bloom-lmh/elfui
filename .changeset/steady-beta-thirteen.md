---
"@elfui/shared": patch
"@elfui/reactivity": patch
"@elfui/runtime": patch
"@elfui/compiler-template": patch
"@elfui/compiler": patch
"@elfui/core": patch
"@elfui/vite-plugin": patch
---

Add the beta.13 framework protocol and integration hardening: exact compiler/Core/Vite compatibility
checks, Metadata v2 and build-only tooling callbacks, stable `useId()`, App plugin disposers,
form-associated lifecycle callbacks, and reactive named Fragment props. Named Fragment `:prop`
and replaced `v-bind` objects now update existing DOM bindings without recreating Fragment nodes.

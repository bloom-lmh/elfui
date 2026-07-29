---
"@elfui/compiler": minor
"@elfui/core": minor
"@elfui/runtime": patch
"@elfui/vite-plugin": patch
---

Remove the `fragment` and `defineFragment()` APIs together with their compiler, metadata, and
runtime helper support. Use ordinary `defineHtml()` template structure and keyed `v-for` blocks
instead.

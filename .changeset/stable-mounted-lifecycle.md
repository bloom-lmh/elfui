---
"@elfui/runtime": patch
"@elfui/core": patch
---

Add `onMounted` and `onUnmounted` compatibility names, delay async component mounting until the resolved DOM and template refs are ready, keep async render effects inside the component scope, route synchronous failures and returned Promise rejections from lifecycle hooks through component error handling, and release template refs with their branch, list item, or component scope.

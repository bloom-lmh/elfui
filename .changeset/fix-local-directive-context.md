---
"@elfui/compiler": patch
"@elfui/core": patch
"@elfui/runtime": patch
"@elfui/vite-plugin": patch
---

Fix macro-generated custom directives so component-local definitions are resolved from every render context, including `v-for` children, before application directives. Make `const name = defineDirective(definition)` the only local directive macro form, infer kebab-case template names from the variable, and release detached branch/list directive scopes when their owning component unmounts.

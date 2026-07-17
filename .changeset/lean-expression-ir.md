---
"@elfui/compiler": patch
"@elfui/vite-plugin": patch
---

Share TypeScript-AST expression classification between runtime compilation and offline code generation, and limit generated scope reads to the setup bindings each expression actually references.

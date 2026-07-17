---
"@elfui/compiler": patch
"@elfui/runtime": patch
---

Replace regex-based template `.value` stripping with a shared TypeScript AST transform that preserves strings and ordinary object fields while retaining explicit Ref reads and writes.

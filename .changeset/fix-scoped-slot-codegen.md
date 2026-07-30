---
"@elfui/compiler": patch
---

Fix offline macro code generation for destructured scoped-slot parameters so slot locals are registered on the child host and remain available to reactive template bindings.

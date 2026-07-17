---
"@elfui/runtime": patch
"@elfui/core": patch
---

Expose declared Custom Element property accessors immediately after construction so host frameworks can select property assignment before connection, and preserve object and array identity while keeping property replacement reactive.

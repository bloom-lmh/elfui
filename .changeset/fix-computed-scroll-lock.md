---
"@elfui/reactivity": patch
"@elfui/runtime": patch
---

Invalidate cached computed values immediately inside batched event transactions, while keeping
ordinary effects deferred until the transaction flushes. Coordinate concurrent `useScrollLock()`
owners so the document remains locked until the final owner releases.

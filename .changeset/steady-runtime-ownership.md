---
"@elfui/runtime": patch
"@elfui/compiler": patch
"@elfui/core": patch
"@elfui/vite-plugin": patch
---

Harden built-in DOM and effect ownership across Teleport, Suspense, Transition,
TransitionGroup, ErrorBoundary, dynamic components, and deferred Custom Element
mounting. Align runtime and offline compiler behavior, batch keyed-list updates,
remove unused package edges, and add release coverage for multi-root cleanup and
template type checking.

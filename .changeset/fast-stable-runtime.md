---
"@elfui/shared": patch
"@elfui/reactivity": patch
"@elfui/runtime": patch
"@elfui/compiler-template": patch
"@elfui/compiler": patch
"@elfui/core": patch
"@elfui/vite-plugin": patch
---

Harden CSS transition completion, remove production DevTools allocations, reduce Custom Element and
TransitionGroup update work, reuse parsed macro source files, and add declaration and published
package API gates. Remove the expired compiler Metadata v1 adapter and the ineffective runtime
TransitionGroup `tag` option; template-level TransitionGroup tags remain supported by the compiler.

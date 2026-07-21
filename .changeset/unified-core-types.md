---
"@elfui/reactivity": minor
"@elfui/runtime": minor
"@elfui/compiler": patch
"@elfui/core": minor
---

Make `@elfui/core` the single application-facing runtime dependency, route generated helpers through `@elfui/core/internal`, expose the curated stable runtime and reactivity surface, and align macro types with strict TypeScript consumers. Writable refs, computed values, and models now return `void` from `set`; finite emit interfaces, typed runtime emit arrays, inferred directive generics, and primitive prop constructors are supported.

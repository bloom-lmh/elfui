# @elfui/reactivity

Fine-grained reactive primitives used by ElfUI and available on their own.

```ts
import { useComputed, useRef } from "@elfui/reactivity";

const count = useRef(1);
const doubled = useComputed(() => count.value * 2);
```

Use `useRef` for primitive state, `useReactive` for objects and arrays, and `useComputed`, `watch`, or `watchEffect` for derived state and effects.

# @elfui/reactivity

Fine-grained reactive primitives used by ElfUI and available on their own.

```ts
import { batch, useComputed, useRef } from "@elfui/reactivity";

const count = useRef(1);
const doubled = useComputed(() => count.value * 2);

batch(() => {
  count.value = 2;
  count.value = 3;
});
```

Use `useRef` for primitive state, `useReactive` for objects and arrays, and `useComputed`, `watch`, or `watchEffect` for derived state and effects.

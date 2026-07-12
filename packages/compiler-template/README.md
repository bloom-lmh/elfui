# @elfui/compiler-template

The template parser used by the ElfUI compiler.

```ts
import { parse } from "@elfui/compiler-template";

const ast = parse("<button>{{ label }}</button>");
```

It is primarily intended for compiler tooling and integrations.

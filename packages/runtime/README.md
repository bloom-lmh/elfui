# @elfui/runtime

Advanced Custom Element runtime APIs for ElfUI.

Most applications should import from `@elfui/core`. Use this package when building framework-level components, custom element wrappers, lifecycle integrations, or advanced host and form helpers.

```ts
import { defineCustomElement, onMounted, onUnmounted } from "@elfui/runtime";
```

See the [ElfUI documentation](https://github.com/bloom-lmh/elfui-docs) for the supported public APIs.

## SSR boundary

Runtime and compiled component modules are safe to import in Node. Without `HTMLElement`, component definition returns a metadata-only server placeholder; the client bundle creates the real Custom Element when it evaluates the module in a browser.

DOM rendering and registration remain client-only. ElfUI does not currently hydrate server-rendered component internals. A registration attempt outside a Custom Elements environment reports `ELF_CUSTOM_ELEMENTS_UNAVAILABLE`, and a tag already owned by another constructor reports `ELF_CUSTOM_ELEMENT_CONFLICT`. Use unique component prefixes, or set `register: false` and register centrally with `registerComponents()` in the client entry.

## DOM observers

`useResizeObserver` and `useIntersectionObserver` accept an `Element`, a `useRef` / `useTemplateRef` result, or a reactive getter. Observation starts after the final DOM is mounted, follows target changes, and disconnects automatically before component unmount.

```ts
import { useResizeObserver, useTemplateRef } from "@elfui/runtime";

const canvas = useTemplateRef<HTMLCanvasElement>("canvas");

useResizeObserver(canvas, ({ width, height }) => {
  // Resize an external Canvas/WebGL renderer here.
});
```

If the browser does not provide the requested observer API, the helper safely remains inactive.

# External tool integration matrix

This workspace verifies that browser-standard external tools can own resources inside an ElfUI component without becoming production dependencies of ElfUI.

The Chromium fixture currently covers `lit-html` as a representative DOM-owning renderer:

- initialization after final ElfUI DOM and template refs are mounted;
- external event-driven updates;
- synchronous DOM moves without duplicate initialization or disposal;
- full disconnect cleanup;
- reconnect with a fresh external tool instance.

It also covers Chart.js as a representative Canvas-owning tool:

- initialization from a mounted canvas template ref;
- data updates without animation timing noise;
- container-driven resizing through ElfUI's `useResizeObserver`;
- `destroy()` on full disconnect and fresh initialization after reconnect.

The graphics capability fixture additionally checks SVG namespace-safe updates and a real WebGL shader/program/buffer lifecycle, including ResizeObserver-driven viewport changes and explicit context loss during teardown.

The overlay fixture uses Floating UI with an anchor inside ElfUI's Shadow DOM and a floating element in a document-level portal. It verifies real positioning, global DOM event bubbling, a host-level composed action event, synchronous DOM moves, `autoUpdate()` cleanup, global-node removal, stale-listener prevention, and fresh initialization after reconnect.

The observer fixture uses the browser's native MutationObserver, ResizeObserver, and IntersectionObserver together with document/window listeners. It verifies branch teardown, late-callback suppression, KeepAlive deactivation/activation pause and resume, cached-child reuse, and complete cleanup of active and inactive cached children.

The asynchronous-resource fixture compiles and instantiates a real WebAssembly module and coordinates it with Blob-backed Web Workers. It verifies computation parity, competing initialization cancellation, unmount-before-ready behavior, Worker termination and URL cleanup, reconnect, late-message isolation, and async lifecycle rejection propagation.

The combined fixture mounts a real ElfUI app with async setup and `lit-html` resource owners in both Shadow and Light DOM. It verifies property/state updates, conditional teardown/recreation, keyed-list host reuse and item/index refresh, full App unmount, and resolving async setup after an early App unmount.

The stress fixture performs 100 mount/move/unmount cycles while each component owns a lit-html tree, Canvas context, MutationObserver, ResizeObserver, interval, document/window listeners, and a global portal node. Every resource has exact create/release counters, and a final delayed probe verifies that no callbacks, hosts, global nodes, or active-resource counters remain.

Run it with:

```sh
pnpm verify:external-integrations
```

The runner uses Playwright Core with an installed Chrome or Edge executable. It does not download or package a browser with ElfUI.

Together these fixtures cover the complete external-tool capability matrix tracked by the framework improvement plan.

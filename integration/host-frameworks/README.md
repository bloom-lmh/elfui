# Host framework integration matrix

This workspace verifies one shared ElfUI Custom Element contract in native DOM, React, Vue, Svelte, and Angular hosts. Each host runs the same behavioral assertions rather than a framework-specific smoke test.

The native baseline covers string, number, boolean, object, array, and function properties; writes before connection; updates after mount; property/attribute precedence; Boolean attribute coercion; JSON object/array attributes; reactive output; and teardown.

The React 19 fixture runs in development StrictMode and verifies the same property types, reference identity, mounted updates, conditional removal/remount, and final root teardown. ElfUI prop accessors are present immediately after Custom Element construction so React can select property assignment before connection.

The Vue fixture uses a shallow host state so object, array, and function identity remains owned by the host. It verifies property updates on a stable Custom Element, conditional removal/remount, and final app teardown.

The Svelte 5 fixture compiles a real Svelte component and drives it through writable stores. It uses explicit Custom Element properties to preserve camelCase names and verifies host-owned references, updates on the existing element, conditional blocks, and final component teardown. Svelte's generic spread path normalizes camelCase keys such as `textValue` and `countValue`, so it is not used as the interoperability contract.

The Angular fixture uses a standalone JIT component, signals, zoneless change detection, `CUSTOM_ELEMENTS_SCHEMA`, and explicit property bindings. It verifies stable updates, reference identity, conditional view teardown/remount, and final `ApplicationRef.destroy()` cleanup without an Angular-specific ElfUI adapter.

All hosts also run shared attribute, event, and presentation contracts. The attribute contract verifies post-mount string/number attributes, the Boolean attribute coercion matrix, and a subsequent framework-owned property update. The event contract verifies single-detail identity, multi-argument arrays, `bubbles`, `composed`, `cancelable`, `preventDefault()` return values, document propagation, detached-tree isolation, and no duplicate listeners after remount. A framework may retain a direct listener on a detached node it still owns; the required boundary is that detached events cannot escape into the application tree and a new host receives exactly one listener.

The presentation contract verifies default and named slots, an exposed method, CSS custom properties crossing Shadow DOM, document-level `::part` styling, focus delegation to a Shadow DOM control, and form participation through `ElementInternals` and `FormData`. These assertions run both on the initial host and after conditional remount where applicable.

The keyed-list contract renders A/B, reorders them to B/A with immutable data, and then replaces A with C. It requires A and B to retain identity during reorder, B to survive the replacement, A to unmount exactly once, and C to be the only newly created element. Final host teardown must balance every ElfUI setup/mount with one unmount; Native ends at 4/4/4 and each framework host ends at 5/5/5 because it also performs a conditional main-host remount.

Run the currently implemented host fixtures with:

```sh
pnpm verify:host-integrations
```

All five host baselines are implemented. Further cases extend this shared contract rather than creating framework-specific smoke tests.

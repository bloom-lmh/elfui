---
"@elfui/core": minor
"@elfui/reactivity": minor
"@elfui/runtime": minor
"@elfui/compiler": minor
---

Remove the beta compatibility exports `onMount`, `onUnmount`, `computed`, `watchEffect`, `watchPostEffect`, `watchSyncEffect`, `useTheme`, and process-wide `directive`. Use `onMounted`, `onUnmounted`, `useComputed`, `useEffect`, explicit-source `watch`, `theme`, component-local `defineDirective`, and application-scoped `app.directive` instead. Mounted hooks may now return a synchronous or asynchronous cleanup function that runs before rendered DOM is released.

Speed up same-key list replacement by bypassing keyed diff allocations and DOM movement, lazily cache larger pure-static macro subtrees for cloning across component renders, share empty lifecycle hook tables until first registration, and reuse style declaration buffers across reactive updates.

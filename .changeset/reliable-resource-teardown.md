---
"@elfui/reactivity": patch
"@elfui/runtime": patch
"@elfui/core": patch
---

Run useEffect cleanup when an owning effect scope stops, cancel queued reruns after teardown, and release active or cached KeepAlive children when they are evicted or their owner unmounts.

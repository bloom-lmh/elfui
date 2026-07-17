---
"@elfui/runtime": patch
"@elfui/core": patch
---

Keep compiled component modules safe to import during SSR with metadata-only server placeholders, report client-only registration attempts clearly, and reject conflicting Custom Element constructors instead of silently retaining the first implementation.

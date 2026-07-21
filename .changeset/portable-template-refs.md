---
"@elfui/compiler": patch
"@elfui/runtime": patch
---

Keep macro components portable when host bundlers do not define `__DEV__`, register static template refs in generated render functions before mounted hooks run, and preserve ordinary `value` fields on auto-unwrapped template locals.

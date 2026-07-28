---
"@elfui/compiler": minor
"@elfui/core": minor
"@elfui/runtime": patch
"@elfui/vite-plugin": patch
---

Change `defineFragment()` to use expanded named callback parameters. Parameter names map to
fragment attributes, type annotations become generated prop types, and default parameters become
optional props. Reject the legacy Props generic, destructuring, rest, and duplicate parameters.

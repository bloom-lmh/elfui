---
"@elfui/compiler": minor
"@elfui/core": minor
"@elfui/vite-plugin": patch
---

Make direct template literals the only macro authoring syntax. Remove the `html` and `css` tagged-template exports, the `MacroHtmlTemplate` type, legacy compiler branches, and obsolete macro-alias diagnostic paths. Use `defineHtml(\`...\`)`, `defineStyle(\`...\`)`, or `defineStyle(styleA, styleB)`.

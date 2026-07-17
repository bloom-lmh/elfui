---
"@elfui/compiler-template": patch
---

Parse interpolation endings with lexical awareness so `}}` inside strings, template literals, comments, regular expressions, or nested expressions no longer truncates the expression.

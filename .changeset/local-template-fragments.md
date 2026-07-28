---
"@elfui/compiler": minor
"@elfui/core": minor
"@elfui/vite-plugin": patch
---

Add compile-time local template fragments with `fragment\`...\``for anonymous slices and`defineFragment<Props>((props) => \`...\`)` for typed named slices. Fragments expand into the parent render scope without creating a custom element, shadow root, or independent lifecycle, and include static diagnostics for unsupported exports and dynamic usage.

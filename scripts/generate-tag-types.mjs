#!/usr/bin/env node
// L2.12 — 自动生成 HTMLElementTagNameMap 类型增强
//
// 扫描 ui-kit/src/components/**/index.ts、index.elf.ts 和 component.ts，提取 .name("elf-xxx") /
// defineName("elf-xxx") / export const X = defineHtml(...) / const X = defineHtml(...); export { X } +
// .props({...}) / defineProps({...})
// 以及 setup 中的 defineExpose({...})，生成 props + 暴露方法的 HTMLElementTagNameMap 增强。
// 生成 ui-kit/dist/elements.d.ts，让用户：
//
//   import "@elfui/ui-kit"   // 副作用注册标签 + 增强 HTMLElementTagNameMap
//
//   const btn = document.createElement("elf-button");  // 类型: HTMLElement
//   btn.variant = "outlined";                          // ✅ 类型完整
//
// 局限：当前只解析常见的 props / defineExpose 写法，复杂泛型类型会降级为 unknown。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const componentsDir = path.resolve(root, "ui-kit/src/components");
const outputFile = path.resolve(root, "ui-kit/src/elements.generated.d.ts");

const TYPE_MAP = {
  String: "string",
  Number: "number",
  Boolean: "boolean",
  Array: "unknown[]",
  Object: "Record<string, unknown>",
  null: "unknown"
};

const collectFiles = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else if (
      entry.isFile() &&
      (entry.name === "index.ts" || entry.name === "index.elf.ts" || entry.name === "component.ts")
    ) {
      out.push(full);
    }
  }
  return out;
};

const extractName = (src, file) => {
  const m = src.match(/(?:\.name|defineName)\("([^"]+)"\)/);
  if (m) return m[1];
  const htmlExport = src.match(
    /export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*defineHtml(?:<[^>]+>)?\s*\(/
  );
  if (htmlExport) return `elf-${kebab(htmlExport[1])}`;

  const localHtml = src.match(/const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*defineHtml(?:<[^>]+>)?\s*\(/);
  if (localHtml) {
    const localName = localHtml[1];
    const namedExport = src.match(
      new RegExp(`export\\s*\\{[^}]*\\b${localName}\\s+as\\s+([A-Z][A-Za-z0-9_]*)\\b[^}]*\\}`)
    );
    if (namedExport) return `elf-${kebab(namedExport[1])}`;
    const directNamedExport = src.match(new RegExp(`export\\s*\\{[^}]*\\b${localName}\\b[^}]*\\}`));
    if (directNamedExport || new RegExp(`export\\s+default\\s+${localName}\\b`).test(src)) {
      return `elf-${kebab(localName)}`;
    }
  }

  if (/export\s+default\s+defineHtml(?:<[^>]+>)?\s*\(/.test(src)) {
    return inferNameFromFile(file);
  }

  return null;
};

const kebab = (value) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();

const inferNameFromFile = (file) => {
  const relative = path.relative(componentsDir, file).replace(/\\/g, "/");
  const parts = relative.split("/");
  const filename = parts
    .pop()
    ?.replace(/\.elf\.tsx?$/, "")
    .replace(/\.[cm]?tsx?$/, "");
  const base = filename === "index" || filename === "component" ? parts.pop() : filename;
  return base ? `elf-${kebab(base)}` : null;
};

const extractPropsFromBlock = (block) => {
  const props = [];
  // 用更宽容的正则（支持嵌套大括号 default、括号、字符串）
  const re = /(\w+):\s*\{\s*type:\s*(\w+|null)/g;
  let match;
  while ((match = re.exec(block)) !== null) {
    const propName = match[1];
    const tsType = TYPE_MAP[match[2]] ?? "unknown";
    props.push({ name: propName, type: tsType });
  }
  return props;
};

const extractPropsBlock = (src) => {
  const macroBlock = findCallObjectArgument(src, "defineProps");
  if (macroBlock) return extractPropsFromBlock(macroBlock);

  const m = src.match(/\.props\(\{([\s\S]*?)\}\)/);
  if (!m) return [];
  return extractPropsFromBlock(m[1]);
};

const findCallObjectArgument = (src, callName) => {
  const callMatch = new RegExp(`${callName}(?:<[^>]+>)?\\s*\\(\\s*\\{`).exec(src);
  if (!callMatch) return null;
  const start = callMatch.index;
  const open = src.indexOf("{", start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return null;
};

const splitTopLevel = (block) => {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    if (ch === "}" || ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      const part = block.slice(start, i).trim();
      if (part) parts.push(part);
      start = i + 1;
    }
  }
  const last = block.slice(start).trim();
  if (last) parts.push(last);
  return parts;
};

const RETURN_TYPE_MAP = {
  void: "void",
  boolean: "boolean",
  string: "string",
  number: "number",
  unknown: "unknown"
};

const normalizeReturnType = (type) => {
  const trimmed = type.trim();
  return RETURN_TYPE_MAP[trimmed] ?? trimmed.replace(/\s+/g, " ");
};

const collectLocalFunctionTypes = (src) => {
  const out = new Map();
  const arrowRe = /const\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*:\s*([^=]+?)\s*=>/g;
  let match;
  while ((match = arrowRe.exec(src)) !== null) {
    const returnType = normalizeReturnType(match[3]);
    out.set(match[1], `(...args: unknown[]) => ${returnType}`);
  }

  const fnRe = /function\s+(\w+)\s*\([^)]*\)\s*:\s*([^{]+)\{/g;
  while ((match = fnRe.exec(src)) !== null) {
    const returnType = normalizeReturnType(match[2]);
    out.set(match[1], `(...args: unknown[]) => ${returnType}`);
  }
  return out;
};

const inferExposeType = (entry, localFunctions) => {
  const inline = entry.match(/^(\w+)\s*:\s*(async\s+)?\([^)]*\)\s*:\s*([^=]+?)\s*=>/);
  if (inline) {
    return { name: inline[1], type: `(...args: unknown[]) => ${normalizeReturnType(inline[3])}` };
  }

  const inlineVoid = entry.match(/^(\w+)\s*:\s*(async\s+)?\([^)]*\)\s*=>\s*void\b/);
  if (inlineVoid) {
    return { name: inlineVoid[1], type: "(...args: unknown[]) => void" };
  }

  const inlineUntyped = entry.match(/^(\w+)\s*:\s*(async\s+)?\([^)]*\)\s*=>/);
  if (inlineUntyped) {
    return { name: inlineUntyped[1], type: "(...args: unknown[]) => unknown" };
  }

  const shorthand = entry.match(/^(\w+)$/);
  if (shorthand) {
    const name = shorthand[1];
    return { name, type: localFunctions.get(name) ?? "unknown" };
  }

  const aliased = entry.match(/^(\w+)\s*:\s*(\w+)$/);
  if (aliased) {
    const [, name, source] = aliased;
    return { name, type: localFunctions.get(source) ?? "unknown" };
  }

  return null;
};

const extractExposeBlock = (src) => {
  const block = findCallObjectArgument(src, "defineExpose");
  if (!block) return [];
  const localFunctions = collectLocalFunctionTypes(src);
  const exposes = [];
  for (const entry of splitTopLevel(block)) {
    const exposed = inferExposeType(entry, localFunctions);
    if (exposed) exposes.push(exposed);
  }
  return exposes;
};

const tagsByName = new Map();
for (const file of collectFiles(componentsDir)) {
  const src = fs.readFileSync(file, "utf-8");
  const name = extractName(src, file);
  if (!name || !name.startsWith("elf-")) continue;
  const props = extractPropsBlock(src);
  const propNames = new Set(props.map((prop) => prop.name));
  const exposes = extractExposeBlock(src).filter((exposed) => !propNames.has(exposed.name));
  if (!tagsByName.has(name)) tagsByName.set(name, { props, exposes });
}

const lines = [
  "// 由 scripts/generate-tag-types.mjs 自动生成 — 不要手改",
  "//",
  "// 引入本文件（或在用户项目 tsconfig 中 include）即可让",
  '//   document.createElement("elf-button")',
  "// 拿到完整 prop 类型。",
  "",
  "declare global {",
  "  interface HTMLElementTagNameMap {"
];

const sortedTags = Array.from(tagsByName.keys()).sort();
for (const tag of sortedTags) {
  const { props, exposes } = tagsByName.get(tag);
  const fields = [...props, ...exposes];
  if (fields.length === 0) {
    lines.push(`    "${tag}": HTMLElement;`);
  } else {
    lines.push(`    "${tag}": HTMLElement & {`);
    for (const p of fields) {
      lines.push(`      ${p.name}: ${p.type};`);
    }
    lines.push("    };");
  }
}

lines.push("  }");
lines.push("}");
lines.push("");
lines.push("export {};");

fs.writeFileSync(outputFile, `${lines.join("\n")}\n`, "utf-8");
console.log(
  `✅ 已生成 ${path.relative(root, outputFile)} — 收录 ${sortedTags.length} 个 elf-* 标签`
);

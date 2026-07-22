import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const snapshotPath = path.join(repoRoot, "docs", "PUBLIC-API-SNAPSHOT.json");
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const entries = snapshot.entries ?? {};

const namesOf = (entry) => new Set((entries[entry] ?? []).map((item) => item.name));

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const assertMissing = (entry, names, reason) => {
  const exported = namesOf(entry);
  const found = names.filter((name) => exported.has(name));
  if (found.length > 0) {
    fail(`${entry} must not export ${found.join(", ")}. ${reason}`);
  }
};

const assertExact = (entry, expected, reason) => {
  const exported = namesOf(entry);
  const expectedSet = new Set(expected);
  const unexpected = [...exported].filter((name) => !expectedSet.has(name)).sort();
  const missing = expected.filter((name) => !exported.has(name)).sort();
  if (unexpected.length > 0 || missing.length > 0) {
    fail(
      `${entry} public API drifted. ${reason}\n` +
        `  unexpected: ${unexpected.join(", ") || "-"}\n` +
        `  missing: ${missing.join(", ") || "-"}`
    );
  }
};

assertMissing(
  "@elfui/core",
  [
    "css",
    "compile",
    "CompileOptions",
    "createComponent",
    "ElementBuilder",
    "extend",
    "html",
    "MacroHtmlTemplate",
    "setTemplateCompiler",
    "variant"
  ],
  "主入口只能暴露宏组件、对象式和稳定用户 API；链式 builder / runtime compiler 留在 @elfui/chain。"
);

assertMissing(
  "@elfui/chain",
  [
    "css",
    "defineDirective",
    "defineEmits",
    "defineHtml",
    "defineModel",
    "defineName",
    "defineOptions",
    "defineProps",
    "defineSlots",
    "defineStyle",
    "html",
    "useComponents",
    "useExtend",
    "useTheme",
    "useVariant"
  ],
  "链式包只承载 builder/runtime compile，宏组件入口只能从 @elfui/core 导入。"
);

assertMissing(
  "@elfui/runtime",
  [
    "createComponent",
    "ElementBuilder",
    "extend",
    "setTemplateCompiler",
    "variant",
    "attr",
    "branch",
    "cls",
    "list",
    "mark",
    "onObject",
    "prop",
    "setCurrentInstance",
    "setScopedSlot",
    "setTemplateRef",
    "show",
    "sty",
    "text",
    "unwrapStateAccess"
  ],
  "底层实现 helper 必须留在 @elfui/runtime/internal，并只经 @elfui/core/internal 转发给编译产物。"
);

assertMissing(
  "@elfui/core",
  [
    "attr",
    "branch",
    "cls",
    "list",
    "mark",
    "onObject",
    "prop",
    "resolveDirective",
    "setTemplateRef",
    "show",
    "sty",
    "text",
    "unwrapStateAccess"
  ],
  "编译 helper 只能从 @elfui/core/internal 进入生成代码，不能泄漏到主入口。"
);

assertExact(
  "@elfui/vite-plugin",
  ["elfui", "elfuiMacroPlugin", "ElfUIMacroPluginOptions", "MinimalVitePlugin"],
  "Vite 插件包只能是工程插件入口；宏编译器源码能力从 @elfui/compiler 使用。"
);

const routerPrefixes = [
  "createRouter",
  "getActiveRouter",
  "isNavigationFailure",
  "Navigation",
  "registerRouterElements",
  "Route",
  "Router",
  "Scroll",
  "setActiveRouter",
  "TypedRoute",
  "onBeforeRoute",
  "useLink",
  "UseLinkResult",
  "useRoute",
  "useRouter"
];
const routerUnexpected = [...namesOf("@elfui/router")]
  .filter((name) => !routerPrefixes.some((prefix) => name.startsWith(prefix)))
  .sort();
if (routerUnexpected.length > 0) {
  fail(`@elfui/router must only export router APIs. Unexpected: ${routerUnexpected.join(", ")}`);
}

if (process.exitCode === undefined) {
  console.log("API boundary check passed.");
}

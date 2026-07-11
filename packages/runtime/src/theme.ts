// K2 / K3 — globalStyle / theme
//
// Web Components 默认 Shadow DOM 隔离，但有两类样式天然能"穿透"：
// 1. CSS 自定义属性（变量）继承
// 2. ::part(name) 选择器
//
// 还有一类常见需求：给指定 tag 注入"document-level" 样式，让它盖住 host 默认样式
// （用户在使用方就能覆盖一些默认值），不需要走 Shadow DOM 内部。
//
// 这里提供两个 helper：
// - globalStyle(css)         → 把 CSS 注入到 document.head
// - theme(target, css)       → 给 tag (字符串 / Constructor) 注入主题样式
//                              内部按 tag 选择器拼接 css，注入到 document.head
//
// 注意：这两个都是"document-level" 样式，不会进入 Shadow DOM 内部；
// 如果要影响组件内部，组件本身要暴露 `::part` 或 CSS 变量。

const styleNode = (id: string): HTMLStyleElement => {
  if (typeof document === "undefined") {
    throw new Error("[theme] 仅浏览器可用");
  }
  const existing = document.getElementById(id) as HTMLStyleElement | null;
  if (existing) return existing;
  const el = document.createElement("style");
  el.id = id;
  document.head.appendChild(el);
  return el;
};

const GLOBAL_ID = "__elfui_global__";
const THEME_ID_PREFIX = "__elfui_theme__";

export interface StyleInjectionOptions {
  /**
   * 稳定样式 id。传入后同 id 再次调用会覆盖旧内容，适合主题热更新和测试隔离。
   */
  id?: string;
}

export type StyleDisposer = () => void;

let styleSeed = 0;

const setStyleBlock = (nodeId: string, css: string, replace: boolean): StyleDisposer => {
  const el = styleNode(nodeId);
  const marker = `/*${++styleSeed}*/`;
  const block = `${marker}\n${css}`;
  el.textContent = replace ? block : `${el.textContent ?? ""}\n${block}`;

  return () => {
    const text = el.textContent ?? "";
    if (!text.includes(marker)) return;
    el.textContent = text.replace(block, "");
    if (!el.textContent.trim()) {
      el.remove();
    }
  };
};

/** 把一段 CSS 注入到 document.head（默认累加；传 id 时覆盖同 id 样式） */
export const globalStyle = (css: string, options: StyleInjectionOptions = {}): StyleDisposer => {
  const nodeId = options.id ? `${GLOBAL_ID}${options.id}` : GLOBAL_ID;
  return setStyleBlock(nodeId, css, options.id !== undefined);
};

/** 接受字符串 tag 或带 __elfDefinition 的构造器 */
export type ThemeTarget = string | { __elfDefinition?: { tag?: string } };

const resolveThemeTag = (target: ThemeTarget): string => {
  if (typeof target === "string") return target.toLowerCase();
  const tag = target.__elfDefinition?.tag;
  if (!tag) throw new Error("[theme] 无效目标");
  return tag.toLowerCase();
};

/**
 * 为指定 tag 注入主题样式。规则：
 * - 用户 css 不需要写选择器；ElfUI 自动用 `<tag>` 包裹
 * - 多次调用同 tag 累加；不同 tag 各自一个 <style>
 * - 注入到 document.head（document-level 样式，不进 Shadow DOM）
 *
 * @example
 *   theme("elf-button", `
 *     background: red;
 *     padding: 8px 16px;
 *   `);
 *   // 等价于 <style> elf-button { background: red; padding: 8px 16px; } </style>
 *
 * @example
 *   // 用 ::part 影响内部
 *   theme("elf-button", `
 *     &::part(label) { font-weight: bold; }
 *   `);
 */
export const theme = (
  target: ThemeTarget,
  css: string,
  options: StyleInjectionOptions = {}
): StyleDisposer => {
  const tag = resolveThemeTag(target);
  const nodeId = options.id
    ? `${THEME_ID_PREFIX}${tag}__${options.id}`
    : `${THEME_ID_PREFIX}${tag}`;
  // CSS Nesting: 浏览器 Chrome 112+ / Firefox 117+ / Safari 16.5+ 都支持
  // 不支持也可以 fallback：直接 prepend 选择器
  // 这里采用 nesting 写法（用户 CSS 已可包含 ::part 等嵌套选择器）
  return setStyleBlock(nodeId, `${tag} {\n${css}\n}`, options.id !== undefined);
};

/** 测试隔离 / 热重载清理：移除 ElfUI 注入的全局样式与主题样式 */
export const resetGlobalStyles = (): void => {
  styleSeed = 0;
  if (typeof document === "undefined") return;
  document
    .querySelectorAll<HTMLStyleElement>(
      `style[id^="${GLOBAL_ID}"], style[id^="${THEME_ID_PREFIX}"]`
    )
    .forEach((el) => el.remove());
};

// 模板 parser — 把模板字符串解析为 AST
//
// 风格：手写递归下降，不依赖第三方
// 支持：
// - 元素 / 嵌套 / 自闭合 / void 元素（br/img/...）
// - 普通属性（含值、无值、单/双引号）
// - 指令简写：v-name、v-name:arg、v-name.mod、v-name:[dynamic]
//   * `:foo` <=> `v-bind:foo`
//   * `@click` <=> `v-on:click`
//   * `#name` <=> `v-slot:name`
// - 文本与插值 {{ ... }}
// - HTML 注释 <!-- ... -->（可选保留）
// - 错误恢复：缺闭合标签等场景给出位置信息

import {
  AttrTypes,
  NodeTypes,
  ParseError,
  type AttributeNode,
  type CommentNode,
  type DirectiveNode,
  type ElementNode,
  type InterpolationNode,
  type ParserOptions,
  type PropNode,
  type RootNode,
  type SourceLoc,
  type SourcePos,
  type TemplateChildNode,
  type TextNode
} from "./ast";

/** HTML void 元素：永远自闭合，没有 close tag */
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);

/** 含原始文本的元素：内部 < 不当作标签解析 */
const RAWTEXT_ELEMENTS = new Set(["script", "style"]);

interface Cursor {
  source: string;
  /** 剩余未消费部分 */
  rest: string;
  offset: number;
  line: number;
  column: number;
  options: Required<ParserOptions>;
}

const defaultOptions: Required<ParserOptions> = {
  comments: false,
  onError: (err) => {
    throw err;
  }
};

/** 入口：把模板字符串解析为 RootNode */
export const parse = (source: string, options: ParserOptions = {}): RootNode => {
  const cursor: Cursor = {
    source,
    rest: source,
    offset: 0,
    line: 1,
    column: 1,
    options: { ...defaultOptions, ...options }
  };

  const start = pos(cursor);
  const children = parseChildren(cursor, []);
  const end = pos(cursor);

  return {
    type: NodeTypes.ROOT,
    children,
    source,
    loc: { start, end, source }
  };
};

// ---------- children ----------

/** 解析子节点列表；ancestors 是父标签栈，遇到任一 ancestor 的闭合标签即返回 */
const parseChildren = (cursor: Cursor, ancestors: string[]): TemplateChildNode[] => {
  const children: TemplateChildNode[] = [];

  while (cursor.rest.length > 0) {
    if (cursor.rest.startsWith("</")) {
      // 检查是否是 ancestor 的闭合标签
      const closeMatch = cursor.rest.match(/^<\/([a-zA-Z][a-zA-Z0-9-]*)/);
      const closeTag = closeMatch?.[1];
      if (closeTag && ancestors.includes(closeTag)) {
        // 把闭合标签留给父级 parseElement 处理
        break;
      }
      // 孤立闭合标签：跳过并报错
      const errStart = pos(cursor);
      const skipLen = cursor.rest.indexOf(">") + 1;
      advance(cursor, skipLen > 0 ? skipLen : cursor.rest.length);
      cursor.options.onError(
        new ParseError(`Unmatched close tag </${closeTag ?? "?"}>`, {
          start: errStart,
          end: pos(cursor),
          source: cursor.source.slice(errStart.offset, cursor.offset)
        })
      );
      continue;
    }

    if (cursor.rest.startsWith("<!--")) {
      const node = parseComment(cursor);
      if (node && cursor.options.comments) {
        children.push(node);
      }
      continue;
    }

    if (cursor.rest.startsWith("{{")) {
      children.push(parseInterpolation(cursor));
      continue;
    }

    if (cursor.rest.startsWith("<") && /^<[a-zA-Z]/.test(cursor.rest)) {
      children.push(parseElement(cursor, ancestors));
      continue;
    }

    children.push(parseText(cursor));
  }

  return children;
};

// ---------- element ----------

const parseElement = (cursor: Cursor, ancestors: string[]): ElementNode => {
  const start = pos(cursor);
  // <tagName
  const tagMatch = cursor.rest.match(/^<([a-zA-Z][a-zA-Z0-9-]*)/);
  if (!tagMatch) {
    throw new Error("parseElement called with non-element");
  }
  const tag = tagMatch[1] ?? "";
  advance(cursor, tagMatch[0].length);

  const props = parseProps(cursor);

  // 检查自闭合
  let isSelfClosing = false;
  if (cursor.rest.startsWith("/>")) {
    isSelfClosing = true;
    advance(cursor, 2);
  } else if (cursor.rest.startsWith(">")) {
    advance(cursor, 1);
  } else {
    cursor.options.onError(
      new ParseError(`Element <${tag}> not properly closed`, {
        start,
        end: pos(cursor),
        source: cursor.source.slice(start.offset, cursor.offset)
      })
    );
  }

  const isVoid = VOID_ELEMENTS.has(tag.toLowerCase());
  if (isSelfClosing || isVoid) {
    return {
      type: NodeTypes.ELEMENT,
      tag,
      isSelfClosing: true,
      props,
      children: [],
      loc: makeLoc(cursor, start)
    };
  }

  // 解析子节点
  const children: TemplateChildNode[] = RAWTEXT_ELEMENTS.has(tag.toLowerCase())
    ? parseRawText(cursor, tag)
    : parseChildren(cursor, [tag, ...ancestors]);

  // 期望闭合标签
  if (cursor.rest.startsWith("</")) {
    const closeMatch = cursor.rest.match(/^<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/);
    if (closeMatch && closeMatch[1] === tag) {
      advance(cursor, closeMatch[0].length);
    } else {
      cursor.options.onError(
        new ParseError(`Mismatched close tag for <${tag}>`, makeLoc(cursor, start))
      );
    }
  } else {
    cursor.options.onError(new ParseError(`<${tag}> missing close tag`, makeLoc(cursor, start)));
  }

  return {
    type: NodeTypes.ELEMENT,
    tag,
    isSelfClosing: false,
    props,
    children,
    loc: makeLoc(cursor, start)
  };
};

// ---------- props ----------

const parseProps = (cursor: Cursor): PropNode[] => {
  const props: PropNode[] = [];
  while (cursor.rest.length > 0) {
    skipWS(cursor);
    if (cursor.rest.startsWith(">") || cursor.rest.startsWith("/>")) {
      break;
    }
    const prop = parseProp(cursor);
    if (prop) {
      props.push(prop);
    } else {
      // 防止死循环：跳一个字符
      advance(cursor, 1);
    }
  }
  return props;
};

const parseProp = (cursor: Cursor): PropNode | null => {
  const start = pos(cursor);
  // 名字：v-xxx / :xxx / @xxx / #xxx / xxx
  // 简写后可以跟 [dynamicArg] 或正常名字
  const nameMatch = cursor.rest.match(/^([@:#]|v-)?([a-zA-Z_[][\w:.\-\]]*)/);
  if (!nameMatch) return null;

  const prefix = nameMatch[1] ?? "";
  const rawName = nameMatch[0] ?? "";
  advance(cursor, rawName.length);
  const nameEnd = pos(cursor);

  // 解析参数（[dynamic] 或 :static）
  let arg: string | undefined;
  let argDynamic: string | undefined;
  // argLoc 预留 — 当前实现把整个 directive loc 收在 loc 字段里；
  // 后续若想给 IDE 提示分开高亮，再补 argLoc 计算
  const argLoc: SourceLoc | undefined = undefined;

  // 分离修饰符（用 .x.y 后缀）
  let restName = nameMatch[2] ?? "";
  let modifiers: string[] = [];
  // : / @ / # 简写已经吃掉前缀；指令名是 restName
  // v-xxx 形式 prefix === "v-"，restName 是 xxx[:arg][.mods]

  // 处理 v-bind:foo / v-on:click 形式：restName 含 :arg
  if (prefix === "v-") {
    const colonIdx = restName.indexOf(":");
    if (colonIdx >= 0) {
      const after = restName.slice(colonIdx + 1);
      restName = restName.slice(0, colonIdx);
      // after 可能是 [dynamic].mod1.mod2
      const parts = after.split(".");
      const argPart = parts[0] ?? "";
      modifiers = parts.slice(1);
      if (argPart.startsWith("[") && argPart.endsWith("]")) {
        argDynamic = argPart.slice(1, -1);
      } else {
        arg = argPart;
      }
    } else {
      // v-name.mods（无 arg）
      const parts = restName.split(".");
      restName = parts[0] ?? "";
      modifiers = parts.slice(1);
    }
  } else if (prefix === ":" || prefix === "@" || prefix === "#") {
    // 简写：restName 可能含 .mod 后缀
    const parts = restName.split(".");
    const argPart = parts[0] ?? "";
    modifiers = parts.slice(1);
    if (argPart.startsWith("[") && argPart.endsWith("]")) {
      argDynamic = argPart.slice(1, -1);
    } else {
      arg = argPart;
    }
  }

  // 决定 directive 名
  let directiveName: string | null = null;
  if (prefix === "v-") {
    directiveName = restName;
  } else if (prefix === ":") {
    directiveName = "bind";
  } else if (prefix === "@") {
    directiveName = "on";
  } else if (prefix === "#") {
    directiveName = "slot";
  }

  // 解析值
  let value: string | true = true;
  let quote: '"' | "'" | undefined;
  let valueLoc: SourceLoc | undefined;
  let exp = "";
  let expLoc: SourceLoc | undefined;

  if (cursor.rest.startsWith("=")) {
    advance(cursor, 1);
    const valStart = pos(cursor);
    if (cursor.rest.startsWith('"') || cursor.rest.startsWith("'")) {
      quote = cursor.rest[0] as '"' | "'";
      advance(cursor, 1);
      const endIdx = cursor.rest.indexOf(quote);
      if (endIdx < 0) {
        cursor.options.onError(
          new ParseError(`Unterminated attribute value`, makeLoc(cursor, valStart))
        );
        const all = cursor.rest;
        advance(cursor, all.length);
        value = all;
      } else {
        value = cursor.rest.slice(0, endIdx);
        advance(cursor, endIdx + 1);
      }
    } else {
      // 无引号值
      const m = cursor.rest.match(/^[^\s>]+/);
      if (m) {
        value = m[0];
        advance(cursor, m[0].length);
      } else {
        value = "";
      }
    }
    const valEnd = pos(cursor);
    valueLoc = {
      start: valStart,
      end: valEnd,
      source: cursor.source.slice(valStart.offset, valEnd.offset)
    };
    exp = typeof value === "string" ? value : "";
    expLoc = valueLoc;
  }

  const loc = makeLoc(cursor, start);

  if (directiveName !== null) {
    // 构造 DirectiveNode 时按 exactOptional 规则只传有值字段
    const dir: DirectiveNode = {
      type: AttrTypes.DIRECTIVE,
      name: directiveName,
      rawName,
      exp,
      modifiers,
      loc
    };
    if (arg !== undefined) dir.arg = arg;
    if (argDynamic !== undefined) dir.argDynamic = argDynamic;
    if (argLoc !== undefined) dir.argLoc = argLoc;
    if (expLoc !== undefined) dir.expLoc = expLoc;
    return dir;
  }

  // 普通属性
  const attr: AttributeNode = {
    type: AttrTypes.ATTRIBUTE,
    name: rawName,
    value,
    loc,
    nameLoc: {
      start,
      end: nameEnd,
      source: cursor.source.slice(start.offset, nameEnd.offset)
    }
  };
  if (quote !== undefined) attr.quote = quote;
  if (valueLoc !== undefined) attr.valueLoc = valueLoc;
  return attr;
};

// ---------- text / interpolation / comment / rawtext ----------

const parseText = (cursor: Cursor): TextNode => {
  const start = pos(cursor);
  // 文本结束于 < 或 {{
  const endIdxLt = cursor.rest.indexOf("<");
  const endIdxMustache = cursor.rest.indexOf("{{");
  let endIdx: number;
  if (endIdxLt < 0 && endIdxMustache < 0) {
    endIdx = cursor.rest.length;
  } else if (endIdxLt < 0) {
    endIdx = endIdxMustache;
  } else if (endIdxMustache < 0) {
    endIdx = endIdxLt;
  } else {
    endIdx = Math.min(endIdxLt, endIdxMustache);
  }
  if (endIdx <= 0) {
    // 防止死循环
    endIdx = 1;
  }
  const content = cursor.rest.slice(0, endIdx);
  advance(cursor, endIdx);
  return {
    type: NodeTypes.TEXT,
    content,
    loc: makeLoc(cursor, start)
  };
};

const REGEX_PREFIX_KEYWORDS = new Set([
  "await",
  "case",
  "delete",
  "do",
  "else",
  "in",
  "instanceof",
  "new",
  "of",
  "return",
  "throw",
  "typeof",
  "void",
  "yield"
]);

const isIdentifierStart = (char: string | undefined): boolean =>
  char !== undefined && /[A-Za-z_$]/.test(char);

const isIdentifierPart = (char: string | undefined): boolean =>
  char !== undefined && /[\w$]/.test(char);

const skipQuotedString = (source: string, start: number, quote: "'" | '"'): number => {
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    index++;
    if (char === quote) return index;
  }
  return source.length;
};

const skipLineComment = (source: string, start: number): number => {
  const newline = source.indexOf("\n", start + 2);
  return newline < 0 ? source.length : newline + 1;
};

const skipBlockComment = (source: string, start: number): number => {
  const close = source.indexOf("*/", start + 2);
  return close < 0 ? source.length : close + 2;
};

const skipRegexLiteral = (source: string, start: number): number => {
  let index = start + 1;
  let inCharacterClass = false;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "[") {
      inCharacterClass = true;
      index++;
      continue;
    }
    if (char === "]" && inCharacterClass) {
      inCharacterClass = false;
      index++;
      continue;
    }
    if (char === "/" && !inCharacterClass) {
      index++;
      while (isIdentifierPart(source[index])) index++;
      return index;
    }
    if (char === "\n" || char === "\r") return index;
    index++;
  }
  return source.length;
};

/** 找到表达式顶层的 `}}`；字符串、模板、注释、正则和嵌套结构中的内容均跳过。 */
const findInterpolationClose = (source: string): number => {
  let index = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let canStartRegex = true;
  let inTemplateText = false;
  const templateReturnModes: boolean[] = [];
  const templateExpressionBases: number[] = [];

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (inTemplateText) {
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === "`") {
        inTemplateText = templateReturnModes.pop() ?? false;
        index++;
        canStartRegex = false;
        continue;
      }
      if (char === "$" && next === "{") {
        templateExpressionBases.push(braceDepth);
        braceDepth++;
        inTemplateText = false;
        index += 2;
        canStartRegex = true;
        continue;
      }
      index++;
      continue;
    }

    if (
      char === "}" &&
      next === "}" &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      templateExpressionBases.length === 0
    ) {
      return index;
    }

    if (char === "'" || char === '"') {
      index = skipQuotedString(source, index, char);
      canStartRegex = false;
      continue;
    }

    if (char === "`") {
      templateReturnModes.push(false);
      inTemplateText = true;
      index++;
      continue;
    }

    if (char === "/" && next === "/") {
      index = skipLineComment(source, index);
      continue;
    }
    if (char === "/" && next === "*") {
      index = skipBlockComment(source, index);
      continue;
    }
    if (char === "/" && canStartRegex) {
      index = skipRegexLiteral(source, index);
      canStartRegex = false;
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = index++;
      while (isIdentifierPart(source[index])) index++;
      canStartRegex = REGEX_PREFIX_KEYWORDS.has(source.slice(start, index));
      continue;
    }

    if (char !== undefined && /[0-9]/.test(char)) {
      index++;
      while (index < source.length && /[\w.]/.test(source[index] ?? "")) index++;
      canStartRegex = false;
      continue;
    }

    if (char === "(") {
      parenDepth++;
      canStartRegex = true;
    } else if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      canStartRegex = false;
    } else if (char === "[") {
      bracketDepth++;
      canStartRegex = true;
    } else if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      canStartRegex = false;
    } else if (char === "{") {
      braceDepth++;
      canStartRegex = true;
    } else if (char === "}") {
      if (braceDepth > 0) braceDepth--;
      const templateBase = templateExpressionBases[templateExpressionBases.length - 1];
      if (templateBase !== undefined && braceDepth === templateBase) {
        templateExpressionBases.pop();
        inTemplateText = true;
      }
      canStartRegex = false;
    } else if ((char === "+" || char === "-") && next === char) {
      // 后缀 ++/-- 后仍是一个完整操作数；前缀 ++/-- 后则仍需读取操作数。
      index++;
    } else if (!/\s/.test(char ?? "")) {
      canStartRegex = char !== "." && !(char === "?" && next === ".");
    }

    index++;
  }

  return -1;
};

const parseInterpolation = (cursor: Cursor): InterpolationNode => {
  const start = pos(cursor);
  advance(cursor, 2); // 吃 {{
  const inner = pos(cursor);
  const closeIdx = findInterpolationClose(cursor.rest);
  let content: string;
  let innerEnd: SourcePos;
  if (closeIdx < 0) {
    cursor.options.onError(new ParseError("Unterminated interpolation {{", makeLoc(cursor, start)));
    content = cursor.rest;
    advance(cursor, cursor.rest.length);
    innerEnd = pos(cursor);
  } else {
    content = cursor.rest.slice(0, closeIdx);
    advance(cursor, closeIdx);
    innerEnd = pos(cursor);
    advance(cursor, 2); // 吃 }}
  }
  return {
    type: NodeTypes.INTERPOLATION,
    content: content.trim(),
    contentLoc: {
      start: inner,
      end: innerEnd,
      source: content
    },
    loc: makeLoc(cursor, start)
  };
};

const parseComment = (cursor: Cursor): CommentNode | null => {
  const start = pos(cursor);
  advance(cursor, 4); // <!--
  const endIdx = cursor.rest.indexOf("-->");
  let content: string;
  if (endIdx < 0) {
    content = cursor.rest;
    advance(cursor, cursor.rest.length);
  } else {
    content = cursor.rest.slice(0, endIdx);
    advance(cursor, endIdx + 3);
  }
  return {
    type: NodeTypes.COMMENT,
    content,
    loc: makeLoc(cursor, start)
  };
};

/** script / style 等 raw 元素的内部内容：找到 </tag> 之前的全部 */
const parseRawText = (cursor: Cursor, tag: string): TemplateChildNode[] => {
  const start = pos(cursor);
  const closeRe = new RegExp(`</${tag}\\s*>`, "i");
  const m = cursor.rest.match(closeRe);
  let content: string;
  if (!m || m.index === undefined) {
    content = cursor.rest;
    advance(cursor, cursor.rest.length);
  } else {
    content = cursor.rest.slice(0, m.index);
    advance(cursor, m.index);
  }
  if (content.length === 0) {
    return [];
  }
  return [
    {
      type: NodeTypes.TEXT,
      content,
      loc: makeLoc(cursor, start)
    }
  ];
};

// ---------- cursor helpers ----------

const pos = (cursor: Cursor): SourcePos => ({
  offset: cursor.offset,
  line: cursor.line,
  column: cursor.column
});

const advance = (cursor: Cursor, n: number): void => {
  if (n <= 0) return;
  for (let i = 0; i < n; i++) {
    const ch = cursor.rest[i];
    if (ch === "\n") {
      cursor.line++;
      cursor.column = 1;
    } else {
      cursor.column++;
    }
  }
  cursor.offset += n;
  cursor.rest = cursor.rest.slice(n);
};

const skipWS = (cursor: Cursor): void => {
  const m = cursor.rest.match(/^\s+/);
  if (m) {
    advance(cursor, m[0].length);
  }
};

const makeLoc = (cursor: Cursor, start: SourcePos): SourceLoc => {
  const end = pos(cursor);
  return {
    start,
    end,
    source: cursor.source.slice(start.offset, end.offset)
  };
};

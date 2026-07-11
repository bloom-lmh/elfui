// B1 模板 parser 验收测试
//
// 覆盖：
// - 元素 / 嵌套 / 自闭合 / void 元素
// - 普通属性（含值/无值/单/双引号）
// - 指令简写：v-if / v-for / v-bind:foo / :foo / @click / #slot
// - 修饰符与动态参数
// - 文本与插值
// - 注释（保留 / 丢弃）
// - 错误恢复

import { describe, expect, it } from "vitest";

import {
  AttrTypes,
  NodeTypes,
  parse,
  type AttributeNode,
  type DirectiveNode,
  type ElementNode,
  type InterpolationNode,
  type TextNode
} from "../index";

describe("基础元素", () => {
  it("空模板", () => {
    const ast = parse("");
    expect(ast.type).toBe(NodeTypes.ROOT);
    expect(ast.children).toEqual([]);
  });

  it("纯文本", () => {
    const ast = parse("hello");
    expect(ast.children).toHaveLength(1);
    const t = ast.children[0] as TextNode;
    expect(t.type).toBe(NodeTypes.TEXT);
    expect(t.content).toBe("hello");
  });

  it("简单元素", () => {
    const ast = parse("<div>hi</div>");
    expect(ast.children).toHaveLength(1);
    const el = ast.children[0] as ElementNode;
    expect(el.type).toBe(NodeTypes.ELEMENT);
    expect(el.tag).toBe("div");
    expect(el.isSelfClosing).toBe(false);
    expect(el.children).toHaveLength(1);
    expect((el.children[0] as TextNode).content).toBe("hi");
  });

  it("自闭合标签", () => {
    const ast = parse("<my-comp />");
    const el = ast.children[0] as ElementNode;
    expect(el.tag).toBe("my-comp");
    expect(el.isSelfClosing).toBe(true);
    expect(el.children).toEqual([]);
  });

  it("void 元素自动自闭合", () => {
    const ast = parse("<br><img>");
    expect(ast.children).toHaveLength(2);
    expect((ast.children[0] as ElementNode).tag).toBe("br");
    expect((ast.children[0] as ElementNode).isSelfClosing).toBe(true);
    expect((ast.children[1] as ElementNode).tag).toBe("img");
  });

  it("嵌套", () => {
    const ast = parse("<div><p><span>x</span></p></div>");
    const div = ast.children[0] as ElementNode;
    const p = div.children[0] as ElementNode;
    const span = p.children[0] as ElementNode;
    expect(span.tag).toBe("span");
    expect((span.children[0] as TextNode).content).toBe("x");
  });

  it("kebab-case 标签", () => {
    const ast = parse("<elf-counter />");
    expect((ast.children[0] as ElementNode).tag).toBe("elf-counter");
  });
});

describe("属性", () => {
  it("普通属性 - 双引号", () => {
    const ast = parse('<div id="app" class="main"></div>');
    const el = ast.children[0] as ElementNode;
    expect(el.props).toHaveLength(2);
    const id = el.props[0] as AttributeNode;
    expect(id.type).toBe(AttrTypes.ATTRIBUTE);
    expect(id.name).toBe("id");
    expect(id.value).toBe("app");
    expect(id.quote).toBe('"');
  });

  it("普通属性 - 单引号", () => {
    const ast = parse("<div id='app'></div>");
    const el = ast.children[0] as ElementNode;
    expect((el.props[0] as AttributeNode).quote).toBe("'");
  });

  it("普通属性 - 无值", () => {
    const ast = parse("<input disabled />");
    const el = ast.children[0] as ElementNode;
    const attr = el.props[0] as AttributeNode;
    expect(attr.name).toBe("disabled");
    expect(attr.value).toBe(true);
  });

  it("属性多个", () => {
    const ast = parse('<input type="text" name="foo" disabled />');
    const el = ast.children[0] as ElementNode;
    expect(el.props).toHaveLength(3);
  });
});

describe("指令", () => {
  it("v-if", () => {
    const ast = parse('<div v-if="ok"></div>');
    const dir = (ast.children[0] as ElementNode).props[0] as DirectiveNode;
    expect(dir.type).toBe(AttrTypes.DIRECTIVE);
    expect(dir.name).toBe("if");
    expect(dir.exp).toBe("ok");
    expect(dir.modifiers).toEqual([]);
  });

  it("v-for", () => {
    const ast = parse('<li v-for="item in items" />');
    const dir = (ast.children[0] as ElementNode).props[0] as DirectiveNode;
    expect(dir.name).toBe("for");
    expect(dir.exp).toBe("item in items");
  });

  it(":foo 简写为 v-bind", () => {
    const ast = parse('<div :title="msg"></div>');
    const dir = (ast.children[0] as ElementNode).props[0] as DirectiveNode;
    expect(dir.name).toBe("bind");
    expect(dir.arg).toBe("title");
    expect(dir.exp).toBe("msg");
  });

  it("@event 简写为 v-on", () => {
    const ast = parse('<button @click="onClick"></button>');
    const dir = (ast.children[0] as ElementNode).props[0] as DirectiveNode;
    expect(dir.name).toBe("on");
    expect(dir.arg).toBe("click");
    expect(dir.exp).toBe("onClick");
  });

  it("#name 简写为 v-slot", () => {
    const ast = parse('<template #default="{ item }" />');
    const dir = (ast.children[0] as ElementNode).props[0] as DirectiveNode;
    expect(dir.name).toBe("slot");
    expect(dir.arg).toBe("default");
  });

  it("修饰符 .stop.prevent", () => {
    const ast = parse('<button @click.stop.prevent="handle"></button>');
    const dir = (ast.children[0] as ElementNode).props[0] as DirectiveNode;
    expect(dir.modifiers).toEqual(["stop", "prevent"]);
  });

  it("v-bind:foo 完整形式", () => {
    const ast = parse('<div v-bind:title="msg"></div>');
    const dir = (ast.children[0] as ElementNode).props[0] as DirectiveNode;
    expect(dir.name).toBe("bind");
    expect(dir.arg).toBe("title");
  });

  it("动态参数 :[key]", () => {
    const ast = parse('<div :[propName]="value"></div>');
    const dir = (ast.children[0] as ElementNode).props[0] as DirectiveNode;
    expect(dir.name).toBe("bind");
    expect(dir.argDynamic).toBe("propName");
    expect(dir.arg).toBeUndefined();
  });

  it("v-model 无 arg", () => {
    const ast = parse('<input v-model="value" />');
    const dir = (ast.children[0] as ElementNode).props[0] as DirectiveNode;
    expect(dir.name).toBe("model");
    expect(dir.exp).toBe("value");
  });

  it("v-model:foo 命名参数", () => {
    const ast = parse('<my-input v-model:value="x" />');
    const dir = (ast.children[0] as ElementNode).props[0] as DirectiveNode;
    expect(dir.name).toBe("model");
    expect(dir.arg).toBe("value");
  });
});

describe("插值", () => {
  it("简单插值", () => {
    const ast = parse("{{ count }}");
    const i = ast.children[0] as InterpolationNode;
    expect(i.type).toBe(NodeTypes.INTERPOLATION);
    expect(i.content).toBe("count");
  });

  it("插值 + 文本混合", () => {
    const ast = parse("hello {{ name }}!");
    expect(ast.children).toHaveLength(3);
    expect((ast.children[0] as TextNode).content).toBe("hello ");
    expect((ast.children[1] as InterpolationNode).content).toBe("name");
    expect((ast.children[2] as TextNode).content).toBe("!");
  });

  it("插值表达式", () => {
    const ast = parse("{{ a + b * 2 }}");
    expect((ast.children[0] as InterpolationNode).content).toBe("a + b * 2");
  });

  it("元素内的插值", () => {
    const ast = parse("<p>{{ msg }}</p>");
    const el = ast.children[0] as ElementNode;
    expect((el.children[0] as InterpolationNode).content).toBe("msg");
  });
});

describe("注释", () => {
  it("默认丢弃注释", () => {
    const ast = parse("<!-- comment --><div />");
    expect(ast.children).toHaveLength(1);
    expect((ast.children[0] as ElementNode).tag).toBe("div");
  });

  it("comments: true 保留注释", () => {
    const ast = parse("<!-- hi --><div />", { comments: true });
    expect(ast.children).toHaveLength(2);
    expect(ast.children[0]?.type).toBe(NodeTypes.COMMENT);
  });
});

describe("source location", () => {
  it("元素位置", () => {
    const ast = parse("<div>hi</div>");
    const el = ast.children[0] as ElementNode;
    expect(el.loc.start.offset).toBe(0);
    expect(el.loc.start.line).toBe(1);
    expect(el.loc.start.column).toBe(1);
    expect(el.loc.end.offset).toBe(13);
  });

  it("多行文本的 line/column 推进", () => {
    const ast = parse("<div>\n  <p />\n</div>");
    const div = ast.children[0] as ElementNode;
    const p = div.children.find((c) => c.type === NodeTypes.ELEMENT) as ElementNode;
    expect(p.loc.start.line).toBe(2);
    expect(p.loc.start.column).toBe(3);
  });

  it("插值 contentLoc", () => {
    const ast = parse("xx {{ count }} yy");
    const i = ast.children[1] as InterpolationNode;
    expect(i.contentLoc.start.offset).toBe(5); // 紧跟 {{ 之后
    expect(i.contentLoc.end.offset).toBe(12);
  });
});

describe("错误恢复", () => {
  it("未结束插值", () => {
    expect(() => parse("{{ x")).toThrow(/Unterminated interpolation/);
  });

  it("未结束属性值", () => {
    expect(() => parse('<div id="abc')).toThrow(/Unterminated attribute/);
  });

  it("缺闭合标签", () => {
    expect(() => parse("<div>")).toThrow(/missing close tag/);
  });

  it("孤立闭合标签", () => {
    const errors: unknown[] = [];
    parse("</div>", {
      onError: (err) => {
        errors.push(err);
      }
    });
    expect(errors).toHaveLength(1);
  });

  it("onError 回调可以收集所有错误不抛", () => {
    const errors: unknown[] = [];
    const ast = parse("<div>", {
      onError: (err) => {
        errors.push(err);
      }
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(ast.type).toBe(NodeTypes.ROOT);
  });
});

describe("script / style raw text", () => {
  it("script 内容不解析为标签", () => {
    const ast = parse("<script>const a = '<div>';</script>");
    const el = ast.children[0] as ElementNode;
    expect(el.children).toHaveLength(1);
    expect((el.children[0] as TextNode).content).toBe("const a = '<div>';");
  });

  it("style 内容不解析", () => {
    const ast = parse("<style>div { color: red; }</style>");
    const el = ast.children[0] as ElementNode;
    expect((el.children[0] as TextNode).content).toBe("div { color: red; }");
  });
});

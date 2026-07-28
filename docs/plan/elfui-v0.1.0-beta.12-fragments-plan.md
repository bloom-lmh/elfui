# ElfUI v0.1.0-beta.12 Fragment API 实施计划

## 目标

在不恢复旧 `html` tagged template、也不引入第二套运行时组件模型的前提下，增加两个编译期模板切片 API：

```ts
fragment`...`;

const Card = defineFragment<Props>((props) => `...`);
```

两者都只在声明文件内有效，不导出、不注册、不创建 Custom Element 或 Shadow Root。

## 最终 API

### 匿名切片

```ts
export const Dashboard = defineHtml(`
  <div class="list">
    ${items.map(
      (item) => fragment`
      <article class="card">
        <span>${item.label}</span>
      </article>
    `
    )}
  </div>
`);
```

`fragment` 只允许出现在 `defineHtml()` 模板插值中，并且必须是可静态分析的 tagged template。它产生透明的多节点片段，继承外层组件的响应式作用域、指令、样式和生命周期。

### 命名切片

```ts
interface CardProps {
  item: Item;
  compact?: boolean;
}

const Card = defineFragment<CardProps>(
  ({ item, compact = false }) => `
    <article class="card" :class=${compact ? "is-compact" : ""}>
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    </article>
  `
);

export const Page = defineHtml(`
    <Card
    v-for="item in items"
    :key="item.id"
    :item="item"
    :compact=${compact}
  />
`);
```

命名由 `const PascalCaseName` 推导。`defineFragment()` 只能赋值给本地 `const`，禁止导出、重新赋值和传入 `app`/`useComponents()`。

## 编译语义

1. `fragment` 片段在父模板的当前渲染作用域内展开，不创建独立组件实例。
2. `defineFragment` 的调用点展开为同一渲染上下文中的模板函数调用；标签属性被收集为只读 props 对象。
3. 片段可使用 `v-if`、`v-for`、绑定、事件、局部指令和响应式表达式。
4. 片段不支持独立 `defineProps`、`defineEmits`、`defineExpose`、生命周期和插槽；后续若需要这些能力应使用 `defineHtml`。
5. 片段中的 `ref`、key 和指令清理必须归属于外层组件实例。
6. 静态模板之外的动态模板、跨文件片段引用、循环片段中的静态 `ref` 在 beta.12 先给出明确诊断。

## 实施阶段

### M1：公共 API 与诊断

- 在 `@elfui/core` 增加 `fragment` 和 `defineFragment` 类型/宏桩。
- 在 compiler macro stub、公开 exports、API snapshot 中同步。
- 增加以下诊断：
  - `ELF_MACRO_DEFINE_FRAGMENT_USAGE`
  - `ELF_MACRO_DEFINE_FRAGMENT_TEMPLATE`
  - `ELF_MACRO_FRAGMENT_EXPORT`
  - `ELF_MACRO_FRAGMENT_CONFLICT`
  - `ELF_MACRO_FRAGMENT_DYNAMIC`
  - `ELF_MACRO_FRAGMENT_REF_SCOPE`

### M2：Compiler/Vite 编译

- 收集 `const PascalCase = defineFragment<Props>(render)` 声明。
- 解析 render 函数的模板字面量和 props 参数。
- 在 `defineHtml` 模板中解析命名片段标签并展开。
- 解析 `fragment\`...\`` 插值并展开为透明片段。
- 保留依赖声明的可访问作用域，避免类似局部指令闭包丢失的问题。
- 将 fragment 标签从普通 Custom Element 解析路径中排除。
- 仅在确实需要时修改 Vite 插件，保持 `.elf.ts`、pragma 和宏导入诊断兼容。

### M3：类型与回归测试

- 匿名片段单节点、多节点和数组渲染。
- 命名片段属性绑定、默认值、`v-for`、响应式更新。
- 局部指令、事件、条件分支和卸载清理。
- 片段与真实组件同名、导出、动态模板和非法嵌套诊断。
- 生成产物不包含 `fragment`、`defineFragment` 运行时调用，不创建额外自定义元素。
- TypeScript 模板类型检查不产生未使用变量和 props 误报。

### M4：文档、生态与发布准备

- 更新 `elfui` README、API 快照和 changelog。
- 同步 `elfui-docs` 中文/英文 API 文档和迁移说明。
- 审查 `@elfui/router` 的对等依赖；本次 fragment 不改变 Router/runtime 协议时保留 `>=0.1.0-beta.11 <0.2.0`，只有协议变更才提升最低版本并同步锁文件。
- 执行框架完整测试、生成代码检查、体积检查、Vite 集成测试和 Router 验证。
- 所有包完成一致版本验证后，再决定是否发布 beta.12。

## 验收标准

- 片段渲染、更新和卸载行为与直接写入父模板一致。
- 不产生额外 Custom Element、Shadow Root 或独立生命周期实例。
- 生成代码中不存在未解析的片段标识符或局部闭包引用。
- 现有 565 项框架测试、Vite 宏诊断和 Router 测试全部通过。
- 公开 API、README、elfui-docs 和 Router peerDependencies 版本一致。

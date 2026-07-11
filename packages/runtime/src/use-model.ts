// useModel — ElfUI 风格的 defineModel
//
// Vue 3.4+ 引入了 defineModel 编译宏，把"声明 prop + 监听 update:xxx 事件"
// 折叠成一行；ElfUI 不引入编译宏，但通过运行时 helper 提供等价的人体工学：
//
//   ElfUI.createComponent()
//     .name("my-input")
//     .props({ modelValue: { type: String, default: "" } })
//     .emits("update:modelValue")
//     .setup((props, ctx) => {
//       const text = useModel(props, ctx);
//       // 读：text.value
//       // 写：text.set("...") 或 text.value = "..."；都会自动 emit
//       return { text };
//     });
//
// 父组件用 v-model="x" 绑定即可。命名参数：useModel(props, ctx, "title")
// 等价 v-model:title。
//
// 设计要点：
// 1. 返回一个 BasicState 风格对象（暴露 .value getter/setter、.set、.peek）
//    与 useState 行为一致，模板里直接 {{ text }} 自动解包。
// 2. .set / .value = 写入时：
//    a) 立即更新本地内部 state（保证 effect/computed 立即看到新值）
//    b) 通过 ctx.emit 发 "update:<name>"，父组件 v-model 接收后会回写 prop
// 3. props 变化时（父组件改了绑定值）通过 useEffect 同步到本地 state，
//    形成"父→子"单向流动，再加上"子 emit 后父更新"形成闭环。

import { useEffect, useRef, REF_FLAG, STATE_FLAG, type Ref } from "@elfui/reactivity";

export interface UseModelOptions {
  /** 自定义 prop 名（默认 "modelValue"） */
  prop?: string;
  /** 自定义事件名（默认 "update:<prop>"） */
  event?: string;
}

export type ModelRef<T> = Ref<T>;

export interface MinimalSetupContext {
  emit(event: string, ...args: unknown[]): void;
}

export interface MinimalProps {
  [key: string]: unknown;
}

/** ElfUI 风格的 defineModel 等价物 */
export function useModel<T = unknown>(
  props: MinimalProps,
  ctx: MinimalSetupContext,
  nameOrOptions: string | UseModelOptions = "modelValue"
): ModelRef<T> {
  const opts: UseModelOptions =
    typeof nameOrOptions === "string" ? { prop: nameOrOptions } : nameOrOptions;
  const propName = opts.prop ?? "modelValue";
  const eventName = opts.event ?? `update:${propName}`;

  // 用 useRef 创建本地副本（永远是 wrapper 形态，不管 T 是什么类型）
  const local = useRef(props[propName] as T);

  // props 变化时（父端 set）同步 to 本地
  useEffect(() => {
    const next = props[propName] as T;
    if (next !== local.peek()) {
      local.set(next);
    }
  });

  const model: ModelRef<T> = {
    [STATE_FLAG]: true,
    [REF_FLAG]: true,
    get value(): T {
      return local.value;
    },
    set value(v: T) {
      local.set(v);
      ctx.emit(eventName, v);
    },
    set(v: T): ModelRef<T> {
      local.set(v);
      ctx.emit(eventName, v);
      return model;
    },
    peek(): T {
      return local.peek();
    }
  };

  return model;
}

// useTemplateRef — 模板引用
//
// 模板里写 `<input ref="myInput" />`，setup 里用：
//   const myInput = useTemplateRef<HTMLInputElement>("myInput");
//   onMount(() => myInput.value?.focus());
//
// 实现：
// - 编译器识别 ref="字面量" 属性，调用 setTemplateRef(host, name, el) 注册
// - useTemplateRef(name) 返回一个 BasicState 风格对象，初值 null，
//   挂载后由 setTemplateRef 写入对应元素
//
// 与 Vue 区别：
// - Vue ref="x" 也支持 :ref="动态" 和 :ref="(el) => ..."；这里先实现字面量形态
// - state 形态返回，模板里也能 {{ myInput.tagName }} 用（不过通常不需要）

import { useRef } from "@elfui/reactivity";

import { getCurrentInstance, type ComponentInstance } from "./lifecycle";

const REFS_KEY: unique symbol = Symbol("elfui.template-refs");

interface InstanceWithRefs extends ComponentInstance {
  [REFS_KEY]?: Map<string, ReturnType<typeof useRef>>;
}

/** setup 内调用：返回一个 state，DOM 挂载后会被填充对应 element */
export const useTemplateRef = <T extends Element = Element>(
  name: string
): { value: T | null; peek(): T | null } => {
  const instance = getCurrentInstance() as InstanceWithRefs | null;
  if (!instance) {
    if (__DEV__) console.warn("[useTemplateRef] 必须在 setup 同步执行期间调用。");
    // 仍返回一个空 state 避免崩溃
    return useRef<T | null>(null) as unknown as { value: T | null; peek(): T | null };
  }
  if (!instance[REFS_KEY]) instance[REFS_KEY] = new Map();
  let s = instance[REFS_KEY].get(name);
  if (!s) {
    s = useRef<T | null>(null) as ReturnType<typeof useRef>;
    instance[REFS_KEY].set(name, s);
  }
  return s as unknown as { value: T | null; peek(): T | null };
};

/** 编译器调用：把指定 element 写入对应的 templateRef state */
export const setTemplateRef = (_host: HTMLElement, name: string, el: Element): void => {
  // 通过 host 反查 instance（attachInstanceToHost 在 inject.ts 里把 instance 挂在 host symbol 上）
  // 这里复用同一个 symbol 不合适——不要引入循环依赖，改成读 lifecycle 当前 instance
  // 实际上：编译器在 createPlainElement 内同步执行，setCurrentInstance 还是当前实例
  const instance = getCurrentInstance() as InstanceWithRefs | null;
  if (!instance) {
    return;
  }
  if (!instance[REFS_KEY]) instance[REFS_KEY] = new Map();
  let s = instance[REFS_KEY].get(name);
  if (!s) {
    s = useRef<Element | null>(null) as ReturnType<typeof useRef>;
    instance[REFS_KEY].set(name, s);
  }
  (s as { set: (v: unknown) => void }).set(el);
};

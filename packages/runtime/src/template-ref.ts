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

import { getCurrentScope, onScopeDispose, useRef } from "@elfui/reactivity";

import { DEV as __DEV__ } from "./dev";
import { getInstanceFromHost } from "./inject";
import { getCurrentInstance, type ComponentInstance } from "./lifecycle";

const REFS_KEY: unique symbol = Symbol("elfui.template-refs");

interface TemplateRefEntry {
  state: ReturnType<typeof useRef>;
  elements: Element[];
}

interface InstanceWithRefs extends ComponentInstance {
  [REFS_KEY]?: Map<string, TemplateRefEntry>;
}

const getRefEntry = (instance: InstanceWithRefs, name: string): TemplateRefEntry => {
  if (!instance[REFS_KEY]) instance[REFS_KEY] = new Map();
  let entry = instance[REFS_KEY].get(name);
  if (!entry) {
    entry = {
      state: useRef<Element | null>(null) as ReturnType<typeof useRef>,
      elements: []
    };
    instance[REFS_KEY].set(name, entry);
  }
  return entry;
};

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
  return getRefEntry(instance, name).state as unknown as {
    value: T | null;
    peek(): T | null;
  };
};

/** 编译器调用：把指定 element 写入对应的 templateRef state */
export const setTemplateRef = (host: HTMLElement, name: string, el: Element): void => {
  // 分支/list 后续更新发生在 render 返回以后，此时 currentInstance 已恢复；host 是稳定回查入口。
  const instance = (getInstanceFromHost(host) ?? getCurrentInstance()) as InstanceWithRefs | null;
  if (!instance) {
    return;
  }
  const entry = getRefEntry(instance, name);
  if (!entry.elements.includes(el)) {
    entry.elements.push(el);
    if (getCurrentScope()) {
      onScopeDispose(() => {
        const index = entry.elements.indexOf(el);
        if (index >= 0) entry.elements.splice(index, 1);
        if (entry.state.peek() === el) {
          entry.state.set(entry.elements[entry.elements.length - 1] ?? null);
        }
      });
    }
  }
  entry.state.set(el);
};

/** 组件完整卸载或失败回滚时兜底清空所有 ref，避免持有 detached DOM。 */
export const clearTemplateRefs = (instance: ComponentInstance): void => {
  const entries = (instance as InstanceWithRefs)[REFS_KEY];
  if (!entries) return;
  for (const entry of entries.values()) {
    entry.elements.length = 0;
    entry.state.set(null);
  }
  entries.clear();
};

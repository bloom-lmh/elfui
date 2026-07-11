// 作用域 slot 支持
//
// Web Components 没有原生作用域 slot。ElfUI 用 host.__elfSlots 桥接：
// - 父组件编译期把 <template #foo="scope"> 转成函数，挂到 host 元素上
// - 子组件 setup 内通过 useScopedSlot("foo")(scope) 拿到当前 slot 渲染结果
//
// 用法：
//
//   父组件：
//     <elf-list :items="items">
//       <template #item="{ item, index }">
//         {{ index }}: {{ item.name }}
//       </template>
//     </elf-list>
//
//   子组件：
//     setup() {
//       const renderItem = useScopedSlot<{ item: T; index: number }>("item");
//       // 在 render 中：
//       const node = renderItem({ item, index });
//     }

import { getCurrentInstance } from "./lifecycle";

/** 作用域 slot 渲染函数 */
export type ScopedSlotFn<S = unknown> = (scope: S) => Node | null;

/** 子组件向父组件挂载作用域 slot 用的内部 key */
export const ELF_SCOPED_SLOTS: unique symbol = Symbol("elfui.scopedSlots");

interface HostWithSlots extends HTMLElement {
  [ELF_SCOPED_SLOTS]?: Record<string, ScopedSlotFn>;
}

/** 父组件编译期把作用域 slot 函数挂到子元素上 */
export const setScopedSlot = <S>(host: HTMLElement, name: string, fn: ScopedSlotFn<S>): void => {
  const h = host as HostWithSlots;
  if (!h[ELF_SCOPED_SLOTS]) h[ELF_SCOPED_SLOTS] = {};
  h[ELF_SCOPED_SLOTS][name] = fn as ScopedSlotFn;
};

/** 父组件编译期一次性挂多个作用域 slot */
export const setScopedSlots = (host: HTMLElement, slots: Record<string, ScopedSlotFn>): void => {
  const h = host as HostWithSlots;
  h[ELF_SCOPED_SLOTS] = { ...(h[ELF_SCOPED_SLOTS] ?? {}), ...slots };
};

/** 子组件读取宿主上挂的作用域 slot；返回一个调用时返回 Node 的函数 */
export const useScopedSlot = <S = unknown>(name: string): ScopedSlotFn<S> => {
  const instance = getCurrentInstance();
  if (!instance) {
    if (__DEV__) console.warn("[useScopedSlot] 必须在 setup 同步期调用");
    return () => null;
  }
  const host = instance.host as HostWithSlots;
  return (scope: S) => {
    const fn = host[ELF_SCOPED_SLOTS]?.[name] as ScopedSlotFn<S> | undefined;
    if (!fn) return null;
    try {
      return fn(scope);
    } catch (err) {
      if (__DEV__) console.error(`[useScopedSlot] slot "${name}" 渲染失败:`, err);
      else console.error(err);
      return null;
    }
  };
};

/** 检查 host 是否含某个作用域 slot */
export const hasScopedSlot = (host: HTMLElement, name: string): boolean => {
  return !!(host as HostWithSlots)[ELF_SCOPED_SLOTS]?.[name];
};

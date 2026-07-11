// @elfui/shared — 公共工具
// 占位：阶段 A 之前不放具体实现

/** 判断对象 */
export const isObject = (value: unknown): value is Record<PropertyKey, unknown> =>
  value !== null && typeof value === "object";

/** 判断函数 */
export const isFunction = (value: unknown): value is (...args: unknown[]) => unknown =>
  typeof value === "function";

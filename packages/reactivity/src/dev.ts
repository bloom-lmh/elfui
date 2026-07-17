/** 编译期可静态替换；直接加载未打包 ESM 时安全回退到开发模式。 */
export const DEV = typeof __DEV__ === "undefined" ? true : __DEV__;

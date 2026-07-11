// 工作区级全局类型声明
//
// __DEV__ 编译时常量：开发期默认 true，生产构建由 esbuild --define:__DEV__=false 替换为字面量 false
// 配合 minify + DCE 真正剥掉 `if (__DEV__) ...` 的代码块和字符串

declare const __DEV__: boolean;

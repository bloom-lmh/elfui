// @elfui/vite-plugin — ElfUI 宏组件 Vite 插件包
//
// 插件独立成包，避免用户从源码编译器子入口导入工程集成能力。

export {
  elfuiMacroPlugin,
  type ElfUIMacroPluginOptions,
  type MinimalVitePlugin
} from "@elfui/compiler/vite";

export { elfuiMacroPlugin as elfui } from "@elfui/compiler/vite";

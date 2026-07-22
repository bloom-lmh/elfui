import * as runtime from "@elfui/runtime";
import {
  registerGlobalDirective,
  resetDirectives,
  resolveDirective
} from "@elfui/runtime/internal";

const exposed = { ...runtime, registerGlobalDirective, resetDirectives, resolveDirective };

(globalThis as unknown as { __elfRuntimeCopyA?: typeof exposed }).__elfRuntimeCopyA = exposed;

import * as runtime from "@elfui/runtime";
import {
  registerGlobalDirective,
  resetDirectives,
  resolveDirective
} from "@elfui/runtime/internal";

const exposed = { ...runtime, registerGlobalDirective, resetDirectives, resolveDirective };

(globalThis as unknown as { __elfRuntimeCopyB?: typeof exposed }).__elfRuntimeCopyB = exposed;

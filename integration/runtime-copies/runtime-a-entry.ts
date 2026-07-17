import * as runtime from "@elfui/runtime";
import { resolveDirective } from "@elfui/runtime/internal";

const exposed = { ...runtime, resolveDirective };

(globalThis as unknown as { __elfRuntimeCopyA?: typeof exposed }).__elfRuntimeCopyA = exposed;

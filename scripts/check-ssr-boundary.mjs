import assert from "node:assert/strict";

import { createApp } from "../packages/elfui/dist/index.js";
import { defineComponent, ensureCustomElement } from "../packages/runtime/dist/index.js";

assert.equal(typeof globalThis.HTMLElement, "undefined");
assert.equal(typeof globalThis.customElements, "undefined");
assert.equal(typeof globalThis.document, "undefined");

const ServerComponent = defineComponent({
  name: "elf-ssr-boundary",
  render: () => {
    throw new Error("SSR must not execute the component render function.");
  }
});

assert.equal(ServerComponent.__elfDefinition.tag, "elf-ssr-boundary");
assert.throws(() => ensureCustomElement(ServerComponent), /\[ELF_CUSTOM_ELEMENTS_UNAVAILABLE\]/);
assert.throws(() => createApp(ServerComponent).mount({}), /\[ELF_APP_DOCUMENT_UNAVAILABLE\]/);

console.log("SSR import and client-only boundary checks passed.");

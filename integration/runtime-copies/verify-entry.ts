import type * as RuntimeModule from "@elfui/runtime";
import type {
  registerGlobalDirective,
  resetDirectives,
  resolveDirective
} from "@elfui/runtime/internal";

type RuntimeCopy = typeof RuntimeModule & {
  registerGlobalDirective: typeof registerGlobalDirective;
  resetDirectives: typeof resetDirectives;
  resolveDirective: typeof resolveDirective;
};

const check = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const publish = (id: "result" | "error", payload: unknown): void => {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const output = document.createElement("pre");
  output.id = id;
  output.dataset.json = encoded;
  document.body.replaceChildren(output);
};

const run = (): { cases: Array<{ name: string; status: "passed" }> } => {
  const scope = globalThis as unknown as {
    __elfRuntimeCopyA?: RuntimeCopy;
    __elfRuntimeCopyB?: RuntimeCopy;
  };
  const first = scope.__elfRuntimeCopyA;
  const second = scope.__elfRuntimeCopyB;
  if (!first || !second) throw new Error("independent runtime bundles were not loaded");

  first.resetConfig();
  second.resetConfig();
  first.configure({ globalProperties: { owner: "first" } });
  check(first.getConfig().globalProperties.owner === "first", "first config was not updated");
  check(
    second.getConfig().globalProperties.owner === undefined,
    "runtime config leaked between copies"
  );

  first.resetDirectives();
  second.resetDirectives();
  const firstDirective = { mounted: () => undefined };
  const secondDirective = { mounted: () => undefined };
  first.registerGlobalDirective("copy-owned", firstDirective);
  second.registerGlobalDirective("copy-owned", secondDirective);
  check(
    first.resolveDirective("copy-owned") === firstDirective,
    "first runtime lost its directive"
  );
  check(
    second.resolveDirective("copy-owned") === secondDirective,
    "global directives leaked between runtime copies"
  );

  const conflictTag = "elf-runtime-copy-conflict";
  const firstOwner = first.defineCustomElement({ tag: conflictTag });
  const secondOwner = second.defineCustomElement({ tag: conflictTag }, { register: false });
  check(customElements.get(conflictTag) === firstOwner, "first runtime did not own the tag");
  let conflict = false;
  try {
    second.ensureCustomElement(secondOwner);
  } catch (error) {
    conflict = String(error).includes("[ELF_CUSTOM_ELEMENT_CONFLICT]");
  }
  check(conflict, "second runtime silently reused a conflicting tag");

  const injectionKey = Symbol.for("elfui.runtime-copy.integration");
  const childTag = "elf-runtime-copy-child";
  second.defineCustomElement({
    tag: childTag,
    shadow: false,
    setup: () => ({ injected: second.inject(injectionKey, "missing") }),
    render: (ctx) => {
      const output = document.createElement("output");
      output.textContent = String(ctx.state.injected);
      return output;
    }
  });
  const parentTag = "elf-runtime-copy-parent";
  first.defineCustomElement({
    tag: parentTag,
    shadow: false,
    setup: () => {
      first.provide(injectionKey, "shared-across-copies");
      return {};
    },
    render: () => document.createElement(childTag)
  });

  const parent = document.createElement(parentTag);
  const standalone = document.createElement(childTag);
  document.body.append(parent, standalone);
  check(parent.textContent === "shared-across-copies", "nested cross-copy injection failed");
  check(standalone.textContent === "missing", "injection leaked outside its component tree");
  parent.remove();
  standalone.remove();

  return {
    cases: [
      { name: "independent runtime config and directive registries", status: "passed" },
      { name: "multi-runtime Custom Element conflict diagnostics", status: "passed" },
      { name: "cross-runtime tree-scoped dependency injection", status: "passed" }
    ]
  };
};

try {
  publish("result", run());
} catch (error) {
  publish("error", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : ""
  });
}

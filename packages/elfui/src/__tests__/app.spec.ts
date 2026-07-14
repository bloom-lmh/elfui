import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type ComponentDefinition,
  defineCustomElement,
  defineExpose,
  inject,
  onUnmount,
  resetDirectives,
  useAppConfig,
  type ElfElementConstructor
} from "@elfui/runtime";
import { resolveDirective } from "@elfui/runtime/internal";

import { createApp, type ElfUIApp } from "../app";

let id = 0;

const nextTag = (name: string): string => `elf-app-${name}-${++id}`;

const defineTestElement = (
  name: string,
  setup?: Parameters<typeof defineCustomElement>[0]["setup"],
  render?: Parameters<typeof defineCustomElement>[0]["render"],
  props?: Parameters<typeof defineCustomElement>[0]["props"]
): ElfElementConstructor =>
  defineCustomElement(createTestDefinition(name, setup, render, props), { register: false });

const createTestDefinition = (
  name: string,
  setup?: Parameters<typeof defineCustomElement>[0]["setup"],
  render?: Parameters<typeof defineCustomElement>[0]["render"],
  props?: Parameters<typeof defineCustomElement>[0]["props"]
): ComponentDefinition => {
  const definition: ComponentDefinition = {
    tag: nextTag(name),
    render:
      render ??
      ((ctx) => {
        const span = document.createElement("span");
        span.textContent = String(ctx.state.value ?? "");
        return span;
      }),
    shadow: false
  };
  if (props) definition.props = props;
  if (setup) definition.setup = setup;
  return definition;
};

describe("createApp", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    resetDirectives();
    delete (globalThis as Record<string, unknown>).__ELFUI_DEVTOOLS_GLOBAL_HOOK__;
  });

  it("reports real app and component state to the development hook", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const events: Array<Record<string, unknown>> = [];
    (globalThis as Record<string, unknown>).__ELFUI_DEVTOOLS_GLOBAL_HOOK__ = {
      emitRuntimeEvent: (event: Record<string, unknown>) => events.push(event)
    };
    const Root = defineTestElement(
      "devtools",
      () => {
        defineExpose({ ping: () => undefined });
        return { ready: true };
      },
      undefined,
      { title: String }
    );
    const app = createApp(Root, { title: "ElfUI" });

    app.mount("#app");

    expect(events.map((event) => event.type)).toEqual(["app:mount", "component:mount"]);
    const component = events[1]!.component as {
      appId: string;
      props(): Record<string, unknown>;
      setup(): Record<string, unknown>;
      exposed(): Record<string, unknown>;
    };
    expect(component.appId).toBe((events[0]!.app as { id: string }).id);
    expect(component.props()).toMatchObject({ title: "ElfUI" });
    expect(component.setup()).toMatchObject({ ready: true });
    expect(component.exposed()).toHaveProperty("ping");

    app.unmount();
    await Promise.resolve();
    expect(events.map((event) => event.type)).toContain("app:unmount");
    expect(events.map((event) => event.type)).toContain("component:unmount");
  });

  it("mounts a root component with root props", () => {
    document.body.innerHTML = '<div id="app"></div>';
    const Root = defineTestElement(
      "root-props",
      undefined,
      (ctx) => {
        const span = document.createElement("span");
        span.textContent = String(ctx.props.title);
        return span;
      },
      { title: String }
    );

    const instance = createApp(Root, { title: "ElfUI" }).mount("#app");

    expect(instance).toBeInstanceOf(HTMLElement);
    expect(document.querySelector("#app")?.textContent).toBe("ElfUI");
  });

  it("rejects repeated mount on the same app instance", () => {
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    const Root = defineTestElement("single-mount");
    const app = createApp(Root);

    app.mount("#a");

    expect(() => app.mount("#b")).toThrow("[ELF_APP_ALREADY_MOUNTED]");
  });

  it("unmounts the root component and triggers lifecycle cleanup", async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const cleanup = vi.fn();
    const Root = defineTestElement("unmount", () => {
      onUnmount(cleanup);
      return {};
    });
    const app = createApp(Root);

    app.mount("#app");
    app.unmount();
    await Promise.resolve();

    expect(document.querySelector("#app")?.children.length).toBe(0);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("makes app-level provides visible to the root component", () => {
    document.body.innerHTML = '<div id="app"></div>';
    const key = Symbol("api");
    const Root = defineTestElement("provide", () => {
      const api = inject(key, "missing");
      return { value: api };
    });

    createApp(Root).provide(key, "ready").mount("#app");

    expect(document.querySelector("#app")?.textContent).toBe("ready");
  });

  it("installs plugins once per app instance", () => {
    const Root = defineTestElement("plugin");
    const install = vi.fn((app: ElfUIApp) => {
      app.directive("mark", { mounted: vi.fn() });
      app.config.globalProperties.pluginReady = true;
    });
    const plugin = { install };
    const app = createApp(Root);

    app.use(plugin).use(plugin);

    expect(install).toHaveBeenCalledTimes(1);
    expect(app.config.globalProperties.pluginReady).toBe(true);
  });

  it("registers components through app.component() with their declared custom-element tag", () => {
    const Root = defineTestElement("component-root");
    const Child = defineTestElement("component-child");
    const tag = Child.__elfDefinition.tag;

    createApp(Root).component(Child);

    expect(customElements.get(tag)).toBe(Child);
  });

  it("uses app.config.errorHandler for component setup errors", () => {
    document.body.innerHTML = '<div id="app"></div>';
    const error = new Error("boom");
    const handler = vi.fn();
    const Root = defineTestElement("error", () => {
      throw error;
    });

    const app = createApp(Root);
    app.config.errorHandler = handler;
    app.mount("#app");

    expect(handler).toHaveBeenCalledWith(error, "component setup/render");
  });

  it("exposes app globalProperties to setup and the template context", () => {
    document.body.innerHTML = '<div id="app"></div>';
    const Root = defineTestElement(
      "config",
      (_props, ctx) => ({ value: String(ctx.config.globalProperties.appName) }),
      (ctx) => {
        const span = document.createElement("span");
        span.textContent = String((ctx.state.$app as Record<string, unknown>).appName);
        return span;
      }
    );
    const app = createApp(Root);
    app.config.globalProperties.appName = "ElfUI";
    app.mount("#app");

    expect(document.querySelector("#app")?.textContent).toBe("ElfUI");
  });

  it("provides the app configuration through useAppConfig and routes component warnings", () => {
    document.body.innerHTML = '<div id="app"></div>';
    const warnHandler = vi.fn();
    const Root = defineTestElement("warn", () => {
      const config = useAppConfig();
      defineExpose({ id: config.globalProperties.appName });
      return {};
    });
    const app = createApp(Root);
    app.config.globalProperties.appName = "ElfUI";
    app.config.warnHandler = warnHandler;
    app.mount("#app");

    expect(warnHandler).toHaveBeenCalledWith(expect.stringContaining("[defineExpose]"));
  });

  it("keeps same-name directives isolated between app roots", () => {
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    const A = defineTestElement("directive-a");
    const B = defineTestElement("directive-b");
    const first = { mounted: vi.fn() };
    const second = { mounted: vi.fn() };

    const firstRoot = createApp(A).directive("mark", first).mount("#a");
    const secondRoot = createApp(B).directive("mark", second).mount("#b");

    expect(resolveDirective("mark", undefined, firstRoot)).toBe(first);
    expect(resolveDirective("mark", undefined, secondRoot)).toBe(second);
  });
});

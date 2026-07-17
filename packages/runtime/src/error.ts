import { resolveAppConfig } from "./config";
import { DEV as __DEV__ } from "./dev";
import { emitDevtoolsRuntimeEvent } from "./devtools";
import { getInstanceFromHost } from "./inject";
import { getCurrentInstance, type ComponentInstance } from "./lifecycle";

export type RuntimeErrorOwner = HTMLElement | ComponentInstance | null | undefined;

const resolveOwner = (owner: RuntimeErrorOwner): ComponentInstance | null => {
  if (!owner) return getCurrentInstance();
  if ("host" in owner) return owner;
  return getInstanceFromHost(owner);
};

/**
 * 把 setup/render 以及编译生成的异步 binding 错误送入同一条组件错误链。
 * 返回 true 表示错误已被 errorCaptured 或 app errorHandler 消费。
 */
export const handleRuntimeError = (
  error: unknown,
  owner?: RuntimeErrorOwner,
  info: string = "runtime",
  logUnhandled: boolean = true
): boolean => {
  const instance = resolveOwner(owner);
  const host = instance?.host ?? (owner && !("host" in owner) ? owner : null);

  if (instance) {
    if (__DEV__) {
      emitDevtoolsRuntimeEvent({ type: "component:error", host: instance.host, error });
    }
    let current: ComponentInstance | null = instance;
    while (current) {
      for (const hook of current.errorCapturedHooks) {
        try {
          if (hook(error, instance) === false) return true;
        } catch (hookError) {
          if (__DEV__) console.error("[errorCaptured] hook error:", hookError);
          else console.error(hookError);
        }
      }
      current = current.parent;
    }
  }

  if (host) {
    const handler = resolveAppConfig(host).errorHandler;
    if (handler) {
      try {
        handler(error, info);
      } catch (handlerError) {
        console.error(handlerError);
      }
      return true;
    }
  }

  if (logUnhandled) console.error(error);
  return false;
};

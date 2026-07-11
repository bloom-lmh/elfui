import { useReactive } from "@elfui/reactivity";

type AttrState = Record<string, string>;

interface HostAttrs {
  state: AttrState;
  observer: MutationObserver | null;
}

const hostAttrs = new WeakMap<HTMLElement, HostAttrs>();

const readAttributes = (host: HTMLElement): AttrState => {
  const state: AttrState = {};
  for (const attribute of Array.from(host.attributes)) {
    state[attribute.name] = attribute.value;
  }
  return state;
};

/** 返回 host 当前 attribute 的响应式快照，不执行内部根节点自动透传。 */
export const getHostAttrs = (host: HTMLElement): Readonly<AttrState> => {
  const cached = hostAttrs.get(host);
  if (cached) return cached.state;

  const state = useReactive(readAttributes(host)) as AttrState;
  const observer =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver((records) => {
          for (const record of records) {
            const name = record.attributeName;
            if (!name) continue;
            const value = host.getAttribute(name);
            if (value === null) delete state[name];
            else state[name] = value;
          }
        });

  observer?.observe(host, { attributes: true });
  hostAttrs.set(host, { state, observer });
  return state;
};

/** 组件真正卸载时释放 observer；重连会按需重新创建。 */
export const disposeHostAttrs = (host: HTMLElement): void => {
  const cached = hostAttrs.get(host);
  if (!cached) return;
  cached.observer?.disconnect();
  hostAttrs.delete(host);
};

import {
  createApp,
  defineComponent,
  onMounted,
  onUnmounted,
  useComputed,
  useEffect,
  useRef
} from "@elfui/core";

export const SizeFixtureApp = defineComponent({
  name: "elf-size-fixture-app",
  props: {
    title: { type: String, default: "ElfUI" },
    initial: { type: Number, default: 0 }
  },
  setup(props) {
    const count = useRef(props.initial);
    const doubled = useComputed(() => count.value * 2);
    let mounted = false;
    onMounted(() => {
      mounted = true;
    });
    onUnmounted(() => {
      mounted = false;
    });
    useEffect(() => {
      if (mounted) document.title = `${props.title}: ${count.value}`;
    });
    return { count, doubled };
  },
  render(ctx) {
    const article = document.createElement("article");
    const heading = document.createElement("h1");
    const button = document.createElement("button");
    heading.textContent = String(ctx.props.title);
    button.textContent = `${ctx.state.count} / ${ctx.state.doubled}`;
    button.addEventListener("click", () => {
      const count = ctx.state.count as number;
      ctx.state.count = count + 1;
    });
    article.append(heading, button);
    return article;
  },
  register: false
});

export const mountSizeFixture = (target: Element) => createApp(SizeFixtureApp).mount(target);

import { nothing, render as renderLit, svg as litSvg } from "lit-html";

// cspell:ignore mediump

import {
  defineCustomElement,
  defineExpose,
  onMounted,
  onUnmounted,
  useTemplateRef
} from "@elfui/runtime";
import { setTemplateRef } from "@elfui/runtime/internal";

const check = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const nextMicrotask = (): Promise<void> => new Promise((resolve) => queueMicrotask(resolve));

const publish = (id: "result" | "error", payload: unknown): void => {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const output = document.createElement("pre");
  output.id = id;
  output.dataset.json = encoded;
  document.body.replaceChildren(output);
};

const lifecycle = { created: 0, destroyed: 0, resized: 0, updates: 0 };

class WebGLRendererProbe {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private draws = 0;

  public constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL context is unavailable");
    this.gl = gl;

    const vertex = this.compileShader(
      gl.VERTEX_SHADER,
      "attribute vec2 position; void main(){ gl_Position=vec4(position,0.0,1.0); }"
    );
    const fragment = this.compileShader(
      gl.FRAGMENT_SHADER,
      "precision mediump float; uniform float tone; void main(){ gl_FragColor=vec4(tone,0.3,0.7,1.0); }"
    );
    const program = gl.createProgram();
    if (!program) throw new Error("WebGL program creation failed");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "WebGL program link failed");
    }
    this.program = program;

    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("WebGL buffer creation failed");
    this.buffer = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.8, -0.8, 0.8, -0.8, 0, 0.8]),
      gl.STATIC_DRAW
    );
  }

  private compileShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) throw new Error("WebGL shader creation failed");
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(shader) ?? "WebGL shader compile failed");
    }
    return shader;
  }

  public resize(width: number, height: number): void {
    this.canvas.width = Math.max(1, Math.round(width));
    this.canvas.height = Math.max(1, Math.round(height));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  public draw(value: number): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const position = gl.getAttribLocation(this.program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(gl.getUniformLocation(this.program, "tone"), Math.min(1, value / 20));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (gl.getError() !== gl.NO_ERROR) throw new Error("WebGL draw failed");
    this.draws++;
  }

  public snapshot(): { width: number; height: number; draws: number } {
    return { width: this.canvas.width, height: this.canvas.height, draws: this.draws };
  }

  public destroy(): void {
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

interface GraphicsIntegrationHost extends HTMLElement {
  updateGraphics(value: number): void;
  resizeGraphics(width: number, height: number): void;
  getGraphicsSnapshot(): { width: number; height: number; draws: number } | null;
}

defineCustomElement({
  tag: "elf-external-graphics",
  setup: () => {
    const container = useTemplateRef<HTMLDivElement>("graphics-container");
    const svgRoot = useTemplateRef<HTMLDivElement>("svg-root");
    const canvas = useTemplateRef<HTMLCanvasElement>("webgl-canvas");
    let renderer: WebGLRendererProbe | null = null;
    let value = 4;

    const renderSvg = (): void => {
      const target = svgRoot.value;
      if (!target) throw new Error("SVG integration root is unavailable");
      renderLit(
        litSvg`<svg data-external-svg viewBox="0 0 100 100"><circle data-external-circle cx="50" cy="50" r=${value}></circle></svg>`,
        target
      );
    };

    defineExpose({
      updateGraphics: (nextValue: number): void => {
        value = nextValue;
        renderSvg();
        if (!renderer) throw new Error("WebGL renderer is unavailable");
        renderer.draw(value);
        lifecycle.updates++;
      },
      resizeGraphics: (width: number, height: number): void => {
        const target = container.value;
        if (!target || !renderer) throw new Error("graphics renderer is unavailable");
        target.style.width = `${width}px`;
        target.style.height = `${height}px`;
        renderer.resize(width, height);
        renderer.draw(value);
        lifecycle.resized++;
      },
      getGraphicsSnapshot: () => renderer?.snapshot() ?? null
    });

    onMounted(() => {
      const target = canvas.value;
      check(target?.isConnected, "WebGL canvas ref was unavailable at mounted time");
      if (!target) throw new Error("WebGL canvas is unavailable");
      renderer = new WebGLRendererProbe(target);
      renderer.resize(256, 128);
      renderer.draw(value);
      renderSvg();
      lifecycle.created++;
    });

    onUnmounted(() => {
      if (svgRoot.value) renderLit(nothing, svgRoot.value);
      renderer?.destroy();
      renderer = null;
      lifecycle.destroyed++;
    });

    return {};
  },
  render: (ctx) => {
    const container = document.createElement("div");
    container.dataset.graphicsContainer = "";
    container.style.cssText = "position:relative;width:256px;height:128px";
    const svgRoot = document.createElement("div");
    svgRoot.dataset.svgRoot = "";
    const canvas = document.createElement("canvas");
    canvas.dataset.webglCanvas = "";
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    container.append(svgRoot, canvas);
    setTemplateRef(ctx.host, "graphics-container", container);
    setTemplateRef(ctx.host, "svg-root", svgRoot);
    setTemplateRef(ctx.host, "webgl-canvas", canvas);
    return container;
  }
});

const run = async () => {
  const host = document.createElement("elf-external-graphics") as GraphicsIntegrationHost;
  document.body.appendChild(host);
  check(host.getGraphicsSnapshot()?.width === 256, "WebGL renderer did not initialize its size");
  const svgElement = host.shadowRoot?.querySelector<SVGSVGElement>("[data-external-svg]");
  let circle = host.shadowRoot?.querySelector<SVGCircleElement>("[data-external-circle]");
  check(svgElement?.namespaceURI === "http://www.w3.org/2000/svg", "SVG namespace was incorrect");
  check(circle?.getAttribute("r") === "4", "SVG renderer did not initialize");

  host.updateGraphics(12);
  circle = host.shadowRoot?.querySelector<SVGCircleElement>("[data-external-circle]");
  check(circle?.getAttribute("r") === "12", "SVG renderer did not update");
  check((host.getGraphicsSnapshot()?.draws ?? 0) >= 2, "WebGL renderer did not update");

  host.resizeGraphics(400, 200);
  const resized = host.getGraphicsSnapshot();
  check(resized?.width === 400 && resized.height === 200, "WebGL viewport resize failed");

  host.remove();
  await nextMicrotask();
  check(lifecycle.destroyed === 1, "WebGL/SVG resources were not destroyed on unmount");
  document.body.appendChild(host);
  check(lifecycle.created === 2, "WebGL/SVG resources were not recreated after reconnect");
  host.remove();
  await nextMicrotask();
  check(lifecycle.destroyed === 2, "reconnected graphics resources were not destroyed");

  return {
    cases: [{ name: "SVG/WebGL resize/update/destroy lifecycle", status: "passed" }],
    graphics: { ...lifecycle },
    userAgent: navigator.userAgent
  };
};

void run().then(
  (report) => publish("result", report),
  (error: unknown) =>
    publish("error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : ""
    })
);

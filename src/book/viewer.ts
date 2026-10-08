import { mountDesktop, type BookController } from "./desktop.js";
import { mountMobile } from "./mobile.js";
export interface ViewerOptions {
  pages: string[];
  initialPage: number;
  patternSource?: string;
  resolveImage?: (src: string) => Promise<string>;
  shadow?: number;
  onPageChange?: (indices: number[]) => void;
  onReady?: () => void;
  onError?: (cause: unknown) => void;
  onController?: (controller: BookController) => void;
}
export function mountViewer(
  container: HTMLElement,
  options: ViewerOptions,
): () => void {
  let dispose: (() => void) | undefined;
  let mode: boolean | undefined;
  let page = options.initialPage;
  const frame = document.createElement("div");
  const host = document.createElement("div");
  frame.className = "book-frame";
  host.className = "book-host";
  host.setAttribute("role", "group");
  host.setAttribute("aria-label", "可交互翻书预览");
  container.append(frame, host);
  function mount(desktop: boolean) {
    dispose?.();
    mode = desktop;
    frame.className = "book-frame " + (desktop ? "desktop" : "mobile");
    container.dataset.layout = desktop ? "desktop" : "mobile";
    host.dataset.magazineState = "preparing";
    const settings = {
      initialPage: page,
      layoutFrame: frame,
      patternSource: options.patternSource,
      resolveImage: options.resolveImage,
      shadow: options.shadow,
      onOpeningReady: () => {
        options.onReady?.();
      },
      onLoadError: options.onError,
      onController: (controller: BookController) =>
        options.onController?.({
          ...controller,
          goTo(index) {
            page = index;
            controller.goTo(index);
          },
        }),
      onPageChange: (indices: number[]) => {
        if (indices.length && (!desktop || !indices.includes(page)))
          page = indices[0];
        options.onPageChange?.(indices);
      },
    };
    dispose = desktop
      ? mountDesktop(host, options.pages, settings)
      : mountMobile(host, options.pages, page, settings);
  }
  const observer = new ResizeObserver(() => {
    const desktop =
      container.clientWidth >= 620 &&
      container.clientWidth > container.clientHeight * 0.82;
    if (desktop !== mode) mount(desktop);
  });
  observer.observe(container);
  return () => {
    observer.disconnect();
    dispose?.();
    frame.remove();
    host.remove();
  };
}

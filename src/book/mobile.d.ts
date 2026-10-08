import type { RenderOptions } from "./desktop.js";
export interface MobileRenderOptions extends RenderOptions {
  layoutFrame?: HTMLElement;
}
export function mountMobile(
  element: HTMLElement,
  pages: string[],
  initialPage?: number,
  options?: MobileRenderOptions,
): () => void;

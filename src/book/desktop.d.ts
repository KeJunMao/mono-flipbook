export interface BookController {
  turn: (forward: boolean) => void;
  goTo: (index: number) => void;
  setShadow: (value: number) => void;
}
export interface RenderOptions {
  onOpeningReady?: (canvas: HTMLCanvasElement) => void;
  onLoadError?: (error: unknown) => void;
  onController?: (controller: BookController) => void;
  onPageChange?: (indices: number[]) => void;
  canvasResolutionScale?: number;
  initialPage?: number;
  patternSource?: string;
  resolveImage?: (src: string) => Promise<string>;
  shadow?: number;
}
export function mountDesktop(
  element: HTMLElement,
  pages: string[],
  options?: RenderOptions,
): () => void;

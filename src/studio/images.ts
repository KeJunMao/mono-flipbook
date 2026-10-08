import type { Appearance, PageImage } from "./model";
export function readDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(Error("无法读取图片"));
    r.readAsDataURL(blob);
  });
}
export function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(Error("浏览器无法解码此图片，请换用 JPG、PNG 或 WebP"));
    image.src = src;
  });
}
export async function importImage(file: File): Promise<PageImage> {
  const src = await readDataURL(file);
  const image = await decodeImage(src);
  if (!image.naturalWidth || !image.naturalHeight) throw Error("图片尺寸无效");
  // Keep a bounded local master; every preview and export is generated from it.
  const ratio = Math.min(
    1,
    3000 / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    id: crypto.randomUUID(),
    name: file.name,
    src: canvas.toDataURL("image/png"),
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
}
export async function preparePages(
  pages: PageImage[],
  a: Pick<Appearance, "paper" | "fit" | "margin">,
  width = 1200,
  signal?: AbortSignal,
): Promise<string[]> {
  const result: string[] = [];
  for (const page of pages) {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    const image = await decodeImage(page.src);
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round(width * 1.377);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = a.paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const inset = (width * a.margin) / 100;
    const w = canvas.width - inset * 2,
      h = canvas.height - inset * 2;
    const scale = (a.fit === "contain" ? Math.min : Math.max)(
      w / image.naturalWidth,
      h / image.naturalHeight,
    );
    const dw = image.naturalWidth * scale,
      dh = image.naturalHeight * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(inset, inset, w, h);
    ctx.clip();
    ctx.drawImage(
      image,
      (canvas.width - dw) / 2,
      (canvas.height - dh) / 2,
      dw,
      dh,
    );
    ctx.restore();
    result.push(canvas.toDataURL("image/jpeg", 0.92));
    await new Promise((r) => setTimeout(r, 0));
  }
  // The desktop renderer uses two sides per physical sheet.
  if (result.length % 2) {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = Math.round(width * 1.377);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = a.paper;
    ctx.fillRect(0, 0, c.width, c.height);
    result.push(c.toDataURL("image/jpeg", 0.9));
  }
  return result;
}
export async function assetDataURL(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  const response = await fetch(src);
  if (!response.ok) throw Error("素材读取失败：" + src);
  return readDataURL(await response.blob());
}

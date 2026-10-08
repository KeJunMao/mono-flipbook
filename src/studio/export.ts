import { assetDataURL, decodeImage, preparePages } from "./images";
import { openingPage, type Project } from "./model";

const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function header(size: number): {
  bytes: Uint8Array<ArrayBuffer>;
  view: DataView;
} {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}
export interface ZipEntry {
  name: string;
  content: string | Uint8Array<ArrayBuffer>;
}
export async function createZip(files: ZipEntry[]): Promise<Blob> {
  const local: BlobPart[] = [],
    central: BlobPart[] = [];
  let offset = 0,
    centralSize = 0;
  for (const file of files) {
    const name = encoder.encode(file.name),
      source =
        typeof file.content === "string"
          ? encoder.encode(file.content)
          : file.content;
    if (source.byteLength >= 25_000_000)
      throw Error("单个资源超过 25 MB，请使用标准图片质量重试：" + file.name);
    let packed: Uint8Array<ArrayBuffer> = source,
      method = 0;
    try {
      const stream = new Blob([source])
        .stream()
        .pipeThrough(new CompressionStream("deflate-raw" as CompressionFormat));
      packed = new Uint8Array(await new Response(stream).arrayBuffer());
      method = 8;
    } catch {
      /* Stored ZIP remains compatible in browsers without raw deflate. */
    }
    const crc = crc32(source),
      h = header(30),
      d = h.view;
    d.setUint32(0, 0x04034b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 0x800, true);
    d.setUint16(8, method, true);
    d.setUint16(12, 0x21, true);
    d.setUint32(14, crc, true);
    d.setUint32(18, packed.length, true);
    d.setUint32(22, source.length, true);
    d.setUint16(26, name.length, true);
    local.push(h.bytes, name, packed);
    const ch = header(46),
      cd = ch.view;
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x800, true);
    cd.setUint16(10, method, true);
    cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, packed.length, true);
    cd.setUint32(24, source.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(ch.bytes, name);
    centralSize += 46 + name.length;
    offset += 30 + name.length + packed.length;
  }
  const end = header(22),
    ed = end.view;
  ed.setUint32(0, 0x06054b50, true);
  ed.setUint16(8, files.length, true);
  ed.setUint16(10, files.length, true);
  ed.setUint32(12, centralSize, true);
  ed.setUint32(16, offset, true);
  return new Blob([...local, ...central, end.bytes], {
    type: "application/zip",
  });
}
function htmlEscape(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export interface ReaderData {
  project: Project;
  pages: string[];
  pattern: string;
  initialPage: number;
  offlineAssets: Record<string, string>;
}
function dataBytes(src: string): {
  bytes: Uint8Array<ArrayBuffer>;
  type: string;
} {
  const comma = src.indexOf(",");
  const type = src.slice(5, src.indexOf(";"));
  const raw = atob(src.slice(comma + 1));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return { bytes, type };
}
export async function exportProject(
  project: Project,
  quality: "standard" | "high",
  onProgress: (message: string) => void,
): Promise<Blob> {
  onProgress("正在准备书页…");
  const pages = project.demo
    ? await Promise.all(project.pages.map((page) => assetDataURL(page.src)))
    : await preparePages(
        project.pages,
        project.appearance,
        quality === "high" ? 2000 : 1200,
      );
  const [pattern, jsResponse, cssResponse] = await Promise.all([
    assetDataURL("./assets/paper.webp"),
    fetch("./generated/reader.js"),
    fetch("./generated/reader.css"),
  ]);
  if (!jsResponse.ok || !cssResponse.ok)
    throw Error("阅读器尚未生成，请重新启动项目");
  const files: ZipEntry[] = [];
  const offlineAssets: Record<string, string> = {};
  function imageAsset(path: string, source: string, offlineName?: string) {
    files.push({ name: path, content: dataBytes(source).bytes });
    if (offlineName) {
      const scriptPath = "offline/" + offlineName + ".js";
      offlineAssets["./" + path] = "./" + scriptPath;
      const register =
        "window.__FOLIO_OFFLINE_ASSETS__=window.__FOLIO_OFFLINE_ASSETS__||{};window.__FOLIO_OFFLINE_ASSETS__[" +
        JSON.stringify("./" + path) +
        "]=" +
        JSON.stringify(source) +
        ";";
      files.push({ name: scriptPath, content: register });
    }
  }
  const pagePaths = pages.map((source, index) => {
    const number = String(index + 1).padStart(3, "0");
    const ext = dataBytes(source).type === "image/webp" ? "webp" : "jpg";
    const path = "assets/pages/page-" + number + "." + ext;
    imageAsset(path, source, "page-" + number);
    return "./" + path;
  });
  imageAsset("assets/paper.webp", pattern, "paper");
  let backgroundImage = "";
  if (
    project.appearance.backgroundMode === "image" &&
    project.appearance.backgroundImage
  ) {
    const image = await decodeImage(project.appearance.backgroundImage);
    const scale = Math.min(
      1,
      2000 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas
      .getContext("2d")!
      .drawImage(image, 0, 0, canvas.width, canvas.height);
    imageAsset("assets/background.webp", canvas.toDataURL("image/webp", 0.9));
    backgroundImage = "./assets/background.webp";
  }
  const data: ReaderData = {
    project: {
      ...project,
      appearance: { ...project.appearance, backgroundImage },
      pages: project.pages.map((page, index) => ({
        id: page.id,
        name: page.name,
        src: pagePaths[index],
      })),
    },
    pages: pagePaths,
    pattern: "./assets/paper.webp",
    initialPage: openingPage(project),
    offlineAssets,
  };
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  const html =
    '<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="' +
    htmlEscape(project.appearance.background) +
    '"><title>' +
    htmlEscape(project.title) +
    '</title><link rel="stylesheet" href="./assets/reader.css"></head><body><noscript>请启用 JavaScript 以阅读此翻书作品。</noscript><script id="folio-data" type="application/json">' +
    json +
    '</script><script defer src="./assets/reader.js"></script></body></html>';
  onProgress("正在打包文件…");
  files.unshift(
    { name: "index.html", content: html },
    { name: "assets/reader.js", content: await jsResponse.text() },
    { name: "assets/reader.css", content: await cssResponse.text() },
  );
  files.push({
    name: "READ-ME.txt",
    content:
      "纸间 · Folio Studio\n\n先解压整个 ZIP，再双击 index.html。请保留 assets 和 offline 目录。\n静态托管：上传整个解压目录，保持相对路径不变，支持放在子目录。\n图片在 assets/pages 中，背景图片与纸纹在 assets 中；HTML 不内嵌图片。\noffline 目录是浏览器本地 WebGL 读取兼容资源，按页拆分；托管时不会加载，仅做静态托管可不上传 offline 目录。\n支持点击、拖拽、长按和键盘方向键翻页。\n\n作品：" +
      project.title +
      "\n页数：" +
      project.pages.length,
  });
  return createZip(files);
}
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

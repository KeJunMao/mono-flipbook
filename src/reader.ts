import { mountViewer } from "./book/viewer";
import { appearanceStyle } from "./studio/model";
import type { BookController } from "./book/desktop.js";
import type { ReaderData } from "./studio/export";
import "./reader.css";

const data = JSON.parse(
  document.getElementById("folio-data")!.textContent!,
) as ReaderData;
const { project } = data,
  a = project.appearance;
document.title = project.title;
const scene = document.createElement("main");
scene.className = "folio-scene";
scene.dataset.background = a.backgroundMode;
for (const [key, value] of Object.entries(appearanceStyle(a)))
  scene.style.setProperty(key, value);
if (a.backgroundMode === "image" && a.backgroundImage) {
  const image = document.createElement("img");
  image.src = a.backgroundImage;
  image.alt = "";
  image.className = "folio-backdrop";
  scene.append(image);
}
const pattern = document.createElement("div");
pattern.className = "folio-pattern";
pattern.dataset.pattern = a.grid;
scene.append(pattern);
if (a.showTitle) {
  const title = document.createElement("h1");
  title.className = "folio-scene-title";
  title.textContent = project.title;
  scene.append(title);
}
const book = document.createElement("div");
book.className = "folio-book";
scene.append(book);
const status = document.createElement("div");
status.className = "folio-state";
status.textContent = "加载中…";
status.setAttribute("role", "status");
scene.append(status);
document.body.append(scene);
let controller: BookController | undefined;
document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    controller?.turn(event.key === "ArrowRight");
  }
});
type OfflineWindow = Window & {
  __FOLIO_OFFLINE_ASSETS__?: Record<string, string>;
};
const cache = new Map<string, Promise<string>>();
function localAsset(src: string): Promise<string> {
  if (location.protocol !== "file:") return Promise.resolve(src);
  const previous = cache.get(src);
  if (previous) return previous;
  const path = data.offlineAssets[src];
  if (!path) return Promise.reject(Error("缺少本地纹理资源：" + src));
  const promise = new Promise<string>((resolve, reject) => {
    const script = document.createElement("script");
    const cleanup = () => {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      script.remove();
    };
    const fail = () => {
      cleanup();
      cache.delete(src);
      reject(Error("无法读取本地资源：" + src));
    };
    const timer = setTimeout(fail, 15000);
    script.src = path;
    script.async = true;
    script.onerror = fail;
    script.onload = () => {
      const globals = window as OfflineWindow,
        source = globals.__FOLIO_OFFLINE_ASSETS__?.[src];
      if (!source) {
        fail();
        return;
      }
      delete globals.__FOLIO_OFFLINE_ASSETS__![src];
      cleanup();
      resolve(source);
    };
    document.head.append(script);
  });
  cache.set(src, promise);
  return promise;
}
function failed() {
  status.textContent = "无法打开书本，请确认资源目录完整且浏览器支持 WebGL。";
  status.setAttribute("role", "alert");
}
async function start() {
  const patternSource = await localAsset(data.pattern);
  mountViewer(book, {
    pages: data.pages,
    initialPage: data.initialPage,
    patternSource,
    shadow: a.shadow,
    resolveImage: location.protocol === "file:" ? localAsset : undefined,
    onController: (c) => {
      controller = c;
    },
    onReady: () => status.remove(),
    onError: failed,
  });
}
void start().catch(failed);

/* oxlint-disable react/set-state-in-effect -- Synchronize the external WebGL renderer lifecycle with its loading state. */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { mountViewer } from "../book/viewer";
import type { BookController } from "../book/desktop.js";
import { appearanceStyle, type Appearance } from "./model";
import "../book/viewer.css";

interface Props {
  pages: string[];
  appearance: Appearance;
  title: string;
  reading: boolean;
  count: number;
  request: { page: number; token: number };
  preparing: boolean;
  onIndices: (indices: number[]) => void;
  onUpload: () => void;
}
export default function BookStage({
  pages,
  appearance: a,
  title,
  reading,
  count,
  request,
  preparing,
  onIndices,
  onUpload,
}: Props) {
  const container = useRef<HTMLDivElement>(null),
    controller = useRef<BookController | null>(null);
  const latest = useRef({ request, a, onIndices });
  useEffect(() => {
    latest.current = { request, a, onIndices };
  }, [request, a, onIndices]);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!pages.length || !container.current) return;
    setReady(false);
    setError(false);
    controller.current = null;
    try {
      return mountViewer(container.current, {
        pages,
        initialPage: latest.current.request.page,
        shadow: latest.current.a.shadow,
        onController: (c) => {
          controller.current = c;
        },
        onReady: () => {
          setReady(true);
        },
        onError: () => {
          setError(true);
        },
        onPageChange: (items) => {
          latest.current.onIndices(items);
        },
      });
    } catch {
      setError(true);
    }
  }, [pages, retry]);
  useEffect(() => {
    controller.current?.goTo(request.page);
  }, [request]);
  useEffect(() => {
    controller.current?.setShadow(a.shadow);
  }, [a.shadow, ready]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        (e.target instanceof HTMLElement && e.target.closest(".page-list"))
      )
        return;
      if (
        e.target instanceof HTMLElement &&
        e.target.matches("input,select,textarea,[contenteditable]")
      )
        return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        controller.current?.turn(e.key === "ArrowRight");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <section
      className="folio-scene"
      style={appearanceStyle(a) as CSSProperties}
      data-background={a.backgroundMode}
      aria-label="作品实时预览"
    >
      {a.backgroundMode === "image" && a.backgroundImage && (
        <img className="folio-backdrop" src={a.backgroundImage} alt="" />
      )}
      <div className="folio-pattern" data-pattern={a.grid} />
      {reading && a.showTitle && (
        <h2 className="folio-scene-title">{title || "未命名作品"}</h2>
      )}
      <div className="folio-book" ref={container} />
      {!count ? (
        <div className="empty-book">
          <div className="empty-paper" aria-hidden="true" />
          <button className="primary" onClick={onUpload}>
            ＋ 添加图片
          </button>
        </div>
      ) : (
        (!ready || preparing || error) && (
          <div className="folio-state" role={error ? "alert" : "status"}>
            <span>
              {error ? "暂时无法显示书本，请确认浏览器支持 WebGL。" : "加载中…"}
            </span>
            {error && (
              <button className="quiet" onClick={() => setRetry((n) => n + 1)}>
                重新加载
              </button>
            )}
          </div>
        )
      )}
    </section>
  );
}

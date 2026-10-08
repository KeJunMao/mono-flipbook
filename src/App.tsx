/* oxlint-disable react/set-state-in-effect -- Synchronize asynchronous image preparation with the UI. */
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import BookStage from "./studio/BookStage";
import PageList from "./studio/PageList";
import {
  applyTheme,
  demoProject,
  openingPage,
  themes,
  type Appearance,
  type Project,
  type PageImage,
} from "./studio/model";
import { importImage, preparePages } from "./studio/images";
import { downloadBlob, exportProject } from "./studio/export";
import "./App.css";

type Tab = "theme" | "background" | "book";
function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
function Color({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="color-field">
      <span>{label}</span>
      <span className="color-control">
        <input
          aria-label={label}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
  );
}
function Range({
  label,
  value,
  min = 0,
  max = 100,
  unit = "%",
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <output>
          {value}
          {unit}
        </output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
export default function App() {
  const [project, setProject] = useState<Project>(demoProject);
  const [tab, setTab] = useState<Tab>("theme"),
    [drawer, setDrawer] = useState<"pages" | "style">("style");
  const [reading, setReading] = useState(false),
    [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [prepared, setPrepared] = useState<string[]>([]),
    [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const [indices, setIndices] = useState<number[]>([]),
    [selected, setSelected] = useState(13);
  const [request, setRequest] = useState({
    page: openingPage(project),
    token: 0,
  });
  const [fileDrag, setFileDrag] = useState(false);
  const [exportOpen, setExportOpen] = useState(false),
    [quality, setQuality] = useState<"standard" | "high">("standard");
  const [exporting, setExporting] = useState(false),
    [exportMessage, setExportMessage] = useState("");
  const [result, setResult] = useState<Blob | null>(null);
  const input = useRef<HTMLInputElement>(null),
    replaceInput = useRef<HTMLInputElement>(null),
    backgroundInput = useRef<HTMLInputElement>(null);
  const exportDialog = useRef<HTMLDialogElement>(null);
  const replacementId = useRef<string | null>(null);
  const a = project.appearance,
    pages = project.pages;
  useEffect(() => {
    const abort = new AbortController();
    if (!pages.length) {
      setPrepared([]);
      setPreparing(false);
      return;
    }
    setPreparing(true);
    const task = project.demo
      ? Promise.resolve(pages.map((p) => p.src))
      : preparePages(
          pages,
          { paper: a.paper, fit: a.fit, margin: a.margin },
          1200,
          abort.signal,
        );
    task
      .then((srcs) => {
        if (!abort.signal.aborted) {
          setPrepared(srcs);
          setPreparing(false);
        }
      })
      .catch((cause) => {
        if (!abort.signal.aborted) {
          setError(String(cause));
          setPreparing(false);
        }
      });
    return () => abort.abort();
  }, [pages, project.demo, a.paper, a.fit, a.margin]);
  useEffect(() => {
    const dialog = exportDialog.current;
    if (exportOpen) dialog?.showModal();
    else dialog?.close();
  }, [exportOpen]);
  useEffect(() => {
    document
      .querySelector(".page-tile.selected")
      ?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [selected]);
  const update = <K extends keyof Appearance>(key: K, value: Appearance[K]) =>
    setProject((p) => ({
      ...p,
      appearance: { ...p.appearance, [key]: value },
    }));
  function jump(index: number) {
    setSelected(index);
    setRequest((r) => ({ page: index, token: r.token + 1 }));
  }
  async function addFiles(files: FileList | File[], replaceId?: string) {
    if (uploading) return;
    setUploading(true);
    setError("");
    setResult(null);
    const imported: PageImage[] = [],
      errors: string[] = [];
    const incoming = Array.from(files).sort((x, y) =>
      x.name.localeCompare(y.name, undefined, { numeric: true }),
    );
    if (
      !replaceId &&
      (project.demo ? 0 : pages.length) + incoming.length > 100
    ) {
      setError("第一版每本书最多支持 100 张图片，请分成多本作品。");
      setUploading(false);
      return;
    }
    for (const file of replaceId ? incoming.slice(0, 1) : incoming) {
      try {
        if (file.size > 40 * 1024 * 1024) throw Error("单张图片请小于 40 MB");
        imported.push(await importImage(file));
      } catch (cause) {
        errors.push(
          file.name +
            "：" +
            (cause instanceof Error ? cause.message : String(cause)),
        );
      }
    }
    if (imported.length) {
      setProject((p) => ({
        ...p,
        demo: false,
        title: p.demo ? "未命名画册" : p.title,
        openingPageId:
          !replaceId && p.demo
            ? imported[0].id
            : (p.openingPageId ?? imported[0].id),
        pages: replaceId
          ? p.pages.map((x) =>
              x.id === replaceId ? { ...imported[0], id: replaceId } : x,
            )
          : [...(p.demo ? [] : p.pages), ...imported],
      }));
      if (!replaceId) jump(project.demo ? 0 : pages.length);
    }
    if (errors.length) setError(errors.join("\n"));
    setUploading(false);
  }
  function pick(e: ChangeEvent<HTMLInputElement>, replacement = false) {
    const files = e.target.files;
    const target = replacement ? replacementId.current : undefined;
    if (files?.length && (!replacement || target))
      void addFiles(files, target ?? undefined);
    replacementId.current = null;
    e.target.value = "";
  }
  function reorder(from: number, to: number) {
    if (from < 0 || to < 0 || to >= pages.length || from === to) return;
    const copy = [...pages];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    setProject((p) => ({ ...p, pages: copy }));
    jump(to);
  }
  function resetBook() {
    jump(openingPage(project));
  }
  async function runExport() {
    if (!pages.length || exporting || uploading) return;
    setExporting(true);
    setError("");
    setResult(null);
    try {
      const zip = await exportProject(project, quality, setExportMessage);
      setResult(zip);
      setExportMessage("导出完成");
      downloadBlob(
        zip,
        (project.title || "folio").replace(/[<>:"/\\|?*]/g, "-") + ".zip",
      );
    } catch (cause) {
      setExportMessage("");
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setExporting(false);
    }
  }
  function replacePage(id: string) {
    if (uploading) return;
    replacementId.current = id;
    replaceInput.current?.click();
  }
  function clearPages() {
    if (
      uploading ||
      exporting ||
      !pages.length ||
      !window.confirm("确定移除所有图片？")
    )
      return;
    setProject((p) => ({ ...p, demo: false, pages: [], openingPageId: null }));
    setPrepared([]);
    setIndices([]);
    setReading(false);
    setError("");
    setResult(null);
    replacementId.current = null;
    jump(0);
  }
  function removePage(id: string) {
    if (uploading) return;
    const index = pages.findIndex((page) => page.id === id);
    if (index < 0) return;
    setProject((p) => {
      const remaining = p.pages.filter((page) => page.id !== id);
      return {
        ...p,
        pages: remaining,
        openingPageId:
          p.openingPageId === id
            ? (remaining[Math.min(index, remaining.length - 1)]?.id ?? null)
            : p.openingPageId,
      };
    });
    jump(Math.min(index, Math.max(0, pages.length - 2)));
    setResult(null);
  }
  return (
    <main
      className={
        "studio" +
        (reading ? " is-reading" : "") +
        (fileDrag ? " is-dropping" : "")
      }
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setFileDrag(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setFileDrag(false);
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          setFileDrag(false);
          void addFiles(e.dataTransfer.files);
        }
      }}
    >
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => pick(e)}
      />
      <input
        ref={replaceInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => pick(e, true)}
      />
      <input
        ref={backgroundInput}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const img = await importImage(file);
            setProject((p) => ({
              ...p,
              appearance: {
                ...p.appearance,
                backgroundImage: img.src,
                backgroundMode: "image",
              },
            }));
          } catch (cause) {
            setError(String(cause));
          }
        }}
      />
      <header className="studio-header">
        <a className="brand" href="./" aria-label="纸间工作台">
          <Mark />
          <span>
            Folio<span className="brand-chinese">纸间</span>
          </span>
        </a>
        <div className="project-heading">
          <input
            aria-label="作品名称"
            value={project.title}
            maxLength={80}
            onChange={(e) =>
              setProject((p) => ({ ...p, title: e.target.value }))
            }
          />
        </div>
        <div className="header-actions">
          <button
            className="quiet"
            aria-label="阅读预览"
            onClick={() => {
              resetBook();
              setReading(true);
            }}
            disabled={!pages.length}
          >
            ◉ <span>阅读预览</span>
          </button>
          <button
            className="primary"
            disabled={!pages.length || uploading}
            onClick={() => {
              setResult(null);
              setExportMessage("");
              setExportOpen(true);
            }}
          >
            导出作品 <span>↗</span>
          </button>
        </div>
      </header>
      {reading && (
        <div className="reading-toolbar">
          <button className="quiet" onClick={() => setReading(false)}>
            ← 返回编辑
          </button>
          <button
            className="quiet"
            aria-label="Reset book to its opening spread"
            onClick={resetBook}
          >
            ↺
          </button>
          <button
            className="quiet"
            onClick={() => {
              setResult(null);
              setExportMessage("");
              setExportOpen(true);
            }}
          >
            导出 ZIP ↗
          </button>
        </div>
      )}
      <div className="workspace">
        <aside
          className={
            "pages-panel" + (drawer === "pages" ? " mobile-active" : "")
          }
          aria-label="页面管理"
        >
          <div className="panel-heading">
            <h2>
              书页<span>{String(pages.length).padStart(2, "0")}</span>
            </h2>
          </div>
          <div className="page-toolbar">
            <button
              className="add-pages"
              disabled={uploading}
              onClick={() => input.current?.click()}
            >
              ＋ {uploading ? "正在处理图片…" : "添加图片"}
            </button>
            <button
              type="button"
              className="clear-pages"
              disabled={!pages.length || uploading || exporting}
              onClick={clearPages}
            >
              清空
            </button>
          </div>
          <PageList
            pages={pages}
            selected={selected}
            visible={indices}
            disabled={uploading}
            onSelect={jump}
            onReplace={replacePage}
            onRemove={removePage}
            onReorder={reorder}
          />
        </aside>
        <section className="preview-panel" aria-label="预览工作区">
          <div className="preview-heading">
            <button
              type="button"
              className="text-button"
              aria-label="Reset book to its opening spread"
              onClick={resetBook}
              disabled={!pages.length}
            >
              回到开篇 ↺
            </button>
            <div className="device-controls">
              <button
                className={device === "desktop" ? "active" : ""}
                aria-label="桌面预览"
                aria-pressed={device === "desktop"}
                onClick={() => setDevice("desktop")}
              >
                ▰ <span>桌面</span>
              </button>
              <button
                className={device === "mobile" ? "active" : ""}
                aria-label="手机预览"
                aria-pressed={device === "mobile"}
                onClick={() => setDevice("mobile")}
              >
                ▯ <span>手机</span>
              </button>
            </div>
          </div>
          <div className={"preview-surround " + device}>
            <BookStage
              key={project.demo ? "demo" : "custom"}
              pages={prepared}
              appearance={a}
              title={project.title}
              reading={reading}
              count={pages.length}
              request={request}
              preparing={preparing}
              onIndices={setIndices}
              onUpload={() => input.current?.click()}
            />
          </div>
        </section>
        <aside
          className={"inspector" + (drawer === "style" ? " mobile-active" : "")}
          aria-label="外观定制"
        >
          <div className="inspector-tabs" role="tablist" aria-label="定制类型">
            {(
              [
                ["theme", "主题"],
                ["background", "背景"],
                ["book", "书本"],
              ] as const
            ).map(([id, name]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls={"settings-" + id}
                id={"tab-" + id}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                {name}
              </button>
            ))}
          </div>
          <div
            className="inspector-content"
            role="tabpanel"
            id={"settings-" + tab}
            aria-labelledby={"tab-" + tab}
          >
            {tab === "theme" && (
              <>
                <div className="theme-grid">
                  {themes.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={
                        "theme-card theme-" +
                        t.id +
                        (a.theme === t.id ? " selected" : "")
                      }
                      aria-pressed={a.theme === t.id}
                      onClick={() =>
                        setProject((p) => ({
                          ...p,
                          appearance: applyTheme(p.appearance, t.id),
                        }))
                      }
                    >
                      <span
                        className="theme-preview"
                        style={{
                          backgroundColor: t.background,
                          color: t.gridColor,
                        }}
                      >
                        <span className="theme-mini-book">
                          <i />
                          <i />
                        </span>
                        {a.theme === t.id && (
                          <span className="theme-check">✓</span>
                        )}
                      </span>
                      <span className="theme-name">{t.name}</span>
                    </button>
                  ))}
                </div>
                <div className="inspector-divider" />
                <Color
                  label="背景颜色"
                  value={a.background}
                  onChange={(v) => update("background", v)}
                />
                <Color
                  label="文字颜色"
                  value={a.text}
                  onChange={(v) => update("text", v)}
                />
              </>
            )}
            {tab === "background" && (
              <>
                <label className="select-field">
                  背景方式
                  <select
                    aria-label="背景方式"
                    value={a.backgroundMode}
                    onChange={(e) =>
                      update(
                        "backgroundMode",
                        e.target.value as Appearance["backgroundMode"],
                      )
                    }
                  >
                    <option value="solid">纯色背景</option>
                    <option value="gradient">柔和渐变</option>
                    <option value="image">自定义图片</option>
                  </select>
                </label>
                <Color
                  label="背景颜色"
                  value={a.background}
                  onChange={(v) => update("background", v)}
                />
                {a.backgroundMode === "gradient" && (
                  <Color
                    label="渐变终点"
                    value={a.backgroundEnd}
                    onChange={(v) => update("backgroundEnd", v)}
                  />
                )}
                {a.backgroundMode === "image" && (
                  <>
                    <button
                      className="add-pages"
                      onClick={() => backgroundInput.current?.click()}
                    >
                      {a.backgroundImage ? "替换背景图片" : "选择背景图片"}
                    </button>
                    {a.backgroundImage && (
                      <img
                        className="background-thumb"
                        alt="当前背景图片"
                        src={a.backgroundImage}
                      />
                    )}
                  </>
                )}
                <div className="inspector-divider" />
                <h3 className="settings-heading">网格</h3>
                <label className="select-field">
                  网格样式
                  <select
                    aria-label="网格样式"
                    value={a.grid}
                    onChange={(e) =>
                      update("grid", e.target.value as Appearance["grid"])
                    }
                  >
                    <option value="grid">细线方格</option>
                    <option value="dots">轻盈点阵</option>
                    <option value="lines">横向线条</option>
                    <option value="none">无网格</option>
                  </select>
                </label>
                {a.grid !== "none" && (
                  <>
                    <Color
                      label="网格颜色"
                      value={a.gridColor}
                      onChange={(v) => update("gridColor", v)}
                    />
                    <Range
                      label="横向间距"
                      value={a.gridX}
                      min={8}
                      max={60}
                      unit=" px"
                      onChange={(v) => update("gridX", v)}
                    />
                    <Range
                      label="纵向间距"
                      value={a.gridY}
                      min={8}
                      max={60}
                      unit=" px"
                      onChange={(v) => update("gridY", v)}
                    />
                    <Range
                      label="网格透明度"
                      value={a.gridOpacity}
                      onChange={(v) => update("gridOpacity", v)}
                    />
                  </>
                )}
              </>
            )}
            {tab === "book" && (
              <>
                <label className="select-field">
                  开篇页
                  <select
                    aria-label="开篇页"
                    disabled={!pages.length || uploading}
                    value={project.openingPageId ?? ""}
                    onChange={(event) => {
                      const id = event.target.value;
                      setProject((p) => ({ ...p, openingPageId: id }));
                      setResult(null);
                      jump(pages.findIndex((page) => page.id === id));
                    }}
                  >
                    {!pages.length && <option value="">暂无图片</option>}
                    {pages.map((page, index) => (
                      <option key={page.id} value={page.id}>
                        第 {index + 1} 页
                      </option>
                    ))}
                  </select>
                </label>
                <label className="select-field">
                  阅读页标题
                  <input
                    aria-label="阅读页标题"
                    value={project.title}
                    maxLength={80}
                    onChange={(e) =>
                      setProject((p) => ({ ...p, title: e.target.value }))
                    }
                  />
                </label>
                <Color
                  label="纸张底色"
                  value={a.paper}
                  onChange={(v) => update("paper", v)}
                />
                <span className="field-caption">图片适配</span>
                <div className="segmented">
                  <button
                    className={a.fit === "contain" ? "active" : ""}
                    aria-pressed={a.fit === "contain"}
                    onClick={() => update("fit", "contain")}
                  >
                    完整显示
                  </button>
                  <button
                    className={a.fit === "cover" ? "active" : ""}
                    aria-pressed={a.fit === "cover"}
                    onClick={() => update("fit", "cover")}
                  >
                    铺满裁切
                  </button>
                </div>
                <Range
                  label="页面留白"
                  value={a.margin}
                  max={15}
                  onChange={(v) => update("margin", v)}
                />
                {project.demo && (
                  <p className="field-note">示例页面不参与图片适配。</p>
                )}
                <div className="inspector-divider" />
                <Range
                  label="书本大小"
                  value={a.scale}
                  min={55}
                  max={100}
                  onChange={(v) => update("scale", v)}
                />
                <Range
                  label="书本阴影"
                  value={a.shadow}
                  onChange={(v) => update("shadow", v)}
                />
                <div className="inspector-divider" />
                <label className="toggle-field">
                  <span>显示作品标题</span>
                  <input
                    type="checkbox"
                    checked={a.showTitle}
                    onChange={(e) => update("showTitle", e.target.checked)}
                  />
                </label>
              </>
            )}
          </div>
        </aside>
      </div>

      <nav className="mobile-nav" aria-label="工作台工具">
        <button
          aria-pressed={drawer === "pages"}
          onClick={() => setDrawer("pages")}
        >
          书页 / {pages.length}
        </button>
        <button
          aria-pressed={drawer === "style"}
          onClick={() => setDrawer("style")}
        >
          主题与外观
        </button>
        <button onClick={() => input.current?.click()} disabled={uploading}>
          ＋ 添加图片
        </button>
      </nav>
      {fileDrag && (
        <div className="drop-overlay">
          <Mark />
          <h2>添加图片</h2>
        </div>
      )}
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button
            className="quiet"
            aria-label="关闭提示"
            onClick={() => setError("")}
          >
            ×
          </button>
        </div>
      )}
      <dialog
        className="export-dialog"
        ref={exportDialog}
        onCancel={(e) => {
          if (exporting) e.preventDefault();
          else setExportOpen(false);
        }}
        onClose={() => {
          if (!exporting) setExportOpen(false);
        }}
      >
        <div className="export-top">
          <h2>导出 ZIP</h2>
          <button
            className="quiet"
            aria-label="关闭导出"
            disabled={exporting}
            onClick={() => setExportOpen(false)}
          >
            ×
          </button>
        </div>
        <div className="export-summary">
          <span>{project.title || "未命名作品"}</span>
          <code>{pages.length} 页</code>
        </div>
        <label className="export-quality">
          图片质量
          <select
            aria-label="导出图片质量"
            value={quality}
            disabled={exporting}
            onChange={(e) => {
              setQuality(e.target.value as typeof quality);
              setResult(null);
            }}
          >
            <option value="standard">标准 · 1200 px / 页</option>
            <option value="high">高清 · 2000 px / 页</option>
          </select>
        </label>

        <button
          className="primary export-main"
          disabled={exporting || !pages.length}
          onClick={
            result
              ? () => downloadBlob(result, (project.title || "folio") + ".zip")
              : runExport
          }
        >
          {exporting
            ? exportMessage
            : result
              ? "再次下载 ZIP · " +
                (result.size / 1024 / 1024).toFixed(1) +
                " MB"
              : "生成并下载 ZIP"}
          <span>{exporting ? "…" : "↗"}</span>
        </button>
        <p className="export-note">解压后打开 index.html，保留资源目录</p>
      </dialog>
    </main>
  );
}

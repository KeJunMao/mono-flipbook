# 纸间 · Folio Studio

纯前端图片翻书工作台。沿用 Three.js 纸张卷曲引擎，支持上传图片、定制外观、设置开篇页和分文件 ZIP 导出。

## 启动

```powershell
pnpm install
pnpm dev --host 127.0.0.1 --port 5173
```

打开 http://127.0.0.1:5173 。

## GitHub Pages 部署

工作流位于 [.github/workflows/pages.yml](.github/workflows/pages.yml)，推送到 `main` 时自动部署，也支持手动触发。

1. 在仓库的 **Settings → Pages → Build and deployment** 中，将 **Source** 设为 **GitHub Actions**。这是使用自定义部署工作流的启用步骤，见 [GitHub 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
2. 提交本次改动并推送到 `main`。
3. 在 **Actions → Deploy GitHub Pages** 查看进度；也可点击 **Run workflow** 手动部署。
4. 完成后，从工作流的 `github-pages` 环境链接打开网站。当前仓库的默认地址为 [https://kejunmao.github.io/mono-flipbook/](https://kejunmao.github.io/mono-flipbook/)。

工作流使用 Node.js 24 和 `package.json` 固定的 pnpm 版本，按锁文件安装依赖、检查源码、生成离线阅读器、构建并发布 `dist/`。部署使用 GitHub 自动提供的令牌，无需配置个人 Token 或手动提交构建产物。

构建路径读取 Pages 的 `base_path`，自动适配仓库子路径、用户主页和已配置的自定义域名；本地默认仍使用相对路径。Fork 后无需把原仓库名写进代码；在自己的仓库中启用 Pages 即可。如果更改部署分支，请同步修改工作流的 `on.push.branches`。

## 操作

- 批量上传浏览器可解码的图片，按文件名自然排序。第一次上传替换示例，后续上传追加。
- 缩略图支持 dnd-kit 鼠标拖动、手机长按拖动、键盘排序。双击替换，选中后右上角 × 删除。
- 添加图片旁的“清空”需要确认；取消不会更改作品，确认后清空书页并保留外观设置。
- 工作台只使用当前页面内存，不保存或恢复本地草稿；刷新后回到示例。
- 桌面双页、手机单页；支持点击、拖拽卷曲、长按连翻与键盘方向键。画布不显示翻页按钮或操作提示。
- 右侧“书本 → 开篇页”设置阅读起点。双页模式显示包含该页的跨页，单页模式直接显示该页。
- 阅读预览、“回到开篇”和导出使用同一开篇设置。排序后跟随同一张图片；删除开篇图片后自动选临近页。
- 五种主题；自定义纯色、渐变或图片背景，网格样式、颜色、间距与透明度，纸张底色、图片适配、留白、书本大小、阴影及标题显隐。

## 导出

导出 ZIP 的结构：

```text
index.html
assets/
  reader.js
  reader.css
  paper.webp
  background.webp   # 使用图片背景时生成
  pages/
    page-001.jpg
    page-002.jpg
    ...
offline/
  page-001.js
  ...
  paper.js
READ-ME.txt
```

HTML 只包含项目配置和相对路径，不内嵌图片或阅读器。图片、CSS、JS 分别保存，全部导出文件在打包时校验小于 25,000,000 字节。

解压后双击 index.html 即可离线阅读，请保留资源目录。托管时上传 index.html 和 assets/，保持路径即可，也支持放在网站子目录，无需服务端或 CDN。

offline/ 是浏览器本地 WebGL 纹理读取的兼容资源，图片数据按页拆成独立脚本。它会增加 ZIP 的总大小，但不会集中到 HTML 或某个大脚本中。HTTP/HTTPS 托管时直接加载 assets/ 中的普通图片，不会请求 offline/，仅托管时可以不上传该目录。

## 图片范围

沿用原书竖版比例 1:1.377，通过完整显示、铺满裁切和留白适配不同尺寸。每本最多 100 张，单张不超过 40 MB；替换不会增加页数。

上传在浏览器内生成最长边不超过 3000 px 的主图。标准导出为 1200 px 宽，高清为 2000 px 宽；原图较小时不会增加细节。原版示例仅保留 750 px 素材（public/assets/750），另保留渲染必需的 paper.webp 纸纹。自定义背景以最长边不超过 2000 px 的 WebP 输出。

透明图片合成在纸张底色上；动画作为静态书页。无法解码的格式会提示换用 JPG、PNG 或 WebP。奇数个自定义页面补一面空白，开篇只能选择实际图片页面。

## 构建与验证

```powershell
pnpm build
pnpm lint
pnpm test
```

使用本机 Chrome 验证翻页交互、鼠标/触摸/键盘排序、双击替换、删除与确认清空、刷新不恢复草稿、开篇设置及排序删除后的关联、ZIP 独立图片与文件大小、file:// 断网阅读和静态子目录托管。

scripts/build-reader.mjs 在 predev/prebuild 中生成 public/generated/reader.js 与 reader.css。生成目录和测试解压包不纳入源码检查。

- src/App.tsx、App.css：工作台。
- src/studio/PageList.tsx：缩略图排序与图片操作。
- src/studio/model.ts：项目、主题和开篇设置。
- src/studio/images.ts：图片解码与书页适配。
- src/studio/export.ts：独立资源与 ZIP 打包。
- src/studio/BookStage.tsx：React 预览。
- src/reader.ts、reader.css：无 React 的静态阅读器。
- src/book/viewer.ts、desktop.js、mobile.js：共享翻页引擎。
- tests/book.spec.ts、studio.spec.ts：浏览器验证。

## 原项目参考

示例内容与原渲染实现来自 https://paper.design/mono 的公开构建资源，保留原来源说明。项目不是 Paper 官方发布的开源仓库，也没有为原站素材附加新的开源许可。

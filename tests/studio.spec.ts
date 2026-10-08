import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";
import { createServer } from "node:http";
async function upload(page: Page) {
  await page.goto("/");
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-state",
    "ready",
  );
  const images = await page.evaluate(() => {
    return [
      [700, 1000, "#859b7b"],
      [1200, 600, "#8199ab"],
      [600, 900, "#c5a57a"],
    ].map(([w, h, color]) => {
      const c = document.createElement("canvas");
      c.width = Number(w);
      c.height = Number(h);
      const x = c.getContext("2d")!;
      x.fillStyle = String(color);
      x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = "#faf7ec";
      x.fillRect(c.width * 0.2, c.height * 0.2, c.width * 0.6, c.height * 0.6);
      return c.toDataURL("image/png").split(",")[1];
    });
  });
  await expect(page.locator(".folio-page-controls, .folio-hint")).toHaveCount(
    0,
  );
  await page.locator('input[type="file"][multiple]').setInputFiles(
    images.map((data, i) => ({
      name: ["photo-10.png", "photo-2.png", "photo-3.png"][i],
      mimeType: "image/png",
      buffer: Buffer.from(data, "base64"),
    })),
  );
  await expect(page.locator(".page-tile")).toHaveCount(3);
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-state",
    "ready",
  );
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-loaded-pages",
    "4",
  );
  await expect(page.locator(".page-tile").first()).toHaveAttribute(
    "aria-label",
    /photo-2.png/,
  );
}
test("upload, reorder, fit, live appearance, and invalid image", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await upload(page);
  await dragPage(page, 0, 1);
  await expect(page.locator(".page-tile").first()).toHaveAttribute(
    "aria-label",
    /photo-3.png/,
  );
  await page.getByRole("tab", { name: "书本", exact: true }).click();
  await page.getByRole("button", { name: "铺满裁切" }).click();
  await page.getByLabel("页面留白", { exact: true }).fill("8");
  await page.getByLabel("纸张底色", { exact: true }).fill("#fff3dd");
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-state",
    "ready",
  );
  await page.getByRole("tab", { name: "主题", exact: true }).click();
  await page.getByRole("button", { name: /夜间画廊/ }).click();
  await expect(page.locator(".folio-scene")).toHaveCSS(
    "background-color",
    "rgb(37, 40, 38)",
  );
  await page.getByRole("tab", { name: "背景", exact: true }).click();
  await page.getByLabel("网格样式", { exact: true }).selectOption("dots");
  await page.getByLabel("横向间距", { exact: true }).fill("32");
  await expect(page.locator(".folio-pattern")).toHaveAttribute(
    "data-pattern",
    "dots",
  );
  await expect(page.locator(".folio-pattern")).toHaveCSS(
    "background-size",
    "32px 18px",
  );
  await page.getByLabel("作品名称", { exact: true }).fill("我的本地图册");
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("alert")).toContainText("无法解码");
  await expect(page.locator(".page-tile")).toHaveCount(3);
  await page.getByRole("button", { name: "关闭提示" }).click();
  await page.screenshot({ path: "artifacts/studio-custom-desktop.png" });
  expect(errors).toEqual([]);
});
test("split ZIP keeps HTML small and runs both offline and on a static host", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await upload(page);
  const openingId = await page
    .locator(".page-tile")
    .last()
    .getAttribute("data-page-id");
  await page.getByRole("tab", { name: "书本", exact: true }).click();
  await page.getByLabel("开篇页", { exact: true }).selectOption(openingId!);
  await page.getByRole("tab", { name: "主题", exact: true }).click();
  const title =
    "\u5c71\u95f4\u6765\u4fe1 </script><img src=x onerror=alert(1)>";
  await page
    .getByLabel("\u4f5c\u54c1\u540d\u79f0", { exact: true })
    .fill(title);
  await page.getByRole("button", { name: /\u591c\u95f4\u753b\u5eca/ }).click();
  await page.getByRole("tab", { name: "\u80cc\u666f", exact: true }).click();
  await page
    .getByLabel("\u80cc\u666f\u65b9\u5f0f", { exact: true })
    .selectOption("image");
  const background = await page
    .locator(".thumbnail img")
    .first()
    .getAttribute("src");
  await page
    .locator('input[type="file"]')
    .nth(2)
    .setInputFiles({
      name: "background.png",
      mimeType: "image/png",
      buffer: Buffer.from(background!.split(",")[1], "base64"),
    });
  await expect(page.locator(".background-thumb")).toBeVisible();
  await page.getByRole("button", { name: "\u5bfc\u51fa\u4f5c\u54c1" }).click();
  await page
    .getByLabel("\u5bfc\u51fa\u56fe\u7247\u8d28\u91cf", { exact: true })
    .selectOption("high");
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "\u751f\u6210\u5e76\u4e0b\u8f7d ZIP" })
    .click();
  const download = await downloading;
  const root = path.resolve("artifacts/offline-check/split");
  const site = path.join(root, "site");
  await fs.mkdir(site, { recursive: true });
  const zipPath = path.join(root, "folio.zip");
  await download.saveAs(zipPath);
  const zip = await fs.readFile(zipPath),
    entries: Record<string, Buffer> = {};
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const method = zip.readUInt16LE(offset + 8),
      size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26),
      extra = zip.readUInt16LE(offset + 28);
    const name = zip
      .subarray(offset + 30, offset + 30 + nameLength)
      .toString("utf8");
    const start = offset + 30 + nameLength + extra,
      bytes = zip.subarray(start, start + size);
    entries[name] = method === 8 ? inflateRawSync(bytes) : bytes;
    expect(entries[name].length).toBe(zip.readUInt32LE(offset + 22));
    expect(entries[name].length).toBeLessThan(25_000_000);
    offset = start + size;
  }
  expect(Object.keys(entries)).toEqual(
    expect.arrayContaining([
      "index.html",
      "assets/reader.js",
      "assets/reader.css",
      "assets/paper.webp",
      "assets/background.webp",
      "assets/pages/page-001.jpg",
      "assets/pages/page-004.jpg",
      "offline/page-001.js",
      "offline/paper.js",
      "READ-ME.txt",
    ]),
  );
  expect(entries["index.html"].length).toBeLessThan(16_384);
  const html = entries["index.html"].toString("utf8");
  expect(html).not.toContain('type="module"');
  expect(html).not.toContain("data:image/");
  expect(html).not.toContain("<img src=x onerror=alert(1)>");
  expect(html).toContain('href="./assets/reader.css"');
  expect(html).toContain('src="./assets/reader.js"');
  expect(
    entries["assets/pages/page-001.jpg"].subarray(0, 2).toString("hex"),
  ).toBe("ffd8");
  for (const [name, bytes] of Object.entries(entries)) {
    const target = path.resolve(site, name);
    expect(target.startsWith(site + path.sep)).toBe(true);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
  const context = await browser.newContext({
    viewport: { width: 1497, height: 1054 },
  });
  await context.setOffline(true);
  const reader = await context.newPage();
  reader.on("pageerror", (error) => errors.push(error.message));
  const external: string[] = [];
  reader.on("request", (request) => {
    if (/^https?:/.test(request.url())) external.push(request.url());
  });
  await reader.goto(pathToFileURL(path.join(site, "index.html")).href);
  await expect(reader).toHaveTitle(title);
  await expect(reader.locator(".book-host")).toHaveAttribute(
    "data-magazine-state",
    "ready",
  );
  await expect(reader.locator(".book-host")).toHaveAttribute(
    "data-magazine-loaded-pages",
    "4",
  );
  const data = await reader
    .locator("#folio-data")
    .evaluate((element) => JSON.parse(element.textContent!));
  expect(data.initialPage).toBe(2);
  expect(data.project.openingPageId).toBe(openingId);
  expect(data.project.appearance.backgroundMode).toBe("image");
  expect(data.project.appearance.backgroundImage).toBe(
    "./assets/background.webp",
  );
  expect(
    data.pages.every((src: string) =>
      /^\.\/assets\/pages\/page-\d{3}\.jpg$/.test(src),
    ),
  ).toBe(true);
  const width = await reader.evaluate(async () => {
    const data = JSON.parse(
      document.getElementById("folio-data")!.textContent!,
    );
    const image = new Image();
    image.src = data.pages[0];
    await image.decode();
    return image.naturalWidth;
  });
  expect(width).toBe(2000);
  await expect(reader.locator(".folio-backdrop")).toHaveAttribute(
    "src",
    "./assets/background.webp",
  );
  expect(
    await reader
      .locator(".folio-backdrop")
      .evaluate(
        (element) =>
          (element as HTMLImageElement).complete &&
          (element as HTMLImageElement).naturalWidth > 0,
      ),
  ).toBe(true);
  await expect(reader.locator(".folio-page-controls,.folio-hint")).toHaveCount(
    0,
  );
  await expect(reader.locator(".book-host")).toHaveAttribute(
    "data-magazine-visible-pages",
    "2,3",
  );
  await reader.keyboard.press("ArrowLeft");
  await expect(reader.locator(".book-host")).toHaveAttribute(
    "data-magazine-visible-pages",
    "1",
  );
  await reader.waitForTimeout(1000);
  await reader.keyboard.press("ArrowRight");
  await expect(reader.locator(".book-host")).toHaveAttribute(
    "data-magazine-visible-pages",
    "2,3",
  );
  await reader.screenshot({ path: "artifacts/studio-offline-desktop.png" });
  await reader.setViewportSize({ width: 390, height: 844 });
  await expect(reader.locator(".book-frame")).toHaveClass(/mobile/);
  await expect(reader.locator(".book-host")).toHaveAttribute(
    "data-magazine-state",
    "ready",
  );
  await expect(reader.locator("canvas")).toHaveCount(1);
  await reader.reload();
  await expect(reader.locator(".book-host")).toHaveAttribute(
    "data-magazine-state",
    "ready",
  );
  await expect(reader.locator(".book-host")).toHaveAttribute(
    "data-magazine-visible-pages",
    "3,4",
  );
  await reader.keyboard.press("ArrowLeft");
  await expect(reader.locator(".book-host")).toHaveAttribute(
    "data-magazine-visible-pages",
    "2,3,4",
  );
  await reader.screenshot({ path: "artifacts/studio-offline-mobile.png" });
  expect(external).toEqual([]);
  await context.close();

  const prefix = "/books/demo/";
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url!, "http://127.0.0.1").pathname;
      if (!pathname.startsWith(prefix)) {
        response.writeHead(404).end();
        return;
      }
      const target = path.resolve(
        site,
        decodeURIComponent(pathname.slice(prefix.length)) || "index.html",
      );
      if (!target.startsWith(site + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      const type: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript",
        ".css": "text/css",
        ".jpg": "image/jpeg",
        ".webp": "image/webp",
        ".txt": "text/plain",
      };
      response.setHeader(
        "Content-Type",
        type[path.extname(target)] || "application/octet-stream",
      );
      response.end(await fs.readFile(target));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Missing static server address");
  const origin = "http://127.0.0.1:" + address.port;
  const hostedContext = await browser.newContext({
    viewport: { width: 1497, height: 1054 },
  });
  try {
    const hosted = await hostedContext.newPage(),
      requests: string[] = [];
    hosted.on("pageerror", (error) => errors.push(error.message));
    hosted.on("request", (request) => requests.push(request.url()));
    await hosted.goto(origin + prefix);
    await expect(hosted).toHaveTitle(title);
    await expect(hosted.locator(".book-host")).toHaveAttribute(
      "data-magazine-state",
      "ready",
    );
    await expect(hosted.locator(".book-host")).toHaveAttribute(
      "data-magazine-loaded-pages",
      "4",
    );
    await expect(hosted.locator(".book-host")).toHaveAttribute(
      "data-magazine-failed-pages",
      "0",
    );
    await expect(hosted.locator(".book-host")).toHaveAttribute(
      "data-magazine-visible-pages",
      "2,3",
    );
    await hosted.keyboard.press("ArrowLeft");
    await expect(hosted.locator(".book-host")).toHaveAttribute(
      "data-magazine-visible-pages",
      "1",
    );
    expect(
      requests.some((url) => url.endsWith("/assets/pages/page-001.jpg")),
    ).toBe(true);
    expect(requests.some((url) => url.endsWith("/assets/reader.css"))).toBe(
      true,
    );
    expect(requests.some((url) => url.includes("/offline/"))).toBe(false);
    expect(requests.every((url) => url.startsWith(origin + "/"))).toBe(true);
    await hosted.screenshot({ path: "artifacts/studio-hosted.png" });
  } finally {
    await hostedContext.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  expect(errors).toEqual([]);
});

test("mobile studio fits its screen and switches tools without blocking touch pages", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-state",
    "ready",
  );
  await expect(page.locator(".book-frame")).toHaveClass(/mobile/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({
    path: "artifacts/studio-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /书页 \/ 28/ }).click();
  await expect(
    page.getByRole("complementary", { name: "页面管理" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /第 1 页/ }).click();
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-visible-pages",
    "1,2,3,4",
  );
  await page.getByRole("button", { name: "阅读预览" }).click();
  await expect(page.locator(".studio")).toHaveClass(/is-reading/);
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-state",
    "ready",
  );
  await page.getByRole("button", { name: "返回编辑" }).click();
  await expect(page.locator(".studio")).not.toHaveClass(/is-reading/);
  await context.close();
});

async function dragPage(page: Page, from: number, to: number) {
  const items = page.locator(".page-select");
  await items.nth(from).scrollIntoViewIfNeeded();
  const start = await items.nth(from).boundingBox(),
    end = await items.nth(to).boundingBox();
  if (!start || !end) throw Error("Missing sortable thumbnail");
  const x = start.x + start.width / 2,
    y = start.y + start.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 9, y, { steps: 3 });
  await expect(page.locator(".page-tile.is-dragging")).toHaveCount(1);
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 15,
  });
  await page.mouse.up();
  await expect(page.locator(".page-tile.is-dragging")).toHaveCount(0);
}
test("thumbnail keyboard sorting, double-click replacement, and selected corner removal", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await upload(page);
  await expect(page.locator(".selected-page, .page-actions")).toHaveCount(0);
  await expect(page.locator(".page-remove")).toHaveCount(1);
  const first = page.locator(".page-select").first();
  await first.focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".page-tile.is-dragging")).toHaveCount(1);
  const target = await page.locator(".page-select").nth(1).boundingBox();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => {
      const overlay = await page.locator(".page-drag-overlay").boundingBox();
      return (
        !!overlay &&
        !!target &&
        Math.abs(overlay.x + overlay.width / 2 - target.x - target.width / 2) <
          8
      );
    })
    .toBe(true);
  await page.keyboard.press("Space");
  await expect(page.locator(".page-tile").first()).toHaveAttribute(
    "aria-label",
    /photo-3.png/,
  );
  const id = await page
    .locator(".page-tile")
    .last()
    .getAttribute("data-page-id");
  const src = await page.locator(".thumbnail img").first().getAttribute("src");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator(".page-select").last().dblclick();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: Buffer.from(src!.split(",")[1], "base64"),
  });
  await expect(page.locator(".page-tile")).toHaveCount(3);
  await expect(page.locator(".page-tile").last()).toHaveAttribute(
    "aria-label",
    /replacement.png/,
  );
  await expect(page.locator(".page-tile").last()).toHaveAttribute(
    "data-page-id",
    id!,
  );
  await expect(page.locator(".page-tile").first()).toHaveAttribute(
    "aria-label",
    /photo-3.png/,
  );
  await page
    .locator(".page-tile")
    .last()
    .getByRole("button", { name: "删除第 3 页", exact: true })
    .click();
  await expect(page.locator(".page-tile")).toHaveCount(2);
  await expect(page.locator(".page-tile.selected")).toHaveAttribute(
    "aria-label",
    /photo-2.png/,
  );
  await expect(page.locator(".page-remove")).toHaveCount(1);
  await page.locator(".page-remove").click();
  await expect(page.locator(".page-tile")).toHaveCount(1);
  await page.locator(".page-remove").click();
  await expect(page.locator(".page-tile")).toHaveCount(0);
  await expect(page.locator(".page-remove")).toHaveCount(0);
  await expect(page.locator(".empty-book")).toBeVisible();
  await expect(page.locator(".book-host")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("mobile long-press thumbnail sorting preserves the ordered pages", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await upload(page);
  await page.getByRole("button", { name: /书页 \/ 3/ }).click();
  const items = page.locator(".page-select");
  await items.first().scrollIntoViewIfNeeded();
  const start = await items.first().boundingBox(),
    end = await items.nth(1).boundingBox();
  if (!start || !end) throw Error("Missing mobile thumbnail");
  const x = start.x + start.width / 2,
    y = start.y + start.height / 2,
    dx = end.x + end.width / 2 - x;
  const client = await context.newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await page.waitForTimeout(280);
  await expect(page.locator(".page-tile.is-dragging")).toHaveCount(1);
  for (let step = 1; step <= 12; step++)
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (dx * step) / 12, y }],
    });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator(".page-tile").first()).toHaveAttribute(
    "aria-label",
    /photo-3.png/,
  );
  await expect(page.locator(".page-tile")).toHaveCount(3);
  await page.screenshot({
    path: "artifacts/studio-mobile-pages.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await context.close();
});

test("remove all confirms first and the workspace never persists a draft", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw Error("Unexpected IndexedDB access");
      },
    });
  });
  await upload(page);
  await expect(page.locator(".save-indicator")).toHaveCount(0);
  await page
    .getByLabel("\u4f5c\u54c1\u540d\u79f0", { exact: true })
    .fill("\u4e34\u65f6\u753b\u518c");
  await page.getByRole("tab", { name: "\u80cc\u666f", exact: true }).click();
  await page
    .getByLabel("\u80cc\u666f\u989c\u8272", { exact: true })
    .fill("#aabbcc");
  const source = await page
    .locator(".thumbnail img")
    .first()
    .getAttribute("src");
  const clear = page.locator(".clear-pages"),
    messages: string[] = [];
  page.once("dialog", async (dialog) => {
    messages.push(dialog.message());
    expect(dialog.type()).toBe("confirm");
    await dialog.dismiss();
  });
  await clear.click();
  await expect(page.locator(".page-tile")).toHaveCount(3);
  page.once("dialog", async (dialog) => {
    messages.push(dialog.message());
    await dialog.accept();
  });
  await clear.click();
  await expect(page.locator(".page-tile")).toHaveCount(0);
  await expect(page.locator(".empty-book")).toBeVisible();
  await expect(clear).toBeDisabled();
  await expect(page.locator(".book-host")).toHaveCount(0);
  expect(messages).toEqual([
    "\u786e\u5b9a\u79fb\u9664\u6240\u6709\u56fe\u7247\uff1f",
    "\u786e\u5b9a\u79fb\u9664\u6240\u6709\u56fe\u7247\uff1f",
  ]);
  await expect(
    page.getByLabel("\u4f5c\u54c1\u540d\u79f0", { exact: true }),
  ).toHaveValue("\u4e34\u65f6\u753b\u518c");
  await expect(page.locator(".folio-scene")).toHaveCSS(
    "background-color",
    "rgb(170, 187, 204)",
  );
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "again.png",
    mimeType: "image/png",
    buffer: Buffer.from(source!.split(",")[1], "base64"),
  });
  await expect(page.locator(".page-tile")).toHaveCount(1);
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-state",
    "ready",
  );
  await page.reload();
  await expect(page.locator(".page-tile")).toHaveCount(28);
  await expect(
    page.getByLabel("\u4f5c\u54c1\u540d\u79f0", { exact: true }),
  ).toHaveValue("\u7eb8\u4e0a\u7ec3\u4e60");
  await expect(page.locator(".folio-scene")).toHaveCSS(
    "background-color",
    "rgb(246, 245, 240)",
  );
  expect(errors).toEqual([]);
});

test("opening page follows its image through sorting and falls back after removal", async ({
  page,
}) => {
  await upload(page);
  const openingId = await page
    .locator(".page-tile")
    .last()
    .getAttribute("data-page-id");
  await page.getByRole("tab", { name: "\u4e66\u672c", exact: true }).click();
  const setting = page.getByLabel("\u5f00\u7bc7\u9875", { exact: true });
  await setting.selectOption(openingId!);
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-visible-pages",
    "2,3",
  );
  await page.getByRole("button", { name: "手机预览" }).click();
  await expect(page.locator(".book-frame")).toHaveClass(/mobile/);
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-state",
    "ready",
  );
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-visible-pages",
    "3,4",
  );
  await page.getByRole("button", { name: "桌面预览" }).click();
  await expect(page.locator(".book-frame")).toHaveClass(/desktop/);
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-state",
    "ready",
  );
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-visible-pages",
    "2,3",
  );
  await page.locator(".page-select").first().click();
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-visible-pages",
    "1",
  );
  await page.getByRole("button", { name: "\u9605\u8bfb\u9884\u89c8" }).click();
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-visible-pages",
    "2,3",
  );
  await page.getByRole("button", { name: "\u8fd4\u56de\u7f16\u8f91" }).click();
  await dragPage(page, 2, 0);
  await expect(setting).toHaveValue(openingId!);
  await expect(setting.locator("option:checked")).toHaveText("\u7b2c 1 \u9875");
  await page.getByRole("button", { name: "Reset book" }).click();
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-visible-pages",
    "1",
  );
  await page.locator(".page-select").nth(1).click();
  await page.locator(".page-remove").click();
  await expect(page.locator(".page-tile")).toHaveCount(2);
  await expect(setting).toHaveValue(openingId!);
  await page.locator(".page-select").first().click();
  await page.locator(".page-remove").click();
  await expect(page.locator(".page-tile")).toHaveCount(1);
  const remainingId = await page
    .locator(".page-tile")
    .first()
    .getAttribute("data-page-id");
  await expect(setting).toHaveValue(remainingId!);
  await expect(page.locator(".book-host")).toHaveAttribute(
    "data-magazine-state",
    "ready",
  );
});

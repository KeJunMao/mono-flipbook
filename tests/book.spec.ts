import { test, expect, type Page } from "@playwright/test";
const book = (page: Page) => page.locator(".book-host");
async function ready(page: Page) {
  await page.goto("/");
  await expect(book(page)).toHaveAttribute("data-magazine-state", "ready");
  await expect(book(page)).toHaveAttribute("data-magazine-failed-pages", "0");
}
async function at(page: Page, x: number, y = 0.5) {
  const rect = await book(page).boundingBox();
  if (!rect) throw Error("Missing book");
  return { x: rect.x + rect.width * x, y: rect.y + rect.height * y };
}
test("desktop opening, click forward, click backward, and reset", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await expect(book(page)).toHaveAttribute(
    "data-magazine-visible-pages",
    "14,15",
  );
  await expect(book(page)).toHaveAttribute("data-magazine-loaded-pages", "28");
  const right = await at(page, 0.78);
  await page.mouse.click(right.x, right.y);
  await expect(book(page)).toHaveAttribute(
    "data-magazine-visible-pages",
    "16,17",
  );
  await page.waitForTimeout(1100);
  const left = await at(page, 0.22);
  await page.mouse.click(left.x, left.y);
  await expect(book(page)).toHaveAttribute(
    "data-magazine-visible-pages",
    "14,15",
  );
  await page.getByRole("button", { name: "Reset book" }).click();
  await expect(book(page)).toHaveAttribute("data-magazine-state", "ready");
  await expect(book(page)).toHaveAttribute(
    "data-magazine-visible-pages",
    "14,15",
  );
  expect(errors).toEqual([]);
});
test("desktop drag commits a turn and a short drag returns to its start", async ({
  page,
}) => {
  await ready(page);
  const start = await at(page, 0.8);
  const short = await at(page, 0.76);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(short.x, short.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  await expect(book(page)).toHaveAttribute(
    "data-magazine-visible-pages",
    "14,15",
  );
  const end = await at(page, 0.4);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y - 120, { steps: 20 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: "artifacts/desktop-drag.png" });
  await page.mouse.up();
  await expect(book(page)).toHaveAttribute(
    "data-magazine-visible-pages",
    "16,17",
  );
});
test("holding the page continuously turns multiple sheets and stops on release", async ({
  page,
}) => {
  await ready(page);
  const point = await at(page, 0.82);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForTimeout(1100);
  await page.mouse.up();
  const after = await book(page).getAttribute("data-magazine-visible-pages");
  expect(Number(after!.split(",")[0])).toBeGreaterThanOrEqual(20);
  await page.waitForTimeout(1600);
  expect(await book(page).getAttribute("data-magazine-visible-pages")).toBe(
    after,
  );
});
test("portrait uses the separate mobile renderer and supports forward and backward turns", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await expect(page.locator(".book-frame")).toHaveClass(/mobile/);
  await expect(book(page)).toHaveAttribute(
    "data-magazine-visible-pages",
    "15,16,17,18",
  );
  await page.screenshot({ path: "artifacts/mobile-opening.png" });
  const rect = await book(page).boundingBox();
  if (!rect) throw Error("Missing book");
  await page.touchscreen.tap(
    rect.x + rect.width * 0.8,
    rect.y + rect.height * 0.5,
  );
  await expect(book(page)).toHaveAttribute(
    "data-magazine-visible-pages",
    "16,17,18,19",
  );
  await page.waitForTimeout(1500);
  await page.touchscreen.tap(
    rect.x + rect.width * 0.12,
    rect.y + rect.height * 0.5,
  );
  await expect(book(page)).toHaveAttribute(
    "data-magazine-visible-pages",
    "15,16,17,18",
  );
  expect(errors).toEqual([]);
  await context.close();
});
test("switching between landscape and portrait keeps a single live canvas", async ({
  page,
}) => {
  await ready(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".book-frame")).toHaveClass(/mobile/);
  await expect(book(page)).toHaveAttribute("data-magazine-state", "ready");
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.setViewportSize({ width: 1497, height: 1054 });
  await expect(page.locator(".book-frame")).toHaveClass(/desktop/);
  await expect(book(page)).toHaveAttribute("data-magazine-state", "ready");
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("reading mode mobile canvas spans the viewport while touch dragging beyond the layout frame", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await ready(page);
  await page.getByRole("button", { name: "阅读预览" }).click();
  const bounds = await page.locator("canvas").boundingBox();
  expect(bounds).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  const frame = await page.locator(".book-frame").boundingBox();
  expect(frame!.height).toBeLessThan(bounds!.height);
  const client = await context.newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 320, y: 480 }],
  });
  for (let step = 1; step <= 12; step++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 320 - 24 * step, y: 480 - 20 * step }],
    });
  }
  await page.waitForTimeout(180);
  await page.screenshot({ path: "artifacts/mobile-fullscreen-drag.png" });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(book(page)).toHaveAttribute(
    "data-magazine-visible-pages",
    "16,17,18,19",
  );
  await page.getByRole("button", { name: "Reset book" }).tap();
  await expect(book(page)).toHaveAttribute("data-magazine-state", "ready");
  await expect(book(page)).toHaveAttribute(
    "data-magazine-visible-pages",
    "15,16,17,18",
  );
  await page.setViewportSize({ width: 360, height: 640 });
  await expect
    .poll(async () => await page.locator("canvas").boundingBox())
    .toEqual({ x: 0, y: 0, width: 360, height: 640 });
  await context.close();
});

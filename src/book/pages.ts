const base = "./assets/750/";
export function desktopPages() {
  return Array.from(
    { length: 28 },
    (_, index) => base + "page-" + String(index + 1).padStart(2, "0") + ".webp",
  );
}
export function mobilePages() {
  const pages = desktopPages();
  return [
    ...pages.slice(0, 13),
    base + "mobile-spread-1.webp",
    base + "mobile-spread-2.webp",
    ...pages.slice(17),
  ];
}

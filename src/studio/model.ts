import { desktopPages } from "../book/pages";
export type Pattern = "grid" | "dots" | "lines" | "none";
export interface Appearance {
  theme: string;
  background: string;
  backgroundEnd: string;
  backgroundMode: "solid" | "gradient" | "image";
  backgroundImage: string;
  grid: Pattern;
  gridColor: string;
  gridX: number;
  gridY: number;
  gridOpacity: number;
  paper: string;
  fit: "contain" | "cover";
  margin: number;
  scale: number;
  shadow: number;
  text: string;
  showTitle: boolean;
}
export interface PageImage {
  id: string;
  name: string;
  src: string;
  width?: number;
  height?: number;
}
export interface Project {
  version: 1;
  title: string;
  pages: PageImage[];
  appearance: Appearance;
  demo: boolean;
  openingPageId: string | null;
}
export const defaults: Appearance = {
  theme: "studio",
  background: "#f6f5f0",
  backgroundEnd: "#e5eaf0",
  backgroundMode: "solid",
  backgroundImage: "",
  grid: "grid",
  gridColor: "#a8c4df",
  gridX: 18,
  gridY: 18,
  gridOpacity: 35,
  paper: "#fbfaf6",
  fit: "contain",
  margin: 0,
  scale: 90,
  shadow: 35,
  text: "#343631",
  showTitle: true,
};
export const themes = [
  {
    id: "studio",
    name: "纸上工作室",
    background: "#f6f5f0",
    gridColor: "#a8c4df",
    grid: "grid",
    text: "#343631",
    paper: "#fbfaf6",
  },
  {
    id: "gallery",
    name: "夜间画廊",
    background: "#252826",
    gridColor: "#6c766e",
    grid: "none",
    text: "#e6e8e1",
    paper: "#fbfaf6",
  },
  {
    id: "warm",
    name: "暖调画册",
    background: "#e9dfcd",
    gridColor: "#a99676",
    grid: "dots",
    text: "#514838",
    paper: "#fff9ed",
  },
  {
    id: "minimal",
    name: "极简留白",
    background: "#eff0ed",
    gridColor: "#c1c5bb",
    grid: "none",
    text: "#30352e",
    paper: "#ffffff",
  },
  {
    id: "mono",
    name: "原版 Mono",
    background: "#f6f6f3",
    gridColor: "#cbdcf5",
    grid: "grid",
    text: "#555b59",
    paper: "#fcfcf9",
  },
] as const;
export function applyTheme(current: Appearance, id: string): Appearance {
  const t = themes.find((t) => t.id === id) ?? themes[0];
  return {
    ...current,
    theme: id,
    background: t.background,
    gridColor: t.gridColor,
    grid: t.grid,
    text: t.text,
    paper: t.paper,
    backgroundMode: "solid",
    gridOpacity: id === "mono" ? 100 : 35,
    gridX: id === "mono" ? 12 : 18,
    gridY: id === "mono" ? 24 : 18,
  };
}
export function demoProject(): Project {
  return {
    version: 1,
    title: "纸上练习",
    demo: true,
    openingPageId: "demo-14",
    appearance: { ...defaults },
    pages: desktopPages().map((src, i) => ({
      id: "demo-" + i,
      name: "Mono · " + String(i + 1).padStart(2, "0"),
      src,
    })),
  };
}
export function appearanceStyle(a: Appearance): Record<string, string> {
  const rgb = a.gridColor.match(/\w\w/g)?.map((x) => parseInt(x, 16)) ?? [
    168, 196, 223,
  ];
  return {
    "--folio-bg": a.background,
    "--folio-bg-end": a.backgroundEnd,
    "--folio-ink": a.text,
    "--folio-grid": "rgba(" + rgb.join(",") + "," + a.gridOpacity / 100 + ")",
    "--folio-gx": a.gridX + "px",
    "--folio-gy": a.gridY + "px",
    "--folio-size": String(a.scale / 100),
  };
}

export function openingPage(project: Project): number {
  return Math.max(
    0,
    project.pages.findIndex((page) => page.id === project.openingPageId),
  );
}

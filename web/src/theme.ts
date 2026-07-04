export interface ThemeCanvas {
  bgTop: string; bgBot: string; grid: string;
  nodeFill: string; nodeStroke: string; edge: string;
  accent: string; activeFill: string; token: string;
  label: string; edgeLabelBg: string; edgeLabelText: string;
  subgraphFill: string; subgraphStroke: string; subgraphLabel: string;
  shadow: string;
}

export interface Theme {
  cssVars: Record<string, string>;
  canvas: ThemeCanvas;
}

const FD = "'Geist', system-ui, -apple-system, sans-serif";
const FM = "'Geist Mono', ui-monospace, 'SFMono-Regular', monospace";

// categorical border colors (0xRRGGBBAA) — nodes cycle through these when no stroke is set
export const NODE_PALETTE: number[] = [
  0x22d3eeff, 0x8b5cf6ff, 0x3b82f6ff, 0x10b981ff,
  0xf59e0bff, 0xf43f5eff, 0xd946efff, 0x14b8a6ff,
];

export const themes: Record<string, Theme> = {
  dark: {
    cssVars: {
      "--bg": "#0e1016", "--panel": "#181b22", "--line": "#262b35",
      "--text": "#e6e8ec", "--muted": "#848b9e", "--accent": "#5b7dff",
      "--font-display": FD, "--font-mono": FM,
    },
    canvas: {
      bgTop: "#0a0d14", bgBot: "#0a0d14", grid: "rgba(255,255,255,0.04)",
      nodeFill: "#111521", nodeStroke: "#2b3345", edge: "#6b7488",
      accent: "#5b7dff", activeFill: "rgba(91,125,255,0.08)", token: "#5b7dff",
      label: "#e6e8ec", edgeLabelBg: "#141824", edgeLabelText: "#a8b8d8",
      subgraphFill: "rgba(91,125,255,0.03)", subgraphStroke: "#3a4a6b", subgraphLabel: "#7d8bb0",
      shadow: "rgba(0,0,0,0.55)",
    },
  },
  light: {
    cssVars: {
      "--bg": "#f5f7fa", "--panel": "#ffffff", "--line": "#e2e6ee",
      "--text": "#1a1e28", "--muted": "#6b7485", "--accent": "#3b82f6",
      "--font-display": FD, "--font-mono": FM,
    },
    canvas: {
      bgTop: "#f5f7fa", bgBot: "#f5f7fa", grid: "rgba(0,0,0,0.045)",
      nodeFill: "#ffffff", nodeStroke: "#dce0e8", edge: "#9ca3af",
      accent: "#3b82f6", activeFill: "rgba(59,130,246,0.08)", token: "#3b82f6",
      label: "#1a1e28", edgeLabelBg: "#ffffff", edgeLabelText: "#505a70",
      subgraphFill: "rgba(59,130,246,0.035)", subgraphStroke: "#9db4e8", subgraphLabel: "#6b7485",
      shadow: "rgba(15,25,50,0.10)",
    },
  },
  contrast: {
    cssVars: {
      "--bg": "#000000", "--panel": "#0a0a0a", "--line": "#ffffff",
      "--text": "#ffffff", "--muted": "#cfcfcf", "--accent": "#ffd400",
      "--font-display": FD, "--font-mono": FM,
    },
    canvas: {
      bgTop: "#000000", bgBot: "#000000", grid: "rgba(255,255,255,0.14)",
      nodeFill: "#0d0d0d", nodeStroke: "#ffffff", edge: "#ffffff",
      accent: "#ffd400", activeFill: "rgba(255,212,0,0.12)", token: "#ffd400",
      label: "#ffffff", edgeLabelBg: "#000000", edgeLabelText: "#ffffff",
      subgraphFill: "rgba(255,255,255,0.04)", subgraphStroke: "#333333", subgraphLabel: "#cfcfcf",
      shadow: "rgba(0,0,0,0.80)",
    },
  },
};

export function applyThemeCSS(name: string, themesMap: Record<string, Theme>): void {
  const t = themesMap[name];
  if (!t) return;
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(t.cssVars)) root.setProperty(k, v);
}

export function hexToRgba(hex: string, alpha: number = 1): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function lightenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.min(255, Math.round(r + (255 - r) * amount));
  const ng = Math.min(255, Math.round(g + (255 - g) * amount));
  const nb = Math.min(255, Math.round(b + (255 - b) * amount));
  return `rgb(${nr},${ng},${nb})`;
}

export function darkenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = Math.round(r * (1 - amount));
  const ng = Math.round(g * (1 - amount));
  const nb = Math.round(b * (1 - amount));
  return `rgb(${nr},${ng},${nb})`;
}

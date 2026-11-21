export type Theme = "dark" | "light" | "system";

const THEMES = new Set<string>(["dark", "light", "system"]);

/** Cookie value to a valid theme; dark is the default. */
export function parseTheme(v: string | undefined | null): Theme {
  return v && THEMES.has(v) ? (v as Theme) : "dark";
}

/** Browser chrome colour (PWA / mobile address bar). Same values as --bg in globals.css. */
export const THEME_COLOR = { dark: "#050506", light: "#f3f3f5" } as const;

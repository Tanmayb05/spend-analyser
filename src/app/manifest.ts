import type { MetadataRoute } from "next";
import { THEME_COLOR } from "@/lib/theme";

// Served at /manifest.webmanifest (linked from layout.tsx). Colours come from lib/theme.ts so they match --bg.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Spend Analyser",
    short_name: "Spend",
    start_url: "/",
    display: "standalone",
    background_color: THEME_COLOR.dark,
    theme_color: THEME_COLOR.dark,
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}

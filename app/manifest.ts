import type { MetadataRoute } from "next";

/* Makes ShiftBoard installable: "Add to Home screen" on a phone opens it full screen, like an app */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ShiftBoard",
    short_name: "ShiftBoard",
    description: "The staff rota for small businesses.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f9",
    theme_color: "#2453a6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

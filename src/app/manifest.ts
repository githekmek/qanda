import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Q&A – Das Frage-Antwort-Spiel",
    short_name: "Q&A",
    description: "Stellt euch abwechselnd Fragen und deckt eure Antworten gemeinsam auf.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    lang: "de",
    icons: [
      { src: "/qanda-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/qanda-icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}

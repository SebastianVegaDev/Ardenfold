import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Ardenfold",
        short_name: "Ardenfold",
        start_url: "/",
        display: "standalone",
        background_color: "#F4F8F7",
        theme_color: "#12383A",
        icons: [
            {
                src: "/app-icon-192.png",
                sizes: "192x192",
                type: "image/png",
            },
            {
                src: "/app-icon-512.png",
                sizes: "512x512",
                type: "image/png",
            },
        ],
    };
}

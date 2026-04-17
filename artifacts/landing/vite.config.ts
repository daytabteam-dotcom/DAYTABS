import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// PORT is only used by the dev server — not needed during `vite build`
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  define: {
    "import.meta.env.VITE_PADDLE_CLIENT_TOKEN": JSON.stringify(process.env.PADDLE_CLIENT_TOKEN ?? ""),
    "import.meta.env.VITE_PADDLE_ENVIRONMENT": JSON.stringify(process.env.PADDLE_ENVIRONMENT ?? "production"),
    "import.meta.env.VITE_PADDLE_PRICE_FREE": JSON.stringify(process.env.PADDLE_PRICE_FREE ?? ""),
    "import.meta.env.VITE_PADDLE_PRICE_PREMIUM": JSON.stringify(process.env.PADDLE_PRICE_PREMIUM ?? ""),
    "import.meta.env.VITE_PADDLE_PRICE_PRO": JSON.stringify(process.env.PADDLE_PRICE_PRO ?? process.env.PADDLE_PRICE_PROFESSIONAL ?? ""),
    "import.meta.env.VITE_PADDLE_PRICE_PROFESSIONAL": JSON.stringify(process.env.PADDLE_PRICE_PROFESSIONAL ?? ""),
  },
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});

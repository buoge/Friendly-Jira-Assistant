import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import manifest from "./manifest.config";

export default defineConfig(({ command }) => {
  const counterFile = new URL("./.build-counter.json", import.meta.url);
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  let count = 1;

  if (command === "build" && existsSync(counterFile)) {
    const previous = JSON.parse(readFileSync(counterFile, "utf8"));
    if (previous.date === date && Number.isSafeInteger(previous.count) && previous.count > 0) {
      count = previous.count + 1;
    }
  }

  const buildId = command === "build" ? `${date}-${count}` : "dev";

  return {
    plugins: [crx({ manifest }), {
      name: "build-version",
      transformIndexHtml(html) {
        return html.replaceAll("__BUILD_ID__", buildId);
      },
      writeBundle() {
        writeFileSync(counterFile, `${JSON.stringify({ date, count }, null, 2)}\n`);
      }
    }],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        input: {
          app: "src/popup/index.html",
          options: "src/options/index.html"
        }
      }
    }
  };
});

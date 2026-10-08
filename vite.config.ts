import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Library build: ESM entry points; three and react stay peer dependencies.
export default defineConfig({
  define: { __VERSION__: JSON.stringify(version) },
  build: {
    lib: {
      entry: { index: "src/index.ts", react: "src/react.tsx", server: "src/server.ts", live: "src/live.ts" },
      formats: ["es"],
    },
    rollupOptions: {
      external: [/^three($|\/)/, "react", "react/jsx-runtime", "react-dom"],
    },
    sourcemap: true,
    target: "es2022",
  },
});

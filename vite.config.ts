import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 純前端，沒有後端。整包可以丟到任何靜態主機。
  build: { outDir: "dist" },
});

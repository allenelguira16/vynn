import { defineConfig } from "vite";
import { vynnRenderNewOxcPlugin } from "vite-plugin-vynn";

export default defineConfig({
  plugins: [vynnRenderNewOxcPlugin()],
  server: {
    port: 3001,
    strictPort: true,
  },
  preview: {
    port: 3001,
    strictPort: true,
  },
});

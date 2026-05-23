// app.config.ts
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "@vynn/volt";
var app_config_default = defineConfig({
  plugins: [tailwindcss()]
});
export {
  app_config_default as default
};

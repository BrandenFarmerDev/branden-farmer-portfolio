import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { getPowerBiEmbedUrl } from "./src/content/powerBiEmbed";

export default defineConfig(({ command, mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  if (command === "build" && mode === "production" && environment.VITE_POWER_BI_EMBED_URL?.trim()) {
    getPowerBiEmbedUrl(environment.VITE_POWER_BI_EMBED_URL);
  }

  return {
    plugins: [react()],
  };
});

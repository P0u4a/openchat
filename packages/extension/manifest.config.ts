import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "OpenChat Browser Extension",
  version: "0.0.1",
  description: "Share conversations across AI chat UIs",
  permissions: ["storage", "activeTab", "sidePanel"],
  host_permissions: ["https://chatgpt.com/*", "https://claude.ai/*"],
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  side_panel: {
    default_path: "sidepanel.html",
  },
  content_scripts: [
    {
      matches: ["https://claude.ai/*"],
      js: ["src/contents/claude.ts"],
      run_at: "document_idle",
    },
  ],
  action: {
    default_title: "OpenChat",
  },
});

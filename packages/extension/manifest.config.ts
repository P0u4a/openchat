import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "OpenChat",
  version: "0.0.1",
  description: "Share conversations across AI chat UIs",
  permissions: ["storage", "activeTab", "sidePanel", "tabs"],
  host_permissions: [
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "http://127.0.0.1:27124/*",
  ],
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
    {
      matches: ["https://chatgpt.com/*"],
      js: ["src/contents/chatgpt.ts"],
      run_at: "document_start",
    },
  ],
  web_accessible_resources: [
    {
      resources: ["src/contents/claude-intercept.js"],
      matches: ["https://claude.ai/*"],
    },
    {
      resources: ["src/contents/chatgpt-intercept.js"],
      matches: ["https://chatgpt.com/*"],
    },
  ],
  icons: {
    128: "assets/icon128.png",
    48: "assets/icon48.png",
  },
  action: {
    default_title: "OpenChat",
    default_icon: "assets/icon128.png",
  },
});

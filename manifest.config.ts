import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Friendly Jira Assistant",
  short_name: "Jira Assistant",
  version: "0.1.0",
  description: "A friendly browser extension assistant for Jira workflows.",
  permissions: ["activeTab", "storage"],
  host_permissions: ["http://*/*", "https://*/*"],
  content_security_policy: {
    extension_pages:
      "script-src 'self'; object-src 'self'; img-src 'self' data: blob: http: https:; connect-src 'self' http: https:;"
  },
  action: {
    default_title: "Friendly Jira Assistant"
  },
  options_page: "src/options/index.html",
  background: {
    service_worker: "src/background/index.ts",
    type: "module"
  },
  web_accessible_resources: [{ resources: ["src/popup/index.html"], matches: ["https://*.atlassian.net/*", "https://pm.glodon.com/*"] }],
  content_scripts: [
    {
      matches: ["https://*.atlassian.net/*", "https://pm.glodon.com/newjira/*"],
      js: ["src/content/index.ts"],
      run_at: "document_idle"
    }
  ]
});

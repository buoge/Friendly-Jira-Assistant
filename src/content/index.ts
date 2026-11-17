import { EXTENSION_NAME } from "../shared/constants";
import type { AssistantPageStatusMessage } from "../shared/messages";

const isJiraPage = location.hostname.endsWith(".atlassian.net") || location.hostname === "pm.glodon.com";

const statusMessage: AssistantPageStatusMessage = {
  type: "ASSISTANT_PAGE_STATUS",
  payload: {
    isJiraPage,
    title: document.title,
    url: location.href
  }
};

chrome.runtime.sendMessage(statusMessage, () => {
  // Reading lastError prevents noisy runtime warnings during hot reload.
  void chrome.runtime.lastError;
});

if (isJiraPage) {
  document.documentElement.dataset.friendlyJiraAssistant = "ready";
  console.info(`${EXTENSION_NAME} is ready on this Jira page.`);
}

// Jira replaces issue panels during navigation, so reattach the entry when needed.
const modalStyle = document.createElement("style");
modalStyle.textContent = `
  #friendly-jira-manager::backdrop { background: rgba(9, 30, 66, .48); }
  #friendly-jira-manager { background: #fff; color: #172b4d; box-sizing: border-box; }
  #friendly-jira-batch { position: relative; z-index: 1; display: inline-block; vertical-align: middle; float: none; }
  .friendly-jira-subtasks-title { display: inline-block !important; position: relative !important; float: none !important; width: auto !important; flex: 0 0 auto !important; margin: 0 !important; vertical-align: middle; white-space: nowrap; }
  .friendly-jira-subtasks-title-group { display: inline-flex !important; float: left; position: relative; width: max-content; }
`;
document.head.append(modalStyle);
let manager: HTMLDialogElement | null = null;
let attachedKey = "";
function attachBatchManager() {
  const match = location.pathname.match(/^(.*?)\/browse\/([A-Za-z][A-Za-z0-9_]*-\d+)/);
  const key = match?.[2] ?? new URLSearchParams(location.search).get("selectedIssue");
  if (!key) {
    document.querySelector("#friendly-jira-batch")?.remove();
    manager?.remove();
    manager = null;
    return;
  }
  if (attachedKey !== key) {
    document.querySelector("#friendly-jira-batch")?.remove();
    manager?.remove();
    manager = null;
    attachedKey = key;
  }
  if (document.querySelector("#friendly-jira-batch")) return;
  const heading = document.querySelector<HTMLElement>("#subtasks-module .mod-header .toggle-title, #subtasks-module .mod-header h2, #subtasks-module .mod-header h3, #subtasks-module .mod-header h4, #subtasks-module .mod-header h5, #subtasks-heading")
    ?? Array.from(document.querySelectorAll<HTMLElement>("h2,h3,h4,h5,h6,[role=heading]"))
      .find(element => /^(子任务|Sub-?tasks)$/i.test(element.textContent?.replace(/[\u200b-\u200f]/g, "").trim() ?? ""));
  if (!heading) return;
  const button = document.createElement("button");
  button.id = "friendly-jira-batch";
  button.textContent = "批量管理";
  button.style.cssText = "margin-left:70px;background:#0052cc;color:white;border:0;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:14px";
  button.type = "button";
  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (manager?.open) return;
    manager = document.createElement("dialog");
    manager.id = "friendly-jira-manager";
    manager.setAttribute("aria-label", `${key} 子任务批量管理`);
    manager.style.cssText = "width:min(1200px,94vw);height:85vh;border:0;border-radius:10px;padding:16px;box-shadow:0 12px 60px #0005";
    const close = document.createElement("button");
    close.textContent = "关闭";
    close.style.cssText = "float:right;margin-bottom:8px;padding:6px 16px";
    close.onclick = () => { manager?.close(); manager?.remove(); manager = null; };
    const frame = document.createElement("iframe");
    const prefix = match?.[1] ?? location.pathname.split("/plugins/")[0];
    const params = new URLSearchParams({ issue: key, server: location.origin + prefix });
    frame.src = chrome.runtime.getURL("src/popup/index.html") + "?" + params;
    frame.title = `${key} 子任务批量管理`;
    frame.style.cssText = "width:100%;height:calc(100% - 40px);border:0";
    const title = document.createElement("strong");
    title.textContent = `${key} · 子任务批量管理`;
    manager.append(close, title, frame);
    manager.addEventListener("close", () => { manager?.remove(); manager = null; });
    document.body.append(manager);
    manager.showModal();
  };
  heading.classList.add("friendly-jira-subtasks-title");
  const titleGroup = document.createElement("span");
  titleGroup.className = "friendly-jira-subtasks-title-group";
  heading.before(titleGroup);
  titleGroup.append(heading, button);
}
let scheduled = false;
new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => { scheduled = false; attachBatchManager(); }, 200);
}).observe(document.body, { childList: true, subtree: true });
attachBatchManager();

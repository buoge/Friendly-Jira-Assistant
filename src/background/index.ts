import type { AssistantMessage } from "../shared/messages";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    assistantEnabled: true
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("src/popup/index.html")
  });
});

chrome.runtime.onMessage.addListener((message: AssistantMessage, sender, sendResponse) => {
  if (message.type !== "ASSISTANT_PAGE_STATUS") {
    return false;
  }

  console.info("Friendly Jira Assistant page status", {
    tabId: sender.tab?.id,
    ...message.payload
  });

  sendResponse({ ok: true });
  return true;
});

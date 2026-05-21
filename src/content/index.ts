import { EXTENSION_NAME } from "../shared/constants";
import type { AssistantPageStatusMessage } from "../shared/messages";

const isJiraPage = location.hostname.endsWith(".atlassian.net");

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

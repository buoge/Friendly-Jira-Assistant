import "./styles.css";

const domainInput = document.querySelector<HTMLInputElement>("#jira-domain");
const saveButton = document.querySelector<HTMLButtonElement>("#save-settings");
const saveStatus = document.querySelector<HTMLParagraphElement>("#save-status");

async function loadSettings() {
  const { jiraDomain = "" } = await chrome.storage.sync.get("jiraDomain");

  if (domainInput) {
    domainInput.value = String(jiraDomain);
  }
}

saveButton?.addEventListener("click", async () => {
  await chrome.storage.sync.set({
    jiraDomain: domainInput?.value.trim() ?? ""
  });

  if (saveStatus) {
    saveStatus.textContent = "Settings saved.";
  }
});

loadSettings();

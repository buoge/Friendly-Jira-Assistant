import "./styles.css";
import {
  fetchBoardSprintIssueGroups,
  fetchJiraProjects,
  fetchProjectBoards,
  type JiraBoardIssue,
  type JiraSprintIssueGroup
} from "../shared/jiraData";
import {
  fetchCurrentJiraUser,
  getBestAvatarUrl,
  getInitials,
  hasJiraHostPermission
} from "../shared/jiraUser";
import { validateJiraServerUrl } from "../shared/jiraUrl";

type JiraProjectConfig = {
  key: string;
  label: string;
};

type StoryBoardConfig = {
  label: string;
  projectKey: string;
  value: string;
};

type SaveProjectConfigResult =
  | {
      ok: true;
      projectConfig: JiraProjectConfig | null;
    }
  | {
      ok: false;
      error: string;
    };

const storageKey = "jiraServerUrl";
const profileStorageKey = "jiraProfile";
const projectStorageKey = "jiraProject";
const storyBoardStorageKey = "storyBoard";

const jiraUrlForm = document.querySelector<HTMLFormElement>("#jira-url-form");
const jiraUrlInput = document.querySelector<HTMLInputElement>("#jira-url");
const clearJiraUrlButton = document.querySelector<HTMLButtonElement>("#clear-jira-url");
const jiraUrlMessage = document.querySelector<HTMLParagraphElement>("#jira-url-message");
const connectionStatus = document.querySelector<HTMLSpanElement>("#connection-status");
const profileAvatar = document.querySelector<HTMLSpanElement>("#profile-avatar");
const profileName = document.querySelector<HTMLElement>("#profile-name");
const profileHost = document.querySelector<HTMLSpanElement>("#profile-host");
const menuItems = document.querySelectorAll<HTMLButtonElement>("[data-view-target]");
const views = document.querySelectorAll<HTMLElement>("[data-view]");
const jiraProjectFilter = document.querySelector<HTMLInputElement>("#jira-project-filter");
const jiraProjectOptions = document.querySelector<HTMLDataListElement>("#jira-project-options");
const storyBoardFilter = document.querySelector<HTMLInputElement>("#story-board-filter");
const storyBoardOptions = document.querySelector<HTMLDataListElement>("#story-board-options");
const applyStoryFiltersButton = document.querySelector<HTMLButtonElement>("#apply-story-filters");
const storyFilterSummary = document.querySelector<HTMLParagraphElement>("#story-filter-summary");
const storyProjectSummary = document.querySelector<HTMLParagraphElement>("#story-project-summary");
const storyIssuesCount = document.querySelector<HTMLParagraphElement>("#story-issues-count");
const storyIssuesList = document.querySelector<HTMLDivElement>("#story-issues-list");
let currentJiraServerUrl = "";
let currentProjectConfig: JiraProjectConfig | null = null;
let currentStoryBoardConfig: StoryBoardConfig | null = null;
let jiraProjectsLoaded = false;
let jiraProjectOptionItems: Array<{ value: string; label: string }> = [];
let storyBoardOptionItems: Array<{ value: string; label: string }> = [];

async function loadSettings() {
  const {
    [storageKey]: jiraServerUrl = "",
    [profileStorageKey]: jiraProfile,
    [projectStorageKey]: jiraProject,
    [storyBoardStorageKey]: storyBoard
  } = await chrome.storage.sync.get([storageKey, profileStorageKey, projectStorageKey, storyBoardStorageKey]);
  const savedUrl = String(jiraServerUrl);

  if (isStoredProfile(jiraProfile)) {
    renderProfile(jiraProfile.displayName, jiraProfile.avatarUrl);
  }

  if (isStoredProject(jiraProject)) {
    renderProjectConfig(jiraProject);
  }

  if (isStoredStoryBoard(storyBoard)) {
    renderStoryBoardConfig(storyBoard);
  }

  if (savedUrl) {
    const validationResult = validateJiraServerUrl(savedUrl);

    if (!validationResult.ok) {
      renderJiraUrl("");
      showMissingUrlState(validationResult.error);
      return;
    }

    renderJiraUrl(validationResult.value);
    void loadJiraProfile(validationResult.value, false);
    void loadJiraProjects(validationResult.value, false);
    activateView("story-subtasks");
    return;
  }

  renderJiraUrl("");
  activateView("jira-settings");
  showMissingUrlState("Please add your Jira Server Url before using Friendly Jira Assistant.");
}

function renderJiraUrl(jiraServerUrl: string) {
  currentJiraServerUrl = jiraServerUrl;

  if (jiraUrlInput) {
    jiraUrlInput.value = jiraServerUrl;
  }

  if (connectionStatus) {
    connectionStatus.textContent = jiraServerUrl ? "Configured" : "Not configured";
    connectionStatus.className = jiraServerUrl
      ? "status-badge status-badge--success"
      : "status-badge status-badge--warning";
  }

  if (profileHost) {
    profileHost.textContent = jiraServerUrl ? getUrlHost(jiraServerUrl) : "Jira not connected";
  }

  if (!jiraServerUrl) {
    renderProfileFallback();
    jiraProjectsLoaded = false;
    currentProjectConfig = null;
    currentStoryBoardConfig = null;
    setInputValue(jiraProjectFilter, "");
    setInputValue(storyBoardFilter, "");
    setDatalistOptions(jiraProjectOptions, []);
    setDatalistOptions(storyBoardOptions, []);
    renderStoryProjectSummary();
  }
}

function renderProjectConfig(projectConfig: JiraProjectConfig | null) {
  currentProjectConfig = projectConfig;
  setInputValue(jiraProjectFilter, projectConfig?.label ?? "");
  renderStoryProjectSummary();
}

function renderStoryBoardConfig(boardConfig: StoryBoardConfig | null) {
  currentStoryBoardConfig = boardConfig;
  setInputValue(storyBoardFilter, boardConfig?.label ?? "");
}

function getUrlHost(jiraServerUrl: string) {
  try {
    return new URL(jiraServerUrl).host;
  } catch {
    return "Jira not connected";
  }
}

function showMessage(element: HTMLParagraphElement | null, message: string, type: "error" | "success") {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.dataset.type = type;
}

function clearMessage(element: HTMLParagraphElement | null) {
  if (!element) {
    return;
  }

  element.textContent = "";
  delete element.dataset.type;
}

async function saveJiraUrl(rawUrl: string) {
  const validationResult = validateJiraServerUrl(rawUrl);

  if (!validationResult.ok) {
    return validationResult;
  }

  await chrome.storage.sync.set({
    [storageKey]: validationResult.value
  });

  renderJiraUrl(validationResult.value);
  return validationResult;
}

async function saveProjectConfig(): Promise<SaveProjectConfigResult> {
  const projectInput = jiraProjectFilter?.value.trim() ?? "";
  const projectConfig = getProjectConfigFromInput(projectInput);

  if (!projectInput) {
    await chrome.storage.sync.remove(projectStorageKey);
    renderProjectConfig(null);
    return {
      ok: true,
      projectConfig: null
    };
  }

  if (!projectConfig) {
    return {
      ok: false,
      error: "请选择 Jira 项目列表中的项目，或输入唯一匹配的项目名称/key。"
    };
  }

  await chrome.storage.sync.set({
    [projectStorageKey]: projectConfig
  });
  renderProjectConfig(projectConfig);
  return {
    ok: true,
    projectConfig
  };
}

async function loadJiraProfile(jiraServerUrl: string, showStatus: boolean) {
  const hasPermission = await hasJiraHostPermission(jiraServerUrl);

  if (!hasPermission) {
    showMessage(
      jiraUrlMessage,
      "Chrome permission is missing. Please reload Friendly Jira Assistant in chrome://extensions.",
      "error"
    );
    renderProfileFallback();
    return false;
  }

  try {
    const user = await fetchCurrentJiraUser(jiraServerUrl);
    const displayName = user.displayName ?? user.name ?? user.emailAddress ?? "Jira user";
    const avatarUrl = getBestAvatarUrl(user, jiraServerUrl);

    renderProfile(displayName, avatarUrl);
    await chrome.storage.sync.set({
      [profileStorageKey]: {
        displayName,
        avatarUrl
      }
    });

    if (showStatus) {
      showMessage(jiraUrlMessage, "Jira profile loaded.", "success");
    }

    return true;
  } catch (error) {
    renderProfileFallback();

    showMessage(jiraUrlMessage, getErrorMessage(error), "error");

    return false;
  }
}

function renderProfile(displayName: string, avatarUrl: string) {
  if (profileName) {
    profileName.textContent = displayName;
  }

  if (!profileAvatar) {
    return;
  }

  profileAvatar.textContent = getInitials(displayName);
  profileAvatar.style.backgroundImage = "";

  if (avatarUrl) {
    const avatarImage = new Image();

    avatarImage.onload = () => {
      profileAvatar.textContent = "";
      profileAvatar.style.backgroundImage = `url("${avatarUrl}")`;
    };

    avatarImage.onerror = () => {
      profileAvatar.textContent = getInitials(displayName);
      profileAvatar.style.backgroundImage = "";
    };

    avatarImage.src = avatarUrl;
  }
}

function renderProfileFallback() {
  if (profileName) {
    profileName.textContent = "Profile not loaded";
  }

  if (profileAvatar) {
    profileAvatar.textContent = "?";
    profileAvatar.style.backgroundImage = "";
  }
}

function isStoredProfile(value: unknown): value is { displayName: string; avatarUrl: string } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const profile = value as Record<string, unknown>;
  return typeof profile.displayName === "string" && typeof profile.avatarUrl === "string";
}

function isStoredProject(value: unknown): value is JiraProjectConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const project = value as Record<string, unknown>;
  return typeof project.key === "string" && typeof project.label === "string";
}

function isStoredStoryBoard(value: unknown): value is StoryBoardConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const board = value as Record<string, unknown>;
  return typeof board.label === "string" && typeof board.projectKey === "string" && typeof board.value === "string";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Could not load your Jira profile. Please confirm you are signed in to Jira.";
}

function showMissingUrlState(message: string) {
  showMessage(jiraUrlMessage, message, "error");
  window.setTimeout(() => {
    jiraUrlInput?.focus();
  }, 100);
}

jiraUrlForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(jiraUrlMessage);

  const result = await saveJiraUrl(jiraUrlInput?.value ?? "");

  if (!result.ok) {
    showMessage(jiraUrlMessage, result.error, "error");
    jiraUrlInput?.focus();
    return;
  }

  const profileLoaded = await loadJiraProfile(result.value, true);
  await loadJiraProjects(result.value, false);
  const projectSaveResult = await saveProjectConfig();

  if (!projectSaveResult.ok) {
    showMessage(jiraUrlMessage, projectSaveResult.error, "error");
    jiraProjectFilter?.focus();
    return;
  }

  if (profileLoaded) {
    showMessage(
      jiraUrlMessage,
      projectSaveResult.projectConfig
        ? `Jira settings saved. Current project: ${projectSaveResult.projectConfig.label}.`
        : "Jira Server Url saved. Select a project here when you are ready.",
      "success"
    );
  }

  activateView("story-subtasks");
});

menuItems.forEach((menuItem) => {
  menuItem.addEventListener("click", () => {
    const targetView = menuItem.dataset.viewTarget;

    if (!targetView) {
      return;
    }

    activateView(targetView);
  });
});

function activateView(targetView: string) {
  menuItems.forEach((item) => {
    item.classList.toggle("menu-item--active", item.dataset.viewTarget === targetView);
  });

  views.forEach((view) => {
    view.classList.toggle("view--active", view.dataset.view === targetView);
  });

  if (targetView === "story-subtasks") {
    void loadStoryBoards();
  }
}

clearJiraUrlButton?.addEventListener("click", async () => {
  const confirmed = window.confirm(
    "Clear the saved Jira Server Url, project, and profile information? You will need to enter them again."
  );

  if (!confirmed) {
    return;
  }

  await chrome.storage.sync.remove(storageKey);
  await chrome.storage.sync.remove(profileStorageKey);
  await chrome.storage.sync.remove(projectStorageKey);
  await chrome.storage.sync.remove(storyBoardStorageKey);
  renderJiraUrl("");
  activateView("jira-settings");
  showMissingUrlState("Please add your Jira Server Url before using Friendly Jira Assistant.");
});

applyStoryFiltersButton?.addEventListener("click", () => {
  void loadStoryIssues();
});

jiraProjectFilter?.addEventListener("focus", () => {
  void loadJiraProjects(currentJiraServerUrl, true);
});

jiraProjectFilter?.addEventListener("change", () => {
  const projectConfig = getProjectConfigFromInput(jiraProjectFilter.value);
  renderProjectConfig(projectConfig);
  currentStoryBoardConfig = null;
  setInputValue(storyBoardFilter, "");
  storyBoardOptionItems = [];
  setDatalistOptions(storyBoardOptions, []);
  renderStoryIssues([]);
  void chrome.storage.sync.remove(storyBoardStorageKey);
});

async function loadJiraProjects(jiraServerUrl: string, showStatus: boolean) {
  if (!jiraServerUrl || jiraProjectsLoaded) {
    return;
  }

  if (showStatus) {
    showMessage(jiraUrlMessage, "正在加载 Jira 项目...", "success");
  }

  setInputDisabled(jiraProjectFilter, true);
  setDatalistOptions(jiraProjectOptions, []);

  try {
    const projects = await fetchJiraProjects(jiraServerUrl);
    jiraProjectOptionItems = projects
      .slice()
      .sort((projectA, projectB) => projectA.name.localeCompare(projectB.name))
      .map((project) => ({
        value: project.key,
        label: `${project.name} (${project.key})`
      }));

    setDatalistOptions(jiraProjectOptions, jiraProjectOptionItems);
    jiraProjectsLoaded = true;

    if (showStatus) {
      showMessage(jiraUrlMessage, "项目已从 Jira 加载。输入项目名称或 key 可模糊匹配。", "success");
    }
  } catch (error) {
    setDatalistOptions(jiraProjectOptions, []);
    showMessage(jiraUrlMessage, getErrorMessage(error), "error");
  } finally {
    setInputDisabled(jiraProjectFilter, false);
  }
}

async function loadStoryBoards() {
  renderStoryProjectSummary();

  if (!currentProjectConfig) {
    setInputValue(storyBoardFilter, "");
    storyBoardOptionItems = [];
    setDatalistOptions(storyBoardOptions, []);
    setStoryFilterMessage("请先在 Jira Server Url 配置中选择项目并保存。", "error");
    return;
  }

  await loadProjectBoards(currentProjectConfig.key);
}

async function loadProjectBoards(projectKey: string) {
  if (!currentJiraServerUrl || !projectKey) {
    setInputValue(storyBoardFilter, "");
    storyBoardOptionItems = [];
    setDatalistOptions(storyBoardOptions, []);
    return;
  }

  setInputDisabled(storyBoardFilter, true);
  storyBoardOptionItems = [];
  setDatalistOptions(storyBoardOptions, []);
  renderStoryIssues([]);

  try {
    const boards = await fetchProjectBoards(currentJiraServerUrl, projectKey);
    const options = boards
      .slice()
      .sort((boardA, boardB) => boardA.name.localeCompare(boardB.name))
      .map((board) => ({
        value: String(board.id),
        label: board.name
      }));

    storyBoardOptionItems = options;
    setDatalistOptions(storyBoardOptions, options);
    restoreStoryBoardForProject(projectKey);
    setStoryFilterMessage(
      options.length ? "迭代看板已从 Jira 加载，可输入字符模糊匹配。" : "该项目暂无迭代看板。",
      "success"
    );
  } catch (error) {
    storyBoardOptionItems = [];
    setDatalistOptions(storyBoardOptions, []);
    setStoryFilterMessage(getErrorMessage(error), "error");
  } finally {
    setInputDisabled(storyBoardFilter, false);
  }
}

function getProjectConfigFromInput(inputValue: string) {
  const normalizedInput = inputValue.trim().toLowerCase();

  if (!normalizedInput) {
    return null;
  }

  if (
    currentProjectConfig &&
    (currentProjectConfig.label.toLowerCase() === normalizedInput ||
      currentProjectConfig.key.toLowerCase() === normalizedInput)
  ) {
    return currentProjectConfig;
  }

  const exactMatch = jiraProjectOptionItems.find((option) => option.label.toLowerCase() === normalizedInput);

  if (exactMatch) {
    return {
      key: exactMatch.value,
      label: exactMatch.label
    };
  }

  const keyMatch = jiraProjectOptionItems.find((option) => option.value.toLowerCase() === normalizedInput);

  if (keyMatch) {
    return {
      key: keyMatch.value,
      label: keyMatch.label
    };
  }

  const fuzzyMatches = jiraProjectOptionItems.filter((option) => option.label.toLowerCase().includes(normalizedInput));

  if (fuzzyMatches.length === 1) {
    return {
      key: fuzzyMatches[0].value,
      label: fuzzyMatches[0].label
    };
  }

  return null;
}

async function loadStoryIssues() {
  if (!currentJiraServerUrl) {
    setStoryFilterMessage("请先配置 Jira Server Url。", "error");
    return;
  }

  if (!currentProjectConfig) {
    setStoryFilterMessage("请先在 Jira Server Url 配置中选择项目并保存。", "error");
    return;
  }

  const boardConfig = getBoardConfigFromInput(storyBoardFilter?.value ?? "");

  if (!boardConfig) {
    setStoryFilterMessage("请选择迭代看板列表中的看板，或输入唯一匹配的看板名称。", "error");
    storyBoardFilter?.focus();
    return;
  }

  const projectText = currentProjectConfig.label;
  await saveStoryBoardConfig(boardConfig, currentProjectConfig.key);
  setStoryFilterMessage(`正在加载 ${boardConfig.label} 中进行中和未开始迭代的待拆分事项...`, "success");
  setStoryIssuesCount("正在加载进行中和未开始迭代...");
  renderStoryIssueGroups([]);
  setButtonDisabled(applyStoryFiltersButton, true);

  try {
    const sprintIssueGroups = await fetchBoardSprintIssueGroups(
      currentJiraServerUrl,
      boardConfig.value,
      currentProjectConfig.key,
      boardConfig.label
    );
    const issueCount = sprintIssueGroups.reduce((total, group) => total + group.issues.length, 0);

    renderStoryIssueGroups(sprintIssueGroups);
    setStoryFilterMessage(`当前过滤：${projectText}，${boardConfig.label}。`, "success");
    setStoryIssuesCount(`共加载 ${sprintIssueGroups.length} 个进行中/未开始迭代，${issueCount} 个待拆分事项。`);
  } catch (error) {
    renderStoryIssueGroups([]);
    setStoryIssuesCount("加载失败。");
    setStoryFilterMessage(getErrorMessage(error), "error");
  } finally {
    setButtonDisabled(applyStoryFiltersButton, false);
  }
}

function getBoardConfigFromInput(inputValue: string) {
  const normalizedInput = inputValue.trim().toLowerCase();

  if (!normalizedInput) {
    return storyBoardOptionItems.length === 1 ? storyBoardOptionItems[0] : null;
  }

  const exactMatch = storyBoardOptionItems.find((option) => option.label.toLowerCase() === normalizedInput);

  if (exactMatch) {
    return exactMatch;
  }

  const idMatch = storyBoardOptionItems.find((option) => option.value.toLowerCase() === normalizedInput);

  if (idMatch) {
    return idMatch;
  }

  const fuzzyMatches = storyBoardOptionItems.filter((option) => option.label.toLowerCase().includes(normalizedInput));

  return fuzzyMatches.length === 1 ? fuzzyMatches[0] : null;
}

async function saveStoryBoardConfig(boardConfig: { value: string; label: string }, projectKey: string) {
  const storyBoardConfig = {
    label: boardConfig.label,
    projectKey,
    value: boardConfig.value
  };

  currentStoryBoardConfig = storyBoardConfig;
  await chrome.storage.sync.set({
    [storyBoardStorageKey]: storyBoardConfig
  });
}

function restoreStoryBoardForProject(projectKey: string) {
  if (!currentStoryBoardConfig || currentStoryBoardConfig.projectKey !== projectKey) {
    setInputValue(storyBoardFilter, "");
    return;
  }

  const boardExists = storyBoardOptionItems.some((option) => option.value === currentStoryBoardConfig?.value);

  if (!boardExists) {
    currentStoryBoardConfig = null;
    setInputValue(storyBoardFilter, "");
    void chrome.storage.sync.remove(storyBoardStorageKey);
    return;
  }

  setInputValue(storyBoardFilter, currentStoryBoardConfig.label);
}

function renderStoryIssues(issues: JiraBoardIssue[]) {
  if (!storyIssuesList) {
    return;
  }

  storyIssuesList.replaceChildren(...issues.map((issue) => createIssueElement(issue)));
}

function renderStoryIssueGroups(groups: JiraSprintIssueGroup[]) {
  if (!storyIssuesList) {
    return;
  }

  if (!groups.length) {
    const emptyElement = document.createElement("p");
    emptyElement.className = "issues-list__empty";
    emptyElement.textContent = "暂无进行中或未开始迭代。";
    storyIssuesList.replaceChildren(emptyElement);
    return;
  }

  storyIssuesList.replaceChildren(...groups.map((group) => createSprintGroupElement(group)));
}

function createSprintGroupElement(group: JiraSprintIssueGroup) {
  const groupElement = document.createElement("section");
  groupElement.className = "sprint-group";

  const headerElement = document.createElement("button");
  headerElement.className = "sprint-group__heading";
  headerElement.type = "button";
  headerElement.setAttribute("aria-expanded", "false");

  const titleElement = document.createElement("span");
  titleElement.className = "sprint-group__title";

  const chevronElement = document.createElement("span");
  chevronElement.className = "sprint-group__chevron";
  chevronElement.textContent = "›";

  const titleTextElement = document.createElement("span");
  titleTextElement.className = "sprint-group__title-text";

  const nameElement = document.createElement("h4");
  nameElement.textContent = group.sprint.name;

  titleTextElement.append(nameElement);

  const metaElement = document.createElement("span");
  metaElement.className = "sprint-group__meta";
  metaElement.textContent = `${getSprintStateLabel(group.sprint.state)} · ${group.issues.length} 个事项`;

  titleElement.append(chevronElement, titleTextElement);
  headerElement.append(titleElement, metaElement);

  const issueListElement = document.createElement("div");
  issueListElement.className = "sprint-group__issues";
  issueListElement.hidden = true;
  issueListElement.replaceChildren(...group.issues.map((issue) => createIssueElement(issue)));

  if (!group.issues.length) {
    const emptyElement = document.createElement("p");
    emptyElement.className = "sprint-group__empty";
    emptyElement.textContent = "该迭代暂无用户故事或任务。";
    issueListElement.append(emptyElement);
  }

  groupElement.append(headerElement, issueListElement);
  headerElement.addEventListener("click", () => {
    const isExpanded = headerElement.getAttribute("aria-expanded") === "true";
    headerElement.setAttribute("aria-expanded", String(!isExpanded));
    issueListElement.hidden = isExpanded;
  });

  return groupElement;
}

function getSprintStateLabel(state: string) {
  if (state === "active") {
    return "进行中";
  }

  if (state === "future") {
    return "未开始";
  }

  return state;
}

function createIssueElement(issue: JiraBoardIssue) {
  const issueElement = document.createElement("article");
  issueElement.className = "issue-row";

  const issueType = issue.fields.issuetype?.name ?? "Issue";
  const status = issue.fields.status?.name ?? "No status";
  const summary = issue.fields.summary ?? "Untitled issue";
  const parentKey = issue.fields.parent?.key;
  const parentSummary = issue.fields.parent?.fields?.summary;

  const metaElement = document.createElement("div");
  metaElement.className = "issue-row__meta";

  const typeElement = document.createElement("span");
  typeElement.className = "issue-row__type";
  typeElement.textContent = issueType;

  const keyElement = document.createElement("a");
  keyElement.href = getIssueBrowseUrl(issue.key);
  keyElement.target = "_blank";
  keyElement.rel = "noreferrer";
  keyElement.className = "issue-row__key";
  keyElement.textContent = issue.key;

  const statusElement = document.createElement("span");
  statusElement.className = "issue-row__status";
  statusElement.textContent = status;

  metaElement.append(typeElement, keyElement, statusElement);

  const summaryElement = document.createElement("p");
  summaryElement.textContent = summary;

  issueElement.append(metaElement, summaryElement);

  if (parentKey || parentSummary) {
    const parentElement = document.createElement("span");
    parentElement.className = "issue-row__parent";
    parentElement.textContent = `父级：${[parentKey, parentSummary].filter(Boolean).join(" · ")}`;
    issueElement.append(parentElement);
  }

  return issueElement;
}

function getIssueBrowseUrl(issueKey: string) {
  return `${currentJiraServerUrl}/browse/${encodeURIComponent(issueKey)}`;
}

function setDatalistOptions(datalist: HTMLDataListElement | null, options: Array<{ value: string; label: string }>) {
  if (!datalist) {
    return;
  }

  datalist.replaceChildren(
    ...options.map((option) => {
      const optionElement = document.createElement("option");
      optionElement.value = option.label;
      optionElement.dataset.value = option.value;
      return optionElement;
    })
  );
}

function setInputDisabled(input: HTMLInputElement | null, disabled: boolean) {
  if (input) {
    input.disabled = disabled;
  }
}

function setButtonDisabled(button: HTMLButtonElement | null, disabled: boolean) {
  if (button) {
    button.disabled = disabled;
  }
}

function setInputValue(input: HTMLInputElement | null, value: string) {
  if (input) {
    input.value = value;
  }
}

function setStoryFilterMessage(message: string, type: "error" | "success") {
  showMessage(storyFilterSummary, message, type);
}

function renderStoryProjectSummary() {
  if (storyProjectSummary) {
    storyProjectSummary.textContent = `当前项目：${currentProjectConfig?.label ?? "未配置"}`;
  }
}

function setStoryIssuesCount(message: string) {
  if (storyIssuesCount) {
    storyIssuesCount.textContent = message;
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }

  if (changes[storageKey]) {
    const jiraServerUrl = String(changes[storageKey].newValue ?? "");
    renderJiraUrl(jiraServerUrl);
    jiraProjectsLoaded = false;

    if (jiraServerUrl) {
      void loadJiraProfile(jiraServerUrl, false);
      void loadJiraProjects(jiraServerUrl, false);
    }
  }

  if (changes[projectStorageKey]) {
    const projectConfig = changes[projectStorageKey].newValue;
    renderProjectConfig(isStoredProject(projectConfig) ? projectConfig : null);
    currentStoryBoardConfig = null;
    setInputValue(storyBoardFilter, "");
    storyBoardOptionItems = [];
    setDatalistOptions(storyBoardOptions, []);
    renderStoryIssues([]);
  }

  if (changes[storyBoardStorageKey]) {
    const storyBoardConfig = changes[storyBoardStorageKey].newValue;
    renderStoryBoardConfig(isStoredStoryBoard(storyBoardConfig) ? storyBoardConfig : null);
  }
});

loadSettings();

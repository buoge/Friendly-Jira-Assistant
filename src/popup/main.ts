import "./styles.css";
import {
  createJiraSubtaskWithWebForm,
  fetchBoardSprintIssueGroups,
  fetchIssueStoryContext,
  fetchJiraProjects,
  fetchProjectBoards,
  updateJiraIssueFields,
  type JiraBoardIssue,
  type JiraIssueFields,
  type JiraSprintIssueGroup
} from "../shared/jiraData";
import {
  fetchCurrentJiraUser,
  getBestAvatarUrl,
  getInitials,
  hasJiraHostPermission
} from "../shared/jiraUser";
import { validateJiraServerUrl } from "../shared/jiraUrl";
import { getStoryPointsFromFields } from "../shared/jiraStoryPoints";
import { resolveSubtaskCategory } from "../shared/subtaskTemplates";
import { showTemplateApplyDialog } from "./templateApplyDialog";
import { initTemplateViews, renderTemplateManager } from "./templateViews";

type JiraProjectConfig = {
  key: string;
  label: string;
};

type StoryBoardConfig = {
  label: string;
  projectKey: string;
  value: string;
};

type IssueWithSubtasks = JiraBoardIssue & {
  subtasks: JiraBoardIssue[];
};

type SubtaskCategory = {
  primary: string;
  primaryId: string;
  secondary: string;
  secondaryId: string;
};

type SubtaskDraft = {
  category: SubtaskCategory;
  checkedByDefault?: boolean;
  originalEstimate?: string;
  summary: string;
};

type SubtaskCategoryOption = SubtaskCategory & {
  label: string;
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
const subtaskCategoryOptions: SubtaskCategoryOption[] = [
  {
    label: "开发工作 / 编码开发-前端",
    primary: "开发工作",
    primaryId: "41359",
    secondary: "编码开发-前端",
    secondaryId: "41364"
  },
  {
    label: "开发工作 / 编码开发-后端",
    primary: "开发工作",
    primaryId: "41359",
    secondary: "编码开发-后端",
    secondaryId: "41365"
  },
  {
    label: "开发工作 / 开发自测",
    primary: "开发工作",
    primaryId: "41359",
    secondary: "开发自测",
    secondaryId: "41366"
  },
  {
    label: "开发工作 / MiniShow",
    primary: "开发工作",
    primaryId: "41359",
    secondary: "MiniShow",
    secondaryId: "41367"
  },
  {
    label: "开发工作 / 代码公审",
    primary: "开发工作",
    primaryId: "41359",
    secondary: "代码公审",
    secondaryId: "41368"
  },
  {
    label: "测试工作 / 用例编写",
    primary: "测试工作",
    primaryId: "41372",
    secondary: "用例编写",
    secondaryId: "41377"
  },
  {
    label: "测试工作 / 功能测试",
    primary: "测试工作",
    primaryId: "41372",
    secondary: "功能测试",
    secondaryId: "41380"
  }
];
const fixedSubtaskDrafts: SubtaskDraft[] = [
  {
    summary: "开发自测",
    category: {
      primary: "开发工作",
      primaryId: "41359",
      secondary: "开发自测",
      secondaryId: "41366"
    }
  },
  {
    summary: "code review",
    category: {
      primary: "开发工作",
      primaryId: "41359",
      secondary: "代码公审",
      secondaryId: "41368"
    }
  },
  {
    summary: "mini show",
    category: {
      primary: "开发工作",
      primaryId: "41359",
      secondary: "MiniShow",
      secondaryId: "41367"
    }
  },
  {
    summary: "测试-用例编写",
    checkedByDefault: false,
    category: {
      primary: "测试工作",
      primaryId: "41372",
      secondary: "用例编写",
      secondaryId: "41377"
    }
  },
  {
    summary: "测试-用例执行",
    checkedByDefault: false,
    category: {
      primary: "测试工作",
      primaryId: "41372",
      secondary: "功能测试",
      secondaryId: "41380"
    }
  }
];
const jiraUrlForm = document.querySelector<HTMLFormElement>("#jira-url-form");
const jiraUrlInput = document.querySelector<HTMLInputElement>("#jira-url");
const saveJiraServerButton = document.querySelector<HTMLButtonElement>("#save-jira-server");
const saveJiraProjectButton = document.querySelector<HTMLButtonElement>("#save-jira-project");
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
const templateTabs = document.querySelector<HTMLElement>("#template-tabs");
const templateTabPanels = document.querySelector<HTMLElement>("#template-tab-panels");
const createTemplateButton = document.querySelector<HTMLButtonElement>("#create-template");
let currentJiraServerUrl = "";
let currentProjectConfig: JiraProjectConfig | null = null;
let currentStoryBoardConfig: StoryBoardConfig | null = null;
let jiraProjectsLoaded = false;
let jiraProjectOptionItems: Array<{ value: string; label: string }> = [];
let storyBoardOptionItems: Array<{ value: string; label: string }> = [];
let pendingFocusIssueKey: string | null = null;

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

  updateProjectFieldAvailability();
}

function updateProjectFieldAvailability() {
  const serverSaved = Boolean(currentJiraServerUrl);

  setInputDisabled(jiraProjectFilter, !serverSaved);
  setButtonDisabled(saveJiraProjectButton, !serverSaved);

  if (jiraProjectFilter) {
    jiraProjectFilter.placeholder = serverSaved ? "输入项目名称或 key" : "请先保存 Jira Server Url";
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

jiraUrlForm?.addEventListener("submit", (event) => {
  event.preventDefault();
});

saveJiraServerButton?.addEventListener("click", async () => {
  clearMessage(jiraUrlMessage);

  const previousUrl = currentJiraServerUrl;
  const result = await saveJiraUrl(jiraUrlInput?.value ?? "");

  if (!result.ok) {
    showMessage(jiraUrlMessage, result.error, "error");
    jiraUrlInput?.focus();
    return;
  }

  if (previousUrl && previousUrl !== result.value) {
    await chrome.storage.sync.remove(projectStorageKey);
    await chrome.storage.sync.remove(storyBoardStorageKey);
    renderProjectConfig(null);
    currentStoryBoardConfig = null;
    setInputValue(storyBoardFilter, "");
    storyBoardOptionItems = [];
    setDatalistOptions(storyBoardOptions, []);
    jiraProjectsLoaded = false;
  }

  const profileLoaded = await loadJiraProfile(result.value, true);
  jiraProjectsLoaded = false;
  await loadJiraProjects(result.value, profileLoaded);
  updateProjectFieldAvailability();

  if (profileLoaded) {
    showMessage(jiraUrlMessage, "Jira Server Url saved.", "success");
  }
});

saveJiraProjectButton?.addEventListener("click", async () => {
  clearMessage(jiraUrlMessage);

  const projectSaveResult = await saveProjectConfig();

  if (!projectSaveResult.ok) {
    showMessage(jiraUrlMessage, projectSaveResult.error, "error");
    jiraProjectFilter?.focus();
    return;
  }

  showMessage(
    jiraUrlMessage,
    projectSaveResult.projectConfig
      ? `Project saved: ${projectSaveResult.projectConfig.label}.`
      : "Project cleared.",
    "success"
  );
  activateView("story-subtasks");
});

jiraUrlInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveJiraServerButton?.click();
  }
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

  if (targetView === "task-templates") {
    void renderTemplateManager();
  }
}

clearJiraUrlButton?.addEventListener("click", async () => {
  const confirmed = window.confirm(
    "确定清除所有配置吗？\n\n将删除已保存的 Jira Server Url、项目、看板和个人资料，清除后需要重新填写。"
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
    const restoredSavedBoard = restoreStoryBoardForProject(projectKey);
    setStoryFilterMessage(
      options.length ? "迭代看板已从 Jira 加载，可输入字符模糊匹配。" : "该项目暂无迭代看板。",
      "success"
    );

    if (restoredSavedBoard) {
      await loadStoryIssues();
    }
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
    const issueCount = sprintIssueGroups.reduce((total, group) => total + getIssuesWithSubtasks(group.issues).length, 0);
    const subtaskCount = sprintIssueGroups.reduce(
      (total, group) => total + getIssuesWithSubtasks(group.issues).reduce((sum, issue) => sum + issue.subtasks.length, 0),
      0
    );

    renderStoryIssueGroups(sprintIssueGroups);
    restorePendingStoryIssueFocus();
    setStoryFilterMessage(`当前过滤：${projectText}，${boardConfig.label}。`, "success");
    setStoryIssuesCount(
      `共加载 ${sprintIssueGroups.length} 个进行中/未开始迭代，${issueCount} 个故事/任务，${subtaskCount} 个子任务。`
    );
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
    return false;
  }

  const boardExists = storyBoardOptionItems.some((option) => option.value === currentStoryBoardConfig?.value);

  if (!boardExists) {
    currentStoryBoardConfig = null;
    setInputValue(storyBoardFilter, "");
    void chrome.storage.sync.remove(storyBoardStorageKey);
    return false;
  }

  setInputValue(storyBoardFilter, currentStoryBoardConfig.label);
  return true;
}

function renderStoryIssues(issues: JiraBoardIssue[]) {
  if (!storyIssuesList) {
    return;
  }

  storyIssuesList.replaceChildren(...issues.map((issue) => createIssueElement({ ...issue, subtasks: [] })));
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

function restorePendingStoryIssueFocus() {
  if (!pendingFocusIssueKey) {
    return;
  }

  const issueKey = pendingFocusIssueKey;
  pendingFocusIssueKey = null;

  requestAnimationFrame(() => {
    focusStoryIssueRow(issueKey);
  });
}

function focusStoryIssueRow(issueKey: string) {
  if (!storyIssuesList) {
    return;
  }

  const issueElement = storyIssuesList.querySelector<HTMLElement>(`[data-issue-key="${issueKey}"]`);

  if (!issueElement) {
    return;
  }

  const sprintGroupElement = issueElement.closest(".sprint-group");
  const sprintHeaderElement = sprintGroupElement?.querySelector<HTMLButtonElement>(".sprint-group__heading");
  const sprintIssuesElement = sprintGroupElement?.querySelector<HTMLElement>(".sprint-group__issues");

  if (sprintHeaderElement && sprintHeaderElement.getAttribute("aria-expanded") !== "true") {
    sprintHeaderElement.setAttribute("aria-expanded", "true");

    if (sprintIssuesElement) {
      sprintIssuesElement.hidden = false;
    }
  }

  const issueHeaderElement = issueElement.querySelector<HTMLButtonElement>(".issue-row__header");
  const detailElement = issueElement.querySelector<HTMLElement>(".issue-row__details");

  if (issueHeaderElement && issueHeaderElement.getAttribute("aria-expanded") !== "true") {
    issueHeaderElement.setAttribute("aria-expanded", "true");

    if (detailElement) {
      detailElement.hidden = false;
    }
  }

  const batchCreateElement = issueElement.querySelector<HTMLElement>(".batch-create");
  const scrollTarget = batchCreateElement ?? issueElement;
  scrollTarget.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function createSprintGroupElement(group: JiraSprintIssueGroup) {
  const groupElement = document.createElement("section");
  groupElement.className = "sprint-group";
  groupElement.classList.toggle("sprint-group--active", group.sprint.state === "active");

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
  const issueTree = getIssuesWithSubtasks(group.issues);
  const subtaskCount = issueTree.reduce((total, issue) => total + issue.subtasks.length, 0);

  metaElement.textContent = `${getSprintStateLabel(group.sprint.state)} · ${issueTree.length} 个故事/任务 · ${subtaskCount} 个子任务`;

  titleElement.append(chevronElement, titleTextElement);
  headerElement.append(titleElement, metaElement);

  const issueListElement = document.createElement("div");
  issueListElement.className = "sprint-group__issues";
  issueListElement.hidden = true;
  issueListElement.replaceChildren(...issueTree.map((issue) => createIssueElement(issue)));

  if (!issueTree.length) {
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

function getIssuesWithSubtasks(issues: JiraBoardIssue[]): IssueWithSubtasks[] {
  const topLevelIssues = getTopLevelIssues(issues);
  const subtasksByParentKey = new Map<string, JiraBoardIssue[]>();
  const subtasksByParentId = new Map<string, JiraBoardIssue[]>();

  getSubtaskIssues(issues).forEach((subtask) => {
    const parentKey = subtask.fields.parent?.key;
    const parentId = subtask.fields.parent?.id;

    if (parentKey) {
      appendIssueToMap(subtasksByParentKey, parentKey, subtask);
    }

    if (parentId) {
      appendIssueToMap(subtasksByParentId, parentId, subtask);
    }
  });

  return topLevelIssues.map((issue) => {
    const subtasks = [
      ...(subtasksByParentKey.get(issue.key) ?? []),
      ...(subtasksByParentId.get(issue.id) ?? []),
      ...(issue.fields.subtasks ?? [])
    ];
    const seenSubtaskIds = new Set<string>();

    return {
      ...issue,
      subtasks: subtasks.filter((subtask) => {
        if (seenSubtaskIds.has(subtask.id)) {
          return false;
        }

        seenSubtaskIds.add(subtask.id);
        return true;
      })
    };
  });
}

function appendIssueToMap(issueMap: Map<string, JiraBoardIssue[]>, key: string, issue: JiraBoardIssue) {
  issueMap.set(key, [...(issueMap.get(key) ?? []), issue]);
}

function getTopLevelIssues(issues: JiraBoardIssue[]) {
  return issues.filter((issue) => !isSubtaskIssue(issue));
}

function getSubtaskIssues(issues: JiraBoardIssue[]) {
  return issues.filter(isSubtaskIssue);
}

function isSubtaskIssue(issue: JiraBoardIssue) {
  const issueType = issue.fields.issuetype?.name?.toLowerCase() ?? "";

  return issueType.includes("sub-task") || issueType.includes("subtask") || issueType.includes("子任务");
}

function createIssueElement(issue: IssueWithSubtasks) {
  const issueElement = document.createElement("article");
  issueElement.className = "issue-row";
  issueElement.dataset.issueKey = issue.key;

  const issueType = issue.fields.issuetype?.name ?? "Issue";
  const status = issue.fields.status?.name ?? "No status";
  const summary = issue.fields.summary ?? "Untitled issue";
  const parentKey = issue.fields.parent?.key;
  const parentSummary = issue.fields.parent?.fields?.summary;
  const detailId = `issue-subtasks-${issue.id}`;

  const headerElement = document.createElement("button");
  headerElement.className = "issue-row__header";
  headerElement.type = "button";
  headerElement.setAttribute("aria-expanded", "false");
  headerElement.setAttribute("aria-controls", detailId);

  const typeElement = document.createElement("span");
  typeElement.className = "issue-row__type";
  typeElement.textContent = issueType;

  const metaElement = document.createElement("span");
  metaElement.className = "issue-row__meta";

  const chevronElement = document.createElement("span");
  chevronElement.className = "issue-row__chevron";
  chevronElement.textContent = "›";
  chevronElement.setAttribute("aria-hidden", "true");

  const keyElement = document.createElement("span");
  keyElement.className = "issue-row__key";
  keyElement.textContent = issue.key;

  const statusElement = document.createElement("span");
  statusElement.className = "issue-row__status";
  statusElement.textContent = status;

  metaElement.append(typeElement, keyElement, statusElement);

  const summaryElement = document.createElement("p");
  summaryElement.textContent = summary;

  const subtaskCountElement = document.createElement("span");
  subtaskCountElement.className = "issue-row__subtask-count";
  subtaskCountElement.textContent = `${issue.subtasks.length} 个子任务`;

  headerElement.append(chevronElement, metaElement, subtaskCountElement);
  issueElement.append(headerElement, summaryElement);

  if (parentKey || parentSummary) {
    const parentElement = document.createElement("span");
    parentElement.className = "issue-row__parent";
    parentElement.textContent = `父级：${[parentKey, parentSummary].filter(Boolean).join(" · ")}`;
    issueElement.append(parentElement);
  }

  const detailElement = document.createElement("div");
  detailElement.id = detailId;
  detailElement.className = "issue-row__details";
  detailElement.hidden = true;

  const subtaskListElement = document.createElement("div");
  subtaskListElement.className = "issue-row__subtasks";

  if (issue.subtasks.length) {
    subtaskListElement.replaceChildren(...issue.subtasks.map((subtask) => createSubtaskElement(subtask)));
  } else {
    const emptyElement = document.createElement("p");
    emptyElement.className = "issue-row__subtasks-empty";
    emptyElement.textContent = "暂无子任务。";
    subtaskListElement.append(emptyElement);
  }

  detailElement.append(subtaskListElement, createBatchCreatePanel(issue));
  issueElement.append(detailElement);

  headerElement.addEventListener("click", () => {
    const isExpanded = headerElement.getAttribute("aria-expanded") === "true";
    headerElement.setAttribute("aria-expanded", String(!isExpanded));
    detailElement.hidden = isExpanded;
  });

  return issueElement;
}

function createBatchCreatePanel(issue: IssueWithSubtasks) {
  const panelElement = document.createElement("section");
  panelElement.className = "batch-create";

  const headingElement = document.createElement("div");
  headingElement.className = "batch-create__heading";

  const headingMainElement = document.createElement("div");
  headingMainElement.className = "batch-create__heading-main";

  const titleElement = document.createElement("h5");
  titleElement.textContent = "批量创建子任务";

  const applyTemplateButton = document.createElement("button");
  applyTemplateButton.type = "button";
  applyTemplateButton.className = "batch-create__apply-template";
  applyTemplateButton.textContent = "应用任务拆分模板";

  const messageElement = document.createElement("p");
  messageElement.className = "batch-create__message";
  messageElement.setAttribute("role", "status");

  headingMainElement.append(titleElement, applyTemplateButton);
  headingElement.append(headingMainElement, messageElement);

  const fixedListElement = document.createElement("div");
  fixedListElement.className = "batch-create__fixed";

  const fixedCheckboxes = fixedSubtaskDrafts.map((draft) => {
    const labelElement = document.createElement("label");
    labelElement.className = "batch-create__check";

    const checkboxElement = document.createElement("input");
    checkboxElement.type = "checkbox";
    checkboxElement.checked =
      draft.checkedByDefault === false ? false : !isFixedSubtaskDraftCovered(issue, draft);
    checkboxElement.value = draft.summary;

    const textElement = document.createElement("span");
    textElement.textContent = draft.summary;

    labelElement.append(checkboxElement, textElement);
    fixedListElement.append(labelElement);
    return checkboxElement;
  });

  const customFieldElement = document.createElement("label");
  customFieldElement.className = "batch-create__custom";

  const customLabelElement = document.createElement("span");
  customLabelElement.textContent = "自定义前端/后端任务";

  const customTextareaElement = document.createElement("textarea");
  customTextareaElement.rows = 3;
  customTextareaElement.placeholder = "每行一个任务，用逗号分隔名称和预估时间，例如：前端-开发任务1，4h";

  customFieldElement.append(customLabelElement, customTextareaElement);

  const previewElement = document.createElement("ul");
  previewElement.className = "batch-create__preview";

  const actionsElement = document.createElement("div");
  actionsElement.className = "batch-create__actions";

  const createButtonElement = document.createElement("button");
  createButtonElement.type = "button";
  createButtonElement.textContent = "创建缺失子任务";

  actionsElement.append(createButtonElement);
  panelElement.append(headingElement, fixedListElement, customFieldElement, previewElement, actionsElement);

  const refreshPreview = () => {
    const preview = getBatchCreatePreview(issue, fixedCheckboxes, customTextareaElement.value);
    renderBatchPreview(previewElement, preview);
    createButtonElement.disabled = preview.creatable.length === 0 || !currentProjectConfig;
  };

  fixedCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", refreshPreview);
  });
  customTextareaElement.addEventListener("input", refreshPreview);
  refreshPreview();

  createButtonElement.addEventListener("click", () => {
    void createMissingSubtasks(issue, fixedCheckboxes, customTextareaElement.value, createButtonElement, messageElement);
  });

  applyTemplateButton.addEventListener("click", () => {
    void (async () => {
      const storyContext = currentJiraServerUrl
        ? await fetchIssueStoryContext(currentJiraServerUrl, issue)
        : {
            storyKey: issue.key,
            storyPoints:
              getStoryPointsFromFields(issue.fields as Record<string, unknown>) ?? "—",
            storySummary: issue.fields.summary?.trim() || "未命名用户故事"
          };
      const items = await showTemplateApplyDialog(storyContext);

      if (!items?.length) {
        return;
      }

      applyTemplateItemsToBatchCreate(issue, items, fixedCheckboxes, customTextareaElement);
      refreshPreview();
      showBatchCreateMessage(messageElement, `已从模板填入 ${items.length} 项任务，请确认后创建。`, "success");
    })();
  });

  return panelElement;
}

function findFixedSubtaskDraftIndex(summary: string) {
  const normalizedSummary = normalizeSummary(summary);
  const category = resolveSubtaskCategory(summary);

  return fixedSubtaskDrafts.findIndex((draft) => {
    if (normalizeSummary(draft.summary) === normalizedSummary) {
      return true;
    }

    return (
      category !== null &&
      category.primaryId === draft.category.primaryId &&
      category.secondaryId === draft.category.secondaryId
    );
  });
}

function applyTemplateItemsToBatchCreate(
  issue: IssueWithSubtasks,
  items: Array<{ estimateHours: number; summary: string }>,
  fixedCheckboxes: HTMLInputElement[],
  customTextareaElement: HTMLTextAreaElement
) {
  fixedCheckboxes.forEach((checkbox) => {
    checkbox.checked = false;
  });

  const customLines: string[] = [];

  items.forEach((item) => {
    const draftIndex = findFixedSubtaskDraftIndex(item.summary);

    if (draftIndex >= 0) {
      const draft = fixedSubtaskDrafts[draftIndex];

      if (!isFixedSubtaskDraftCovered(issue, draft)) {
        fixedCheckboxes[draftIndex].checked = true;
      }

      return;
    }

    if (getCustomTaskCategory(item.summary)) {
      customLines.push(`${item.summary}，${item.estimateHours}h`);
    }
  });

  customTextareaElement.value = customLines.join("\n");
}

function isFixedSubtaskDraftCovered(issue: IssueWithSubtasks, draft: SubtaskDraft) {
  const normalizedDraftSummary = normalizeSummary(draft.summary);

  return issue.subtasks.some((subtask) => {
    if (normalizeSummary(subtask.fields.summary ?? "") === normalizedDraftSummary) {
      return true;
    }

    const existingCategory = getIssueSubtaskCategory(subtask);

    return (
      existingCategory !== null &&
      existingCategory.primaryId === draft.category.primaryId &&
      existingCategory.secondaryId === draft.category.secondaryId
    );
  });
}

function getBatchCreatePreview(issue: IssueWithSubtasks, fixedCheckboxes: HTMLInputElement[], customTaskText: string) {
  const existingSummaries = new Set(issue.subtasks.map((subtask) => normalizeSummary(subtask.fields.summary ?? "")));
  const selectedFixedDrafts = fixedSubtaskDrafts.filter((draft, index) => fixedCheckboxes[index]?.checked);
  const customDraftResult = parseCustomTaskDrafts(customTaskText);
  const duplicateSummaries = new Set<string>();
  const creatable: SubtaskDraft[] = [];
  const skipped: string[] = [];

  selectedFixedDrafts.forEach((draft) => {
    const normalizedSummary = normalizeSummary(draft.summary);

    if (!normalizedSummary) {
      return;
    }

    if (isFixedSubtaskDraftCovered(issue, draft)) {
      skipped.push(`${draft.summary}（已存在）`);
      return;
    }

    if (duplicateSummaries.has(normalizedSummary)) {
      skipped.push(`${draft.summary}（重复输入）`);
      return;
    }

    duplicateSummaries.add(normalizedSummary);
    creatable.push(draft);
  });

  customDraftResult.drafts.forEach((draft) => {
    const normalizedSummary = normalizeSummary(draft.summary);

    if (!normalizedSummary) {
      return;
    }

    if (existingSummaries.has(normalizedSummary)) {
      skipped.push(`${draft.summary}（已存在）`);
      return;
    }

    if (duplicateSummaries.has(normalizedSummary)) {
      skipped.push(`${draft.summary}（重复输入）`);
      return;
    }

    duplicateSummaries.add(normalizedSummary);
    creatable.push(draft);
  });

  return {
    creatable,
    invalid: customDraftResult.invalid,
    skipped
  };
}

function renderBatchPreview(
  previewElement: HTMLUListElement,
  preview: { creatable: SubtaskDraft[]; invalid: string[]; skipped: string[] }
) {
  const previewItems = [
    ...preview.creatable.map((draft) => ({
      text: `${draft.summary}：${draft.category.primary} / ${draft.category.secondary}${draft.originalEstimate ? `，初始预估 ${draft.originalEstimate}` : ""}`,
      type: "ready"
    })),
    ...preview.skipped.map((summary) => ({
      text: summary,
      type: "muted"
    })),
    ...preview.invalid.map((summary) => ({
      text: `${summary}（仅支持“前端”或“后端”开头）`,
      type: "error"
    }))
  ];

  if (!previewItems.length) {
    const emptyElement = document.createElement("li");
    emptyElement.className = "batch-create__preview-empty";
    emptyElement.textContent = "选择固定任务或输入自定义任务后会在这里预览。";
    previewElement.replaceChildren(emptyElement);
    return;
  }

  previewElement.replaceChildren(
    ...previewItems.map((item) => {
      const itemElement = document.createElement("li");
      itemElement.dataset.type = item.type;
      itemElement.textContent = item.text;
      return itemElement;
    })
  );
}

function parseCustomTaskDrafts(customTaskText: string) {
  const drafts: SubtaskDraft[] = [];
  const invalid: string[] = [];

  customTaskText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const parsedLine = parseCustomTaskLine(line);
      const category = getCustomTaskCategory(parsedLine.summary);

      if (!category) {
        invalid.push(line);
        return;
      }

      drafts.push({
        category,
        originalEstimate: parsedLine.originalEstimate,
        summary: parsedLine.summary
      });
    });

  return {
    drafts,
    invalid
  };
}

function parseCustomTaskLine(line: string) {
  const [summary = "", originalEstimate = ""] = line.split(/[，,]/, 2).map((part) => part.trim());

  return {
    originalEstimate,
    summary
  };
}

function getCustomTaskCategory(summary: string): SubtaskCategory | null {
  if (summary.startsWith("前端")) {
    return {
      primary: "开发工作",
      primaryId: "41359",
      secondary: "编码开发-前端",
      secondaryId: "41364"
    };
  }

  if (summary.startsWith("后端")) {
    return {
      primary: "开发工作",
      primaryId: "41359",
      secondary: "编码开发-后端",
      secondaryId: "41365"
    };
  }

  return null;
}

async function createMissingSubtasks(
  issue: IssueWithSubtasks,
  fixedCheckboxes: HTMLInputElement[],
  customTaskText: string,
  createButtonElement: HTMLButtonElement,
  messageElement: HTMLParagraphElement
) {
  if (!currentProjectConfig) {
    showBatchCreateMessage(messageElement, "请先选择 Jira 项目。", "error");
    return;
  }

  const preview = getBatchCreatePreview(issue, fixedCheckboxes, customTaskText);

  if (!preview.creatable.length) {
    showBatchCreateMessage(messageElement, "没有需要创建的子任务。", "error");
    return;
  }

  if (!issue.id) {
    showBatchCreateMessage(messageElement, "缺少父问题 id，无法调用 Jira 原生创建子任务表单。", "error");
    return;
  }

  setButtonDisabled(createButtonElement, true);
  showBatchCreateMessage(messageElement, "正在通过 Jira 原生表单创建子任务...", "success");

  try {
    const createdKeys: string[] = [];

    for (const draft of preview.creatable) {
      const createdIssue = await createJiraSubtaskWithWebForm(currentJiraServerUrl, {
        categoryChildId: draft.category.secondaryId,
        categoryParentId: draft.category.primaryId,
        originalEstimate: draft.originalEstimate,
        parentIssueId: issue.id,
        summary: draft.summary
      });
      createdKeys.push(createdIssue.key);
    }

    showBatchCreateMessage(
      messageElement,
      `已创建 ${createdKeys.length} 个子任务${preview.skipped.length ? `，跳过 ${preview.skipped.length} 个已存在/重复项` : ""}。`,
      "success"
    );
    pendingFocusIssueKey = issue.key;
    await loadStoryIssues();
    setStoryFilterMessage(
      `已为 ${issue.key} 创建 ${createdKeys.length} 个子任务${preview.skipped.length ? `，跳过 ${preview.skipped.length} 个已存在/重复项` : ""}。`,
      "success"
    );
  } catch (error) {
    showBatchCreateMessage(messageElement, getErrorMessage(error), "error");
  } finally {
    setButtonDisabled(createButtonElement, false);
  }
}

function normalizeSummary(summary: string) {
  return summary.trim().toLowerCase();
}

function showBatchCreateMessage(element: HTMLParagraphElement, message: string, type: "error" | "success") {
  element.textContent = message;
  element.dataset.type = type;
}

function createSubtaskElement(issue: JiraBoardIssue) {
  const issueElement = document.createElement("article");
  issueElement.className = "subtask-row";

  const issueType = issue.fields.issuetype?.name ?? "子任务";
  const status = issue.fields.status?.name ?? "No status";
  const summary = issue.fields.summary ?? "Untitled issue";
  const category = getIssueSubtaskCategory(issue);
  const originalEstimate = issue.fields.timetracking?.originalEstimate ?? "";
  const assigneeName = issue.fields.assignee?.name ?? "";
  const assigneeLabel = issue.fields.assignee?.displayName ?? assigneeName;

  const mainElement = document.createElement("div");
  mainElement.className = "subtask-row__main";

  const contentElement = document.createElement("div");
  contentElement.className = "subtask-row__content";

  const metaElement = document.createElement("div");
  metaElement.className = "subtask-row__meta";

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

  const summaryElement = document.createElement("p");
  summaryElement.textContent = summary;

  const editorElement = document.createElement("div");
  editorElement.className = "subtask-row__editor";

  const categoryField = document.createElement("label");
  categoryField.className = "subtask-row__field";
  const categoryLabel = document.createElement("span");
  categoryLabel.textContent = "任务分类";
  const categorySelect = document.createElement("select");
  categorySelect.replaceChildren(
    createOptionElement("", "未设置"),
    ...subtaskCategoryOptions.map((option) => createOptionElement(getCategoryOptionValue(option), option.label))
  );
  categorySelect.value = category ? getCategoryOptionValue(category) : "";
  categoryField.append(categoryLabel, categorySelect);

  const estimateField = document.createElement("label");
  estimateField.className = "subtask-row__field";
  const estimateLabel = document.createElement("span");
  estimateLabel.textContent = "初始预估";
  const estimateInput = document.createElement("input");
  estimateInput.value = originalEstimate;
  estimateInput.placeholder = "例如 4h";
  estimateField.append(estimateLabel, estimateInput);

  const assigneeField = document.createElement("label");
  assigneeField.className = "subtask-row__field";
  const assigneeTextLabel = document.createElement("span");
  assigneeTextLabel.textContent = "经办人";
  const assigneeInput = document.createElement("input");
  assigneeInput.value = assigneeName;
  assigneeInput.placeholder = assigneeLabel || "用户名";
  assigneeField.append(assigneeTextLabel, assigneeInput);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "保存";

  const messageElement = document.createElement("span");
  messageElement.className = "subtask-row__message";
  messageElement.setAttribute("role", "status");

  editorElement.append(categoryField, estimateField, assigneeField, saveButton, messageElement);
  metaElement.append(typeElement, keyElement, statusElement);
  contentElement.append(metaElement, summaryElement);
  mainElement.append(contentElement, editorElement);
  issueElement.append(mainElement);

  saveButton.addEventListener("click", () => {
    void saveSubtaskEdits(issue, categorySelect, estimateInput, assigneeInput, saveButton, messageElement);
  });

  return issueElement;
}

function createOptionElement(value: string, label: string) {
  const optionElement = document.createElement("option");
  optionElement.value = value;
  optionElement.textContent = label;
  return optionElement;
}

function getCategoryOptionValue(category: SubtaskCategory) {
  return `${category.primaryId}:${category.secondaryId}`;
}

function getIssueSubtaskCategory(issue: JiraBoardIssue): SubtaskCategoryOption | null {
  const fieldValue = issue.fields.customfield_14102;

  if (!fieldValue || typeof fieldValue !== "object") {
    return null;
  }

  const categoryValue = fieldValue as { child?: { id?: string; value?: string }; id?: string; value?: string };
  const parentId = categoryValue.id ?? "";
  const parentLabel = categoryValue.value ?? "";
  const childId = categoryValue.child?.id ?? "";
  const childLabel = categoryValue.child?.value ?? "";

  return (
    subtaskCategoryOptions.find(
      (option) =>
        (parentId && childId && option.primaryId === parentId && option.secondaryId === childId) ||
        (parentLabel && childLabel && option.primary === parentLabel && option.secondary === childLabel)
    ) ?? null
  );
}

async function saveSubtaskEdits(
  issue: JiraBoardIssue,
  categorySelect: HTMLSelectElement,
  estimateInput: HTMLInputElement,
  assigneeInput: HTMLInputElement,
  saveButton: HTMLButtonElement,
  messageElement: HTMLSpanElement
) {
  const category = subtaskCategoryOptions.find((option) => getCategoryOptionValue(option) === categorySelect.value);
  const estimate = estimateInput.value.trim();
  const assignee = assigneeInput.value.trim();
  const fields: JiraIssueFields = {};

  if (category) {
    fields.customfield_14102 = {
      id: category.primaryId,
      child: {
        id: category.secondaryId
      }
    };
  }

  if (estimate) {
    fields.timetracking = {
      originalEstimate: estimate,
      remainingEstimate: estimate
    };
  }

  if (assignee) {
    fields.assignee = {
      name: assignee
    };
  }

  if (!Object.keys(fields).length) {
    showSubtaskEditMessage(messageElement, "没有可保存的字段。", "error");
    return;
  }

  setButtonDisabled(saveButton, true);
  showSubtaskEditMessage(messageElement, "保存中...", "success");

  try {
    await updateJiraIssueFields(currentJiraServerUrl, issue.key, fields);
    showSubtaskEditMessage(messageElement, "已保存。", "success");
  } catch (error) {
    showSubtaskEditMessage(messageElement, getErrorMessage(error), "error");
  } finally {
    setButtonDisabled(saveButton, false);
  }
}

function showSubtaskEditMessage(element: HTMLSpanElement, message: string, type: "error" | "success") {
  element.textContent = message;
  element.dataset.type = type;
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
    } else {
      updateProjectFieldAvailability();
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

initTemplateViews({
  createTemplateButton,
  templateTabPanels,
  templateTabs
});

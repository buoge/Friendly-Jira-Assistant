import { getJiraUserName, type JiraUser } from "./jiraUser";

export type JiraAssignee = {
  displayName: string;
  id: string;
  name: string;
};

export const jiraAssigneesStorageKey = "jiraAssignees";

let cachedAssignees: JiraAssignee[] | null = null;

function normalizeAssigneeName(name: string) {
  return name.trim().toLowerCase();
}

function createAssigneeId(name: string) {
  const normalized = normalizeAssigneeName(name).replace(/[^a-z0-9_-]+/g, "-");

  return normalized || `assignee-${Date.now()}`;
}

function sanitizeAssignees(value: unknown): JiraAssignee[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenNames = new Set<string>();
  const assignees: JiraAssignee[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Partial<JiraAssignee>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const displayName = typeof record.displayName === "string" ? record.displayName.trim() : name;
    const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : createAssigneeId(name);
    const normalizedName = normalizeAssigneeName(name);

    if (!name || seenNames.has(normalizedName)) {
      continue;
    }

    seenNames.add(normalizedName);
    assignees.push({ displayName: displayName || name, id, name });
  }

  return assignees;
}

async function persistAssignees(assignees: JiraAssignee[]) {
  cachedAssignees = assignees;
  await chrome.storage.sync.set({
    [jiraAssigneesStorageKey]: assignees
  });
}

export function getCachedAssignees() {
  return cachedAssignees ? [...cachedAssignees] : [];
}

export function resetAssigneeCache() {
  cachedAssignees = null;
}

export async function getJiraAssignees() {
  if (cachedAssignees) {
    return [...cachedAssignees];
  }

  const stored = await chrome.storage.sync.get(jiraAssigneesStorageKey);
  cachedAssignees = sanitizeAssignees(stored[jiraAssigneesStorageKey]);

  return [...cachedAssignees];
}

export async function saveJiraAssignees(assignees: JiraAssignee[]) {
  const sanitized = sanitizeAssignees(assignees);
  await persistAssignees(sanitized);

  return sanitized;
}

export async function addJiraAssignee(input: { displayName?: string; name: string }) {
  const name = input.name.trim();
  const displayName = input.displayName?.trim() || name;

  if (!name) {
    throw new Error("Jira 用户名不能为空。");
  }

  const assignees = await getJiraAssignees();
  const normalizedName = normalizeAssigneeName(name);

  if (assignees.some((assignee) => normalizeAssigneeName(assignee.name) === normalizedName)) {
    throw new Error("该经办人已存在。");
  }

  assignees.push({
    displayName,
    id: createAssigneeId(name),
    name
  });

  return saveJiraAssignees(assignees);
}

export async function updateJiraAssignee(
  assigneeId: string,
  input: { displayName?: string; name: string }
) {
  const name = input.name.trim();
  const displayName = input.displayName?.trim() || name;

  if (!name) {
    throw new Error("Jira 用户名不能为空。");
  }

  const assignees = await getJiraAssignees();
  const targetIndex = assignees.findIndex((assignee) => assignee.id === assigneeId);

  if (targetIndex < 0) {
    throw new Error("未找到要编辑的经办人。");
  }

  const normalizedName = normalizeAssigneeName(name);

  if (
    assignees.some(
      (assignee, index) => index !== targetIndex && normalizeAssigneeName(assignee.name) === normalizedName
    )
  ) {
    throw new Error("该 Jira 用户名已被其他经办人使用。");
  }

  assignees[targetIndex] = {
    ...assignees[targetIndex],
    displayName,
    name
  };

  return saveJiraAssignees(assignees);
}

export async function deleteJiraAssignee(assigneeId: string) {
  const assignees = await getJiraAssignees();
  const nextAssignees = assignees.filter((assignee) => assignee.id !== assigneeId);

  if (nextAssignees.length === assignees.length) {
    throw new Error("未找到要删除的经办人。");
  }

  return saveJiraAssignees(nextAssignees);
}

export async function ensureAssigneeFromUser(user: JiraUser) {
  const name = getJiraUserName(user).trim();
  const displayName = user.displayName?.trim() || name;

  if (!name) {
    return getJiraAssignees();
  }

  const assignees = await getJiraAssignees();
  const normalizedName = normalizeAssigneeName(name);

  if (assignees.some((assignee) => normalizeAssigneeName(assignee.name) === normalizedName)) {
    return assignees;
  }

  assignees.unshift({
    displayName,
    id: createAssigneeId(name),
    name
  });

  return saveJiraAssignees(assignees);
}

export function formatAssigneeLabel(assignee: JiraAssignee) {
  if (assignee.displayName && assignee.displayName !== assignee.name) {
    return `${assignee.displayName} (${assignee.name})`;
  }

  return assignee.name;
}

export function findAssigneeByName(name: string, assignees: JiraAssignee[]) {
  const normalizedName = normalizeAssigneeName(name);

  return assignees.find((assignee) => normalizeAssigneeName(assignee.name) === normalizedName) ?? null;
}

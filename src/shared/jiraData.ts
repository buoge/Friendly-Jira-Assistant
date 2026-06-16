import { getStoryPointsFieldCandidates, getStoryPointsFromFields } from "./jiraStoryPoints";

export type JiraProject = {
  id: string;
  key: string;
  name: string;
};

export type JiraBoard = {
  id: number | string;
  location?: {
    projectKey?: string;
  };
  name: string;
  projectKey?: string;
  type?: string;
};

export type JiraBoardIssue = {
  fields: JiraIssueFields & {
    issuetype?: {
      name?: string;
    };
    parent?: {
      id?: string;
      fields?: {
        summary?: string;
      };
      key?: string;
    };
    status?: {
      name?: string;
    };
    subtasks?: JiraBoardIssue[];
    summary?: string;
  };
  id: string;
  key: string;
  self?: string;
};

export type JiraIssueFields = Record<string, unknown> & {
  assignee?: {
    displayName?: string;
    name?: string;
  } | null;
  issuetype?: {
    id?: string;
    name?: string;
  };
  project?: {
    id?: string;
    key?: string;
  };
  summary?: string;
  timetracking?: {
    originalEstimate?: string;
    remainingEstimate?: string;
  };
};

export type JiraSprint = {
  completeDate?: string;
  endDate?: string;
  goal?: string;
  id: number;
  name: string;
  startDate?: string;
  state: "active" | "closed" | "future" | string;
};

export type JiraSprintIssueGroup = {
  issues: JiraBoardIssue[];
  sprint: JiraSprint;
};

export type JiraCreateFieldMetadata = {
  allowedValues?: Array<Record<string, unknown>>;
  name: string;
  required?: boolean;
  schema?: {
    custom?: string;
    customId?: number;
    items?: string;
    system?: string;
    type?: string;
  };
};

export type JiraSubtaskCreateMetadata = {
  fields: Record<string, JiraCreateFieldMetadata>;
  issueType: {
    id?: string;
    name: string;
  };
};

export type JiraCreatedIssue = {
  id: string;
  key: string;
  self: string;
};

export type JiraWebFormSubtaskFields = {
  categoryChildId: string;
  categoryParentId: string;
  originalEstimate?: string;
  parentIssueId: string;
  summary: string;
};

type JiraBoardResponse =
  | JiraBoard[]
  | {
      rapidViews?: JiraBoard[];
      values?: JiraBoard[];
      views?: JiraBoard[];
    };

export async function fetchJiraProjects(jiraServerUrl: string) {
  return jiraFetch<JiraProject[]>(jiraServerUrl, "/rest/api/2/project");
}

export async function fetchProjectBoards(jiraServerUrl: string, projectKey: string) {
  if (!projectKey) {
    return [];
  }

  try {
    const boards = await fetchGreenhopperProjectBoards(jiraServerUrl, projectKey);

    if (boards.length) {
      return boards;
    }
  } catch {
    // Jira Server project sidebars are backed by GreenHopper rapid views, but some versions expose only Agile APIs.
  }

  try {
    const boards = await fetchRapidViews(jiraServerUrl);

    if (boards.length) {
      return boards;
    }
  } catch {
    // GreenHopper is the legacy Jira Software board API used by older Jira Server instances.
  }

  try {
    const boards = await fetchAgileBoards(jiraServerUrl);

    if (boards.length) {
      return boards;
    }
  } catch {
    // Some Jira instances only allow project-scoped Agile board queries.
  }

  const boards = await fetchAgileBoards(jiraServerUrl, projectKey);

  return boards.length ? boards : [];
}

export async function fetchBoardSprintIssueGroups(
  jiraServerUrl: string,
  boardId: string,
  projectKey: string,
  boardName: string
) {
  const sprints = filterSprintsByBoardName(await fetchVisiblePlanningSprints(jiraServerUrl, boardId, projectKey), boardName);
  const groups: JiraSprintIssueGroup[] = [];

  for (const sprint of sprints) {
    const issues = await fetchSprintIssues(jiraServerUrl, sprint.id);
    groups.push({
      sprint,
      issues
    });
  }

  return groups;
}

export type JiraStoryContext = {
  storyKey: string;
  storyPoints: string;
  storySummary: string;
};

let cachedStoryPointsFieldId: string | null | undefined;

export async function resolveStoryPointsFieldId(jiraServerUrl: string) {
  if (cachedStoryPointsFieldId !== undefined) {
    return cachedStoryPointsFieldId;
  }

  try {
    const fields = await jiraFetch<Array<{ id: string; name: string }>>(jiraServerUrl, `/rest/api/2/field`);
    const matchedField = fields.find((field) => {
      const normalizedName = field.name.trim().toLowerCase();

      return (
        normalizedName === "story points" ||
        normalizedName === "story point" ||
        normalizedName === "故事点" ||
        normalizedName === "故事点数" ||
        normalizedName.includes("故事点")
      );
    });

    cachedStoryPointsFieldId = matchedField?.id ?? null;
  } catch {
    cachedStoryPointsFieldId = null;
  }

  return cachedStoryPointsFieldId;
}

export async function fetchIssueStoryContext(jiraServerUrl: string, issue: JiraBoardIssue) {
  const storySummary = issue.fields.summary?.trim() || "未命名用户故事";
  const storyPointsFieldId = await resolveStoryPointsFieldId(jiraServerUrl);
  let storyPoints = getStoryPointsFromFields(issue.fields as Record<string, unknown>, storyPointsFieldId);

  if (storyPoints === null) {
    const fieldsToFetch = ["summary", ...getStoryPointsFieldCandidates()];

    if (storyPointsFieldId) {
      fieldsToFetch.push(storyPointsFieldId);
    }

    try {
      const enrichedIssue = await jiraFetch<JiraBoardIssue>(
        jiraServerUrl,
        `/rest/api/2/issue/${encodeURIComponent(issue.key)}?fields=${fieldsToFetch.join(",")}`
      );
      storyPoints = getStoryPointsFromFields(enrichedIssue.fields as Record<string, unknown>, storyPointsFieldId);
    } catch {
      storyPoints = null;
    }
  }

  return {
    storyKey: issue.key,
    storyPoints: storyPoints ?? "—",
    storySummary
  };
}

export async function fetchIssueForSubtaskCreation(jiraServerUrl: string, issueKey: string) {
  return jiraFetch<JiraBoardIssue>(
    jiraServerUrl,
    `/rest/api/2/issue/${encodeURIComponent(issueKey)}?fields=*all`
  );
}

export async function fetchSubtaskCreateMetadata(jiraServerUrl: string, projectKey: string) {
  const metadata = await jiraFetch<{
    projects?: Array<{
      issuetypes?: Array<{
        fields?: Record<string, JiraCreateFieldMetadata>;
        id?: string;
        name?: string;
        subtask?: boolean;
      }>;
    }>;
  }>(
    jiraServerUrl,
    `/rest/api/2/issue/createmeta?projectKeys=${encodeURIComponent(
      projectKey
    )}&expand=projects.issuetypes.fields`
  );
  const issueTypes = metadata.projects?.flatMap((project) => project.issuetypes ?? []) ?? [];
  const subtaskIssueType =
    issueTypes.find((issueType) => issueType.subtask) ??
    issueTypes.find((issueType) => isSubtaskIssueTypeName(issueType.name ?? "")) ??
    null;

  if (!subtaskIssueType?.fields || !subtaskIssueType.name) {
    throw new Error("未能从 Jira 读取子任务创建字段，请确认当前项目允许创建子任务。");
  }

  return {
    fields: subtaskIssueType.fields,
    issueType: {
      id: subtaskIssueType.id,
      name: subtaskIssueType.name
    }
  };
}

export async function createJiraSubtask(
  jiraServerUrl: string,
  fields: JiraIssueFields
) {
  return jiraFetch<JiraCreatedIssue>(jiraServerUrl, "/rest/api/2/issue", {
    body: JSON.stringify({
      fields
    }),
    method: "POST"
  });
}

export async function createJiraSubtaskWithWebForm(jiraServerUrl: string, fields: JiraWebFormSubtaskFields) {
  const formResponse = await fetch(
    `${jiraServerUrl}/secure/CreateSubTaskIssue!default.jspa?parentIssueId=${encodeURIComponent(fields.parentIssueId)}`,
    {
      credentials: "include",
      headers: {
        Accept: "text/html"
      },
      referrerPolicy: "no-referrer"
    }
  );

  if (!formResponse.ok) {
    throw new Error(`Jira returned HTTP ${formResponse.status} while loading the subtask form.`);
  }

  const formHtml = await formResponse.text();
  const formDocument = new DOMParser().parseFromString(formHtml, "text/html");
  const formElement = formDocument.querySelector<HTMLFormElement>("#subtask-create-details");

  if (!formElement) {
    throw new Error("未能读取 Jira 原生创建子任务表单。");
  }

  const formData = new URLSearchParams();

  formDocument.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    "#subtask-create-details input[name], #subtask-create-details select[name], #subtask-create-details textarea[name]"
  ).forEach((element) => {
    if (element instanceof HTMLInputElement && ["file", "submit", "button"].includes(element.type)) {
      return;
    }

    if (element instanceof HTMLSelectElement) {
      const selectedOptions = [...element.selectedOptions];

      if (!selectedOptions.length) {
        formData.append(element.name, element.value);
        return;
      }

      selectedOptions.forEach((option) => {
        formData.append(element.name, option.value);
      });
      return;
    }

    formData.append(element.name, element.value);
  });

  formData.set("summary", fields.summary);
  formData.set("parentIssueId", fields.parentIssueId);
  formData.set("assignee", "-1");
  formData.set("customfield_14102", fields.categoryParentId);
  formData.set("customfield_14102:1", fields.categoryChildId);

  if (fields.originalEstimate) {
    formData.set("timetracking_originalestimate", fields.originalEstimate);
    formData.set("timetracking_remainingestimate", fields.originalEstimate);
  }

  const action = formElement.getAttribute("action") ?? "CreateSubTaskIssueDetails.jspa";
  const postUrl = new URL(action, formResponse.url || `${jiraServerUrl}/secure/`).href;
  const createResponse = await fetch(postUrl, {
    body: formData,
    credentials: "include",
    headers: {
      Accept: "text/html",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST",
    referrerPolicy: "no-referrer"
  });
  const responseHtml = await createResponse.text();

  if (!createResponse.ok) {
    throw new Error(`Jira returned HTTP ${createResponse.status} while submitting the subtask form.`);
  }

  if (responseHtml.includes("error") && responseHtml.includes("问题不存在")) {
    throw new Error("Jira 原生表单创建失败：问题不存在。");
  }

  const createdKey = createResponse.url.match(/browse\/([A-Z0-9]+-\d+)/)?.[1] ?? fields.summary;

  return {
    id: "",
    key: createdKey,
    self: createResponse.url
  };
}

export async function updateJiraIssueFields(jiraServerUrl: string, issueKey: string, fields: JiraIssueFields) {
  await jiraFetch<Record<string, never>>(jiraServerUrl, `/rest/api/2/issue/${encodeURIComponent(issueKey)}`, {
    body: JSON.stringify({
      fields
    }),
    method: "PUT"
  });
}

async function fetchVisiblePlanningSprints(jiraServerUrl: string, boardId: string, projectKey: string) {
  try {
    const planningSprints = await fetchPlanningSprints(jiraServerUrl, boardId, projectKey);

    if (planningSprints.length) {
      return planningSprints;
    }
  } catch {
    // The Jira planning page uses GreenHopper data, but older instances can reject this endpoint.
  }

  return fetchBoardSprints(jiraServerUrl, boardId, "active,future");
}

async function fetchPlanningSprints(jiraServerUrl: string, boardId: string, projectKey: string) {
  const planningResponse = await jiraFetch<{
    activeSprints?: JiraSprint[];
    futureSprints?: JiraSprint[];
    sprints?: JiraSprint[];
  }>(
    jiraServerUrl,
    `/rest/greenhopper/1.0/xboard/plan/backlog/data?rapidViewId=${encodeURIComponent(
      boardId
    )}&selectedProjectKey=${encodeURIComponent(projectKey)}`
  );
  const sprints = [
    ...(planningResponse.activeSprints ?? []),
    ...(planningResponse.futureSprints ?? []),
    ...(planningResponse.sprints ?? [])
  ];
  const seenSprintIds = new Set<number>();

  return sprints.filter((sprint) => {
    if ((sprint.state !== "active" && sprint.state !== "future") || seenSprintIds.has(sprint.id)) {
      return false;
    }

    seenSprintIds.add(sprint.id);
    return true;
  });
}

async function fetchBoardSprints(jiraServerUrl: string, boardId: string, state: string) {
  const sprints: JiraSprint[] = [];
  let startAt = 0;
  let hasMore = true;

  while (hasMore && startAt < 1000) {
    const sprintResponse = await jiraFetch<{
      isLast?: boolean;
      maxResults: number;
      startAt: number;
      total?: number;
      values?: JiraSprint[];
    }>(
      jiraServerUrl,
      `/rest/agile/1.0/board/${encodeURIComponent(boardId)}/sprint?maxResults=50&startAt=${startAt}&state=${state}`
    );

    sprints.push(...(sprintResponse.values ?? []));
    startAt = sprintResponse.startAt + sprintResponse.maxResults;
    hasMore = sprintResponse.isLast === false || (typeof sprintResponse.total === "number" && startAt < sprintResponse.total);
  }

  return sprints.filter((sprint) => sprint.state === "active" || sprint.state === "future");
}

function filterSprintsByBoardName(sprints: JiraSprint[], boardName: string) {
  const teamKeyword = getTeamKeywordFromBoardName(boardName);

  if (!teamKeyword) {
    return sprints;
  }

  return sprints.filter((sprint) => sprint.name.includes(teamKeyword));
}

function getTeamKeywordFromBoardName(boardName: string) {
  const teamMatch = boardName.match(/Team\d+\s*-\s*(.+?)小组/);

  return teamMatch?.[1]?.trim() ?? "";
}

async function fetchSprintIssues(jiraServerUrl: string, sprintId: number) {
  const issues: JiraBoardIssue[] = [];
  let startAt = 0;
  let hasMore = true;
  const storyPointsFieldId = await resolveStoryPointsFieldId(jiraServerUrl);
  const issueFields = buildStoryIssueFields(storyPointsFieldId);

  while (hasMore && startAt < 5000) {
    const issueResponse = await jiraFetch<{
      issues?: JiraBoardIssue[];
      maxResults: number;
      startAt: number;
      total: number;
    }>(
      jiraServerUrl,
      `/rest/agile/1.0/sprint/${encodeURIComponent(
        String(sprintId)
      )}/issue?maxResults=100&startAt=${startAt}&fields=${issueFields}`
    );

    issues.push(...(issueResponse.issues ?? []));
    startAt = issueResponse.startAt + issueResponse.maxResults;
    hasMore = startAt < issueResponse.total;
  }

  return issues.filter((issue) => isStoryOrTaskIssue(issue) || isSubtaskIssue(issue));
}

async function fetchGreenhopperProjectBoards(jiraServerUrl: string, projectKey: string) {
  const projectBoardApis = [
    `/rest/greenhopper/1.0/rapidviews/list?projectKey=${encodeURIComponent(projectKey)}`,
    `/rest/greenhopper/1.0/rapidview?projectKey=${encodeURIComponent(projectKey)}`
  ];

  for (const apiPath of projectBoardApis) {
    try {
      const boards = normalizeBoardResponse(await jiraFetch<JiraBoardResponse>(jiraServerUrl, apiPath));

      if (boards.length) {
        return boards;
      }
    } catch {
      // Different Jira Server versions expose different GreenHopper routes. Continue through fallbacks.
    }
  }

  return [];
}

async function fetchAgileBoards(jiraServerUrl: string, projectKey?: string) {
  const boards: JiraBoard[] = [];
  let startAt = 0;
  let hasMore = true;

  while (hasMore && startAt < 1000) {
    const boardResponse = await jiraFetch<{
      maxResults: number;
      startAt: number;
      total: number;
      values?: JiraBoard[];
    }>(
      jiraServerUrl,
      `/rest/agile/1.0/board?maxResults=100&orderBy=name&type=scrum,simple${
        projectKey ? `&projectKeyOrId=${encodeURIComponent(projectKey)}` : ""
      }&startAt=${startAt}`
    );

    boards.push(...(boardResponse.values ?? []));
    startAt = boardResponse.startAt + boardResponse.maxResults;
    hasMore = startAt < boardResponse.total;
  }

  return projectKey ? boards.filter((board) => isBoardForProject(board, projectKey)) : boards;
}

async function fetchRapidViews(jiraServerUrl: string) {
  return normalizeBoardResponse(await jiraFetch<JiraBoardResponse>(jiraServerUrl, "/rest/greenhopper/1.0/rapidview"));
}

function normalizeBoardResponse(response: JiraBoardResponse) {
  if (Array.isArray(response)) {
    return response;
  }

  return response.views ?? response.rapidViews ?? response.values ?? [];
}

function isBoardForProject(board: JiraBoard, projectKey: string) {
  const normalizedProjectKey = projectKey.toLowerCase();

  return (
    board.location?.projectKey?.toLowerCase() === normalizedProjectKey ||
    board.projectKey?.toLowerCase() === normalizedProjectKey ||
    board.name.toLowerCase().includes(normalizedProjectKey.toLowerCase())
  );
}

function isStoryOrTaskIssue(issue: JiraBoardIssue) {
  const issueType = issue.fields.issuetype?.name?.toLowerCase() ?? "";

  if (isSubtaskIssue(issue)) {
    return false;
  }

  return (
    issueType.includes("story") ||
    issueType === "task" ||
    issueType.includes("故事") ||
    issueType === "任务"
  );
}

function isSubtaskIssue(issue: JiraBoardIssue) {
  const issueType = issue.fields.issuetype?.name?.toLowerCase() ?? "";

  return isSubtaskIssueTypeName(issueType);
}

function isSubtaskIssueTypeName(issueTypeName: string) {
  const issueType = issueTypeName.toLowerCase();

  return issueType.includes("sub-task") || issueType.includes("subtask") || issueType.includes("子任务");
}

function buildStoryIssueFields(storyPointsFieldId: string | null) {
  const fields = new Set([
    "summary",
    "issuetype",
    "status",
    "parent",
    "subtasks",
    "assignee",
    "timetracking",
    "customfield_14102",
    ...getStoryPointsFieldCandidates()
  ]);

  if (storyPointsFieldId) {
    fields.add(storyPointsFieldId);
  }

  return [...fields].join(",");
}

async function jiraFetch<T>(jiraServerUrl: string, apiPath: string, init: RequestInit = {}) {
  const response = await fetch(`${jiraServerUrl}${apiPath}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers
    },
    referrerPolicy: "no-referrer"
  });

  if (!response.ok) {
    let detail = "";

    try {
      const errorBody = await response.json() as { errorMessages?: string[]; errors?: Record<string, string> };
      const fieldErrors = Object.values(errorBody.errors ?? {});
      detail = [...(errorBody.errorMessages ?? []), ...fieldErrors].filter(Boolean).join(" ");
    } catch {
      detail = "";
    }

    throw new Error(
      `Jira returned HTTP ${response.status} while requesting Jira.${detail ? ` ${detail}` : ""}`
    );
  }

  const responseText = await response.text();

  if (!responseText) {
    return undefined as T;
  }

  return JSON.parse(responseText) as T;
}

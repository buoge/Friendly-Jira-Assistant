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
  fields: {
    issuetype?: {
      name?: string;
    };
    parent?: {
      fields?: {
        summary?: string;
      };
      key?: string;
    };
    status?: {
      name?: string;
    };
    summary?: string;
  };
  id: string;
  key: string;
  self?: string;
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
      )}/issue?maxResults=100&startAt=${startAt}&fields=summary,issuetype,status,parent`
    );

    issues.push(...(issueResponse.issues ?? []));
    startAt = issueResponse.startAt + issueResponse.maxResults;
    hasMore = startAt < issueResponse.total;
  }

  return issues.filter(isStoryOrTaskIssue);
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

  if (issueType.includes("sub-task") || issueType.includes("subtask") || issueType.includes("子任务")) {
    return false;
  }

  return (
    issueType.includes("story") ||
    issueType === "task" ||
    issueType.includes("故事") ||
    issueType === "任务"
  );
}

async function jiraFetch<T>(jiraServerUrl: string, apiPath: string) {
  const response = await fetch(`${jiraServerUrl}${apiPath}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    referrerPolicy: "no-referrer"
  });

  if (!response.ok) {
    throw new Error(`Jira returned HTTP ${response.status} while loading data.`);
  }

  return (await response.json()) as T;
}

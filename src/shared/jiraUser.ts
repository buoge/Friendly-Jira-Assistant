export type JiraUser = {
  accountId?: string;
  displayName?: string;
  emailAddress?: string;
  key?: string;
  name?: string;
  avatarUrls?: Record<string, string>;
};

export async function requestJiraHostPermission(jiraServerUrl: string) {
  const originPattern = `${new URL(jiraServerUrl).origin}/*`;

  return chrome.permissions.request({
    origins: [originPattern]
  });
}

export async function hasJiraHostPermission(jiraServerUrl: string) {
  const originPattern = `${new URL(jiraServerUrl).origin}/*`;

  return chrome.permissions.contains({
    origins: [originPattern]
  });
}

export async function fetchCurrentJiraUser(jiraServerUrl: string) {
  const apiPaths = ["/rest/api/2/myself", "/rest/api/3/myself"];

  for (const apiPath of apiPaths) {
    const response = await fetch(`${jiraServerUrl}${apiPath}`, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      referrerPolicy: "no-referrer"
    });

    if (response.ok) {
      return (await response.json()) as JiraUser;
    }

    if (![404, 410].includes(response.status)) {
      throw new Error(`Jira returned HTTP ${response.status} while loading your profile.`);
    }
  }

  throw new Error("Could not find a supported Jira user profile endpoint.");
}

export function getBestAvatarUrl(user: JiraUser, jiraServerUrl: string) {
  const avatarUrls = user.avatarUrls ?? {};
  const avatarUrl =
    avatarUrls["24x24"] ?? avatarUrls["48x48"] ?? avatarUrls["32x32"] ?? avatarUrls["16x16"] ?? "";

  if (avatarUrl) {
    return getAbsoluteJiraUrl(avatarUrl, jiraServerUrl);
  }

  const userName = getJiraUserName(user);

  if (userName) {
    return getAbsoluteJiraUrl(`/secure/useravatar?ownerId=${encodeURIComponent(userName)}`, jiraServerUrl);
  }

  return "";
}

export function getJiraUserName(user: JiraUser) {
  return user.name ?? user.key ?? user.accountId ?? user.emailAddress ?? "";
}

function getAbsoluteJiraUrl(url: string, jiraServerUrl: string) {
  try {
    return new URL(url, jiraServerUrl).href;
  } catch {
    return "";
  }
}

export function getInitials(name: string) {
  const trimmedName = name.trim();

  if (!trimmedName) {
    return "?";
  }

  const words = trimmedName.split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

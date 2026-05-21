export type JiraUrlValidationResult =
  | {
      ok: true;
      value: string;
    }
  | {
      ok: false;
      error: string;
    };

export function validateJiraServerUrl(input: string): JiraUrlValidationResult {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return {
      ok: false,
      error: "Please enter your Jira Server Url."
    };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmedInput);
  } catch {
    return {
      ok: false,
      error: "Please enter a complete URL, for example https://your-team.atlassian.net."
    };
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return {
      ok: false,
      error: "Jira Server Url must start with http:// or https://."
    };
  }

  if (!parsedUrl.hostname) {
    return {
      ok: false,
      error: "The URL must include a valid host name."
    };
  }

  if (parsedUrl.username || parsedUrl.password) {
    return {
      ok: false,
      error: "Do not include username or password in the Jira Server Url."
    };
  }

  if (parsedUrl.search || parsedUrl.hash) {
    return {
      ok: false,
      error: "Use the Jira base URL only, without query strings or fragments."
    };
  }

  const normalizedPath = parsedUrl.pathname.replace(/\/+$/, "");
  const normalizedUrl = `${parsedUrl.origin}${normalizedPath === "/" ? "" : normalizedPath}`;

  return {
    ok: true,
    value: normalizedUrl
  };
}

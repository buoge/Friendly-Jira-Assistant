const STORY_POINTS_FIELD_CANDIDATES = [
  "customfield_10106",
  "customfield_10016",
  "customfield_10203",
  "customfield_10002"
];

const STORY_POINTS_FIELD_NAME_MATCHERS = [
  (name: string) => name === "story points",
  (name: string) => name === "story point",
  (name: string) => name === "故事点",
  (name: string) => name === "故事点数"
];

export type JiraFieldDefinition = {
  id: string;
  name: string;
  schema?: {
    custom?: string;
    type?: string;
  };
};

function looksLikeIssueKey(value: string) {
  return /^[A-Z][A-Z0-9_]+-\d+$/i.test(value.trim());
}

function normalizeStoryPointsNumber(value: number) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value * 10) / 10;

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatStoryPointsValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return normalizeStoryPointsNumber(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed || looksLikeIssueKey(trimmed)) {
      return null;
    }

    const numericValue = Number(trimmed.replace(/[^\d.-]/g, ""));

    if (!Number.isFinite(numericValue)) {
      return null;
    }

    return normalizeStoryPointsNumber(numericValue);
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;

    if ("value" in record) {
      return formatStoryPointsValue(record.value);
    }
  }

  return null;
}

export function isStoryPointsFieldDefinition(field: JiraFieldDefinition) {
  const normalizedName = field.name.trim().toLowerCase();
  const matchesName = STORY_POINTS_FIELD_NAME_MATCHERS.some((matcher) => matcher(normalizedName));

  if (!matchesName) {
    return false;
  }

  const schemaType = field.schema?.type ?? "";
  const schemaCustom = (field.schema?.custom ?? "").toLowerCase();

  if (schemaType === "number") {
    return true;
  }

  if (schemaCustom.includes("float") || schemaCustom.includes("storypoint")) {
    return true;
  }

  if (
    schemaType === "issuelink" ||
    schemaCustom.includes("issuelink") ||
    schemaCustom.includes("epic") ||
    schemaCustom.includes("version")
  ) {
    return false;
  }

  return matchesName;
}

export function resolveStoryPointsFieldFromDefinitions(fields: JiraFieldDefinition[]) {
  return fields.find(isStoryPointsFieldDefinition)?.id ?? null;
}

export function getStoryPointsFromFields(fields: Record<string, unknown>, fieldId?: string | null) {
  if (fieldId) {
    return formatStoryPointsValue(fields[fieldId]);
  }

  for (const key of STORY_POINTS_FIELD_CANDIDATES) {
    const matchedValue = formatStoryPointsValue(fields[key]);

    if (matchedValue !== null) {
      return matchedValue;
    }
  }

  return null;
}

export function getStoryPointsFieldCandidates() {
  return STORY_POINTS_FIELD_CANDIDATES;
}

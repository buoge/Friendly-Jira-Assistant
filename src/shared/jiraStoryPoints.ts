const STORY_POINTS_FIELD_CANDIDATES = [
  "customfield_10106",
  "customfield_10016",
  "customfield_10203",
  "customfield_10002"
];

export function formatStoryPointsValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;

    if ("value" in record) {
      return formatStoryPointsValue(record.value);
    }

    if ("name" in record) {
      return formatStoryPointsValue(record.name);
    }
  }

  return null;
}

export function getStoryPointsFromFields(fields: Record<string, unknown>, fieldId?: string | null) {
  if (fieldId) {
    const matchedValue = formatStoryPointsValue(fields[fieldId]);

    if (matchedValue !== null) {
      return matchedValue;
    }
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

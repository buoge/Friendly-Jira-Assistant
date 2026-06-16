export type SubtaskCategory = {
  primary: string;
  primaryId: string;
  secondary: string;
  secondaryId: string;
};

export type SubtaskTemplateItem = {
  estimateHours?: number;
  summary: string;
};

export type SubtaskTemplate = {
  description: string;
  id: string;
  items: SubtaskTemplateItem[];
  name: string;
};

export const subtaskTemplatesStorageKey = "subtaskTemplates";
export const protectedTemplateIds = new Set(["general"]);

export function isTemplateDeletable(template: SubtaskTemplate | string) {
  const templateId = typeof template === "string" ? template : template.id;
  return !protectedTemplateIds.has(templateId);
}

const defaultTemplates: SubtaskTemplate[] = [
  {
    id: "web-new-component",
    name: "Web 新增组件",
    description:
      "适用于在 Web 端新增表单/面板类组件的需求，覆盖前端组件开发、后端接口与标准质量流程。",
    items: [
      { summary: "前端-编辑面板新增 form 组件" },
      { summary: "前端-新组件基础布局和样式开发" },
      { summary: "前端-新组件数据存储结构逻辑实现" },
      { summary: "前端-新组件选中样式和多选复制/删除兼容适配" },
      { summary: "前端-新组件位置拖动适配" },
      { summary: "前端-代码优化" },
      { summary: "后端-技术方案设计" },
      { summary: "后端-api 接口设计" },
      { summary: "后端-api 接口开发" },
      { summary: "开发自测" },
      { summary: "code review" },
      { summary: "mini show" },
      { summary: "测试-用例设计编写" },
      { summary: "测试-用例执行" }
    ]
  },
  {
    id: "general",
    name: "通用模板",
    description: "适用于常规功能开发，包含前后端主流程与固定质量子任务。",
    items: [
      { summary: "前端-功能开发" },
      { summary: "后端-功能开发" },
      { summary: "开发自测" },
      { summary: "code review" },
      { summary: "mini show" },
      { summary: "测试用例编写" },
      { summary: "测试用例执行" }
    ]
  },
  {
    id: "spec-mode",
    name: "Spec 模式模板",
    description: "适用于先写 Spec/方案再落地的需求，强调方案、接口与验收拆分。",
    items: [
      { summary: "前端-需求与交互梳理" },
      { summary: "前端-Spec 对齐与实现" },
      { summary: "前端-联调与边界场景适配" },
      { summary: "后端-技术方案与数据模型设计" },
      { summary: "后端-api 接口设计" },
      { summary: "后端-api 接口开发" },
      { summary: "开发自测" },
      { summary: "code review" },
      { summary: "mini show" },
      { summary: "测试-用例设计编写" },
      { summary: "测试-用例执行" }
    ]
  }
];

export function resolveSubtaskCategory(summary: string): SubtaskCategory | null {
  const trimmedSummary = summary.trim();

  if (!trimmedSummary) {
    return null;
  }

  if (trimmedSummary.startsWith("前端")) {
    return {
      primary: "开发工作",
      primaryId: "41359",
      secondary: "编码开发-前端",
      secondaryId: "41364"
    };
  }

  if (trimmedSummary.startsWith("后端")) {
    return {
      primary: "开发工作",
      primaryId: "41359",
      secondary: "编码开发-后端",
      secondaryId: "41365"
    };
  }

  const normalizedSummary = trimmedSummary.toLowerCase();

  if (normalizedSummary === "开发自测") {
    return {
      primary: "开发工作",
      primaryId: "41359",
      secondary: "开发自测",
      secondaryId: "41366"
    };
  }

  if (normalizedSummary === "mini show") {
    return {
      primary: "开发工作",
      primaryId: "41359",
      secondary: "MiniShow",
      secondaryId: "41367"
    };
  }

  if (normalizedSummary === "code review") {
    return {
      primary: "开发工作",
      primaryId: "41359",
      secondary: "代码公审",
      secondaryId: "41368"
    };
  }

  if (
    normalizedSummary === "测试用例编写" ||
    normalizedSummary.includes("用例设计编写") ||
    normalizedSummary.includes("用例编写")
  ) {
    return {
      primary: "测试工作",
      primaryId: "41372",
      secondary: "用例编写",
      secondaryId: "41377"
    };
  }

  if (normalizedSummary === "测试用例执行" || normalizedSummary.includes("用例执行")) {
    return {
      primary: "测试工作",
      primaryId: "41372",
      secondary: "功能测试",
      secondaryId: "41380"
    };
  }

  return null;
}

const HOURS_PER_WORK_DAY = 8;

export { HOURS_PER_WORK_DAY };

export function formatHoursAsWorkDays(totalHours: number) {
  if (totalHours <= 0) {
    return "0";
  }

  const days = totalHours / HOURS_PER_WORK_DAY;
  const rounded = Math.round(days * 10) / 10;

  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function parseEstimateToHours(value: string) {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    return undefined;
  }

  const matched = trimmed.match(/^(\d+(?:\.\d+)?)([wdhm])?$/);

  if (!matched) {
    return undefined;
  }

  const amount = Number(matched[1]);
  const unit = matched[2] ?? "h";

  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }

  switch (unit) {
    case "w":
      return amount * 5 * HOURS_PER_WORK_DAY;
    case "d":
      return amount * HOURS_PER_WORK_DAY;
    case "h":
      return amount;
    case "m":
      return amount / 60;
    default:
      return undefined;
  }
}

export function splitTemplateItemLine(line: string) {
  const delimiterMatch = line.match(/[，,]/);

  if (!delimiterMatch || delimiterMatch.index === undefined) {
    return {
      estimatePart: "",
      summary: line.trim()
    };
  }

  const summary = line.slice(0, delimiterMatch.index).trim();
  const estimatePart = line.slice(delimiterMatch.index + delimiterMatch[0].length).trim();

  return {
    estimatePart,
    summary
  };
}

export function parseTemplateItemLine(line: string) {
  const { estimatePart, summary } = splitTemplateItemLine(line);
  const estimateHours = estimatePart ? parseEstimateToHours(estimatePart) : undefined;

  return {
    estimateHours,
    summary
  };
}

export function getTemplateItemDisplay(item: SubtaskTemplateItem) {
  const { estimatePart, summary: splitSummary } = splitTemplateItemLine(item.summary);
  const parsedEstimateHours = estimatePart ? parseEstimateToHours(estimatePart) : undefined;
  const hasEmbeddedEstimate = Boolean(estimatePart);
  const summary = hasEmbeddedEstimate ? splitSummary : item.summary;
  const estimateHours = item.estimateHours ?? parsedEstimateHours ?? 0;

  return {
    estimateHours,
    summary
  };
}

export function formatTemplateItemLine(item: SubtaskTemplateItem) {
  const display = getTemplateItemDisplay(item);

  if (display.estimateHours > 0) {
    return `${display.summary}，${display.estimateHours}h`;
  }

  return display.summary;
}

export function parseTemplateItemLines(lines: string[]) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parsed = parseTemplateItemLine(line);

      return {
        summary: parsed.summary,
        ...(parsed.estimateHours !== undefined ? { estimateHours: parsed.estimateHours } : {})
      };
    });
}

export function formatTemplateItemPreview(item: SubtaskTemplateItem) {
  const display = getTemplateItemDisplay(item);
  const category = resolveSubtaskCategory(display.summary);
  const estimateSuffix = display.estimateHours > 0 ? `，初始预估 ${display.estimateHours}h` : "";

  if (!category) {
    return `${display.summary}${estimateSuffix}`;
  }

  return `${display.summary}：${category.primary} / ${category.secondary}${estimateSuffix}`;
}

function isStoredTemplate(value: unknown): value is SubtaskTemplate {
  if (!value || typeof value !== "object") {
    return false;
  }

  const template = value as Record<string, unknown>;

  return (
    typeof template.id === "string" &&
    typeof template.name === "string" &&
    typeof template.description === "string" &&
    Array.isArray(template.items) &&
    template.items.every((item) => {
      const record = item as Record<string, unknown>;
      const estimateHours = record.estimateHours;

      return (
        typeof record.summary === "string" &&
        (estimateHours === undefined || (typeof estimateHours === "number" && estimateHours > 0))
      );
    })
  );
}

export async function getSubtaskTemplates() {
  const stored = await chrome.storage.sync.get(subtaskTemplatesStorageKey);
  const templates = stored[subtaskTemplatesStorageKey];

  if (!Array.isArray(templates) || !templates.length) {
    await chrome.storage.sync.set({
      [subtaskTemplatesStorageKey]: defaultTemplates
    });
    return defaultTemplates;
  }

  const validTemplates = templates.filter(isStoredTemplate);

  if (!validTemplates.length) {
    await chrome.storage.sync.set({
      [subtaskTemplatesStorageKey]: defaultTemplates
    });
    return defaultTemplates;
  }

  return validTemplates;
}

export async function saveSubtaskTemplates(templates: SubtaskTemplate[]) {
  await chrome.storage.sync.set({
    [subtaskTemplatesStorageKey]: templates
  });
}

export function createTemplateId(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fff-]/g, "");

  return `custom-${slug || "template"}-${Date.now()}`;
}

export async function addSubtaskTemplate(template: SubtaskTemplate) {
  const templates = await getSubtaskTemplates();
  const nextTemplates = [...templates, template];

  await saveSubtaskTemplates(nextTemplates);
  return template;
}

export async function updateSubtaskTemplate(
  templateId: string,
  updates: Pick<SubtaskTemplate, "description" | "items" | "name">
) {
  const templates = await getSubtaskTemplates();
  const templateIndex = templates.findIndex((template) => template.id === templateId);

  if (templateIndex === -1) {
    return null;
  }

  templates[templateIndex] = {
    ...templates[templateIndex],
    ...updates
  };

  await saveSubtaskTemplates(templates);
  return templates[templateIndex];
}

export async function deleteSubtaskTemplate(templateId: string) {
  if (!isTemplateDeletable(templateId)) {
    return false;
  }

  const templates = await getSubtaskTemplates();
  const nextTemplates = templates.filter((template) => template.id !== templateId);

  if (nextTemplates.length === templates.length) {
    return false;
  }

  await saveSubtaskTemplates(nextTemplates);
  return true;
}

export async function getSubtaskTemplateById(templateId: string) {
  const templates = await getSubtaskTemplates();
  return templates.find((template) => template.id === templateId) ?? null;
}

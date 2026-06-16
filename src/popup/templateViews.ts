import { showConfirmDialog, showFormDialog } from "./appDialog";
import {
  addSubtaskTemplate,
  createTemplateId,
  deleteSubtaskTemplate,
  formatTemplateItemLine,
  formatTemplateItemPreview,
  getSubtaskTemplates,
  isTemplateDeletable,
  parseTemplateItemLines,
  saveSubtaskTemplates,
  updateSubtaskTemplate,
  type SubtaskTemplate
} from "../shared/subtaskTemplates";

type TemplateViewController = {
  createTemplateButton: HTMLButtonElement | null;
  templateTabPanels: HTMLElement | null;
  templateTabs: HTMLElement | null;
};

const starterTemplateItems = [
  { summary: "前端-功能开发" },
  { summary: "后端-功能开发" },
  { summary: "开发自测" },
  { summary: "code review" },
  { summary: "mini show" },
  { summary: "测试-用例编写" },
  { summary: "测试-用例执行" }
];

let controller: TemplateViewController | null = null;
let currentTemplateId = "";
let draggedTemplateTabId: string | null = null;
let suppressTemplateTabClick = false;

export function initTemplateViews(options: TemplateViewController) {
  controller = options;

  options.createTemplateButton?.addEventListener("click", () => {
    void createTemplate();
  });

  setupTemplateTabDragAndDrop(options.templateTabs);
}

export async function renderTemplateManager(activeTemplateId = currentTemplateId) {
  if (!controller?.templateTabs || !controller.templateTabPanels) {
    return;
  }

  const templates = await getSubtaskTemplates();
  const nextActiveId =
    activeTemplateId && templates.some((template) => template.id === activeTemplateId)
      ? activeTemplateId
      : (templates[0]?.id ?? "");

  currentTemplateId = nextActiveId;
  renderTemplateTabs(templates, controller.templateTabs, nextActiveId);
  renderTemplateTabPanels(templates, controller.templateTabPanels, nextActiveId);
}

async function createTemplate() {
  const result = await showFormDialog({
    title: "新增拆分模板",
    fields: [
      {
        id: "name",
        label: "模板名称",
        placeholder: "请输入模板名称"
      },
      {
        id: "description",
        label: "模板描述",
        placeholder: "可选",
        optional: true,
        multiline: true
      }
    ]
  });

  if (!result?.name) {
    return;
  }

  const newTemplate: SubtaskTemplate = {
    id: createTemplateId(result.name),
    name: result.name,
    description: result.description || "自定义任务拆分模板。",
    items: starterTemplateItems.map((item) => ({ ...item }))
  };

  await addSubtaskTemplate(newTemplate);
  await renderTemplateManager(newTemplate.id);
}

function renderTemplateTabs(templates: SubtaskTemplate[], templateTabs: HTMLElement, activeTemplateId: string) {
  templateTabs.replaceChildren();

  if (!templates.length) {
    const emptyElement = document.createElement("p");
    emptyElement.className = "template-tabs__empty";
    emptyElement.textContent = "暂无模板，请点击「新增拆分模板」。";
    templateTabs.append(emptyElement);
    return;
  }

  templates.forEach((template) => {
    const tabButton = document.createElement("button");
    tabButton.type = "button";
    tabButton.className = "template-tab";
    tabButton.classList.toggle("template-tab--active", template.id === activeTemplateId);
    tabButton.textContent = template.name;
    tabButton.draggable = true;
    tabButton.setAttribute("role", "tab");
    tabButton.setAttribute("aria-selected", String(template.id === activeTemplateId));
    tabButton.dataset.templateId = template.id;

    tabButton.addEventListener("click", () => {
      if (suppressTemplateTabClick) {
        suppressTemplateTabClick = false;
        return;
      }

      void switchTemplateTab(template.id);
    });

    tabButton.addEventListener("dragstart", (event) => {
      draggedTemplateTabId = template.id;
      tabButton.classList.add("template-tab--dragging");

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", template.id);
      }
    });

    tabButton.addEventListener("dragend", () => {
      draggedTemplateTabId = null;
      tabButton.classList.remove("template-tab--dragging");
      clearTemplateTabDropIndicator(templateTabs);
    });

    templateTabs.append(tabButton);
  });
}

function setupTemplateTabDragAndDrop(templateTabs: HTMLElement | null) {
  if (!templateTabs || templateTabs.dataset.dragReady === "true") {
    return;
  }

  templateTabs.dataset.dragReady = "true";

  templateTabs.addEventListener("dragover", (event) => {
    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    updateTemplateTabInsertIndicator(templateTabs, event.clientX);
  });

  templateTabs.addEventListener("dragleave", (event) => {
    const relatedTarget = event.relatedTarget as Node | null;

    if (!relatedTarget || !templateTabs.contains(relatedTarget)) {
      clearTemplateTabDropIndicator(templateTabs);
    }
  });

  templateTabs.addEventListener("drop", (event) => {
    event.preventDefault();
    suppressTemplateTabClick = true;

    const draggedId = draggedTemplateTabId ?? event.dataTransfer?.getData("text/plain") ?? "";
    const draggedTab = draggedId
      ? templateTabs.querySelector<HTMLButtonElement>(`[data-template-id="${draggedId}"]`)
      : null;

    clearTemplateTabDropIndicator(templateTabs);

    if (!draggedTab) {
      return;
    }

    insertDraggedTemplateTab(templateTabs, draggedTab, event.clientX);
    void persistTemplateOrder();
  });
}

const templateTabInsertIndicatorClass = "template-tab-insert-indicator";

function getOrCreateTemplateTabInsertIndicator(templateTabs: HTMLElement) {
  let indicator = templateTabs.querySelector<HTMLElement>(`.${templateTabInsertIndicatorClass}`);

  if (!indicator) {
    indicator = document.createElement("span");
    indicator.className = templateTabInsertIndicatorClass;
    indicator.setAttribute("aria-hidden", "true");
  }

  return indicator;
}

function getTemplateTabsExcludingDragged(templateTabs: HTMLElement) {
  return [...templateTabs.querySelectorAll<HTMLButtonElement>(".template-tab")].filter(
    (tabButton) => tabButton.dataset.templateId !== draggedTemplateTabId
  );
}

function updateTemplateTabInsertIndicator(templateTabs: HTMLElement, clientX: number) {
  if (!draggedTemplateTabId) {
    clearTemplateTabDropIndicator(templateTabs);
    return;
  }

  const tabs = getTemplateTabsExcludingDragged(templateTabs);

  if (!tabs.length) {
    clearTemplateTabDropIndicator(templateTabs);
    return;
  }

  const indicator = getOrCreateTemplateTabInsertIndicator(templateTabs);

  for (const tabButton of tabs) {
    const tabRect = tabButton.getBoundingClientRect();
    const midpoint = tabRect.left + tabRect.width / 2;

    if (clientX < midpoint) {
      templateTabs.insertBefore(indicator, tabButton);
      return;
    }
  }

  tabs[tabs.length - 1].after(indicator);
}

function insertDraggedTemplateTab(
  templateTabs: HTMLElement,
  draggedTab: HTMLButtonElement,
  clientX: number
) {
  const tabs = [...templateTabs.querySelectorAll<HTMLButtonElement>(".template-tab")].filter(
    (tabButton) => tabButton !== draggedTab
  );

  for (const tabButton of tabs) {
    const tabRect = tabButton.getBoundingClientRect();
    const midpoint = tabRect.left + tabRect.width / 2;

    if (clientX < midpoint) {
      tabButton.before(draggedTab);
      return;
    }
  }

  const lastTab = tabs[tabs.length - 1];

  if (lastTab) {
    lastTab.after(draggedTab);
    return;
  }

  templateTabs.append(draggedTab);
}

function clearTemplateTabDropIndicator(templateTabs: HTMLElement) {
  templateTabs.querySelector<HTMLElement>(`.${templateTabInsertIndicatorClass}`)?.remove();
}

async function persistTemplateOrder() {
  const templateTabs = controller?.templateTabs;
  const templateTabPanels = controller?.templateTabPanels;

  if (!templateTabs || !templateTabPanels) {
    return;
  }

  const orderedIds = [...templateTabs.querySelectorAll<HTMLButtonElement>(".template-tab")].map(
    (tabButton) => tabButton.dataset.templateId ?? ""
  ).filter(Boolean);

  if (!orderedIds.length) {
    return;
  }

  const templates = await getSubtaskTemplates();
  const templateMap = new Map(templates.map((template) => [template.id, template]));
  const orderedTemplates = orderedIds
    .map((templateId) => templateMap.get(templateId))
    .filter((template): template is SubtaskTemplate => Boolean(template));

  if (orderedTemplates.length !== templates.length) {
    return;
  }

  await saveSubtaskTemplates(orderedTemplates);

  orderedIds.forEach((templateId) => {
    const panelElement = templateTabPanels.querySelector<HTMLElement>(`[data-template-id="${templateId}"]`);

    if (panelElement) {
      templateTabPanels.append(panelElement);
    }
  });
}

function renderTemplateTabPanels(
  templates: SubtaskTemplate[],
  templateTabPanels: HTMLElement,
  activeTemplateId: string
) {
  templateTabPanels.replaceChildren();

  if (!templates.length) {
    return;
  }

  templates.forEach((template) => {
    const panelElement = document.createElement("article");
    panelElement.className = "template-detail";
    panelElement.classList.toggle("template-detail--active", template.id === activeTemplateId);
    panelElement.dataset.templateId = template.id;
    panelElement.setAttribute("role", "tabpanel");
    panelElement.hidden = template.id !== activeTemplateId;
    mountTemplateDetailPanel(panelElement, template);
    templateTabPanels.append(panelElement);
  });
}

async function switchTemplateTab(templateId: string) {
  currentTemplateId = templateId;

  controller?.templateTabs
    ?.querySelectorAll<HTMLButtonElement>(".template-tab")
    .forEach((tabButton) => {
      const isActive = tabButton.dataset.templateId === templateId;
      tabButton.classList.toggle("template-tab--active", isActive);
      tabButton.setAttribute("aria-selected", String(isActive));
    });

  controller?.templateTabPanels
    ?.querySelectorAll<HTMLElement>(".template-detail")
    .forEach((panelElement) => {
      const isActive = panelElement.dataset.templateId === templateId;
      panelElement.classList.toggle("template-detail--active", isActive);
      panelElement.hidden = !isActive;

      if (!isActive) {
        setTemplatePanelEditMode(panelElement, false);
      }
    });
}

function mountTemplateDetailPanel(panelElement: HTMLElement, template: SubtaskTemplate) {
  panelElement.replaceChildren();
  panelElement.dataset.editing = "false";

  panelElement.dataset.templateItems = JSON.stringify(template.items.map((item) => formatTemplateItemLine(item)));

  const headerElement = document.createElement("header");
  headerElement.className = "template-detail__header";

  const titleRowElement = document.createElement("div");
  titleRowElement.className = "template-detail__title-row";

  const titleElement = document.createElement("h3");
  titleElement.className = "template-detail__title";
  titleElement.textContent = template.name;

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "button-secondary template-detail__edit";
  editButton.textContent = "编辑";

  const actionsElement = document.createElement("div");
  actionsElement.className = "template-detail__actions";
  actionsElement.append(editButton);

  if (isTemplateDeletable(template)) {
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "button-danger template-detail__delete";
    deleteButton.textContent = "删除";

    deleteButton.addEventListener("click", () => {
      void deleteTemplate(template.id, template.name);
    });

    actionsElement.append(deleteButton);
  }

  titleRowElement.append(titleElement, actionsElement);

  const descriptionElement = document.createElement("p");
  descriptionElement.className = "template-detail__description template-detail__view";
  descriptionElement.textContent = template.description;

  const metaElement = document.createElement("p");
  metaElement.className = "template-detail__meta template-detail__view";
  metaElement.textContent = `共 ${template.items.length} 个子任务样例`;

  const nameField = document.createElement("label");
  nameField.className = "field template-detail__field";
  const nameLabel = document.createElement("span");
  nameLabel.textContent = "模板名称";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = template.name;
  nameField.append(nameLabel, nameInput);

  const descriptionField = document.createElement("label");
  descriptionField.className = "field template-detail__field";
  const descriptionLabel = document.createElement("span");
  descriptionLabel.textContent = "模板描述";
  const descriptionInput = document.createElement("textarea");
  descriptionInput.rows = 3;
  descriptionInput.value = template.description;
  descriptionField.append(descriptionLabel, descriptionInput);

  const itemsField = document.createElement("label");
  itemsField.className = "field template-detail__field field--items";
  const itemsLabel = document.createElement("span");
  itemsLabel.textContent = "子任务样例（每行一个）";
  const itemsInput = document.createElement("textarea");
  itemsInput.rows = 12;
  itemsInput.value = template.items.map((item) => formatTemplateItemLine(item)).join("\n");
  itemsInput.placeholder = "例如：前端-功能开发，8h 或 前端-功能开发，1d";
  itemsField.append(itemsLabel, itemsInput);

  const descriptionHelp = document.createElement("p");
  descriptionHelp.className = "field-help";
  descriptionHelp.textContent = "简要说明该模板适用的任务场景。";
  descriptionField.append(descriptionHelp);

  const itemsHelp = document.createElement("p");
  itemsHelp.className = "field-help";
  itemsHelp.textContent = "每行一个子任务名称，支持前端-/后端- 前缀自动匹配分类。";
  itemsField.append(itemsHelp);

  headerElement.append(titleRowElement, descriptionElement, metaElement);

  const editFormElement = document.createElement("section");
  editFormElement.className = "template-edit-form template-detail__edit-surface";

  const editFormHeading = document.createElement("div");
  editFormHeading.className = "template-edit-form__heading";

  const editFormTitle = document.createElement("h3");
  editFormTitle.textContent = "编辑模板";

  const editFormHint = document.createElement("p");
  editFormHint.textContent = "修改模板信息后点击 Update 保存，或点击取消放弃更改。";

  editFormHeading.append(editFormTitle, editFormHint);

  const messageElement = document.createElement("p");
  messageElement.className = "template-detail__message";
  messageElement.setAttribute("role", "status");

  const footerElement = document.createElement("footer");
  footerElement.className = "template-detail__footer";

  const updateButton = document.createElement("button");
  updateButton.type = "button";
  updateButton.className = "button-primary";
  updateButton.textContent = "Update";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "button-secondary template-detail__cancel";
  cancelButton.textContent = "取消";

  footerElement.append(updateButton, cancelButton);
  editFormElement.append(editFormHeading, nameField, descriptionField, itemsField, messageElement, footerElement);

  const previewSection = document.createElement("section");
  previewSection.className = "template-detail__preview template-detail__view";

  const previewTitle = document.createElement("h4");
  previewTitle.textContent = "子任务拆分样例";

  const previewList = document.createElement("ul");
  previewList.className = "batch-create__preview template-detail__preview-list";
  previewList.replaceChildren(...template.items.map((item) => createPreviewListItem(item)));

  previewSection.append(previewTitle, previewList);

  editButton.addEventListener("click", () => {
    nameInput.value = titleElement.textContent ?? "";
    descriptionInput.value = descriptionElement.textContent ?? "";
    itemsInput.value = getPanelItemSummaries(panelElement).join("\n");
    setTemplatePanelEditMode(panelElement, true);
  });

  cancelButton.addEventListener("click", () => {
    setTemplatePanelEditMode(panelElement, false);
  });

  updateButton.addEventListener("click", () => {
    void saveTemplatePanel(panelElement, template.id, {
      descriptionElement,
      descriptionInput,
      footerElement,
      itemsInput,
      messageElement,
      metaElement,
      nameInput,
      previewList,
      titleElement,
      updateButton
    });
  });

  panelElement.append(headerElement, previewSection, editFormElement);
  setTemplatePanelEditMode(panelElement, false);
}

function getPanelItemSummaries(panelElement: HTMLElement) {
  try {
    const summaries = JSON.parse(panelElement.dataset.templateItems ?? "[]") as string[];
    return Array.isArray(summaries) ? summaries : [];
  } catch {
    return [];
  }
}

function createPreviewListItem(item: { summary: string }) {
  const itemElement = document.createElement("li");
  itemElement.dataset.type = "ready";
  itemElement.textContent = formatTemplateItemPreview(item);
  return itemElement;
}

async function deleteTemplate(templateId: string, templateName: string) {
  if (!isTemplateDeletable(templateId)) {
    return;
  }

  const confirmed = await showConfirmDialog({
    title: "删除模板",
    message: `确定删除模板「${templateName}」吗？\n\n删除后无法恢复。`,
    confirmLabel: "删除",
    danger: true
  });

  if (!confirmed) {
    return;
  }

  const deleted = await deleteSubtaskTemplate(templateId);

  if (!deleted) {
    return;
  }

  const templates = await getSubtaskTemplates();
  const nextActiveId =
    templates.find((template) => template.id !== templateId)?.id ?? templates[0]?.id ?? "";

  await renderTemplateManager(nextActiveId);
}

function setTemplatePanelEditMode(panelElement: HTMLElement, isEditing: boolean) {
  panelElement.dataset.editing = String(isEditing);
  panelElement.classList.toggle("template-detail--editing", isEditing);

  const messageElement = panelElement.querySelector<HTMLElement>(".template-detail__message");

  if (messageElement) {
    messageElement.textContent = "";
    delete messageElement.dataset.type;
  }
}

async function saveTemplatePanel(
  panelElement: HTMLElement,
  templateId: string,
  elements: {
    descriptionElement: HTMLParagraphElement;
    descriptionInput: HTMLTextAreaElement;
    footerElement: HTMLElement;
    itemsInput: HTMLTextAreaElement;
    messageElement: HTMLParagraphElement;
    metaElement: HTMLParagraphElement;
    nameInput: HTMLInputElement;
    previewList: HTMLUListElement;
    titleElement: HTMLHeadingElement;
    updateButton: HTMLButtonElement;
  }
) {
  const name = elements.nameInput.value.trim();
  const description = elements.descriptionInput.value.trim();
  const items = parseTemplateItemLines(elements.itemsInput.value.split(/\r?\n/));

  if (!name) {
    showTemplateMessage(elements.messageElement, "模板名称不能为空。", "error");
    elements.nameInput.focus();
    return;
  }

  if (!items.length) {
    showTemplateMessage(elements.messageElement, "请至少保留一个子任务样例。", "error");
    elements.itemsInput.focus();
    return;
  }

  elements.updateButton.disabled = true;
  showTemplateMessage(elements.messageElement, "正在更新模板...", "success");

  try {
    const updatedTemplate = await updateSubtaskTemplate(templateId, {
      name,
      description: description || "自定义任务拆分模板。",
      items
    });

    if (!updatedTemplate) {
      showTemplateMessage(elements.messageElement, "未找到要更新的模板。", "error");
      return;
    }

    elements.titleElement.textContent = updatedTemplate.name;
    elements.descriptionElement.textContent = updatedTemplate.description;
    elements.metaElement.textContent = `共 ${updatedTemplate.items.length} 个子任务样例`;
    elements.previewList.replaceChildren(...updatedTemplate.items.map((item) => createPreviewListItem(item)));
    panelElement.dataset.templateItems = JSON.stringify(updatedTemplate.items.map((item) => formatTemplateItemLine(item)));

    setTemplatePanelEditMode(panelElement, false);
    showTemplateMessage(elements.messageElement, "模板已更新。", "success");

    const tabButton = controller?.templateTabs?.querySelector<HTMLButtonElement>(
      `[data-template-id="${templateId}"]`
    );

    if (tabButton) {
      tabButton.textContent = updatedTemplate.name;
    }
  } catch (error) {
    showTemplateMessage(elements.messageElement, getErrorMessage(error), "error");
  } finally {
    elements.updateButton.disabled = false;
  }
}

function showTemplateMessage(element: HTMLParagraphElement, message: string, type: "error" | "success") {
  element.textContent = message;
  element.dataset.type = type;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "更新模板失败，请稍后重试。";
}

export function getCurrentTemplateId() {
  return currentTemplateId;
}

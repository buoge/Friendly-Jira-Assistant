import {
  formatHoursAsWorkDays,
  formatTemplateItemPreview,
  getSubtaskTemplates,
  getTemplateItemDisplay,
  parseEstimateToHours,
  type SubtaskTemplate
} from "../shared/subtaskTemplates";

export type TemplateApplyItem = {
  estimateHours: number;
  summary: string;
};

export type TemplateApplyStoryContext = {
  storyKey: string;
  storyPoints: string;
  storySummary: string;
};

type DialogElements = {
  backdrop: HTMLElement | null;
  bodyContainer: HTMLElement | null;
  cancelButton: HTMLButtonElement | null;
  confirmButton: HTMLButtonElement | null;
  dialog: HTMLElement | null;
  messageElement: HTMLElement | null;
  root: HTMLElement;
  titleElement: HTMLElement | null;
};

let dialogRoot: HTMLElement | null = null;
let activeDialogCleanup: (() => void) | null = null;

function getDialogElements(): DialogElements {
  if (!dialogRoot) {
    dialogRoot = document.querySelector<HTMLElement>("#app-dialog-root");
  }

  if (!dialogRoot) {
    throw new Error("Dialog root is missing.");
  }

  let bodyContainer = dialogRoot.querySelector<HTMLElement>("#app-dialog-body");

  if (!bodyContainer) {
    bodyContainer = document.createElement("div");
    bodyContainer.id = "app-dialog-body";
    bodyContainer.className = "app-dialog__body";

    const fieldsContainer = dialogRoot.querySelector<HTMLElement>("#app-dialog-fields");
    fieldsContainer?.insertAdjacentElement("beforebegin", bodyContainer);
  }

  return {
    backdrop: dialogRoot.querySelector<HTMLElement>(".app-dialog__backdrop"),
    bodyContainer,
    cancelButton: dialogRoot.querySelector<HTMLButtonElement>("#app-dialog-cancel"),
    confirmButton: dialogRoot.querySelector<HTMLButtonElement>("#app-dialog-confirm"),
    dialog: dialogRoot.querySelector<HTMLElement>(".app-dialog"),
    messageElement: dialogRoot.querySelector<HTMLElement>("#app-dialog-message"),
    root: dialogRoot,
    titleElement: dialogRoot.querySelector<HTMLElement>("#app-dialog-title")
  };
}

function closeDialog() {
  const elements = getDialogElements();

  activeDialogCleanup?.();
  activeDialogCleanup = null;
  elements.bodyContainer?.replaceChildren();
  elements.messageElement && (elements.messageElement.textContent = "");
  elements.messageElement && (elements.messageElement.hidden = true);
  elements.bodyContainer && (elements.bodyContainer.hidden = true);
  elements.dialog?.classList.remove("app-dialog--wide", "app-dialog--template-apply");
  elements.root.hidden = true;
  elements.root.setAttribute("aria-hidden", "true");
  document.body.classList.remove("app-dialog-open");
}

function openDialog() {
  const elements = getDialogElements();
  elements.dialog?.classList.add("app-dialog--template-apply");
  elements.root.hidden = false;
  elements.root.setAttribute("aria-hidden", "false");
  document.body.classList.add("app-dialog-open");
}

function parseEstimateHours(value: string) {
  const hours = parseEstimateToHours(value);

  if (hours === undefined || hours <= 0) {
    return null;
  }

  return hours;
}

function renderTemplatePicker(
  templates: SubtaskTemplate[],
  selectedTemplateId: string,
  onSelect: (templateId: string) => void
) {
  const container = document.createElement("div");
  container.className = "template-apply-picker";

  const selectField = document.createElement("label");
  selectField.className = "field app-dialog__field";

  const selectLabel = document.createElement("span");
  selectLabel.textContent = "选择模板";

  const selectElement = document.createElement("select");
  selectElement.className = "template-apply-picker__select";

  templates.forEach((template) => {
    const optionElement = document.createElement("option");
    optionElement.value = template.id;
    optionElement.textContent = template.name;
    optionElement.selected = template.id === selectedTemplateId;
    selectElement.append(optionElement);
  });

  selectField.append(selectLabel, selectElement);
  container.append(selectField);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];

  const descriptionElement = document.createElement("p");
  descriptionElement.className = "template-apply-picker__description";
  descriptionElement.textContent = selectedTemplate?.description ?? "";

  const previewTitle = document.createElement("h4");
  previewTitle.className = "template-apply-picker__preview-title";
  previewTitle.textContent = "模板内容";

  const previewList = document.createElement("ul");
  previewList.className = "template-apply-picker__preview-list";

  selectedTemplate?.items.forEach((item) => {
    const listItem = document.createElement("li");
    listItem.textContent = formatTemplateItemPreview(item);
    previewList.append(listItem);
  });

  container.append(descriptionElement, previewTitle, previewList);

  selectElement.addEventListener("change", () => {
    onSelect(selectElement.value);
  });

  return container;
}

function setEstimateFieldInvalid(estimateInput: HTMLInputElement | null | undefined, invalid: boolean) {
  if (!estimateInput) {
    return;
  }

  const fieldElement = estimateInput.closest(".template-apply-table__estimate-field");
  const hintElement = fieldElement?.querySelector<HTMLElement>(".template-apply-table__estimate-hint");

  estimateInput.classList.toggle("template-apply-table__estimate--invalid", invalid);

  if (hintElement) {
    hintElement.hidden = !invalid;
  }
}

function clearEstimateFieldValidation(tableBody: HTMLElement) {
  tableBody.querySelectorAll<HTMLInputElement>(".template-apply-table__estimate").forEach((estimateInput) => {
    setEstimateFieldInvalid(estimateInput, false);
  });
}

function updateTemplateTableRowNumbers(tableBody: HTMLElement) {
  tableBody.querySelectorAll("tr").forEach((row, index) => {
    const indexElement = row.querySelector<HTMLElement>(".template-apply-table__index");

    if (indexElement) {
      indexElement.textContent = String(index + 1);
    }
  });
}

function createTemplateTableRow(summary = "", estimate = "0") {
  const rowElement = document.createElement("tr");

  const indexCell = document.createElement("td");
  indexCell.className = "template-apply-table__index";
  indexCell.textContent = "1";

  const nameCell = document.createElement("td");
  nameCell.className = "template-apply-table__name-cell";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "template-apply-table__name";
  nameInput.value = summary;
  nameInput.placeholder = "任务名称";
  nameCell.append(nameInput);

  const estimateCell = document.createElement("td");
  estimateCell.className = "template-apply-table__estimate-cell";
  const estimateFieldElement = document.createElement("div");
  estimateFieldElement.className = "template-apply-table__estimate-field";

  const estimateInput = document.createElement("input");
  estimateInput.type = "number";
  estimateInput.className = "template-apply-table__estimate";
  estimateInput.min = "0";
  estimateInput.step = "0.5";
  estimateInput.placeholder = "小时";
  estimateInput.value = estimate;

  const estimateHintElement = document.createElement("span");
  estimateHintElement.className = "template-apply-table__estimate-hint";
  estimateHintElement.textContent = "必填";
  estimateHintElement.hidden = true;

  estimateFieldElement.append(estimateInput, estimateHintElement);
  estimateCell.append(estimateFieldElement);

  const actionsCell = document.createElement("td");
  actionsCell.className = "template-apply-table__actions";

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "template-apply-table__add";
  addButton.setAttribute("aria-label", "在下方新增");
  addButton.title = "在下方新增";
  addButton.textContent = "+";

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "template-apply-table__remove";
  removeButton.setAttribute("aria-label", "删除此项");
  removeButton.title = "删除此项";
  removeButton.textContent = "删除";

  actionsCell.append(addButton, removeButton);
  rowElement.append(indexCell, nameCell, estimateCell, actionsCell);

  return rowElement;
}

function updateTemplateTableRowActions(tableBody: HTMLElement) {
  const rows = tableBody.querySelectorAll("tr");
  const disableRemove = rows.length <= 1;

  rows.forEach((row) => {
    const removeButton = row.querySelector<HTMLButtonElement>(".template-apply-table__remove");
    if (removeButton) {
      removeButton.disabled = disableRemove;
    }
  });

  updateTemplateTableRowNumbers(tableBody);
}

function updateTemplateTableTotalSummary(tableBody: HTMLElement, totalElement: HTMLElement) {
  let totalHours = 0;

  tableBody.querySelectorAll<HTMLInputElement>(".template-apply-table__estimate").forEach((estimateInput) => {
    const hours = parseEstimateToHours(estimateInput.value) ?? 0;

    if (hours > 0) {
      totalHours += hours;
    }
  });

  totalElement.textContent = `工时总计：${formatHoursAsWorkDays(totalHours)}d`;
}

function bindTemplateTableRowActions(
  tableBody: HTMLElement,
  errorElement: HTMLElement,
  totalElement: HTMLElement
) {
  const refreshTotal = () => {
    updateTemplateTableTotalSummary(tableBody, totalElement);
  };

  tableBody.addEventListener("input", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.classList.contains("template-apply-table__estimate")) {
      setEstimateFieldInvalid(target, false);
      errorElement.hidden = true;
      refreshTotal();
    }
  });

  tableBody.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const rowElement = target.closest("tr");

    if (!rowElement || !tableBody.contains(rowElement)) {
      return;
    }

    if (target.closest(".template-apply-table__add")) {
      const newRowElement = createTemplateTableRow();
      rowElement.insertAdjacentElement("afterend", newRowElement);
      newRowElement.querySelector<HTMLInputElement>(".template-apply-table__name")?.focus();
      updateTemplateTableRowActions(tableBody);
      errorElement.hidden = true;
      refreshTotal();
      return;
    }

    if (target.closest(".template-apply-table__remove")) {
      if (tableBody.querySelectorAll("tr").length <= 1) {
        return;
      }

      rowElement.remove();
      updateTemplateTableRowActions(tableBody);
      errorElement.hidden = true;
      refreshTotal();
    }
  });

  updateTemplateTableRowActions(tableBody);
  refreshTotal();
}

function renderTemplateStoryMeta(context: TemplateApplyStoryContext) {
  const metaElement = document.createElement("div");
  metaElement.className = "template-apply-story-meta";

  const storyNameElement = document.createElement("p");
  storyNameElement.className = "template-apply-story-meta__item template-apply-story-meta__item--story";
  storyNameElement.textContent = `用户故事名称：${context.storyKey} ${context.storySummary}`;

  const storyPointsElement = document.createElement("p");
  storyPointsElement.className = "template-apply-story-meta__item template-apply-story-meta__item--points";
  storyPointsElement.textContent = `故事点数：${context.storyPoints}`;

  metaElement.append(storyNameElement, storyPointsElement);

  return metaElement;
}

function renderTemplateTable(template: SubtaskTemplate) {
  const container = document.createElement("div");
  container.className = "template-apply-table-wrap";

  const tableElement = document.createElement("table");
  tableElement.className = "template-apply-table";

  const tableHead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const indexHeader = document.createElement("th");
  indexHeader.className = "template-apply-table__index-header";
  indexHeader.textContent = "序号";
  const nameHeader = document.createElement("th");
  nameHeader.className = "template-apply-table__name-header";
  nameHeader.textContent = "任务名称";
  const estimateHeader = document.createElement("th");
  estimateHeader.className = "template-apply-table__estimate-header";
  estimateHeader.textContent = "初始预估（小时）";
  const actionsHeader = document.createElement("th");
  actionsHeader.className = "template-apply-table__actions-header";
  actionsHeader.textContent = "操作";
  headerRow.append(indexHeader, nameHeader, estimateHeader, actionsHeader);
  tableHead.append(headerRow);

  const tableBody = document.createElement("tbody");

  template.items.forEach((item) => {
    const { estimateHours, summary } = getTemplateItemDisplay(item);
    tableBody.append(createTemplateTableRow(summary, estimateHours > 0 ? String(estimateHours) : "0"));
  });

  tableElement.append(tableHead, tableBody);

  const tableScrollElement = document.createElement("div");
  tableScrollElement.className = "template-apply-table-scroll";
  tableScrollElement.append(tableElement);

  const totalElement = document.createElement("p");
  totalElement.className = "template-apply-table__total";
  totalElement.setAttribute("aria-live", "polite");

  const errorElement = document.createElement("p");
  errorElement.className = "template-apply-table__error";
  errorElement.hidden = true;

  bindTemplateTableRowActions(tableBody, errorElement, totalElement);
  container.append(tableScrollElement, totalElement, errorElement);

  return {
    container,
    errorElement,
    getRows: () =>
      [...tableBody.querySelectorAll<HTMLTableRowElement>("tr")].map((row) => ({
        estimateInput: row.querySelector<HTMLInputElement>(".template-apply-table__estimate"),
        nameInput: row.querySelector<HTMLInputElement>(".template-apply-table__name")
      }))
  };
}

export function showTemplateApplyDialog(storyContext?: TemplateApplyStoryContext) {
  return new Promise<TemplateApplyItem[] | null>((resolve) => {
    void (async () => {
      const elements = getDialogElements();
      const templates = await getSubtaskTemplates();

      if (!templates.length) {
        resolve(null);
        return;
      }

      closeDialog();
      openDialog();

      let step: "pick" | "edit" = "pick";
      let selectedTemplateId = templates[0]?.id ?? "";

      const finish = (result: TemplateApplyItem[] | null) => {
        closeDialog();
        resolve(result);
      };

      const renderStep = () => {
        const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];

        if (!selectedTemplate) {
          finish(null);
          return;
        }

        elements.bodyContainer?.replaceChildren();
        elements.bodyContainer && (elements.bodyContainer.hidden = false);
        elements.messageElement && (elements.messageElement.hidden = true);

        if (step === "pick") {
          elements.dialog?.classList.remove("app-dialog--wide");

          if (elements.titleElement) {
            elements.titleElement.textContent = "应用任务拆分模板";
          }

          if (elements.cancelButton) {
            elements.cancelButton.textContent = "取消";
          }

          if (elements.confirmButton) {
            elements.confirmButton.textContent = "使用模板";
            elements.confirmButton.classList.remove("button-danger");
            elements.confirmButton.classList.add("button-primary");
          }

          const picker = renderTemplatePicker(templates, selectedTemplateId, (templateId) => {
            selectedTemplateId = templateId;
            renderStep();
          });

          elements.bodyContainer?.append(picker);
          elements.cancelButton?.focus();
          return;
        }

        elements.dialog?.classList.add("app-dialog--wide");

        if (elements.titleElement) {
          elements.titleElement.textContent = `应用模板：${selectedTemplate.name}`;
        }

        if (elements.cancelButton) {
          elements.cancelButton.textContent = "返回";
        }

        if (elements.confirmButton) {
          elements.confirmButton.textContent = "生成任务";
          elements.confirmButton.classList.remove("button-danger");
          elements.confirmButton.classList.add("button-primary");
        }

        const tableView = renderTemplateTable(selectedTemplate);

        if (storyContext) {
          elements.bodyContainer?.append(renderTemplateStoryMeta(storyContext));
        }

        elements.bodyContainer?.append(tableView.container);

        const firstEstimateInput = tableView.getRows()[0]?.estimateInput;
        firstEstimateInput?.focus();
        firstEstimateInput?.select();
      };

      const handleCancel = () => {
        if (step === "edit") {
          step = "pick";
          renderStep();
          return;
        }

        finish(null);
      };

      const handleConfirm = () => {
        if (step === "pick") {
          step = "edit";
          renderStep();
          return;
        }

        const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];

        if (!selectedTemplate) {
          finish(null);
          return;
        }

        const tableView = elements.bodyContainer?.querySelector(".template-apply-table-wrap");
        const errorElement = tableView?.querySelector<HTMLElement>(".template-apply-table__error");
        const tableBody = tableView?.querySelector<HTMLElement>("tbody");
        const rows = [...(tableBody?.querySelectorAll<HTMLTableRowElement>("tr") ?? [])];
        const items: TemplateApplyItem[] = [];
        const invalidRows: number[] = [];

        if (tableBody) {
          clearEstimateFieldValidation(tableBody);
        }

        rows.forEach((row, index) => {
          const nameInput = row.querySelector<HTMLInputElement>(".template-apply-table__name");
          const estimateInput = row.querySelector<HTMLInputElement>(".template-apply-table__estimate");
          const summary = nameInput?.value.trim() ?? "";
          const estimateHours = parseEstimateHours(estimateInput?.value ?? "");

          if (!summary) {
            return;
          }

          if (estimateHours === null) {
            invalidRows.push(index + 1);
            setEstimateFieldInvalid(estimateInput, true);
            return;
          }

          items.push({ estimateHours, summary });
        });

        if (invalidRows.length) {
          if (errorElement) {
            errorElement.hidden = false;
            errorElement.textContent = `第 ${invalidRows.join("、")} 行的初始预估为必填项，且必须大于 0 小时。`;
          }

          const firstInvalidRow = rows[invalidRows[0] - 1];
          firstInvalidRow?.querySelector<HTMLInputElement>(".template-apply-table__estimate")?.focus();
          return;
        }

        if (!items.length) {
          if (errorElement) {
            errorElement.hidden = false;
            errorElement.textContent = "请至少保留一项有效任务。";
          }
          return;
        }

        finish(items);
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          handleCancel();
        }
      };

      const handleBackdrop = () => {
        handleCancel();
      };

      elements.confirmButton?.addEventListener("click", handleConfirm);
      elements.cancelButton?.addEventListener("click", handleCancel);
      elements.backdrop?.addEventListener("click", handleBackdrop);
      document.addEventListener("keydown", handleKeyDown);

      activeDialogCleanup = () => {
        elements.confirmButton?.removeEventListener("click", handleConfirm);
        elements.cancelButton?.removeEventListener("click", handleCancel);
        elements.backdrop?.removeEventListener("click", handleBackdrop);
        document.removeEventListener("keydown", handleKeyDown);
      };

      renderStep();
    })();
  });
}

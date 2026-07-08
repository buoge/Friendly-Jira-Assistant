import {
  addJiraAssignee,
  deleteJiraAssignee,
  formatAssigneeLabel,
  getJiraAssignees,
  updateJiraAssignee,
  type JiraAssignee
} from "../shared/jiraAssignees";
import { showConfirmDialog, showFormDialog } from "./appDialog";

type AssigneeViewController = {
  addAssigneeButton: HTMLButtonElement | null;
  assigneeListElement: HTMLElement | null;
  assigneeMessageElement: HTMLParagraphElement | null;
};

let controller: AssigneeViewController | null = null;

const assigneeFormFields = [
  {
    id: "name",
    label: "Jira 用户名",
    placeholder: "例如 wucb"
  },
  {
    id: "displayName",
    label: "显示名称",
    optional: true,
    placeholder: "可选，默认同用户名"
  }
] as const;

export function initAssigneeViews(options: AssigneeViewController) {
  controller = options;

  options.addAssigneeButton?.addEventListener("click", () => {
    void createAssignee();
  });
}

export async function renderAssigneeManager() {
  if (!controller?.assigneeListElement) {
    return;
  }

  const assignees = await getJiraAssignees();
  renderAssigneeList(controller.assigneeListElement, assignees);
}

async function createAssignee() {
  const result = await showAssigneeFormDialog("新增经办人");

  if (!result?.name) {
    return;
  }

  try {
    await addJiraAssignee({
      displayName: result.displayName,
      name: result.name
    });
    showAssigneeMessage("已添加经办人。", "success");
    await renderAssigneeManager();
  } catch (error) {
    showAssigneeMessage(getErrorMessage(error), "error");
  }
}

async function editAssignee(assignee: JiraAssignee) {
  const result = await showAssigneeFormDialog("编辑经办人", {
    displayName: assignee.displayName,
    name: assignee.name
  });

  if (!result?.name) {
    return;
  }

  try {
    await updateJiraAssignee(assignee.id, {
      displayName: result.displayName,
      name: result.name
    });
    showAssigneeMessage("已更新经办人。", "success");
    await renderAssigneeManager();
  } catch (error) {
    showAssigneeMessage(getErrorMessage(error), "error");
  }
}

async function removeAssignee(assignee: JiraAssignee) {
  const confirmed = await showConfirmDialog({
    title: "删除经办人",
    message: `确定删除经办人「${formatAssigneeLabel(assignee)}」吗？`,
    confirmLabel: "删除",
    danger: true
  });

  if (!confirmed) {
    return;
  }

  try {
    await deleteJiraAssignee(assignee.id);
    showAssigneeMessage("已删除经办人。", "success");
    await renderAssigneeManager();
  } catch (error) {
    showAssigneeMessage(getErrorMessage(error), "error");
  }
}

function renderAssigneeList(listElement: HTMLElement, assignees: JiraAssignee[]) {
  listElement.replaceChildren();

  if (!assignees.length) {
    const emptyElement = document.createElement("p");
    emptyElement.className = "assignee-list__empty";
    emptyElement.textContent = "暂无经办人，请点击「新增经办人」添加。";
    listElement.append(emptyElement);
    return;
  }

  const tableElement = document.createElement("table");
  tableElement.className = "assignee-list__table";

  const headerRow = document.createElement("tr");
  ["显示名称", "Jira 用户名", "操作"].forEach((label) => {
    const headerCell = document.createElement("th");
    headerCell.textContent = label;
    headerRow.append(headerCell);
  });
  tableElement.append(headerRow);

  assignees.forEach((assignee) => {
    const rowElement = document.createElement("tr");

    const displayNameCell = document.createElement("td");
    displayNameCell.textContent = assignee.displayName;

    const nameCell = document.createElement("td");
    nameCell.textContent = assignee.name;

    const actionsCell = document.createElement("td");
    actionsCell.className = "assignee-list__actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "button-secondary assignee-list__edit";
    editButton.textContent = "编辑";
    editButton.addEventListener("click", () => {
      void editAssignee(assignee);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "button-danger assignee-list__delete";
    deleteButton.textContent = "删除";
    deleteButton.addEventListener("click", () => {
      void removeAssignee(assignee);
    });

    actionsCell.append(editButton, deleteButton);
    rowElement.append(displayNameCell, nameCell, actionsCell);
    tableElement.append(rowElement);
  });

  listElement.append(tableElement);
}

async function showAssigneeFormDialog(title: string, initialValues?: Record<string, string>) {
  return showFormDialog({
    title,
    fields: [...assigneeFormFields],
    confirmLabel: "保存",
    values: initialValues
  });
}

function showAssigneeMessage(message: string, type: "error" | "success") {
  if (!controller?.assigneeMessageElement) {
    return;
  }

  controller.assigneeMessageElement.textContent = message;
  controller.assigneeMessageElement.dataset.type = type;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "操作失败，请稍后重试。";
}

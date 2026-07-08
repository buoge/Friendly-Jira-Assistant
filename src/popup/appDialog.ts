type DialogField = {
  id: string;
  label: string;
  multiline?: boolean;
  optional?: boolean;
  placeholder?: string;
};

type ConfirmDialogOptions = {
  cancelLabel?: string;
  confirmLabel?: string;
  danger?: boolean;
  message: string;
  title: string;
};

type FormDialogOptions = {
  cancelLabel?: string;
  confirmLabel?: string;
  fields: DialogField[];
  title: string;
  values?: Record<string, string>;
};

let dialogRoot: HTMLElement | null = null;
let activeDialogCleanup: (() => void) | null = null;

function getDialogElements() {
  if (!dialogRoot) {
    dialogRoot = document.querySelector<HTMLElement>("#app-dialog-root");
  }

  if (!dialogRoot) {
    throw new Error("Dialog root is missing.");
  }

  return {
    backdrop: dialogRoot.querySelector<HTMLElement>(".app-dialog__backdrop"),
    cancelButton: dialogRoot.querySelector<HTMLButtonElement>("#app-dialog-cancel"),
    confirmButton: dialogRoot.querySelector<HTMLButtonElement>("#app-dialog-confirm"),
    dialog: dialogRoot.querySelector<HTMLElement>(".app-dialog"),
    fieldsContainer: dialogRoot.querySelector<HTMLElement>("#app-dialog-fields"),
    messageElement: dialogRoot.querySelector<HTMLElement>("#app-dialog-message"),
    root: dialogRoot,
    titleElement: dialogRoot.querySelector<HTMLElement>("#app-dialog-title")
  };
}

function closeDialog() {
  const elements = getDialogElements();

  activeDialogCleanup?.();
  activeDialogCleanup = null;
  elements.fieldsContainer?.replaceChildren();
  const bodyContainer = elements.root.querySelector<HTMLElement>("#app-dialog-body");
  bodyContainer?.replaceChildren();
  bodyContainer && (bodyContainer.hidden = true);
  elements.root.querySelector<HTMLElement>(".app-dialog")?.classList.remove("app-dialog--wide", "app-dialog--template-apply");
  elements.root.hidden = true;
  elements.root.setAttribute("aria-hidden", "true");
  document.body.classList.remove("app-dialog-open");
}

function openDialog() {
  const elements = getDialogElements();
  elements.root.hidden = false;
  elements.root.setAttribute("aria-hidden", "false");
  document.body.classList.add("app-dialog-open");
}

export function showConfirmDialog(options: ConfirmDialogOptions) {
  return new Promise<boolean>((resolve) => {
    const elements = getDialogElements();

    closeDialog();
    openDialog();

    const bodyContainer = elements.root.querySelector<HTMLElement>("#app-dialog-body");
    bodyContainer && (bodyContainer.hidden = true);

    if (elements.titleElement) {
      elements.titleElement.textContent = options.title;
    }

    if (elements.messageElement) {
      elements.messageElement.textContent = options.message;
      elements.messageElement.hidden = false;
    }

    if (elements.fieldsContainer) {
      elements.fieldsContainer.hidden = true;
      elements.fieldsContainer.replaceChildren();
    }

    if (elements.cancelButton) {
      elements.cancelButton.textContent = options.cancelLabel ?? "取消";
    }

    if (elements.confirmButton) {
      elements.confirmButton.textContent = options.confirmLabel ?? "确定";
      elements.confirmButton.classList.toggle("button-danger", Boolean(options.danger));
      elements.confirmButton.classList.toggle("button-primary", !options.danger);
    }

    const handleConfirm = () => {
      closeDialog();
      resolve(true);
    };

    const handleCancel = () => {
      closeDialog();
      resolve(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCancel();
      }
    };

    elements.confirmButton?.addEventListener("click", handleConfirm);
    elements.cancelButton?.addEventListener("click", handleCancel);
    elements.backdrop?.addEventListener("click", handleCancel);
    document.addEventListener("keydown", handleKeyDown);

    activeDialogCleanup = () => {
      elements.confirmButton?.removeEventListener("click", handleConfirm);
      elements.cancelButton?.removeEventListener("click", handleCancel);
      elements.backdrop?.removeEventListener("click", handleCancel);
      document.removeEventListener("keydown", handleKeyDown);
    };

    elements.cancelButton?.focus();
  });
}

export function showFormDialog(options: FormDialogOptions) {
  return new Promise<Record<string, string> | null>((resolve) => {
    const elements = getDialogElements();
    const fieldElements = new Map<string, HTMLInputElement | HTMLTextAreaElement>();

    closeDialog();
    openDialog();

    const bodyContainer = elements.root.querySelector<HTMLElement>("#app-dialog-body");
    bodyContainer && (bodyContainer.hidden = true);

    if (elements.titleElement) {
      elements.titleElement.textContent = options.title;
    }

    if (elements.messageElement) {
      elements.messageElement.textContent = "";
      elements.messageElement.hidden = true;
    }

    if (elements.fieldsContainer) {
      elements.fieldsContainer.hidden = false;
      elements.fieldsContainer.replaceChildren(
        ...options.fields.map((field) => {
          const fieldElement = document.createElement("label");
          fieldElement.className = "field app-dialog__field";

          const labelElement = document.createElement("span");
          labelElement.textContent = field.label;

          const controlElement = field.multiline
            ? document.createElement("textarea")
            : document.createElement("input");

          if (controlElement instanceof HTMLInputElement) {
            controlElement.type = "text";
          }

          if (field.multiline && controlElement instanceof HTMLTextAreaElement) {
            controlElement.rows = 3;
          }

          if (field.placeholder) {
            controlElement.placeholder = field.placeholder;
          }

          const initialValue = options.values?.[field.id];

          if (initialValue) {
            controlElement.value = initialValue;
          }

          fieldElements.set(field.id, controlElement);
          fieldElement.append(labelElement, controlElement);
          return fieldElement;
        })
      );
    }

    if (elements.cancelButton) {
      elements.cancelButton.textContent = options.cancelLabel ?? "取消";
    }

    if (elements.confirmButton) {
      elements.confirmButton.textContent = options.confirmLabel ?? "确定";
      elements.confirmButton.classList.remove("button-danger");
      elements.confirmButton.classList.add("button-primary");
    }

    const handleConfirm = () => {
      const values: Record<string, string> = {};

      for (const field of options.fields) {
        const controlElement = fieldElements.get(field.id);
        const value = controlElement?.value.trim() ?? "";

        if (!field.optional && !value) {
          controlElement?.focus();
          return;
        }

        values[field.id] = value;
      }

      closeDialog();
      resolve(values);
    };

    const handleCancel = () => {
      closeDialog();
      resolve(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCancel();
      }
    };

    elements.confirmButton?.addEventListener("click", handleConfirm);
    elements.cancelButton?.addEventListener("click", handleCancel);
    elements.backdrop?.addEventListener("click", handleCancel);
    document.addEventListener("keydown", handleKeyDown);

    activeDialogCleanup = () => {
      elements.confirmButton?.removeEventListener("click", handleConfirm);
      elements.cancelButton?.removeEventListener("click", handleCancel);
      elements.backdrop?.removeEventListener("click", handleCancel);
      document.removeEventListener("keydown", handleKeyDown);
    };

    const firstField = options.fields[0] ? fieldElements.get(options.fields[0].id) : null;
    firstField?.focus();
  });
}

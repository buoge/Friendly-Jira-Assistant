export type AssistantPingMessage = {
  type: "ASSISTANT_PING";
};

export type AssistantPageStatusMessage = {
  type: "ASSISTANT_PAGE_STATUS";
  payload: {
    isJiraPage: boolean;
    title: string;
    url: string;
  };
};

export type AssistantMessage = AssistantPingMessage | AssistantPageStatusMessage;

import { Message } from '../types';

export type TerminalAssistantStatus = 'completed' | 'failed' | 'aborted';

/** Update a terminal assistant state without touching unrelated messages. */
export function updateAssistantMessageStatus(
  messages: Message[],
  assistantMessageId: string | null,
  status: TerminalAssistantStatus,
): Message[] {
  if (assistantMessageId === null) return messages;

  return messages.map((message) =>
    message.id === assistantMessageId
      ? { ...message, status, isWaitingForFirstToken: false }
      : message,
  );
}

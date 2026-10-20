import { describe, expect, it } from 'vitest';
import { Message } from '@/types';
import { updateAssistantMessageStatus } from '@/utils/messageStatus';

describe('updateAssistantMessageStatus', () => {
  const messages: Message[] = [
    { id: 'user-1', content: 'hello', role: 'user' },
    {
      id: 'assistant-1',
      content: 'partial',
      role: 'assistant',
      isWaitingForFirstToken: false,
      status: 'streaming',
    },
  ];

  it('updates the target assistant message by id', () => {
    const updated = updateAssistantMessageStatus(
      messages,
      'assistant-1',
      'aborted',
    );

    expect(updated[1].status).toBe('aborted');
    expect(updated[1].isWaitingForFirstToken).toBe(false);
    expect(updated[0].status).toBeUndefined();
  });

  it('returns the original list when no assistant id is available', () => {
    expect(updateAssistantMessageStatus(messages, null, 'failed')).toBe(
      messages,
    );
  });
});

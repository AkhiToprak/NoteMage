import { db } from '@/lib/db';

export async function createSystemMessage(groupId: string, content: string): Promise<void> {
  await db.groupMessage.create({
    data: {
      groupId,
      senderId: null,
      type: 'system',
      content,
    },
  });
}

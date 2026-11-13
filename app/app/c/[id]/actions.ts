'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { addMessage, createChat, getCharacterById } from '@/lib/db';
import { updateChatSettings } from '@/lib/resources-db';
import { parseOpenings } from '@/lib/characters';

// 从角色页开始新故事：建会话，把开场白写成第一条角色消息，可选身份，然后跳到对话页。
export async function startStory(characterId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const character = getCharacterById(characterId);
  if (!character) redirect('/plaza');
  const personaId = Number(formData.get('personaId')) || null;
  const openingId = String(formData.get('openingId') ?? 'default');
  const alternates = parseOpenings(character.alternate_greetings);
  const alternate = openingId.startsWith('alt-') ? alternates[Number(openingId.slice(4))] : undefined;
  const opening = alternate?.text || character.greeting;
  const title = alternate?.title || '默认开场';
  const chatId = createChat(user.id, character.id, title);
  addMessage(chatId, 'assistant', opening);
  if (personaId) updateChatSettings(user.id, chatId, { presetId: null, personaId, lorebookIds: null });
  redirect(`/chats/${chatId}`);
}

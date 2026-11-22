'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { addMessage, createChat, getCharacterById } from '@/lib/db';
import { resolvePersona, setChatPersona } from '@/lib/resources-db';
import { parseOpenings } from '@/lib/characters';
import { nsfwBlock } from '@/lib/age-gate';

// 从角色页开始新故事：建会话，把开场白写成第一条角色消息，可选身份，然后跳到对话页。
export async function startStory(characterId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const character = getCharacterById(characterId);
  if (!character) redirect('/plaza');
  if (await nsfwBlock(user.id, character)) redirect(`/c/${characterId}`);
  const personaId = Number(formData.get('personaId')) || null;
  const openingId = String(formData.get('openingId') ?? 'default');
  const alternates = parseOpenings(character.alternate_greetings);
  const alternate = openingId.startsWith('alt-') ? alternates[Number(openingId.slice(4))] : undefined;
  const opening = alternate?.text || character.greeting;
  const title = alternate?.title || '默认开场';
  const chatId = createChat(user.id, character.id, title);
  // ST：备选开场白是第一条消息的候选，进故事后还能左右滑动切换
  const greetings = [character.greeting, ...alternates.map((item) => item.text)].filter((text) => text && text.trim());
  const chosen = Math.max(0, greetings.indexOf(opening));
  if (greetings.length > 1) addMessage(chatId, 'assistant', opening, greetings, chosen);
  else addMessage(chatId, 'assistant', opening);
  // ST：选的就是自动身份（绑定该角色 → 默认）时不锁定，之后改默认身份也会跟着变；选了别的才锁定到这段聊天
  if (personaId && resolvePersona(user.id, { lockedId: null, characterIds: [character.id] })?.id !== personaId) setChatPersona(user.id, chatId, personaId);
  redirect(`/chats/${chatId}`);
}

import { modelName } from '@/lib/model';
import { fail, idParam, json, requireUser } from '@/lib/api';
import { getChat, getCharacterById, listMessages } from '@/lib/db';
import { assemblePrompt } from '@/lib/prompt';
import { loadGenerationConfig } from '@/lib/resources-db';
import { getOverride } from '@/lib/cards';
import { memorySettings, ragChunks, summaryState } from '@/lib/memory';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// GET /api/chats/[id]/context-preview —— 只读预览：下一次发送会组装出什么
export async function GET(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const chat = getChat(id, user.id);
  if (!chat) return fail('会话不存在', 404);
  const character = getCharacterById(chat.character_id);
  if (!character) return fail('角色不存在', 404);

  const config = loadGenerationConfig(user.id, chat);
  const history = listMessages(chat.id);
  const memory = memorySettings(chat);
  const lastUser = [...history].reverse().find((message) => message.role === 'user');
  const rag = memory.ragPrefs.enabled && lastUser ? ragChunks(history, lastUser.content, memory.ragPrefs.topK) : [];
  const result = assemblePrompt({
    character,
    history,
    preset: config.preset,
    persona: config.persona,
    loreEntries: config.loreEntries,
    regexRules: config.regexRules,
    summary: summaryState(chat).text,
    rag,
    memory: memory.memory,
    card: getOverride(user.id, chat.character_id),
    model: modelName(chat.model),
  });

  return json({
    preset: { id: config.preset.id, name: config.preset.name, params: config.preset.params, instruct: config.preset.instruct },
    persona: config.persona ? { id: config.persona.id, name: config.persona.name } : null,
    blocks: result.blocks,
    messages: result.messages,
    tokens: result.tokens,
    chars: result.chars,
    dropped: result.dropped,
    loreHits: result.loreHits,
    context: result.context,
  });
}

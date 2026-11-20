import { templateLore, templatePrompt } from '@/lib/ejs-server';
import { modelName } from '@/lib/model';
import { fail, idParam, json, requireUser } from '@/lib/api';
import { getChat, getCharacterById, listMessages } from '@/lib/db';
import { assemblePrompt } from '@/lib/prompt';
import { chatVariables } from '@/lib/mvu-server';
import { loadGenerationConfig } from '@/lib/resources-db';
import { getOverride } from '@/lib/cards';
import { memorySettings, ragChunks, summaryState, promptMemory } from '@/lib/memory';

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
  const vars = chatVariables(chat.id, chat.character_id);
  const ejsLore = await templateLore(config.loreEntries, { userId: user.id, chatId: chat.id, character, userName: config.userName, loreEntries: config.loreEntries, history: history, model: modelName(chat.model), variables: vars });
  const result = assemblePrompt({
    dryRun: true,
    character,
    history,
    preset: config.preset,
    persona: config.persona,
    userName: config.userName,
    loreEntries: ejsLore.entries,
    regexRules: config.regexRules,
    ...promptMemory(chat, user.id),
    rag,
    card: getOverride(user.id, chat.character_id),
    model: modelName(chat.model),
    variables: vars,
  });
  // EJS 模板（ST-Prompt-Template 写法），在 QuickJS 沙盒里跑；生成阶段 setvar 不落库
  const ejs = await templatePrompt(result.messages, { userId: user.id, chatId: chat.id, character, userName: config.userName, loreEntries: config.loreEntries, history: history, model: modelName(chat.model), variables: vars, generateType: 'normal' });
  result.messages = ejs.messages;
  // 预览里分块显示的也换成处理后的文本
  const ejsBlocks = await templatePrompt(result.blocks.map((block) => ({ role: 'system' as const, content: block.text })), { userId: user.id, chatId: chat.id, character, userName: config.userName, loreEntries: config.loreEntries, history: history, model: modelName(chat.model), variables: vars, generateType: 'normal' });
  result.blocks = result.blocks.map((block, index) => ({ ...block, text: ejsBlocks.messages[index]?.content ?? block.text }));

  return json({
    preset: { id: config.preset.id, name: config.preset.name, params: config.preset.params, instruct: config.preset.instruct },
    persona: config.persona ? { id: config.persona.id, name: config.persona.name } : null,
    blocks: result.blocks,
    messages: result.messages,
    ejsErrors: [...ejsLore.errors, ...ejs.errors, ...ejsBlocks.errors.filter((item) => !ejs.errors.some((other) => other.message === item.message))],
    tokens: result.tokens,
    chars: result.chars,
    dropped: result.dropped,
    loreHits: result.loreHits,
    context: result.context,
  });
}

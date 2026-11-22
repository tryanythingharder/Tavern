import { fail, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { generateImage, generateSpeech, imageConfigured, ttsConfigured } from '@/lib/media';
import { modelConfigured, streamChat } from '@/lib/model';

export const dynamic = 'force-dynamic';

// POST /api/admin/settings/test —— { kind: 'image' | 'tts' } 真实调用一次，用于验证配置
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);

  const body = (await request.json().catch(() => ({}))) as { kind?: string };
  if (body.kind === 'image') {
    if (!imageConfigured()) return fail('生图还没配置完整（base URL / key / 模型）', 400);
    try {
      const result = await generateImage('一张简单的测试图：暖色台灯下的旧书桌，极简', user.id);
      return json({ ok: true, url: result.url });
    } catch (error) {
      return fail(error instanceof Error ? error.message : '生图测试失败', 502);
    }
  }
  if (body.kind === 'tts') {
    if (!ttsConfigured()) return fail('语音还没配置完整（base URL / key / 模型）', 400);
    try {
      const result = await generateSpeech('这是一条语音测试。', user.id);
      return json({ ok: true, url: result.url });
    } catch (error) {
      return fail(error instanceof Error ? error.message : '语音测试失败', 502);
    }
  }
  if (body.kind === 'model') {
    if (!modelConfigured()) return fail('文本模型还没配置完整（base URL / key / 模型）', 400);
    try {
      let text = '';
      for await (const event of streamChat([{ role: 'user', content: '只回复两个字母：ok' }], {
        params: { temperature: 0.7, topP: 0.95, topK: 0, minP: 0, typicalP: 1, repetitionPenalty: 1, repetitionPenaltyRange: 0, repetitionPenaltySlope: 0, presencePenalty: 0, frequencyPenalty: 0, maxTokens: 16, contextSize: 0, seed: -1 },
      })) {
        if (event.type === 'content') text += event.text;
      }
      return json({ ok: true, text: text.slice(0, 80) });
    } catch (error) {
      return fail(error instanceof Error ? error.message : '模型测试失败', 502);
    }
  }
  return fail('参数不对', 400);
}

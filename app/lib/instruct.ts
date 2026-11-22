// 文本补全（ST Text Completion）：把对话消息按 Instruct 模板拼成一整段 prompt，走 /completions。
// 字段名与 ST 的 Instruct 模板一致，可直接导入 ST 导出的 instruct JSON（含 names_behavior / system_same_as_user / wrap 等）。

export type InstructTemplate = {
  name: string;
  input_sequence: string;
  input_suffix: string;
  output_sequence: string;
  output_suffix: string;
  system_sequence: string;
  system_suffix: string;
  last_output_sequence: string;
  first_output_sequence: string;
  stop_sequence: string;
  system_same_as_user: boolean;
  wrap: boolean; // 序列与内容之间换行
  names_behavior: 'none' | 'force' | 'always'; // always：每条都加「名字: 」；force：只在群聊/多角色；none：不加
  bos: string; // 开头追加（Llama 3 的 <|begin_of_text|>）
};

const base: InstructTemplate = {
  name: '', input_sequence: '', input_suffix: '', output_sequence: '', output_suffix: '', system_sequence: '', system_suffix: '',
  last_output_sequence: '', first_output_sequence: '', stop_sequence: '', system_same_as_user: false, wrap: true, names_behavior: 'always', bos: '',
};
const t = (id: string, patch: Partial<InstructTemplate>): [string, InstructTemplate] => [id, { ...base, ...patch }];

export const INSTRUCT_PRESETS: Record<string, InstructTemplate> = Object.fromEntries([
  t('chatml', { name: 'ChatML', input_sequence: '<|im_start|>user', input_suffix: '<|im_end|>\n', output_sequence: '<|im_start|>assistant', output_suffix: '<|im_end|>\n', system_sequence: '<|im_start|>system', system_suffix: '<|im_end|>\n', stop_sequence: '<|im_end|>' }),
  t('llama3', { name: 'Llama 3 Instruct', input_sequence: '<|start_header_id|>user<|end_header_id|>\n\n', input_suffix: '<|eot_id|>', output_sequence: '<|start_header_id|>assistant<|end_header_id|>\n\n', output_suffix: '<|eot_id|>', system_sequence: '<|start_header_id|>system<|end_header_id|>\n\n', system_suffix: '<|eot_id|>', stop_sequence: '<|eot_id|>', wrap: false, bos: '<|begin_of_text|>' }),
  t('mistral-v7', { name: 'Mistral V7', input_sequence: '[INST] ', input_suffix: '[/INST]', output_sequence: '', output_suffix: '</s>', system_sequence: '[SYSTEM_PROMPT] ', system_suffix: '[/SYSTEM_PROMPT]', stop_sequence: '</s>', wrap: false }),
  t('gemma2', { name: 'Gemma 2', input_sequence: '<start_of_turn>user', input_suffix: '<end_of_turn>\n', output_sequence: '<start_of_turn>model', output_suffix: '<end_of_turn>\n', system_same_as_user: true, stop_sequence: '<end_of_turn>' }),
  t('alpaca', { name: 'Alpaca', input_sequence: '### Instruction:', input_suffix: '\n\n', output_sequence: '### Response:', output_suffix: '\n\n', system_suffix: '\n\n' }),
  t('vicuna', { name: 'Vicuna 1.1', input_sequence: 'USER: ', input_suffix: '\n', output_sequence: 'ASSISTANT: ', output_suffix: '\n', system_suffix: '\n\n', wrap: false, names_behavior: 'none' }),
  t('metharme', { name: 'Metharme (Pygmalion)', input_sequence: '<|user|>', output_sequence: '<|model|>', system_sequence: '<|system|>', wrap: false }),
  t('plain', { name: '纯文本（故事续写）', input_suffix: '\n', output_suffix: '\n', system_suffix: '\n\n', wrap: false }),
]);

export const DEFAULT_INSTRUCT = 'chatml';

const str = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);

/** 解析 ST 导出的 instruct JSON（容忍旧版字段 names: boolean） */
export function parseInstructJson(raw: string): InstructTemplate | null {
  let data: Record<string, unknown>;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== 'object' || (typeof data.input_sequence !== 'string' && typeof data.output_sequence !== 'string')) return null;
  const nb = str(data.names_behavior);
  return {
    name: str(data.name, '自定义模板').slice(0, 60),
    input_sequence: str(data.input_sequence), input_suffix: str(data.input_suffix),
    output_sequence: str(data.output_sequence), output_suffix: str(data.output_suffix),
    system_sequence: str(data.system_sequence), system_suffix: str(data.system_suffix),
    last_output_sequence: str(data.last_output_sequence), first_output_sequence: str(data.first_output_sequence),
    stop_sequence: str(data.stop_sequence),
    system_same_as_user: data.system_same_as_user === true,
    wrap: data.wrap !== false,
    names_behavior: nb === 'none' || nb === 'force' || nb === 'always' ? nb : data.names === false ? 'none' : 'always',
    bos: str(data.bos),
  };
}

/** 渠道里存的模板：预设 id 或 ST JSON */
export function resolveInstruct(value: string | null | undefined): InstructTemplate {
  const raw = String(value ?? '').trim();
  if (raw.startsWith('{')) return parseInstructJson(raw) ?? INSTRUCT_PRESETS[DEFAULT_INSTRUCT];
  return INSTRUCT_PRESETS[raw] ?? INSTRUCT_PRESETS[DEFAULT_INSTRUCT];
}

export type TextMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * 拼 prompt。开头连续的 system 合成一段系统块；中途的 system（作者注释、深度提示）按 system 序列插入
 *（模板没有 system 序列或 system_same_as_user 时用 user 序列）。最后一条是助手（续写 / 预填）就不闭合，直接接着写。
 */
export function formatTextPrompt(messages: TextMessage[], tpl: InstructTemplate, names: { user: string; char: string }): { prompt: string; stop: string[] } {
  const nl = tpl.wrap ? '\n' : '';
  const named = tpl.names_behavior === 'always';
  const wrapSeq = (seq: string, body: string, suffix: string) => `${seq}${seq ? nl : ''}${body}${suffix}${tpl.wrap && !suffix.endsWith('\n') ? '\n' : ''}`;
  const sysSeq = tpl.system_same_as_user || !tpl.system_sequence ? tpl.input_sequence : tpl.system_sequence;
  const sysSuf = tpl.system_same_as_user || !tpl.system_sequence ? tpl.input_suffix : tpl.system_suffix;

  let i = 0;
  const head: string[] = [];
  while (i < messages.length && messages[i].role === 'system') { if (messages[i].content.trim()) head.push(messages[i].content.trim()); i++; }
  let out = tpl.bos;
  if (head.length) out += wrapSeq(tpl.system_sequence && !tpl.system_same_as_user ? tpl.system_sequence : (tpl.system_same_as_user ? tpl.input_sequence : ''), head.join('\n\n'), tpl.system_sequence && !tpl.system_same_as_user ? tpl.system_suffix : (tpl.system_same_as_user ? tpl.input_suffix : tpl.system_suffix || '\n\n'));

  const rest = messages.slice(i);
  const lastIsAssistant = rest.length > 0 && rest[rest.length - 1].role === 'assistant';
  let firstOutput = true;
  rest.forEach((message, index) => {
    const isLast = index === rest.length - 1;
    if (message.role === 'system') { out += wrapSeq(sysSeq, message.content, sysSuf); return; }
    if (message.role === 'user') { out += wrapSeq(tpl.input_sequence, named ? `${names.user}: ${message.content}` : message.content, tpl.input_suffix); return; }
    const seq = firstOutput && tpl.first_output_sequence ? tpl.first_output_sequence : tpl.output_sequence;
    firstOutput = false;
    const body = named && !message.content.startsWith(`${names.char}:`) ? `${names.char}: ${message.content}` : message.content;
    if (isLast) out += `${isLast && tpl.last_output_sequence ? tpl.last_output_sequence : seq}${seq ? nl : ''}${body}`; // 续写：不闭合
    else out += wrapSeq(seq, body, tpl.output_suffix);
  });
  if (!lastIsAssistant) {
    const seq = tpl.last_output_sequence || tpl.output_sequence;
    out += `${seq}${seq ? nl : ''}${named ? `${names.char}:` : ''}`;
  }

  const stop = new Set<string>();
  if (tpl.stop_sequence) stop.add(tpl.stop_sequence);
  if (tpl.input_sequence.trim()) stop.add(tpl.input_sequence.trim());
  if (named && names.user) stop.add(`\n${names.user}:`);
  return { prompt: out, stop: [...stop] };
}

import type { PresetParams } from '@/lib/resources';

// 采样参数表：[字段, ST 名称, 最小, 最大, 步长, 是否常用, 中文说明]
// 「简单功能」只露 core 的几项，「酒馆全功能」全部展开。
export type ParamField = { key: keyof PresetParams; label: string; min: number; max: number; step: number; core: boolean; help: string };

export const PARAM_FIELDS: ParamField[] = [
  { key: 'temperature', label: 'temperature', min: 0, max: 2, step: 0.05, core: true, help: '越高越放飞，越低越稳' },
  { key: 'topP', label: 'top_p', min: 0.05, max: 1, step: 0.01, core: true, help: '只在累计概率内取词' },
  { key: 'maxTokens', label: 'max_tokens', min: 16, max: 8192, step: 16, core: true, help: '单条回复长度上限' },
  { key: 'repetitionPenalty', label: 'repetition_penalty', min: 1, max: 2, step: 0.01, core: true, help: '压制复读' },
  { key: 'topK', label: 'top_k', min: 0, max: 200, step: 1, core: false, help: '0 = 不限' },
  { key: 'minP', label: 'min_p', min: 0, max: 1, step: 0.01, core: false, help: '过滤低概率词' },
  { key: 'typicalP', label: 'typical_p', min: 0, max: 1, step: 0.01, core: false, help: '1 = 关闭' },
  { key: 'repetitionPenaltyRange', label: 'rep_pen_range', min: 0, max: 8192, step: 1, core: false, help: '复读惩罚回看多少 tokens' },
  { key: 'repetitionPenaltySlope', label: 'rep_pen_slope', min: 0, max: 10, step: 0.1, core: false, help: '惩罚随距离衰减' },
  { key: 'presencePenalty', label: 'presence_penalty', min: -2, max: 2, step: 0.01, core: false, help: '鼓励换话题' },
  { key: 'frequencyPenalty', label: 'frequency_penalty', min: -2, max: 2, step: 0.01, core: false, help: '降低重复用词' },
  { key: 'seed', label: 'seed', min: -1, max: 2147483647, step: 1, core: false, help: '-1 = 随机' },
];

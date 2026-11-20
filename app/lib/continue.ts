// ST「继续」共用：续写提示与拼接规则（单聊 /api/messages/[id]/continue 与群聊共用）

// ST 默认的继续提示：[Continue your last message without repeating its original content.]
// 额外叮嘱别再输出状态栏：带状态栏的卡续写时模型常会再写一个，导致一条消息里出现两个。
export const CONTINUE_NUDGE = '[接着你上一条消息继续写下去，不要重复已经写过的内容，也不要再输出一遍状态栏。]';

export function joinContinue(base: string, more: string): string {
  if (!more) return base;
  if (!base || /\s$/.test(base) || /^[\s，。！？、；：,.!?;:）)」』”]/.test(more)) return base + more;
  return `${base}${/[。！？.!?」』”）)]$/.test(base) ? '\n' : ''}${more}`;
}

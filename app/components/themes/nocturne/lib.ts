// 夜幕主题的小工具：幕次推算、文案清洗。纯函数，服务端/客户端都能用。

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 1 → 一，12 → 十二，23 → 二十三（够用到 99） */
export function cnNumber(n: number): string {
  if (n <= 10) return CN[n] ?? String(n);
  if (n < 20) return `十${CN[n - 10]}`;
  if (n < 100) return `${CN[Math.floor(n / 10)]}十${n % 10 ? CN[n % 10] : ''}`;
  return String(n);
}

/** 每一幕的回合数（一来一回算两条消息） */
export const TURNS_PER_ACT = 12;

export type ActInfo = {
  /** 当前回合（≈ 消息数 / 2，向上取整） */
  turn: number;
  /** 当前幕（从 1 开始） */
  act: number;
  /** 当前幕内进度 0..1 */
  progress: number;
};

export function actInfo(messageCount: number): ActInfo {
  const turn = Math.max(1, Math.ceil(messageCount / 2));
  const act = Math.floor((turn - 1) / TURNS_PER_ACT) + 1;
  const inAct = (turn - 1) % TURNS_PER_ACT;
  return { turn, act, progress: Math.min(1, (inAct + 1) / TURNS_PER_ACT) };
}

/** 两位数编号：1 → 01 */
export const pad2 = (n: number) => String(n).padStart(2, '0');

/** 去掉 *动作* / ((OOC)) 等标记符号，只留可读文字（卡片摘要用） */
export function plain(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/\(\([^)]*\)\)|（（[^）]*））/g, '')
    .replace(/\*\*?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 取最后一句「台词」（没有就返回整段的结尾） */
export function lastLine(text: string | null | undefined): { lead: string; line: string } {
  const value = plain(text);
  const match = value.match(/^(.*?)(「[^」]+」)\s*$/);
  if (match) return { lead: match[1].trim(), line: match[2] };
  return { lead: '', line: value };
}

/** 估算片长：每回合约 1 分 50 秒，纯装饰 */
export function runtime(messageCount: number): string {
  const minutes = Math.max(1, Math.round(messageCount * 0.9));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${pad2(minutes % 60)}m`;
}

// ST 斜杠命令（STscript）的最常用子集：输入框里以 / 开头就按命令执行，| 串联多条。
export type SlashCommand = { name: string; arg: string };

export const SLASH_HELP: { cmd: string; desc: string }[] = [
  { cmd: '/sys 文本', desc: '插入旁白（按 system 发给模型，不触发回复）' },
  { cmd: '/send 文本', desc: '只发你的消息，不让角色回复' },
  { cmd: '/trigger', desc: '让角色接着回复（等于空输入点发送）' },
  { cmd: '/continue', desc: '接着最后一条角色消息往下写' },
  { cmd: '/regen', desc: '重新生成最后一条角色消息' },
  { cmd: '/impersonate 方向', desc: '让 AI 以你的身份写一句' },
  { cmd: '/hide 3-5', desc: '隐藏楼层（不发给模型），楼层号从 0 开始' },
  { cmd: '/unhide 3-5', desc: '取消隐藏' },
  { cmd: '/cut 3-5', desc: '删除这些楼层' },
  { cmd: '/del 2', desc: '删除最后 N 条（默认 1）' },
  { cmd: '/setinput 文本', desc: '把文本放进输入框' },
  { cmd: '/echo 文本', desc: '弹一条提示' },
];

const ALIASES: Record<string, string> = {
  sys: 'sys', nar: 'sys', narrator: 'sys', send: 'send', trigger: 'trigger', continue: 'continue', cont: 'continue',
  regen: 'regen', regenerate: 'regen', impersonate: 'impersonate', imp: 'impersonate', hide: 'hide', unhide: 'unhide',
  cut: 'cut', del: 'del', delete: 'del', setinput: 'setinput', echo: 'echo', help: 'help', '?': 'help',
};

export function isSlash(text: string): boolean {
  return /^\/[\w?]/.test(text.trim());
}

// 管道 | 拆分（{{…}} 和 {: :} 里的 | 不拆）；命名参数 key=value 去掉
export function parseSlash(text: string): SlashCommand[] {
  const out: SlashCommand[] = [];
  for (const part of text.split(/\|(?![^{]*\})/)) {
    const match = part.trim().match(/^\/([\w?]+)\s*([\s\S]*)$/);
    if (!match) continue;
    const name = ALIASES[match[1].toLowerCase()] ?? `?${match[1]}`;
    const arg = match[2].replace(/^(?:\w+=(?:"[^"]*"|\S+)\s+)+/, '').trim();
    out.push({ name, arg });
  }
  return out;
}

// ST 斜杠命令（STscript）的最常用子集：输入框里以 / 开头就按命令执行，| 串联多条。
export type SlashCommand = { name: string; arg: string; named: Record<string, string> };

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
  { cmd: '/setvar key=名字 值', desc: '设置聊天变量（{{getvar::名字}} 读取；全局用 /setglobalvar）' },
  { cmd: '/getvar 名字', desc: '读取聊天变量，结果可用 | 传给下一条（{{pipe}}）' },
  { cmd: '/addvar key=名字 值', desc: '数字相加、列表追加、文字拼接' },
  { cmd: '/incvar 名字', desc: '加 1（/decvar 减 1）' },
  { cmd: '/flushvar 名字', desc: '删除变量' },
  { cmd: '/listvar', desc: '列出全部聊天变量和全局变量' },
  { cmd: '/sendas name=名字 文本', desc: '以角色身份插一条消息，不生成' },
  { cmd: '/comment 文本', desc: '插入注释（只给你看，不发给模型）' },
  { cmd: '/gen 提示', desc: '带聊天上下文按提示生成一段文字，结果给下一条命令（{{pipe}}），不落库' },
  { cmd: '/genraw 提示', desc: '只用提示本身生成（不带聊天）' },
  { cmd: '/input 提示', desc: '弹出输入框，输入的文字给下一条命令' },
  { cmd: '/buttons labels=["是","否"] 提示', desc: '弹出按钮让你选，选中的文字给下一条命令' },
  { cmd: '/popup 文本', desc: '弹出提示框' },
  { cmd: '/qr 0', desc: '执行快捷回复栏的第 N 个按钮（从 0 开始；也可 label=按钮名 set=集名）' },
  { cmd: '/qr-list', desc: '列出快捷回复集；/qr-list 集名 列出这个集的按钮' },
  { cmd: '/qr-set 集名', desc: '全局切换这个快捷回复集（/qr-set-on、/qr-set-off）' },
  { cmd: '/qr-chatset 集名', desc: '只在本聊天切换（/qr-chatset-on、/qr-chatset-off）' },
  { cmd: '/bg 名字', desc: '换背景（按名字匹配背景库；锁定了就换这段故事的，否则换默认；不带参数看当前；/bg none 无背景）' },
  { cmd: '/lockbg', desc: '把当前背景锁定到这段故事（/unlockbg 解锁）' },
  { cmd: '/expression-set 表情', desc: '手动切换立绘表情，如 joy 或「开心」（/expression-list 列出全部）' },
];

const ALIASES: Record<string, string> = {
  sys: 'sys', nar: 'sys', narrator: 'sys', send: 'send', trigger: 'trigger', continue: 'continue', cont: 'continue',
  regen: 'regen', regenerate: 'regen', impersonate: 'impersonate', imp: 'impersonate', hide: 'hide', unhide: 'unhide',
  cut: 'cut', del: 'del', delete: 'del', setinput: 'setinput', echo: 'echo', help: 'help', '?': 'help',
  setvar: 'setvar', getvar: 'getvar', addvar: 'addvar', incvar: 'incvar', decvar: 'decvar', flushvar: 'flushvar', listvar: 'listvar',
  setglobalvar: 'setglobalvar', getglobalvar: 'getglobalvar', addglobalvar: 'addglobalvar', incglobalvar: 'incglobalvar',
  decglobalvar: 'decglobalvar', flushglobalvar: 'flushglobalvar',
  sendas: 'sendas', comment: 'comment', gen: 'gen', genraw: 'genraw', input: 'input', buttons: 'buttons', popup: 'popup',
  qr: 'qr', 'qr-list': 'qr-list', 'qr-set': 'qr-set', 'qr-set-on': 'qr-set-on', 'qr-set-off': 'qr-set-off',
  'qr-chatset': 'qr-chatset', 'qr-chatset-on': 'qr-chatset-on', 'qr-chatset-off': 'qr-chatset-off',
  bg: 'bg', background: 'bg', lockbg: 'lockbg', bglock: 'lockbg', unlockbg: 'unlockbg', bgunlock: 'unlockbg',
  'expression-set': 'expression-set', sprite: 'expression-set', emote: 'expression-set', 'expression-list': 'expression-list', expressions: 'expression-list',
};

/** 变量命令 → [作用域, 操作]（ST /setvar 等） */
export const VAR_COMMANDS: Record<string, ['chat' | 'global', 'set' | 'get' | 'add' | 'inc' | 'dec' | 'flush']> = {
  setvar: ['chat', 'set'], getvar: ['chat', 'get'], addvar: ['chat', 'add'], incvar: ['chat', 'inc'], decvar: ['chat', 'dec'], flushvar: ['chat', 'flush'],
  setglobalvar: ['global', 'set'], getglobalvar: ['global', 'get'], addglobalvar: ['global', 'add'], incglobalvar: ['global', 'inc'],
  decglobalvar: ['global', 'dec'], flushglobalvar: ['global', 'flush'],
};

export function isSlash(text: string): boolean {
  return /^\/[\w?]/.test(text.trim());
}

// 管道 | 拆分（{{…}} 和 {: :} 里的 | 不拆）；命名参数 key=value 去掉
export function parseSlash(text: string): SlashCommand[] {
  const out: SlashCommand[] = [];
  for (const part of text.split(/\|(?![^{]*\})/)) {
    const match = part.trim().match(/^\/([\w?][\w?-]*)\s*([\s\S]*)$/);
    if (!match) continue;
    const name = ALIASES[match[1].toLowerCase()] ?? `?${match[1]}`;
    const named: Record<string, string> = {};
    let rest = match[2];
    for (;;) {
      const kv = rest.match(/^\s*(\w+)=(?:"([^"]*)"|(\[[^\]]*\])|(\S+))(?:\s+|$)/);
      if (!kv) break;
      named[kv[1].toLowerCase()] = kv[2] ?? kv[3] ?? kv[4] ?? '';
      rest = rest.slice(kv[0].length);
    }
    out.push({ name, arg: rest.trim(), named });
  }
  return out;
}

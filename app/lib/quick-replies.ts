// ST Quick Reply v2：快捷回复集（set）→ 按钮（qr）。前后端共用的类型、ST JSON 导入导出、点击时的文字拼接。
// ST 的 QR 集格式：{ version: 2, name, disableSend, placeBeforeInput, injectInput, color, onlyBorderColor, qrList: [...] }

export type QrAuto = { startup: boolean; user: boolean; ai: boolean; chatChange: boolean; groupDraft: boolean };

export type QrItem = {
  id: number;
  label: string;
  title: string;
  message: string;
  hidden: boolean;
  auto: QrAuto;
  /** ST preventAutoExecute（默认开）：这个按钮引起的发送/回复不再触发别的自动执行 */
  preventAuto: boolean;
  /** 右键 / 长按弹出的子菜单：引用其它集（chain=也显示那个集的子菜单，ST isChained） */
  context: { setId: number; chain: boolean }[];
};

export type QrSet = {
  id: number;
  name: string;
  disableSend: boolean;
  placeBeforeInput: boolean;
  injectInput: boolean;
  color: string;
  onlyBorderColor: boolean;
  replies: QrItem[];
};

export const NO_AUTO: QrAuto = { startup: false, user: false, ai: false, chatChange: false, groupDraft: false };

export const AUTO_LABELS: [keyof QrAuto, string, string][] = [
  ['startup', '打开网站时', 'Execute on startup'],
  ['chatChange', '进入聊天时', 'Execute on chat change'],
  ['user', '玩家发消息后', 'Execute on user message'],
  ['ai', '角色回复后', 'Execute on AI message'],
  ['groupDraft', '群聊轮到角色前', 'Execute on group member draft'],
];

const bool = (value: unknown) => value === true || value === 1 || value === 'true';
const str = (value: unknown, max = 20000) => (typeof value === 'string' ? value : value == null ? '' : String(value)).slice(0, max);

export function normalizeAuto(raw: unknown): QrAuto {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { startup: bool(value.startup), user: bool(value.user), ai: bool(value.ai), chatChange: bool(value.chatChange), groupDraft: bool(value.groupDraft) };
}

export function normalizeItem(raw: unknown, index = 0): Omit<QrItem, 'id'> & { id?: number } {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const context = Array.isArray(value.context) ? value.context : [];
  return {
    id: Number.isInteger(value.id) ? Number(value.id) : undefined,
    label: str(value.label, 60) || `按钮 ${index + 1}`,
    title: str(value.title, 300),
    message: str(value.message),
    hidden: bool(value.hidden),
    auto: normalizeAuto(value.auto),
    preventAuto: value.preventAuto === undefined ? true : bool(value.preventAuto),
    context: context
      .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : {}))
      .filter((item) => Number.isInteger(Number(item.setId)) && Number(item.setId) > 0)
      .map((item) => ({ setId: Number(item.setId), chain: bool(item.chain) }))
      .slice(0, 20),
  };
}

/** ST 导出的 QR 集（v2；也认 v1 的 quickReplySlots） → 我们的结构；context 里的集按名字解析，找不到就丢掉 */
export function fromStSet(raw: unknown, setIdByName: (name: string) => number | null = () => null): { set: Omit<QrSet, 'id' | 'replies'>; replies: Omit<QrItem, 'id'>[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const list = Array.isArray(value.qrList) ? value.qrList : Array.isArray(value.quickReplySlots) ? value.quickReplySlots : null;
  if (!list) return null;
  const replies = list.map((item, index) => {
    const qr = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const ctx = Array.isArray(qr.contextList) ? qr.contextList : [];
    return {
      label: str(qr.label ?? qr.title, 60) || `按钮 ${index + 1}`,
      title: str(qr.title, 300),
      message: str(qr.message ?? qr.mes),
      hidden: bool(qr.isHidden),
      preventAuto: qr.preventAutoExecute === undefined ? true : bool(qr.preventAutoExecute),
      auto: {
        startup: bool(qr.executeOnStartup),
        user: bool(qr.executeOnUser),
        ai: bool(qr.executeOnAi),
        chatChange: bool(qr.executeOnChatChange),
        groupDraft: bool(qr.executeOnGroupMemberDraft),
      },
      context: ctx
        .map((entry) => {
          const link = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
          const name = str(link.set ?? link.setName, 120);
          const setId = name ? setIdByName(name) : null;
          return setId ? { setId, chain: bool(link.isChained) } : null;
        })
        .filter((entry): entry is { setId: number; chain: boolean } => !!entry),
    };
  });
  return {
    set: {
      name: str(value.name, 80) || '导入的快捷回复',
      disableSend: bool(value.disableSend),
      placeBeforeInput: bool(value.placeBeforeInput),
      injectInput: bool(value.injectInput),
      color: /^#[0-9a-f]{3,8}$/i.test(str(value.color)) ? str(value.color) : '',
      onlyBorderColor: bool(value.onlyBorderColor),
    },
    replies,
  };
}

/** 导出成 ST v2 格式（能直接拖进 SillyTavern 的 Quick Reply 扩展导入） */
export function toStSet(set: QrSet, setName: (id: number) => string | null): Record<string, unknown> {
  return {
    version: 2,
    name: set.name,
    disableSend: set.disableSend,
    placeBeforeInput: set.placeBeforeInput,
    injectInput: set.injectInput,
    color: set.color || 'transparent',
    onlyBorderColor: set.onlyBorderColor,
    qrList: set.replies.map((qr, index) => ({
      id: index + 1,
      showLabel: false,
      label: qr.label,
      title: qr.title,
      message: qr.message,
      contextList: qr.context.map((link) => ({ set: setName(link.setId), isChained: link.chain })).filter((link) => link.set),
      preventAutoExecute: qr.preventAuto,
      isHidden: qr.hidden,
      executeOnStartup: qr.auto.startup,
      executeOnUser: qr.auto.user,
      executeOnAi: qr.auto.ai,
      executeOnChatChange: qr.auto.chatChange,
      executeOnGroupMemberDraft: qr.auto.groupDraft,
      executeOnNewChat: false,
      automationId: '',
    })),
    idIndex: set.replies.length,
  };
}

/**
 * 点按钮时要做什么（ST QuickReplySet.execute）：
 *  - {{input}} 换成输入框里的文字
 *  - 「自动注入输入」：把输入框文字拼到按钮文字后面（勾了「放在输入前面」就是按钮文字在前）
 *  - 「不发送（填进输入框）」：只改输入框
 *  - 以 / 开头：当斜杠命令执行
 */
export function planQuickReply(set: Pick<QrSet, 'disableSend' | 'placeBeforeInput' | 'injectInput'>, message: string, input: string):
  { kind: 'input'; text: string } | { kind: 'slash'; text: string; clearInput: boolean } | { kind: 'send'; text: string; clearInput: boolean } {
  const usedInput = /\{\{input\}\}/i.test(message);
  let text = message.replace(/\{\{input\}\}/gi, () => input);
  const join = (a: string, b: string) => [a, b].filter((part) => part.trim()).join(' ');
  if (set.disableSend) {
    const merged = set.placeBeforeInput ? join(text, input) : join(input, text);
    return { kind: 'input', text: merged };
  }
  if (set.injectInput && input.trim()) text = set.placeBeforeInput ? join(text, input) : join(input, text);
  const clearInput = usedInput || (set.injectInput && !!input.trim());
  if (/^\s*\/[\w?]/.test(text)) return { kind: 'slash', text: text.trim(), clearInput };
  return { kind: 'send', text, clearInput };
}

/** 一组生效的集里的可见按钮，按集分组（ST 的 QR 栏，一集一段） */
export function visibleButtons(sets: QrSet[]): { set: QrSet; item: QrItem }[] {
  return sets.flatMap((set) => set.replies.filter((item) => !item.hidden).map((item) => ({ set, item })));
}

/** /qr 5、/qr label=打招呼：从可见按钮里找（ST 下标从 0 开始） */
export function findQuickReply(sets: QrSet[], spec: { index?: number; label?: string; set?: string }): { set: QrSet; item: QrItem } | null {
  const pool = spec.set ? sets.filter((set) => set.name === spec.set) : sets;
  if (spec.label) {
    for (const set of pool) {
      const item = set.replies.find((qr) => qr.label === spec.label);
      if (item) return { set, item };
    }
    return null;
  }
  if (spec.index === undefined) return null;
  const list = spec.set ? pool.flatMap((set) => set.replies.map((item) => ({ set, item }))) : visibleButtons(pool);
  return list[spec.index] ?? null;
}

export type QrState = { sets: QrSet[]; globalIds: number[]; scopeIds: number[] };

export function activeQrSets(state: QrState): QrSet[] {
  const on = new Set([...state.globalIds, ...state.scopeIds]);
  return state.sets.filter((set) => on.has(set.id));
}

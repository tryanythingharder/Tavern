// 后台导航：分类 → 子菜单。侧栏、手机顶部分类条、各子页标题都从这里读。
export type AdminNavItem = { href: string; label: string; desc?: string };
export type AdminNavGroup = { id: string; label: string; icon: string; items: AdminNavItem[] };

export const ADMIN_GROUPS: AdminNavGroup[] = [
  {
    id: 'home', label: '概览', icon: 'M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z',
    items: [{ href: '/admin', label: '运营概览', desc: '今日数据与待办' }],
  },
  {
    id: 'content', label: '内容管理', icon: 'M4 5h16v14H4zM8 9h8M8 13h5',
    items: [
      { href: '/admin/review', label: '广场审核', desc: '角色上架前的人工审核' },
      { href: '/admin/reports', label: '举报处理', desc: '玩家提交的举报' },
      { href: '/admin/content', label: '内容分级', desc: '18+ 开关、地区与年龄线' },
      { href: '/admin/announcement', label: '站内公告', desc: '顶部横幅通知' },
    ],
  },
  {
    id: 'users', label: '用户与交易', icon: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5 20a7 7 0 0 1 14 0',
    items: [
      { href: '/admin/users', label: '玩家', desc: '账号、点数与封禁' },
      { href: '/admin/orders', label: '订单', desc: '充值记录与补单' },
      { href: '/admin/codes', label: '卡密', desc: '兑换码批量生成' },
      { href: '/admin/invites', label: '邀请码', desc: '注册邀请码' },
    ],
  },
  {
    id: 'models', label: '模型', icon: 'M4 6h16v4H4zM4 14h16v4H4z',
    items: [
      { href: '/admin/channels', label: '渠道', desc: '上游线路与优先级' },
      { href: '/admin/models', label: '模型广场', desc: '玩家可选的模型' },
    ],
  },
  {
    id: 'billing', label: '计费与增长', icon: 'M3 6h18v12H3zM3 10h18M7 15h4',
    items: [
      { href: '/admin/settings/billing', label: '点数计费', desc: '每千 tokens 扣点与按模型定价' },
      { href: '/admin/settings/payment', label: '支付渠道', desc: '收款方式与点数单价' },
      { href: '/admin/settings/growth', label: '福利与增长', desc: '免费额度、首充、邀请返点' },
      { href: '/admin/settings/context', label: '上下文长度', desc: '默认窗口与全站封顶' },
    ],
  },
  {
    id: 'media', label: '扩展能力', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3 2-1-2-4-2 .5-1.5-1L15 4h-6l-.5 2.5-1.5 1L5 7l-2 4 2 1-2 1 2 4 2-.5 1.5 1L9 20h6l.5-2.5 1.5-1 2 .5 2-4z',
    items: [
      { href: '/admin/settings/image', label: '生图', desc: '对话里的「生图」按钮' },
      { href: '/admin/settings/tts', label: '语音朗读', desc: '消息朗读（TTS）' },
      { href: '/admin/settings/embedding', label: '向量记忆', desc: '长对话的记忆召回' },
      { href: '/admin/settings/mail', label: '邮件', desc: '验证邮件与找回密码' },
    ],
  },
  {
    id: 'services', label: '站点与服务', icon: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
    items: [
      { href: '/admin/services/legal', label: '运营主体与法务', desc: '协议页里的主体与联系方式' },
      { href: '/admin/services/stripe', label: 'Stripe 收款', desc: '信用卡在线支付' },
      { href: '/admin/services/storage', label: '媒体存储', desc: 'R2 / S3 对象存储' },
      { href: '/admin/services/backup', label: '异地备份', desc: '数据库与媒体每日备份' },
      { href: '/admin/services/alert', label: '错误告警', desc: '报错推送到群机器人' },
      { href: '/admin/services/moderation', label: '自动内容审核', desc: '违规内容自动拦截' },
      { href: '/admin/services/push', label: '浏览器推送', desc: 'PWA 通知密钥' },
      { href: '/admin/services/age', label: '年龄验证', desc: '需要验证地区的服务商' },
    ],
  },
  {
    id: 'system', label: '系统', icon: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h4',
    items: [{ href: '/admin/audit', label: '审计日志', desc: '管理员操作记录' }],
  },
];

export function isActiveHref(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
}

export function activeGroup(pathname: string): AdminNavGroup {
  return ADMIN_GROUPS.find((group) => group.items.some((item) => isActiveHref(pathname, item.href))) ?? ADMIN_GROUPS[0];
}

export function navItem(href: string): { group: AdminNavGroup; item: AdminNavItem } | null {
  for (const group of ADMIN_GROUPS) {
    const item = group.items.find((entry) => entry.href === href);
    if (item) return { group, item };
  }
  return null;
}

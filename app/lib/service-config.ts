import { getSetting, hasSetting } from '@/lib/settings';

// 「站点与服务」后台的字段注册表：每个字段 = app_settings 里的一个键 + 对应的环境变量兜底。
// 读取顺序：后台填写 > 环境变量 > 默认值。secret 字段只写不读，接口只回传「是否已配置 / 来源」。
// 新增一项配置：在这里加一行，再在使用处改成 serviceValue('键')。
export type ServiceField = {
  key: string;
  env?: string;
  label: string;
  hint?: string;
  placeholder?: string;
  secret?: boolean;
  kind?: 'text' | 'textarea' | 'select' | 'switch' | 'number';
  options?: { value: string; label: string }[];
  fallback?: string;
};

export type ServiceGroup = { id: string; title: string; intro: string; fields: ServiceField[] };

export const SERVICE_GROUPS: ServiceGroup[] = [
  {
    id: 'legal',
    title: '运营主体与法务',
    intro: '会显示在《用户协议》《隐私政策》和帮助页。填好并经法务确认后，打开「已审核」即可去掉模板提示。',
    fields: [
      { key: 'site.operatorName', label: '运营主体', placeholder: '例如：Yehua Studio LLC', hint: '公司或个人的法定名称' },
      { key: 'site.operatorAddress', label: '注册地址', placeholder: '选填' },
      { key: 'site.supportEmail', env: 'TAVERN_SUPPORT_EMAIL', label: '客服邮箱', placeholder: 'support@example.com' },
      { key: 'site.legalEmail', label: '法务与隐私邮箱', placeholder: '留空则用客服邮箱', hint: '数据删除、版权投诉、隐私请求的联系地址' },
      { key: 'site.jurisdiction', label: '适用法律与管辖地', placeholder: '例如：State of Delaware, USA', hint: '写进用户协议「争议解决」一节' },
      { key: 'site.legalUpdated', label: '条款最后更新日期', placeholder: 'YYYY-MM-DD' },
      { key: 'site.legalReviewed', label: '法务已审核', kind: 'switch', hint: '打开后，协议页不再显示「这是模板文本」' },
    ],
  },
  {
    id: 'stripe',
    title: 'Stripe 收款',
    intro: '填好后在「计费与增长 → 支付渠道」里选 Stripe。Webhook 地址填 https://你的域名/api/payments/stripe，订阅 checkout.session.completed。成人内容需先确认 Stripe 允许你的业务。',
    fields: [
      { key: 'payment.stripeKey', env: 'TAVERN_STRIPE_SECRET_KEY', label: 'Secret Key', secret: true, placeholder: 'sk_live_…' },
      { key: 'payment.stripeWebhookSecret', env: 'TAVERN_STRIPE_WEBHOOK_SECRET', label: 'Webhook 签名密钥', secret: true, placeholder: 'whsec_…' },
    ],
  },
  {
    id: 'storage',
    title: '媒体存储（R2 / S3）',
    intro: '头像、立绘、生图结果存到对象存储；不填就存在服务器本地磁盘（.data/media）。AWS S3、Cloudflare R2、Backblaze B2、MinIO 通用。',
    fields: [
      { key: 'storage.driver', env: 'TAVERN_STORAGE_DRIVER', label: '存储方式', kind: 'select', options: [{ value: '', label: '自动（配好 S3 就用 S3）' }, { value: 's3', label: 'S3 兼容对象存储' }, { value: 'local', label: '本地磁盘' }] },
      { key: 's3.endpoint', env: 'TAVERN_S3_ENDPOINT', label: 'Endpoint', placeholder: 'https://<account>.r2.cloudflarestorage.com' },
      { key: 's3.bucket', env: 'TAVERN_S3_BUCKET', label: 'Bucket' },
      { key: 's3.region', env: 'TAVERN_S3_REGION', label: 'Region', placeholder: 'auto', fallback: 'auto' },
      { key: 's3.prefix', env: 'TAVERN_S3_PREFIX', label: '路径前缀', placeholder: 'media/', fallback: 'media/' },
      { key: 's3.accessKey', env: 'TAVERN_S3_ACCESS_KEY', label: 'Access Key ID', secret: true },
      { key: 's3.secretKey', env: 'TAVERN_S3_SECRET_KEY', label: 'Secret Access Key', secret: true },
      { key: 'storage.keepLocal', env: 'TAVERN_STORAGE_KEEP_LOCAL', label: '上传后保留本地副本', kind: 'switch' },
    ],
  },
  {
    id: 'backup',
    title: '异地备份',
    intro: '服务器上用 cron 每天跑一次 npm run backup（例如 0 3 * * *）。填了这里的对象存储，备份会自动上传；不填只留在本机 .backups。建议用和媒体不同的 Bucket。',
    fields: [
      { key: 'backup.endpoint', label: 'Endpoint', placeholder: 'https://<account>.r2.cloudflarestorage.com' },
      { key: 'backup.bucket', label: 'Bucket' },
      { key: 'backup.region', label: 'Region', placeholder: 'auto', fallback: 'auto' },
      { key: 'backup.prefix', label: '路径前缀', placeholder: 'backups/', fallback: 'backups/' },
      { key: 'backup.accessKey', label: 'Access Key ID', secret: true },
      { key: 'backup.secretKey', label: 'Secret Access Key', secret: true },
      { key: 'backup.keepDays', env: 'TAVERN_BACKUP_KEEP_DAYS', label: '本机保留天数', kind: 'number', placeholder: '14', fallback: '14' },
    ],
  },
  {
    id: 'alert',
    title: '错误告警',
    intro: '服务端或前端报错时推送到群机器人（Slack、Discord、飞书、企业微信、钉钉都兼容）。同一错误 5 分钟内只推一次。',
    fields: [
      { key: 'alert.webhook', env: 'TAVERN_ALERT_WEBHOOK', label: 'Webhook 地址', secret: true, placeholder: 'https://hooks.slack.com/…' },
    ],
  },
  {
    id: 'moderation',
    title: '自动内容审核',
    intro: '角色发布、导入与对话消息会调用 OpenAI 免费的 moderation 接口；默认只拦截涉未成年性内容。接口出错时放行并告警。',
    fields: [
      { key: 'moderation.key', env: 'TAVERN_MODERATION_KEY', label: 'API Key', secret: true, placeholder: 'sk-…' },
      { key: 'moderation.url', env: 'TAVERN_MODERATION_URL', label: 'Base URL', placeholder: 'https://api.openai.com/v1', fallback: 'https://api.openai.com/v1' },
      { key: 'moderation.model', env: 'TAVERN_MODERATION_MODEL', label: '模型', placeholder: 'omni-moderation-latest', fallback: 'omni-moderation-latest' },
      { key: 'moderation.block', env: 'TAVERN_MODERATION_BLOCK', label: '拦截类别', placeholder: 'sexual/minors', fallback: 'sexual/minors', hint: '逗号分隔，例如 sexual/minors,self-harm/instructions' },
    ],
  },
  {
    id: 'push',
    title: '浏览器推送（PWA）',
    intro: 'VAPID 密钥首次使用时自动生成并保存，一般不用管。联系地址留空则用客服邮箱。',
    fields: [
      { key: 'push.subject', env: 'TAVERN_VAPID_SUBJECT', label: '联系地址', placeholder: 'mailto:support@example.com' },
    ],
  },
];

const FIELDS = new Map(SERVICE_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, field] as const)));

export function serviceField(key: string): ServiceField | undefined {
  return FIELDS.get(key);
}

// 读取：后台 > 环境变量 > 字段默认值
export function serviceValue(key: string): string {
  const field = FIELDS.get(key);
  const env = field?.env ? process.env[field.env]?.trim() ?? '' : '';
  return getSetting(key, env || field?.fallback || '').trim();
}

export function serviceSwitch(key: string): boolean {
  return ['1', 'true', 'on', 'yes'].includes(serviceValue(key).toLowerCase());
}

export function serviceSource(key: string): 'admin' | 'env' | 'none' {
  if (hasSetting(key)) return 'admin';
  const field = FIELDS.get(key);
  return field?.env && process.env[field.env]?.trim() ? 'env' : 'none';
}

// 法务页用的运营信息
export function legalInfo() {
  const support = serviceValue('site.supportEmail');
  return {
    operator: serviceValue('site.operatorName'),
    address: serviceValue('site.operatorAddress'),
    supportEmail: support,
    legalEmail: serviceValue('site.legalEmail') || support,
    jurisdiction: serviceValue('site.jurisdiction'),
    updated: serviceValue('site.legalUpdated'),
    reviewed: serviceSwitch('site.legalReviewed'),
  };
}

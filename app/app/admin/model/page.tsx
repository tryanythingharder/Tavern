import { redirect } from 'next/navigation';

// 旧「单线路配置」页已并入「渠道」页（/admin/channels）：
// 旧配置（环境变量 TAVERN_MODEL_* / 设置 model.*）原样保留，没有渠道时仍是生成的兜底线路；
// 渠道页会显示它是否在生效，并可一键「转为渠道」。旧链接、书签统一跳到渠道页。
export default function AdminModelPage() {
  redirect('/admin/channels');
}

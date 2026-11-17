// 浏览器端：把用户选的角色卡文件（PNG / JSON）变成 /api/characters/import 的请求体
export async function cardFileBody(file: File): Promise<{ png?: string; json?: string }> {
  if (/\.json$/i.test(file.name) || file.type === 'application/json') return { json: await file.text() };
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return { png: btoa(binary) };
}

export type ImportExtras = { loreEntries: number; regexScripts: number; depthPrompt: boolean; helperScripts: number; mvu: boolean; html: boolean };

export function describeExtras(extras?: ImportExtras | null): string {
  if (!extras) return '';
  const parts: string[] = [];
  if (extras.loreEntries) parts.push(`世界书 ${extras.loreEntries} 条`);
  if (extras.regexScripts) parts.push(`正则 ${extras.regexScripts} 条`);
  if (extras.depthPrompt) parts.push('深度提示');
  if (extras.html) parts.push('HTML 美化 / 状态栏');
  let text = parts.length ? `已带入：${parts.join('、')}。` : '';
  if (extras.helperScripts || extras.mvu) text += ' 卡里的酒馆助手脚本 / MVU 变量暂不执行（导出时原样保留）。';
  return text.trim();
}

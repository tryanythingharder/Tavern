// 酒馆助手（JS-Slash-Runner）角色卡脚本：从卡的原始 data.extensions 里读出来。
//   新版：extensions.tavern_helper = { scripts: ScriptTree[], variables }（也见过 [[key, value], ...] 的键值对写法）
//   旧版：extensions.TavernHelper_scripts = [{ type: 'script', value: {...} }] 或直接是脚本对象
// 文件夹（type: 'folder'）展开成里面的脚本；文件夹关掉时里面的脚本也不跑。
// 运行在每会话一个的隐藏沙盒里（public/sandbox/runner.html + components/helper-runner.tsx）。

export type HelperButton = { name: string; visible: boolean };
export type HelperScript = {
  id: string;
  name: string;
  content: string;
  info: string;
  enabled: boolean;
  buttons: HelperButton[];
  data: Record<string, unknown>;
  /** 平台自带 MVU 变量引擎（lib/mvu.ts），卡里打包的 MVU 框架脚本不再跑，免得重复改变量 */
  skipped?: 'mvu-framework';
};

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const MAX_SCRIPT = 256 * 1024;
const MAX_SCRIPTS = 32;

// MVU 框架本体：卡作者常把 MagVarUpdate 的打包文件作为一个脚本 import 进来
const MVU_FRAMEWORK_RE = /MagVarUpdate|magvarupdate|\/mvu\/(?:dist|artifact)|bundle\.js['"][^\n]*mvu|mvu[^\n]{0,40}bundle\.js/i;

function settingsOf(value: unknown): Obj | null {
  if (isObj(value)) return value;
  // 键值对设置：[['scripts', [...]], ['variables', {...}]]
  if (Array.isArray(value) && value.every((item) => Array.isArray(item) && item.length === 2 && typeof item[0] === 'string')) {
    return Object.fromEntries(value as [string, unknown][]);
  }
  return null;
}

function normalizeOne(raw: unknown, parentEnabled: boolean, out: HelperScript[], seen: Set<string>) {
  if (!isObj(raw)) return;
  const item = isObj(raw.value) && (raw.type === 'script' || raw.type === 'folder') ? { ...raw.value, type: raw.type } as Obj : raw;
  if (item.type === 'folder' || Array.isArray(item.scripts)) {
    const enabled = parentEnabled && item.enabled !== false;
    for (const child of (Array.isArray(item.scripts) ? item.scripts : [])) normalizeOne(child, enabled, out, seen);
    return;
  }
  const content = typeof item.content === 'string' ? item.content : '';
  if (!content.trim() || out.length >= MAX_SCRIPTS) return;
  let id = typeof item.id === 'string' && item.id ? item.id.slice(0, 80) : `script-${out.length + 1}`;
  while (seen.has(id)) id = `${id}-${out.length + 1}`;
  seen.add(id);
  const button = isObj(item.button) ? item.button : null;
  const rawButtons = Array.isArray(button?.buttons) ? button!.buttons : Array.isArray(item.buttons) ? item.buttons : [];
  const buttonsOn = button ? button.enabled !== false : true;
  const buttons = buttonsOn
    ? (rawButtons as unknown[])
        .filter(isObj)
        .map((b) => ({ name: String(b.name ?? '').slice(0, 40), visible: b.visible !== false }))
        .filter((b) => b.name)
        .slice(0, 12)
    : [];
  const script: HelperScript = {
    id,
    name: typeof item.name === 'string' && item.name ? item.name.slice(0, 80) : id,
    content: content.slice(0, MAX_SCRIPT),
    info: typeof item.info === 'string' ? item.info.slice(0, 2000) : '',
    enabled: parentEnabled && item.enabled !== false,
    buttons,
    data: isObj(item.data) ? item.data : {},
  };
  if (MVU_FRAMEWORK_RE.test(content)) script.skipped = 'mvu-framework';
  out.push(script);
}

export function helperScriptsFromRaw(raw: unknown): { scripts: HelperScript[]; variables: Obj } {
  const data = isObj(raw) ? raw : {};
  const ext = isObj(data.extensions) ? data.extensions : {};
  const scripts: HelperScript[] = [];
  const seen = new Set<string>();
  const settings = settingsOf(ext.tavern_helper);
  const list = settings?.scripts;
  if (Array.isArray(list)) for (const item of list) normalizeOne(item, true, scripts, seen);
  const old = ext.TavernHelper_scripts;
  const oldList = Array.isArray(old) ? old : isObj(old) ? Object.values(old) : [];
  for (const item of oldList) normalizeOne(item, true, scripts, seen);
  const variables = settings && isObj(settings.variables) ? settings.variables : isObj(ext.TavernHelper_characterScriptVariables) ? ext.TavernHelper_characterScriptVariables : {};
  return { scripts, variables };
}

/** 真正要在沙盒里跑的脚本（启用、非 MVU 框架） */
export function runnableScripts(scripts: HelperScript[]): HelperScript[] {
  return scripts.filter((script) => script.enabled && !script.skipped);
}

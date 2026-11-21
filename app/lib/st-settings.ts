// 从 SillyTavern 的 settings.json 读出「生成行为」里我们支持的项（纯函数，前端直接用）。
// ST 的位置：power_user.custom_stopping_strings / custom_stopping_strings_macro / trim_sentences /
// auto_continue / reasoning；world_info_settings.world_info_character_strategy；extension_settings.translate。
import type { GenPrefs, LoreStrategy } from '@/lib/gen-prefs';
import { TRANSLATE_LANGS, type TranslateAuto } from '@/lib/translation';

export type StSettingsImport = { patch: Partial<GenPrefs>; found: string[] };

const obj = (value: unknown): Record<string, any> | null => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : null);
const bool = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

// ST: world_info_insertion_strategy = { evenly: 0, character_first: 1, global_first: 2 }
const LORE_BY_NUM: Record<number, LoreStrategy> = { 0: 'evenly', 1: 'character_first', 2: 'global_first' };

export function genPrefsFromStSettings(raw: unknown, base: GenPrefs): StSettingsImport | null {
  const root = obj(raw);
  if (!root) return null;
  // 也接受只导出了 power_user 的片段
  const pu = obj(root.power_user) ?? (root.custom_stopping_strings !== undefined || root.reasoning || root.auto_continue ? root : null);
  const wi = obj(root.world_info_settings) ?? root;
  const tr = obj(obj(root.extension_settings)?.translate);
  const patch: Partial<GenPrefs> = {};
  const found: string[] = [];

  if (pu) {
    if (typeof pu.custom_stopping_strings === 'string' || Array.isArray(pu.custom_stopping_strings)) {
      let list: unknown = pu.custom_stopping_strings;
      if (typeof list === 'string') {
        try { list = list.trim() ? JSON.parse(list) : []; } catch { list = []; }
      }
      const items = Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
      patch.stopStrings = items;
      found.push(items.length ? `停止词 ${items.length} 个` : '停止词（空）');
    }
    const macro = bool(pu.custom_stopping_strings_macro);
    if (macro !== undefined) { patch.stopMacros = macro; found.push('停止词替换宏'); }
    const trim = bool(pu.trim_sentences);
    if (trim !== undefined) { patch.trimSentences = trim; found.push('裁剪句子'); }
    const ac = obj(pu.auto_continue);
    if (ac) {
      const target = Number(ac.target_length);
      patch.autoContinue = { enabled: bool(ac.enabled) ?? base.autoContinue.enabled, target: Number.isFinite(target) ? Math.max(0, Math.min(4096, Math.round(target))) : base.autoContinue.target };
      found.push('自动继续');
    }
    const rs = obj(pu.reasoning);
    if (rs) {
      const max = Number(rs.max_additions);
      patch.reasoning = {
        autoParse: bool(rs.auto_parse) ?? base.reasoning.autoParse,
        prefix: typeof rs.prefix === 'string' && rs.prefix.trim() ? rs.prefix.trim().slice(0, 40) : base.reasoning.prefix,
        suffix: typeof rs.suffix === 'string' && rs.suffix.trim() ? rs.suffix.trim().slice(0, 40) : base.reasoning.suffix,
        autoExpand: bool(rs.auto_expand) ?? base.reasoning.autoExpand,
        addToPrompts: bool(rs.add_to_prompts) ?? base.reasoning.addToPrompts,
        maxAdditions: Number.isFinite(max) ? Math.max(0, Math.min(50, Math.round(max))) : base.reasoning.maxAdditions,
      };
      found.push('思考内容');
    }
  }

  const strategy = Number(wi?.world_info_character_strategy);
  if (wi && wi.world_info_character_strategy !== undefined && LORE_BY_NUM[strategy]) {
    patch.loreStrategy = LORE_BY_NUM[strategy];
    found.push('世界书插入策略');
  }

  if (tr) {
    const codes = new Set(TRANSLATE_LANGS.map((item) => item.code));
    const autos: TranslateAuto[] = ['none', 'responses', 'inputs', 'both'];
    const target = typeof tr.target_language === 'string' && codes.has(tr.target_language) ? tr.target_language : base.translate.target;
    const auto = autos.includes(tr.auto_mode) ? (tr.auto_mode as TranslateAuto) : base.translate.auto;
    patch.translate = { ...base.translate, target, auto };
    found.push('消息翻译');
  }

  return found.length ? { patch, found } : null;
}

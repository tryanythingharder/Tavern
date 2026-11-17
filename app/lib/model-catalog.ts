import { getSetting, setSetting } from '@/lib/settings';

// 模型广场的展示信息（后台「模型广场」编辑）。价格不在这里：仍存 points.models（每千 tokens 扣多少点），
// 这样计费、预扣、结算只有一个来源。
export type ModelMeta = {
  name: string;      // 展示名，空则用模型 id
  summary: string;   // 一句话介绍
  tags: string[];    // 文笔 / 长上下文 / 便宜 …
  context: string;   // 上下文长度，展示用（如 200K）
  featured: boolean; // 推荐：排在最前
  hidden: boolean;   // 下架：广场和对话里都不能选
  sort: number;
};

export function emptyMeta(): ModelMeta {
  return { name: '', summary: '', tags: [], context: '', featured: false, hidden: false, sort: 0 };
}

function normalizeMeta(value: unknown): ModelMeta {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const str = (input: unknown, max: number) => String(input ?? '').trim().slice(0, max);
  const tags = Array.isArray(raw.tags) ? raw.tags : String(raw.tags ?? '').split(/[,，\s]+/);
  return {
    name: str(raw.name, 40),
    summary: str(raw.summary, 160),
    tags: tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 6).map((tag) => tag.slice(0, 12)),
    context: str(raw.context, 16),
    featured: raw.featured === true,
    hidden: raw.hidden === true,
    sort: Number.isFinite(Number(raw.sort)) ? Math.round(Number(raw.sort)) : 0,
  };
}

export function modelCatalogMeta(): Record<string, ModelMeta> {
  try {
    const data = JSON.parse(getSetting('models.catalog', '{}')) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(data).map(([id, meta]) => [id, normalizeMeta(meta)]));
  } catch {
    return {};
  }
}

export function saveModelCatalogMeta(entries: Record<string, unknown>): Record<string, ModelMeta> {
  const clean = Object.fromEntries(Object.entries(entries).filter(([id]) => id.trim()).map(([id, meta]) => [id.trim().slice(0, 120), normalizeMeta(meta)]));
  setSetting('models.catalog', JSON.stringify(clean));
  return clean;
}

export function isModelHidden(id: string): boolean {
  return modelCatalogMeta()[id]?.hidden === true;
}

// 详情页「来源与许可」：种子卡（owner_id 为空）按 id 从 PLAZA_SEEDS 查结构化来源。
// 不读数据库里的 creatorNotes，所以老库（种子早已写入、card_fields 里没有 source）也能显示，无需迁移。
import { PLAZA_SEEDS, type SeedSource } from '@/data/plaza-seeds';

const BY_ID = new Map<string, SeedSource>(PLAZA_SEEDS.filter((seed) => seed.source).map((seed) => [seed.id, seed.source as SeedSource]));

/** 用户自建卡（ownerId 非空）一律不显示，即使 id 撞上种子 id */
export function seedSourceFor(id: string, ownerId: number | null): SeedSource | null {
  if (ownerId !== null) return null;
  return BY_ID.get(id) ?? null;
}

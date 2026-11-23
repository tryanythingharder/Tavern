import fs from 'node:fs/promises';
import path from 'node:path';
import { getCharacterLook, listMessages, type DbCharacter } from '@/lib/db';
import { readMedia } from '@/lib/storage';

// 生图的人物一致性：找一张「这个角色长什么样」的图，作为参考图传给生图模型。
// 顺序：玩家设的定妆照 → 角色封面 → 角色头像 → 内置角色自带的立绘 → 这段对话里第一张「角色立绘」插图。
// 都没有就返回 null（第一张立绘画出来之后，后面的图就会以它为准）。

export type CharacterReference = { buffer: Buffer; source: 'look' | 'cover' | 'avatar' | 'builtin' | 'chat' };

async function loadUrl(url: string | null | undefined, requesterId: number): Promise<Buffer | null> {
  const value = (url ?? '').trim();
  if (!value) return null;
  const media = value.match(/^\/media\/([a-zA-Z0-9-]+\.[a-z0-9]+)$/);
  if (media) return (await readMedia(media[1], requesterId).catch(() => null))?.buffer ?? null;
  // 站内静态图（/characters/x.jpg 之类）；外链不去抓，免得被拿来做 SSRF
  if (/^\/[a-zA-Z0-9/_.-]+\.(png|jpe?g|webp)$/i.test(value) && !value.includes('..')) {
    return fs.readFile(path.join(process.cwd(), 'public', value)).catch(() => null);
  }
  return null;
}

// 上游多数只收 PNG，且图越大越慢：统一缩到 1024 以内转 PNG；sharp 不可用就原样给
async function normalize(buffer: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default;
    return await sharp(buffer).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  } catch {
    return buffer;
  }
}

type ImageAttachment = { kind?: string; url?: string; mode?: string; prompt?: string };
const parseAttachment = (raw: string | null | undefined): ImageAttachment | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ImageAttachment;
    return value?.kind === 'image' ? value : null;
  } catch {
    return null;
  }
};

/** 这段对话里已经画过的插图（从早到晚） */
export function chatImages(chatId: number): ImageAttachment[] {
  return listMessages(chatId).map((message) => parseAttachment(message.attachment)).filter((item): item is ImageAttachment => Boolean(item));
}

/** 角色本身有没有图（封面/头像/内置立绘）——给对话页显示「人物参考」用，不读文件 */
export function characterHasImage(character: DbCharacter): boolean {
  return Boolean(character.cover_image?.trim() || character.avatar_image?.trim() || character.owner_id === null);
}

export async function characterReference(character: DbCharacter, chatId: number, requesterId: number): Promise<CharacterReference | null> {
  const candidates: [CharacterReference['source'], string | null][] = [
    ['look', getCharacterLook(requesterId, character.id)],
    ['cover', character.cover_image],
    ['avatar', character.avatar_image],
    ['builtin', character.owner_id === null ? `/characters/${character.id}.jpg` : null],
  ];
  const firstPortrait = chatImages(chatId).find((item) => item.mode === 'character');
  if (firstPortrait?.url) candidates.push(['chat', firstPortrait.url]);
  for (const [source, url] of candidates) {
    const buffer = await loadUrl(url, requesterId);
    if (buffer && buffer.length > 0) return { buffer: await normalize(buffer), source };
  }
  return null;
}

/** 告诉生图模型参考图里是谁、哪些要保持不变 */
export function referenceLead(name: string): string {
  return `The reference image shows ${name}. Keep ${name}'s face, facial features, hairstyle, hair colour, age and build exactly the same as in the reference image; only change pose, expression, outfit or setting where the description below asks for it.`;
}

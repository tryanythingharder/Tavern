import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StorageDriver } from '@/lib/storage-drivers/types';

// 本地磁盘：.data/media。单机部署或开发时用；也是远端驱动的写入缓冲。
export const mediaDir = join(process.cwd(), '.data', 'media');

export const localDriver: StorageDriver = {
  id: 'local',
  label: '本地磁盘',
  configHint: '无需配置（.data/media）',
  configured: () => true,
  async put(name, body) {
    mkdirSync(mediaDir, { recursive: true });
    writeFileSync(join(mediaDir, name), body);
  },
  async get(name) {
    try {
      return readFileSync(join(mediaDir, name));
    } catch {
      return null;
    }
  },
  async delete(name) {
    try {
      unlinkSync(join(mediaDir, name));
    } catch {
      // 文件已经不在了
    }
  },
};

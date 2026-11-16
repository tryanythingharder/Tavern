// 媒体存储驱动接口。新增驱动：在 lib/storage-drivers/ 下写一个实现，并在 index.ts 的 DRIVERS 里登记。
// 文件名由 storage.ts 生成（uuid.ext），驱动只负责按名字存取删。
export interface StorageDriver {
  id: string;
  label: string;
  configHint: string;
  configured(): boolean;
  put(name: string, body: Buffer, contentType: string): Promise<void>;
  get(name: string): Promise<Buffer | null>;
  delete(name: string): Promise<void>;
}

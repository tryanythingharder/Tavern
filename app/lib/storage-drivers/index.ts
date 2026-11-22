import { localDriver } from '@/lib/storage-drivers/local';
import { s3Driver } from '@/lib/storage-drivers/s3';
import type { StorageDriver } from '@/lib/storage-drivers/types';
import { serviceValue } from '@/lib/service-config';

export type { StorageDriver } from '@/lib/storage-drivers/types';
export { localDriver, mediaDir } from '@/lib/storage-drivers/local';

// 驱动注册表：新驱动在这里加一行。顺序 = 自动选择时的优先级（local 放最后兜底）。
export const DRIVERS: StorageDriver[] = [s3Driver, localDriver];

// 当前驱动：TAVERN_STORAGE_DRIVER 指定且已配置就用它，否则自动选第一个已配置的。
export function activeDriver(): StorageDriver {
  const wanted = serviceValue('storage.driver').toLowerCase();
  const chosen = DRIVERS.find((item) => item.id === wanted);
  if (chosen?.configured()) return chosen;
  return DRIVERS.find((item) => item.configured()) ?? localDriver;
}

export function driverSummary() {
  const active = activeDriver().id;
  return DRIVERS.map((item) => ({ id: item.id, label: item.label, hint: item.configHint, configured: item.configured(), active: item.id === active }));
}

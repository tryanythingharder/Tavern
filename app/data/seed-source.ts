// 外部改编种子卡的结构化来源：详情页「来源与许可」用。原创卡不带 source。
export type License = 'CC BY 4.0' | 'CC BY-SA 4.0' | 'CC0 1.0';

export const LICENSE_URL: Record<License, string> = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
};

export type SeedSource = {
  /** 原卡标题 */
  title: string;
  author: string;
  url: string;
  license: License;
  licenseUrl: string;
  adapted: true;
};

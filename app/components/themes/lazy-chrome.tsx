'use client';

import dynamic from 'next/dynamic';

// 主题装饰层里的客户端部件按主题拆块：服务端只渲染当前主题，浏览器也只下载当前主题的那一块。
// （直接从服务端组件静态引用时，三个主题的客户端代码都会被打进对话页的同一个块里。）
const live = () => import('@/components/themes/folio/chat-live');
export const LazyFolioBookmarks = dynamic(() => live().then((m) => m.FolioBookmarks));
export const LazyFolioComposerTools = dynamic(() => live().then((m) => m.FolioComposerTools));
export const LazyFolioFolio = dynamic(() => live().then((m) => m.FolioFolio));
export const LazyFolioProgress = dynamic(() => live().then((m) => m.FolioProgress));
export const LazyFolioToc = dynamic(() => live().then((m) => m.FolioToc));
export const LazyStageChatChrome = dynamic(() => import('@/components/themes/stage/chat-chrome').then((m) => m.StageChatChrome));

import type { Theme } from '@/lib/theme';
import { FolioChatChrome } from '@/components/themes/folio/chat-chrome';
import { StageChatChrome } from '@/components/themes/stage/chat-chrome';

// 对话页的主题装饰层：场景底板、章节导轨、角色卡等。
// 消息流和输入框仍由 ChatRoom 渲染，主题用 CSS 重新排布它们。
export type ChatChromeData = {
  chatId: number;
  chatTitle: string;
  character: {
    id: string;
    name: string;
    author: string;
    hue: number;
    cover: string | null;
    tags: string[];
    hook: string;
    description: string;
    pace: string;
  };
  messageCount: number;
  bookmarks: number;
  memoryCovered: number;
  personaName: string | null;
  lorebookCount: number;
};

export function ThemeChatChrome({ theme, chrome }: { theme: Theme; chrome: ChatChromeData }) {
  if (theme === 'stage') return <StageChatChrome chrome={chrome} />;
  return <FolioChatChrome chrome={chrome} />;
}

// 酒馆助手的事件广播和动作类型：对话页静态引用这里，运行器本体（components/helper-runner.tsx）按需加载
export type HelperActions = {
  send: (text: string) => void;
  setInput: (text: string) => void;
  /** 对话页的斜杠命令执行器（lib/slash.ts）；有它就整条交给它，行为与玩家在输入框里打的一致 */
  slash?: (text: string) => Promise<void>;
  editMessage: (id: number, content: string) => Promise<void>;
};

export function emitHelperEvent(event: string, ...args: unknown[]) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tavern:helper', { detail: { event, args } }));
}

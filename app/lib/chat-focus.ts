// 沉浸模式的开关存在 localStorage 这个键里；首屏内联脚本和客户端按钮共用
export const CHAT_FOCUS_KEY = 'tavern:chat-focus';

export function chatFocusBootScript(richCard: boolean): string {
  return `(function(){try{var v=localStorage.getItem(${JSON.stringify(CHAT_FOCUS_KEY)});var on=v?v==='1':${richCard ? 'true' : 'false'};if(on)document.documentElement.setAttribute('data-chat-focus','');}catch(e){}})();`;
}

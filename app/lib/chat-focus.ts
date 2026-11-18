// 沉浸模式的开关存在 localStorage 这个键里；首屏内联脚本和客户端按钮共用
export const CHAT_FOCUS_KEY = 'tavern:chat-focus';
// 沉浸时侧边立绘（只给没有 HTML 美化的普通卡）：'1' = 显示，默认不显示
export const CHAT_PORTRAIT_KEY = 'tavern:chat-portrait';

export function chatFocusBootScript(richCard: boolean): string {
  return `(function(){try{var d=document.documentElement;var v=localStorage.getItem(${JSON.stringify(CHAT_FOCUS_KEY)});var on=v?v==='1':${richCard ? 'true' : 'false'};if(on)d.setAttribute('data-chat-focus','');if(!${richCard ? 'true' : 'false'}&&localStorage.getItem(${JSON.stringify(CHAT_PORTRAIT_KEY)})==='1')d.setAttribute('data-chat-portrait','');if(${richCard ? 'true' : 'false'})d.setAttribute('data-chat-rich','');else d.removeAttribute('data-chat-rich');}catch(e){}})();`;
}

// 沉浸模式的开关存在 localStorage 这个键里；首屏内联脚本和客户端按钮共用
export const CHAT_FOCUS_KEY = 'tavern:chat-focus';
// 沉浸时左侧「画面栏」（立绘 / 当前插图）：'open' 展开，'rail' 收成窄条；默认展开
export const CHAT_STAGE_KEY = 'tavern:chat-stage';
// 画面栏宽度（px），拖动右边缘调整
export const CHAT_STAGE_W_KEY = 'tavern:chat-stage-w';
export const STAGE_MIN_W = 240;

export function chatFocusBootScript(richCard: boolean, hasStage: boolean): string {
  const rich = richCard ? 'true' : 'false';
  const stage = hasStage ? 'true' : 'false';
  return `(function(){try{var d=document.documentElement;var v=localStorage.getItem(${JSON.stringify(CHAT_FOCUS_KEY)});var on=v?v==='1':${rich};if(on)d.setAttribute('data-chat-focus','');if(${rich})d.setAttribute('data-chat-rich','');else d.removeAttribute('data-chat-rich');if(${stage}){var s=localStorage.getItem(${JSON.stringify(CHAT_STAGE_KEY)})==='rail'?'rail':'open';d.setAttribute('data-chat-stage',s);var w=Number(localStorage.getItem(${JSON.stringify(CHAT_STAGE_W_KEY)}));if(w>=${STAGE_MIN_W})d.style.setProperty('--stage-open-w',w+'px');}else d.removeAttribute('data-chat-stage');}catch(e){}})();`;
}

// 对话页顶部（从 chat-room.tsx 拆出）：「加载更早消息」按钮 + 故事开场卡（封面、角色名、标题、玩家身份）
export function ChatHeader({ hasMore, loadingOlder, onLoadOlder, characterCover, characterHue, characterName, title, personaName }: {
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  characterCover: string | null;
  characterHue: number;
  characterName: string;
  title?: string;
  personaName: string;
}) {
  return (
    <>
      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <button className="p-btn p-btn--sm" type="button" disabled={loadingOlder} onClick={onLoadOlder}>
            {loadingOlder ? '加载中…' : '加载更早消息'}
          </button>
        </div>
      )}
      <section className={`p-rp-prologue${characterCover ? ' has-cover' : ''}`} style={{ ['--h' as string]: characterHue }}>
        {characterCover && <img className="rd-prologue-bg" src={characterCover} alt="" aria-hidden="true" />}
        <div className="rd-prologue-in">
          <div className="p-eyebrow">STORY · {characterName}</div>
          <h1>{title ?? '故事'}</h1>
          <p>你以「{personaName ?? '你'}」的身份进入这段故事</p>
          <small>开场</small>
        </div>
      </section>
    </>
  );
}

import { getTheme } from '@/lib/theme';

// 登录 / 注册右侧场景图：按主题换图和文案（书页用角色立绘，戏台保留雨夜霓虹房间）
const SCENES = {
  folio: {
    src: '/characters/lin-wanzhao.jpg',
    alt: '画廊昏暗灯下的女子，一段尚未写完的故事',
    label: '第一章 · 三年后的雨夜 · 新的读者',
    title: <>每一册书，<br />都等你写下第一句。</>,
    lead: '翻开扉页，故事从你开口那一刻才开始。',
  },
  stage: {
    src: '/auth-scene.jpg',
    alt: '窗外霓虹映进雨夜房间，新的故事等待开启',
    label: '雨夜 · 2077 · 新的身份',
    title: <>有些故事，<br />等你推门才开始。</>,
    lead: '城市还未入睡。今晚，你想成为谁？',
  },
} as const;

export async function AuthScene() {
  const theme = await getTheme();
  const scene = theme === 'stage' ? SCENES.stage : SCENES.folio;
  return (
    <aside className="p-auth-scene" data-scene={theme} aria-label={scene.alt}>
      <img className="p-auth-art" src={scene.src} alt={scene.alt} />
      <div className="p-auth-scene-copy">
        <div className="p-auth-scene-label">{scene.label}</div>
        <h2>{scene.title}</h2>
        <p>{scene.lead}</p>
      </div>
    </aside>
  );
}

'use client';
import { joinList } from '@/lib/i18n/runtime';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CATEGORIES } from '@/lib/catalog';
import type { CharacterView } from '@/lib/characters';
import { Modal, api } from '@/components/settings-ui';
import { Select } from '@/components/ui-select';

export function CharacterForm({ initial }: { initial?: CharacterView }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [hook, setHook] = useState(initial?.hook ?? '');
  const [greeting, setGreeting] = useState(initial?.greeting ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [pace, setPace] = useState(initial?.pace ?? '');
  const [tags, setTags] = useState(initial ? joinList(initial.tags, '，') : '');
  const [category, setCategory] = useState(initial?.category ?? '现代');
  const [nsfw, setNsfw] = useState(initial?.nsfw ?? false);
  const [coverData, setCoverData] = useState<string>(initial?.coverImage ?? '');
  const [avatarData, setAvatarData] = useState<string>(initial?.avatarImage ?? '');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [card, setCard] = useState({
    personality: initial?.card?.personality ?? '',
    scenario: initial?.card?.scenario ?? '',
    mesExample: initial?.card?.mesExample ?? '',
    systemPrompt: initial?.card?.systemPrompt ?? '',
    postHistory: initial?.card?.postHistory ?? '',
    creatorNotes: initial?.card?.creatorNotes ?? '',
  });
  const setCardField = (key: keyof typeof card, value: string) => setCard((prev) => ({ ...prev, [key]: value }));
  const advancedFilled = Object.values(card).filter((value) => value.trim()).length;
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const [alternate, setAlternate] = useState((initial?.alternateGreetings ?? []).map((opening) => `${opening.title}\n${opening.text}`).join('\n---\n'));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'draft' | 'published' | null>(null);
  const [saved, setSaved] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<number | null>(null);
  const [restore, setRestore] = useState<{ savedAt: number; data: Record<string, unknown> } | null>(null);
  const draftKey = `tavern-draft-${initial?.id ?? 'new'}`;
  const ready = useRef(false);

  const tagList = tags.split(/[,，\s]+/).map((tag) => tag.trim()).filter(Boolean).slice(0, 5);

  // 挂载时检查本地草稿：新建时提示恢复；编辑时只显示「有未提交的本地修改」
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const data = JSON.parse(raw) as Record<string, unknown> & { savedAt?: number };
        if (!initial) setRestore({ savedAt: Number(data.savedAt) || Date.now(), data });
        else setAutoSavedAt(Number(data.savedAt) || null);
      }
    } catch {
      // 本地存储不可用时忽略
    }
    ready.current = true;
  }, [draftKey, initial]);

  // 输入后 700ms 自动存到本地；有未处理的恢复提示时先不覆盖
  useEffect(() => {
    if (!ready.current || restore) return;
    const timer = setTimeout(() => {
      // 全空时不存，避免「丢弃」后立刻又写回一份空草稿
      if (!name.trim() && !hook.trim() && !greeting.trim() && !description.trim() && !alternate.trim()) return;
      const data = { name, hook, greeting, description, pace, tags, category, nsfw, alternate, card, savedAt: Date.now() };
      try {
        localStorage.setItem(draftKey, JSON.stringify(data));
        setAutoSavedAt(data.savedAt);
      } catch {
        // 隐私模式写不进去就只在内存里保留
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [name, hook, greeting, description, pace, tags, category, nsfw, alternate, card, draftKey, restore]);

  const applyRestore = () => {
    if (!restore) return;
    const data = restore.data;
    setName(String(data.name ?? ''));
    setHook(String(data.hook ?? ''));
    setGreeting(String(data.greeting ?? ''));
    setDescription(String(data.description ?? ''));
    setPace(String(data.pace ?? ''));
    setTags(String(data.tags ?? ''));
    setCategory(String(data.category ?? '现代'));
    setNsfw(Boolean(data.nsfw));
    setAlternate(String(data.alternate ?? ''));
    if (data.card && typeof data.card === 'object') setCard((prev) => ({ ...prev, ...(data.card as Record<string, string>) }));
    setRestore(null);
    setAutoSavedAt(restore.savedAt);
  };

  const discardRestore = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // 忽略
    }
    setRestore(null);
    setAutoSavedAt(null);
  };

  const submit = async (status: 'draft' | 'published') => {
    setBusy(status);
    setError('');
    setSaved(false);
    try {
      const payload = {
        name, hook, greeting, description, pace, tags: tagList, category, nsfw, status, alternateGreetings: alternate, card,
        coverData: coverData.startsWith('data:image/') ? coverData : undefined,
        avatarData: avatarData.startsWith('data:image/') ? avatarData : undefined,
      };
      // 草稿要等保存成功才删，失败时用户写的内容还能恢复
      const clearDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* 忽略 */ } };
      if (initial) {
        await api(`/api/characters/${initial.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        clearDraft();
        if (status === 'published') router.push(`/c/${initial.id}`);
        else { setSaved(true); router.refresh(); }
      } else {
        const { character } = await api<{ character: CharacterView }>('/api/characters', { method: 'POST', body: JSON.stringify(payload) });
        clearDraft();
        if (status === 'published') router.push(`/c/${character.id}`);
        else router.push(`/create?edit=${character.id}`);
      }
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const preview = {
    id: initial?.id ?? 'preview',
    name: name || '角色名',
    initial: Array.from(name || '新')[0] ?? '新',
    hue: initial?.hue ?? 210,
    ownerId: initial?.ownerId ?? 1,
  };

  const alternatePreviews = alternate
    .split(/\n\s*---\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      const lines = block.split('\n');
      const first = lines[0]?.trim() ?? '';
      const hasTitle = lines.length > 1 && first.length <= 20 && !/[。！？.!?]/.test(first);
      return { title: hasTitle ? first : `备用开场 ${index + 1}`, text: hasTitle ? lines.slice(1).join('\n').trim() : block };
    })
    .filter((item) => item.text)
    .slice(0, 8);

  const previewCard = (
    <div className="p-create-preview">
    <div className="creator-preview-player p-create-preview-body">
      <h3 className="p-create-preview-name">{name.trim() || '未命名角色'}</h3>
      <p className="p-create-preview-hook">{hook || '公开简介会显示在这里。'}</p>
      <div className="creator-preview-tags">
        <span className="p-pill p-pill--sm p-pill--outline">{category}</span>
        {tagList.filter((tag) => tag !== category).map((tag) => <span className="p-pill p-pill--sm p-pill--outline" key={tag}>{tag}</span>)}
      </div>
      {nsfw && <p className="p-small">已标记为需主动确认的内容 · 不会公开到广场</p>}
      <h4>人物与关系</h4>
      <p>{description || '补充角色的公开性格与人物关系。'}</p>
      <h4>互动节奏</h4>
      <p>{pace || '慢热 · 细节叙事。'}</p>
      <h4>第一幕</h4>
      <p className="p-create-preview-greeting">{greeting || '角色的第一段话会出现在这里。'}</p>
      {alternatePreviews.map((item) => (
        <div key={item.title + item.text.slice(0, 12)}>
          <h4>{item.title}</h4>
          <p>{item.text}</p>
        </div>
      ))}
      <p className="p-small">玩家身份：由玩家开始时选择 · 仅展示公开内容</p>
    </div>
    </div>
  );

  const missing = [!name.trim() && '名称', !hook.trim() && '剧情钩子', !greeting.trim() && '开场白'].filter(Boolean) as string[];
  const publishHint = missing.length ? `发布前还需要填写：${joinList(missing)}` : '可以发布了';
  return (
    <>
      <header className="p-page-title">
        <div>
          <h1>{initial ? '编辑角色' : '创建角色'}</h1>
          <p>把一个人物、一段关系和一个世界，写成可以进入的故事。</p>
        </div>
        <div className="p-page-title-actions">
          <Link className="p-btn" href="/create?tab=works">我的作品</Link>
          <button className="p-btn" type="button" onClick={() => setPreviewOpen(true)}>预览玩家视角</button>
        </div>
      </header>

      {restore && (
        <div className="p-notice" style={{ marginBottom: 16 }}>
          <div className="p-notice-main">
            <div className="p-notice-title">检测到未提交的本地草稿</div>
            <div>{new Date(restore.savedAt).toLocaleString('zh-CN')} 自动保存</div>
          </div>
          <button className="p-btn p-btn--sm" type="button" onClick={applyRestore}>恢复</button>
          <button className="p-btn p-btn--sm" type="button" onClick={discardRestore}>丢弃</button>
        </div>
      )}

      <div className="p-create-layout">
        <div className="p-create-main">
          {error && <p role="alert" className="p-form-error" style={{ marginBottom: 16 }}>{error}</p>}
          <div className="p-create-actions-bar">
            <button className="p-btn p-btn--primary" type="button" disabled={busy !== null || !name.trim() || !hook.trim() || !greeting.trim()} onClick={() => void submit('published')}>
              {busy === 'published' ? '提交中…' : initial ? '保存并发布' : '提交审核并发布'}
            </button>
            <button className="p-btn" type="button" disabled={busy !== null || !name.trim()} onClick={() => void submit('draft')}>
              {busy === 'draft' ? '保存中…' : '保存草稿'}
            </button>
            <a className="p-btn p-btn--ghost p-create-cancel" href={initial ? `/c/${initial.id}` : '/library'}>取消</a>
            <span className="p-small p-create-need">{publishHint}</span>
          </div>
          <section className="p-card p-card--pad">
            <h2 className="p-form-section-title">公开展示</h2>
            <p className="p-small creator-section-hint">名称、剧情简介与分类标签是玩家看见的内容；先写清这是谁、为什么值得进入故事。</p>

            <div className="p-create-media">
              <div className="p-create-avatar-wrap">
                <div className={`p-cover p-create-avatar${avatarData ? ' has-image' : ''}`} style={{ ['--h' as string]: initial?.hue ?? 210 }} data-initial={preview.initial} role="img" aria-label="角色形象">
                  {avatarData && <img src={avatarData} alt="" />}
                </div>
                <button className="p-btn p-btn--sm" type="button" onClick={() => avatarInput.current?.click()}>更换形象</button>
                {avatarData && <button className="p-text-btn" type="button" onClick={() => setAvatarData(initial?.avatarImage ?? '')}>恢复默认</button>}
                <input
                  ref={avatarInput}
                  aria-label="上传角色形象"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 8 * 1024 * 1024) {
                      setError('图片超过 8 MB，请换一张');
                      event.target.value = '';
                      return;
                    }
                    setError('');
                    const reader = new FileReader();
                    reader.onload = () => setAvatarData(String(reader.result ?? ''));
                    reader.readAsDataURL(file);
                    event.target.value = '';
                  }}
                />
              </div>
              <div className="p-field">
                <label className="p-label" htmlFor="create-name">角色名称</label>
                <input id="create-name" className="p-input" required value={name} maxLength={32} placeholder="例如：沈砚之" onChange={(event) => setName(event.target.value)} />
                <span className="p-hint">让玩家第一眼认出这个角色。</span>
              </div>
            </div>

            <div className="p-field">
              <label className="p-label">角色封面</label>
              <div className="p-create-cover-wrap">
                <div className={`p-cover p-create-cover${coverData ? ' has-image' : ''}`} style={{ ['--h' as string]: initial?.hue ?? 210 }} data-initial="封面" role="img" aria-label="角色封面">
                  {coverData && <img src={coverData} alt="" />}
                </div>
                <div className="p-create-cover-actions">
                  <button className="p-btn p-btn--sm" type="button" onClick={() => coverInput.current?.click()}>更换封面</button>
                  {coverData && <button className="p-text-btn" type="button" onClick={() => setCoverData(initial?.coverImage ?? '')}>恢复默认</button>}
                  <span className="p-hint">PNG / JPG / WebP，最大 8 MB；会作为角色封面。</span>
                </div>
                <input
                  ref={coverInput}
                  aria-label="上传角色封面"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 8 * 1024 * 1024) {
                      setError('图片超过 8 MB，请换一张');
                      event.target.value = '';
                      return;
                    }
                    setError('');
                    const reader = new FileReader();
                    reader.onload = () => setCoverData(String(reader.result ?? ''));
                    reader.readAsDataURL(file);
                    event.target.value = '';
                  }}
                />
              </div>
            </div>
            <div className="p-field">
              <label className="p-label" htmlFor="create-hook">一句话剧情钩子</label>
              <input id="create-hook" className="p-input" required value={hook} maxLength={90} placeholder="他记得所有人，却唯独忘了你。" onChange={(event) => setHook(event.target.value)} />
            </div>
            <div className="p-field">
              <label className="p-label" htmlFor="create-greeting">开场白</label>
              <textarea id="create-greeting" className="p-textarea" required rows={4} value={greeting} placeholder="用动作、场景和一句对白，把玩家带进故事。" onChange={(event) => setGreeting(event.target.value)} />
              <span className="p-hint">这是玩家看到的第一条消息，不是隐藏提示词。</span>
            </div>
          </section>

          <section className="p-card p-card--pad">
            <h2 className="p-form-section-title">角色行为</h2>
            <p className="p-small creator-section-hint">角色描述会进入系统提示，也会在玩家预览中公开；私有指令请放到角色卡高级字段里。</p>

            <div className="p-field">
              <label className="p-label" htmlFor="create-description">角色描述</label>
              <textarea id="create-description" className="p-textarea" rows={4} value={description} placeholder="外貌、背景、说话方式、在意什么。" onChange={(event) => setDescription(event.target.value)} />
              <span className="p-hint">进入上下文模板的「角色描述」。</span>
            </div>

            <div className="p-field-row">
              <div className="p-field">
                <label className="p-label" htmlFor="create-pace">互动节奏</label>
                <input id="create-pace" className="p-input" value={pace} maxLength={120} placeholder="慢热 · 细节叙事" onChange={(event) => setPace(event.target.value)} />
              </div>
              <div className="p-field">
                <label className="p-label" htmlFor="create-category">题材</label>
                <Select id="create-category" className="p-select" value={category} onChange={(event) => setCategory(event.target.value)}>
                  {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              </div>
            </div>

            <div className="p-field">
              <label className="p-label" htmlFor="create-tags">标签</label>
              <input id="create-tags" className="p-input" value={tags} placeholder="民国，悬疑，慢热" onChange={(event) => setTags(event.target.value)} />
              <span className="p-hint">用逗号分隔，最多 12 个。</span>
            </div>

            <div className="p-field">
              <label className="p-label" htmlFor="create-alternate">备用开场</label>
              <textarea id="create-alternate" className="p-textarea" rows={4} value={alternate} placeholder={'另一段开场白…\n---\n再一段…'} onChange={(event) => setAlternate(event.target.value)} />
              <span className="p-hint">每段用一行 --- 分隔；第一行很短时会被当作这段开场的标题。</span>
            </div>

            <label className="p-check">
              <input type="checkbox" checked={nsfw} onChange={(event) => setNsfw(event.target.checked)} />
              <span>包含成人向内容<span className="p-small">开启后默认不会出现在普通推荐中，需要玩家主动确认显示。</span></span>
            </label>
          </section>

          <details className="p-card p-card--pad cf-adv" open={advancedFilled > 0}>
            <summary className="cf-adv-sum">
              <span className="p-form-section-title">高级 · SillyTavern 卡字段</span>
              <span className="p-small">{advancedFilled ? `已填 ${advancedFilled} 项` : '可选，导入 ST 卡时会自动填好'}</span>
            </summary>
            <p className="p-small creator-section-hint">这些字段和 ST V2 卡一一对应，导出时原样写回。支持 {'{{char}}'}、{'{{user}}'}；系统提示与后置指令可用 {'{{original}}'} 引用预设原文。玩家在「我的 → 角色卡覆盖」里写的同名字段会优先生效。</p>
            <div className="p-field">
              <label className="p-label" htmlFor="cf-personality">性格（personality）</label>
              <textarea id="cf-personality" className="p-textarea" rows={3} maxLength={20000} value={card.personality} placeholder="嘴硬心软；生气时反而更客气。" onChange={(event) => setCardField('personality', event.target.value)} />
            </div>
            <div className="p-field">
              <label className="p-label" htmlFor="cf-scenario">场景（scenario）</label>
              <textarea id="cf-scenario" className="p-textarea" rows={3} maxLength={20000} value={card.scenario} placeholder="1936 年冬，上海法租界的一间旧书店。" onChange={(event) => setCardField('scenario', event.target.value)} />
            </div>
            <div className="p-field">
              <label className="p-label" htmlFor="cf-mes">对话示例（mes_example）</label>
              <textarea id="cf-mes" className="p-textarea cf-mono" rows={6} maxLength={30000} value={card.mesExample} placeholder={'<START>\n{{user}}：你好。\n{{char}}：*抬眼看了你一下* 「打烊了。」'} onChange={(event) => setCardField('mesExample', event.target.value)} />
              <span className="p-hint">每段以 &lt;START&gt; 开头，只用来教模型说话的口吻，不会当作真实发生过的剧情。</span>
            </div>
            <div className="p-field">
              <label className="p-label" htmlFor="cf-system">系统提示（system_prompt）</label>
              <textarea id="cf-system" className="p-textarea cf-mono" rows={3} maxLength={20000} value={card.systemPrompt} placeholder="留空则使用玩家预设的主提示词。" onChange={(event) => setCardField('systemPrompt', event.target.value)} />
            </div>
            <div className="p-field">
              <label className="p-label" htmlFor="cf-post">后置指令（post_history_instructions）</label>
              <textarea id="cf-post" className="p-textarea cf-mono" rows={2} maxLength={20000} value={card.postHistory} placeholder="放在对话历史之后，常用于强调文风或禁止事项。" onChange={(event) => setCardField('postHistory', event.target.value)} />
            </div>
            <div className="p-field">
              <label className="p-label" htmlFor="cf-notes">作者备注（creator_notes）</label>
              <textarea id="cf-notes" className="p-textarea" rows={2} maxLength={20000} value={card.creatorNotes} placeholder="给玩家看的玩法说明，不会发给模型。" onChange={(event) => setCardField('creatorNotes', event.target.value)} />
            </div>
          </details>

          <div className="p-form-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="p-btn p-btn--primary" type="button" disabled={busy !== null || !name.trim() || !hook.trim() || !greeting.trim()} onClick={() => void submit('published')}>
              {busy === 'published' ? '提交中…' : initial ? '保存并发布' : '提交审核并发布'}
            </button>
            <button className="p-btn" type="button" disabled={busy !== null || !name.trim()} onClick={() => void submit('draft')}>
              {busy === 'draft' ? '保存中…' : '保存草稿'}
            </button>
            <a className="p-btn p-btn--ghost p-create-cancel" href={initial ? `/c/${initial.id}` : '/library'}>取消</a>
            <span className="p-small p-create-need">{publishHint}</span>
            {saved && <span className="p-small">草稿已保存</span>}
            {autoSavedAt && !saved && <span className="p-small">本地自动保存 · {new Date(autoSavedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
            {initial && <span className="p-small">当前状态：{initial.status === 'draft' ? '草稿' : initial.status === 'archived' ? '已下架' : '已发布'}</span>}
          </div>
          <div className="p-form-error" hidden={!error}>{error}</div>
        </div>

        <aside className="p-create-side">
          <section className="p-card p-card--pad">
            <h2 className="p-form-section-title">玩家视角 · 实时预览</h2>
            <p className="p-small">仅展示公开内容，不含私有生成设定。</p>
            {previewCard}
          </section>
        </aside>
      </div>

      {previewOpen && (
        <Modal
          title="玩家视角"
          onClose={() => setPreviewOpen(false)}
          footer={<button className="btn btn--sm" type="button" onClick={() => setPreviewOpen(false)}>关闭</button>}
        >
          <p className="small" style={{ marginTop: 0 }}>玩家在详情页会看到的内容，不含私有生成设定。</p>
          {previewCard}
        </Modal>
      )}
    </>
  );
}

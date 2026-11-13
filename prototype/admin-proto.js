(() => {
    'use strict';
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const content = $('.p-acontent');
    const toolbar = $('.p-atoolbar');
    const toolbarTitle = $('.p-atoolbar h1');
    const toolbarSub = $('.p-atoolbar-sub');
    const toolbarActions = $('.p-atoolbar-actions');
    if (!content || !toolbar) return;
    const initialOverview = content.innerHTML;
    const initialActions = toolbarActions.innerHTML;
    const state = { plazaTab: 'pending', orderStatus: 'all', orderQuery: '', playerQuery: '', codes: [], invites: [], announcement: localStorage.getItem('rp-site-announcement') ?? '欢迎来到酒馆。请友善对待每一位创作者和玩家。' };
    const meta = {
        overview: ['概览', '示例数据 · 静态演示'],
        plaza: ['广场审核', '审核新作品与版本更新，通过后才会出现在广场。'],
        reports: ['举报处理', '玩家举报与安全处置。'],
        announcement: ['公告', '编辑玩家端顶部公告，留空关闭。'],
        players: ['玩家', '查看余额、充值、封禁和令牌状态。'],
        orders: ['订单', '查看充值订单与导出记录。'],
        codes: ['卡密', '批量生成和查看点数兑换卡密。'],
        invites: ['邀请码', '管理邀请制注册与一次性邀请码。'],
        gateway: ['模型与网关', '运行时网关、默认模型、模型白名单与计费。'],
        channels: ['渠道', '查看和测试上游渠道。'],
        audit: ['审计日志', '后台敏感操作留痕。'],
    };

    const toast = message => {
        $('.admin-toast')?.remove();
        const el = document.createElement('div');
        el.className = 'admin-toast';
        el.setAttribute('role', 'status');
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3200);
    };

    // 本地演示数据可真实导出：生成 JSON 文件下载，不经过任何服务端
    const downloadFile = (name, rows) => {
        const blob = new Blob([JSON.stringify({exportedAt:new Date().toISOString(),rows},null,2)],{type:'application/json'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = name;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast(`已导出 ${name}`);
    };

    const dialog = (title, body, { confirm = '保存', cancel = '取消', onConfirm = null, danger = false } = {}) => {
        const overlay = document.createElement('div');
        overlay.className = 'p-modal-root';
        overlay.innerHTML = `<section class="p-modal" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title">
            <button class="p-modal-close" type="button" aria-label="关闭弹窗">×</button>
            <h3 id="admin-dialog-title">${esc(title)}</h3>
            <div class="p-modal-body">${body}</div>
            <div class="p-modal-actions"><button class="p-btn" type="button" data-cancel>${esc(cancel)}</button><button class="p-btn ${danger ? 'p-btn--danger' : 'p-btn--primary'}" type="button" data-confirm>${esc(confirm)}</button></div>
        </section>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        $('.p-modal-close', overlay).onclick = close;
        $('[data-cancel]', overlay).onclick = close;
        $('[data-confirm]', overlay).onclick = () => {
            if (onConfirm?.(overlay, close) === false) return;
            if (onConfirm) return;
            close();
        };
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        overlay.addEventListener('keydown', e => {
            if (e.key === 'Escape') { close(); return; }
            if (e.key !== 'Tab') return;
            const focusables = [...overlay.querySelectorAll('button, [href], input, select, textarea')].filter(el => !el.disabled);
            if (!focusables.length) return;
            const first = focusables[0], last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        });
        setTimeout(() => $('.p-modal-close', overlay).focus(), 0);
        return { overlay, close };
    };

    // The admin toolbar already renders the page title, description and primary action.
    const viewHead = () => '';

    const kpis = items => `<div class="admin-kpis">${items.map(([label,value,note]) => `<div class="admin-kpi"><div class="admin-kpi-label">${label}</div><div class="admin-kpi-value">${value}</div>${note ? `<div class="admin-kpi-note">${note}</div>` : ''}</div>`).join('')}</div>`;

    const table = (headers, rows) => {
        const body = Array.isArray(rows) ? rows.join('') : rows;
        return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${headers.length}"><div class="admin-empty">没有记录</div></td></tr>`}</tbody></table></div>`;
    };

    let plazaItems = [
        {id:'p1',name:'长夜观山',author:'青梧',kind:'新提交',age:'2 小时前',nsfw:false,cover:'山',hue:24,desc:'守一城旧事，也等一个愿意听你说完的人。',greeting:'山门落雪。他听见脚步，没有回头。'},
        {id:'p2',name:'星港列车长',author:'江晚舟',kind:'新提交',age:'5 小时前',nsfw:false,cover:'星',hue:280,desc:'末班列车驶离星港，他把最后一张车票留给了你。',greeting:'车门即将关闭。列车长低头看向你：「这张票，还来得及。」'},
        {id:'p3',name:'雨夜便利店',author:'阿九',kind:'版本更新',age:'昨天 21:40',nsfw:true,cover:'雨',hue:160,desc:'凌晨两点的便利店，她只在你值夜班时出现。',greeting:'自动门开了。她把伞收起来，抖落一地雨水。'},
    ];
    let selectedPlaza = plazaItems[0].id;

    const renderPlaza = () => {
        const item = plazaItems.find(x => x.id === selectedPlaza) || plazaItems[0];
        return `${viewHead('广场审核','审核新作品与版本更新，通过后才会出现在广场。','<button class="p-btn" data-action="plaza-refresh">刷新队列</button>')}
            <div class="p-tabs" role="tablist"><button data-plaza-tab="pending" aria-selected="${state.plazaTab==='pending'}">待审 ${plazaItems.length}</button><button data-plaza-tab="update" aria-selected="${state.plazaTab==='update'}">待审更新 1</button><button data-plaza-tab="approved" aria-selected="${state.plazaTab==='approved'}">已通过</button></div>
            <div class="admin-review"><div class="admin-review-list">${plazaItems.length ? plazaItems.map(x=>`<div class="admin-review-row ${x.id===selectedPlaza?'is-active':''}" role="button" tabindex="0" data-review="${x.id}"><div class="p-cover p-qthumb" style="--h:${x.hue}" data-initial="${x.cover}"></div><div class="p-row-main"><div class="p-row-title">${esc(x.name)}</div><div class="p-row-sub">@${esc(x.author)} · ${x.kind} · ${x.age}</div></div><span class="admin-row-actions"><button class="p-btn p-btn--sm p-btn--primary" data-approve="${x.id}">通过</button><button class="p-btn p-btn--sm p-btn--danger" data-reject="${x.id}">拒绝</button></span><span class="p-pill p-pill--sm ${x.nsfw?'p-pill--warn':'p-pill--outline'}">${x.nsfw?'NSFW':'普通'}</span></div>`).join('') : '<div class="admin-empty">没有待审作品</div>'}</div>
            ${item ? `<aside class="p-card admin-review-preview"><div class="p-cover admin-review-cover" style="--h:${item.hue}" data-initial="${item.cover}"></div><h3>${esc(item.name)}</h3><div class="admin-review-meta"><span class="p-pill p-pill--sm p-pill--outline">@${esc(item.author)}</span><span class="p-pill p-pill--sm ${item.nsfw?'p-pill--warn':'p-pill--ok'}">${item.nsfw?'含成人内容':'普通内容'}</span><span class="p-pill p-pill--sm p-pill--outline">${esc(item.kind)}</span></div><div class="admin-review-text">${esc(item.desc)}<br><br>${esc(item.greeting)}</div><div class="admin-review-actions"><button class="p-btn p-btn--primary" data-approve="${item.id}">通过</button><button class="p-btn p-btn--danger" data-reject="${item.id}">拒绝</button></div></aside>` : ''}</div>`;
    };

    const renderReports = () => {
        const reports = [
            ['未标记的成人内容','沈砚之','@匿名玩家','2 小时前','open'],
            ['侵犯版权或未经授权转载','长夜观山','@白露未晞','昨天','open'],
            ['骚扰、仇恨或危险内容','雨夜便利店','@青柠汽水','2 天前','open'],
            ['其他','星港列车长','@老周','3 天前','resolved'],
        ];
        return `${viewHead('举报处理','玩家举报与安全处置。','<button class="p-btn" data-action="reports-refresh">刷新</button>')}
            ${kpis([['待处理',3,'均未超过 24 小时'],['今日已处理',8,'较昨日 +2'],['被举报作品',3,'其中 NSFW 1 件'],['处理率','92%','近 7 天']])}
            <div class="p-card">${table(['作品','举报人','原因','时间','状态','操作'],reports.map(([reason,work,reporter,time,status])=>`<tr><td><strong>${esc(work)}</strong></td><td>${esc(reporter)}</td><td>${esc(reason)}</td><td>${time}</td><td><span class="p-pill p-pill--sm ${status==='open'?'p-pill--warn':'p-pill--ok'}">${status==='open'?'待处理':'已处理'}</span></td><td><div class="admin-actions"><button class="p-btn p-btn--sm" data-report-action="dismiss">忽略</button><button class="p-btn p-btn--sm" data-report-action="nsfw">标记 NSFW</button><button class="p-btn p-btn--sm p-btn--danger" data-report-action="remove">下架</button></div></td></tr>`))}</div>`;
    };

    const players = [
        ['林见白','linjianbai','1,240 点','正常','2026-03-12'],
        ['青梧','qingwu','8,640 点','正常','2026-01-08'],
        ['白露未晞','bailu','320 点','正常','2026-04-19'],
        ['江晚舟','jiangwanzhou','0 点','已封禁','2026-02-02'],
        ['苏叶','suye','12,000 点','正常','2025-12-26'],
    ];
    const renderPlayers = () => `${viewHead('玩家','查看余额、充值、封禁和令牌状态。','<button class="p-btn" data-action="players-export">导出玩家</button>')}
        <div class="p-card"><div class="admin-toolbar"><label class="p-search"><input class="p-input" id="player-query" type="search" placeholder="搜索昵称、用户名" value="${esc(state.playerQuery)}" aria-label="搜索玩家"></label><select class="p-select" aria-label="状态筛选"><option>全部状态</option><option>正常</option><option>已封禁</option></select><button class="p-btn p-btn--sm" data-action="player-search">搜索</button></div>${table(['玩家','用户名','余额','状态','注册时间','操作'],players.filter(([name,handle])=>!state.playerQuery||`${name} ${handle}`.includes(state.playerQuery)).map(([name,handle,balance,status,joined])=>`<tr><td><strong>${name}</strong></td><td>@${handle}</td><td>${balance}</td><td><span class="p-pill p-pill--sm ${status==='正常'?'p-pill--ok':'p-pill--danger'}">${status}</span></td><td>${joined}</td><td><div class="admin-actions"><button class="p-btn p-btn--sm" data-player-recharge="${handle}">充值</button><button class="p-btn p-btn--sm" data-player-toggle="${handle}">${status==='正常'?'封禁':'解封'}</button></div></td></tr>`))}</div>`;

    const orders = [
        ['#261028-0842','林见白','¥1,000','120,000 点','已支付','14:32'],
        ['#261028-0839','青梧','¥300','33,000 点','已支付','14:07'],
        ['#261028-0831','白露未晞','¥100','10,000 点','已支付','13:41'],
        ['#261028-0827','江晚舟','¥30','3,000 点','待支付','13:12'],
        ['#261028-0809','苏叶','¥100','10,000 点','已退款','10:38'],
    ];
    const renderOrders = () => {
        const rows = orders.filter(([id,name,,,status])=>(state.orderStatus==='all'||status===state.orderStatus)&&(!state.orderQuery||`${id} ${name}`.toLowerCase().includes(state.orderQuery.toLowerCase())));
        return `${viewHead('订单','查看充值订单与导出记录。','<button class="p-btn" data-action="orders-export">导出当前筛选</button>')}
        ${kpis([['今日实收','¥2,860','12 笔订单'],['待支付','1 笔','¥30'],['退款','¥100','1 笔'],['本月收入','¥42,680','较上月 +8.2%']])}
        <div class="p-card"><div class="admin-toolbar"><div class="p-tabs"><button data-order-status="all" aria-selected="${state.orderStatus==='all'}">全部</button><button data-order-status="已支付" aria-selected="${state.orderStatus==='已支付'}">已支付</button><button data-order-status="待支付" aria-selected="${state.orderStatus==='待支付'}">待支付</button><button data-order-status="已退款" aria-selected="${state.orderStatus==='已退款'}">已退款</button></div><label class="p-search"><input class="p-input" id="order-query" type="search" placeholder="订单号或玩家" value="${esc(state.orderQuery)}" aria-label="搜索订单"></label></div>${table(['订单号','玩家','金额','点数','状态','时间','操作'],rows.map(([id,name,amount,points,status,time])=>`<tr><td>${id}</td><td>${name}</td><td>${amount}</td><td>${points}</td><td><span class="p-pill p-pill--sm ${status==='已支付'?'p-pill--ok':status==='待支付'?'p-pill--warn':'p-pill--danger'}">${status}</span></td><td>${time}</td><td><div class="admin-actions"><button class="p-btn p-btn--sm" data-order-view="${id}">详情</button></div></td></tr>`))}<div class="p-table-foot"><span class="p-foot-count">1–${rows.length} / 共 1,284</span><div class="p-foot-right"><button class="p-btn p-btn--sm p-btn--icon" disabled aria-label="上一页">‹</button><button class="p-btn p-btn--sm p-btn--icon" aria-label="下一页">›</button></div></div></div>`;
    };

    const renderCodes = () => `${viewHead('卡密','批量生成和查看点数兑换卡密。','<button class="p-btn p-btn--primary" data-action="codes-generate">生成卡密</button>')}
        ${kpis([['未使用',42,''],['已兑换',286,''],['本月生成',80,''],['本月兑换',31,'']])}
        <div class="p-card">${table(['卡密','点数','创建时间','状态','兑换人'],state.codes.length?state.codes.map(c=>`<tr><td><span class="admin-code">${c.code}</span></td><td>${c.points} 点</td><td>刚刚</td><td><span class="p-pill p-pill--sm p-pill--ok">未使用</span></td><td>—</td></tr>`):'<tr><td colspan="5"><div class="admin-empty">还没有生成卡密</div></td></tr>')}</div>`;

    const renderInvites = () => `${viewHead('邀请码','管理邀请制注册与一次性邀请码。','<button class="p-btn p-btn--primary" data-action="invite-create">生成邀请码</button>')}
        <div class="p-card p-card--pad"><div class="admin-channel"><div class="admin-channel-main"><div class="admin-channel-name">要求邀请码注册</div><div class="admin-channel-sub">开启后，注册页会显示邀请码字段；已开启的注册不会受影响。</div></div><label class="admin-switch"><input type="checkbox" id="invite-required" checked><span>已开启</span></label></div></div>
        <div class="p-card">${table(['邀请码','创建人','创建时间','状态','使用人'],state.invites.length?state.invites.map(i=>`<tr><td><span class="admin-code">${i.code}</span></td><td>admin</td><td>刚刚</td><td><span class="p-pill p-pill--sm p-pill--ok">未使用</span></td><td>—</td></tr>`):'<tr><td colspan="5"><div class="admin-empty">还没有邀请码</div></td></tr>')}</div>`;

    const renderGateway = () => `${viewHead('模型与网关','运行时网关、默认模型、模型白名单与计费。','<button class="p-btn" data-action="gateway-test">测试连接</button><button class="p-btn p-btn--primary" data-action="gateway-save">应用配置</button>')}
        <div class="p-card"><div class="admin-form">
            <div class="is-wide"><label for="gateway-url">网关地址</label><input class="p-input" id="gateway-url" value="https://api.example.com/v1"><div class="admin-form-note">兼容 OpenAI 的 /v1 地址；修改后会影响新玩家和后续请求。</div></div>
            <div><label for="gateway-model">默认模型</label><select class="p-select" id="gateway-model"><option>deepseek-v4.1-flash</option><option>glm-4.6</option><option>gpt-4.1-mini</option></select></div>
            <div><label for="gateway-mode">计费模式</label><select class="p-select" id="gateway-mode"><option>共用密钥（shared）</option><option>玩家独立令牌（tokens）</option></select></div>
            <div class="is-wide"><label for="gateway-key">上游 API Key</label><input class="p-input" id="gateway-key" type="password" placeholder="已配置 · 留空不修改" autocomplete="new-password"><div class="admin-form-note">密钥只写入服务端，不会在后台回显。</div></div>
            <div class="is-wide"><label for="gateway-models">模型白名单</label><input class="p-input" id="gateway-models" value="deepseek-v4.1-flash, glm-4.6"><div class="admin-form-note">玩家只能选择列表中的模型。</div></div>
            <div><label for="gateway-points">注册赠送点数</label><input class="p-input" id="gateway-points" inputmode="numeric" value="100"></div>
            <div><label for="gateway-rate">每点折算额度</label><input class="p-input" id="gateway-rate" inputmode="numeric" value="694"></div>
        </div><div class="admin-form-actions"><button class="p-btn" data-action="gateway-test">测试连接</button><button class="p-btn p-btn--primary" data-action="gateway-save">应用配置</button></div></div>`;

    const channels = [
        ['OpenAI 兼容主渠道','https://relay.example.com/v1','优先级 1 · 权重 10 · 已启用',true],
        ['备用渠道','https://backup.example.com/v1','优先级 2 · 权重 5 · 已启用',true],
        ['本地 mock','http://127.0.0.1:8081/v1','仅开发环境 · 已停用',false],
    ];
    const renderChannels = () => `${viewHead('渠道','查看和测试上游渠道。','<button class="p-btn" data-action="channel-refresh">刷新</button>')}
        <div class="p-card">${channels.map(([name,url,sub,enabled])=>`<div class="admin-channel"><div class="admin-channel-main"><div class="admin-channel-name">${esc(name)}</div><div class="admin-channel-sub">${esc(url)} · ${esc(sub)}</div></div><label class="admin-switch"><input type="checkbox" ${enabled?'checked':''} aria-label="${enabled?'停用':'启用'}${esc(name)}"><span>${enabled?'启用':'停用'}</span></label><button class="p-btn p-btn--sm" data-channel-test="${esc(name)}">测试</button></div>`).join('')}</div>
        <div class="p-notice">当前网关若不支持管理接口，渠道页只展示降级提示，不伪造上游操作成功。</div>`;

    const renderAnnouncement = () => `${viewHead('公告','编辑玩家端顶部公告，留空关闭。','<button class="p-btn p-btn--primary" data-action="announcement-save">保存公告</button>')}
        <div class="p-card"><div class="admin-form"><div class="is-wide"><label for="announcement-text">公告内容</label><textarea class="p-textarea" id="announcement-text" rows="6" placeholder="留空则关闭公告">${esc(state.announcement)}</textarea><div class="admin-form-note">修改内容后，之前关闭过公告的玩家会再次看到。</div></div></div><div class="admin-form-actions"><button class="p-btn" data-action="announcement-clear">清空并关闭</button><button class="p-btn p-btn--primary" data-action="announcement-save">保存公告</button></div></div>
        <div class="p-card p-card--pad"><div class="p-eyebrow">玩家端预览</div><div class="p-notice" style="margin:12px 0 0"><div class="p-notice-main">${esc(state.announcement)||'公告已关闭'}</div></div></div>`;

    const audit = [
        ['admin','上架作品','长夜观山 v2','2 小时前'],
        ['admin','拒绝更新','星港列车长','5 小时前'],
        ['admin','为玩家充值','青梧 +3,000 点','昨天 14:07'],
        ['admin','生成卡密','10 张 · 1,000 点','昨天 11:20'],
        ['admin','切换邀请制','开启','2 天前'],
    ];
    const renderAudit = () => `${viewHead('审计日志','后台敏感操作留痕。','<button class="p-btn" data-action="audit-export">导出日志</button>')}
        <div class="p-card"><div class="admin-toolbar"><label class="p-search"><input class="p-input" type="search" placeholder="搜索操作人、动作或对象" aria-label="搜索审计日志"></label><select class="p-select" aria-label="动作筛选"><option>全部动作</option><option>审核</option><option>资金</option><option>配置</option></select></div>${table(['操作人','动作','对象','时间'],audit.map(([who,action,target,time])=>`<tr><td>${who}</td><td>${action}</td><td>${target}</td><td>${time}</td></tr>`))}</div>`;

    const views = { plaza: renderPlaza, reports: renderReports, players: renderPlayers, orders: renderOrders, codes: renderCodes, invites: renderInvites, gateway: renderGateway, channels: renderChannels, announcement: renderAnnouncement, audit: renderAudit };

    const setToolbarActions = view => {
        if (view === 'overview') { toolbarActions.innerHTML = initialActions; return; }
        const primary = {
            plaza: ['刷新队列','plaza-refresh'], reports: ['刷新','reports-refresh'], players: ['导出玩家','players-export'], orders: ['导出当前筛选','orders-export'], codes: ['生成卡密','codes-generate'], invites: ['生成邀请码','invite-create'], gateway: ['应用配置','gateway-save'], channels: ['刷新','channel-refresh'], announcement: ['保存公告','announcement-save'], audit: ['导出日志','audit-export'],
        }[view];
        toolbarActions.innerHTML = `<button class="p-btn p-btn--sm" data-action="${primary[1]}">${primary[0]}</button>`;
    };

    const bindView = view => {
        if (view === 'overview') {
            $$('.p-atoolbar-actions .p-btn').forEach(btn => btn.onclick = () => toast(btn.textContent.trim() === '刷新' ? '概览已刷新' : 'CSV 导出将在真实后台执行'));
            return;
        }
        $$('[data-review]').forEach(btn => { btn.onclick = () => { selectedPlaza = btn.dataset.review; renderView('plaza'); }; btn.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); } }; });
        $$('[data-plaza-tab]').forEach(btn => btn.onclick = () => { state.plazaTab = btn.dataset.plazaTab; renderView('plaza'); });
        $$('[data-approve]').forEach(btn => btn.onclick = e => {
            e.stopPropagation();
            const item = plazaItems.find(x => x.id === btn.dataset.approve);
            dialog('通过审核', `<p>通过「${esc(item.name)}」后，作品会出现在广场。${item.kind === '版本更新' ? '线上版本会从 v1 更新到 v2。' : ''}</p>`, { confirm:'通过并上架', onConfirm:(_,close)=>{plazaItems = plazaItems.filter(x=>x.id!==item.id);selectedPlaza=plazaItems[0]?.id;close();renderView('plaza');toast('已通过审核');} });
        });
        $$('[data-reject]').forEach(btn => btn.onclick = e => {
            e.stopPropagation();
            const item = plazaItems.find(x => x.id === btn.dataset.reject);
            dialog('拒绝作品', `<label for="reject-note">拒绝原因（玩家可见）</label><textarea class="p-textarea" id="reject-note" placeholder="请说明需要修改的内容"></textarea>`, { confirm:'拒绝并通知', danger:true, onConfirm:(overlay,close)=>{const note=$('#reject-note',overlay).value.trim();if(!note)return false;plazaItems=plazaItems.filter(x=>x.id!==item.id);selectedPlaza=plazaItems[0]?.id;close();renderView('plaza');toast('已拒绝，原因已记录');} });
        });
        $$('[data-report-action]').forEach(btn => btn.onclick = () => {
            const action = btn.dataset.reportAction;
            dialog(action==='dismiss'?'忽略举报':action==='nsfw'?'标记为 NSFW':'下架作品', `<p>${action==='dismiss'?'忽略后该举报进入已处理记录，不会影响作品。':action==='nsfw'?'作品会被标记为成人内容，默认不对普通玩家展示。':'作品将从广场下架，作者会收到处理结果。'}</p>`, {confirm:action==='dismiss'?'确认忽略':'确认处理',danger:action==='remove',onConfirm:(_,close)=>{close();toast(action==='dismiss'?'举报已忽略':action==='nsfw'?'已标记为 NSFW':'作品已下架');}});
        });
        $$('[data-order-status]').forEach(btn => btn.onclick = () => { state.orderStatus = btn.dataset.orderStatus; renderView('orders'); });
        const orderQuery = $('#order-query'); if(orderQuery) orderQuery.oninput = e => { state.orderQuery = e.target.value; renderView('orders'); setTimeout(()=>{$('#order-query')?.focus();},0); };
        $$('[data-order-view]').forEach(btn => btn.onclick = () => dialog('订单详情', `<p>订单 ${esc(btn.dataset.orderView)} · 支付状态与点数到账记录。真实后台会在这里显示易支付回调与审计信息。</p>`, {confirm:'知道了',cancel:'关闭',onConfirm:(_,close)=>close()}));
        const playerQuery = $('#player-query'); if(playerQuery) playerQuery.onkeydown = e => { if(e.key==='Enter'){state.playerQuery=e.target.value.trim();renderView('players');} };
        $$('[data-player-recharge]').forEach(btn => btn.onclick = () => dialog('为玩家充值', `<div class="p-field"><label class="p-label" for="recharge-points">充值点数</label><input class="p-input" id="recharge-points" inputmode="numeric" value="1000"></div><p class="admin-form-note">此操作会写入审计日志，并立即更新玩家余额。</p>`, {confirm:'确认充值',onConfirm:(overlay,close)=>{const amount=$('#recharge-points',overlay).value;close();toast(`已为 @${btn.dataset.playerRecharge} 充值 ${amount} 点`);}}));
        $$('[data-player-toggle]').forEach(btn => btn.onclick = () => dialog('变更玩家状态', `<p>确认对 @${esc(btn.dataset.playerToggle)} 执行「${btn.textContent.trim()}」？封禁会阻止该账号继续登录，但不会删除作品与会话。</p>`, {confirm:'确认',danger:true,onConfirm:(_,close)=>{close();toast('玩家状态已更新');}}));
        const required = $('#invite-required'); if(required) required.onchange = () => toast(required.checked?'邀请制已开启':'邀请制已关闭');
        $$('[data-channel-test]').forEach(btn => btn.onclick = () => toast(`正在测试 ${btn.dataset.channelTest}…`));
        const announcement = $('#announcement-text'); if(announcement) announcement.oninput = e => { state.announcement = e.target.value; };
    };

    const decorateTables = () => {
        $$('.admin-table').forEach(table => {
            const headers = $$('thead th', table).map(th => th.textContent.trim());
            $$('tbody tr', table).forEach(row => {
                [...row.children].forEach((cell, index) => { cell.dataset.label = headers[index] || ''; });
            });
        });
    };

    const renderView = view => {
        const [title, sub] = meta[view] || meta.overview;
        toolbarTitle.textContent = title;
        toolbarSub.textContent = sub;
        document.title = `${title} · 酒馆管理后台`;
        setToolbarActions(view);
        content.innerHTML = view === 'overview' ? initialOverview : `<div class="admin-view">${views[view]?.() || ''}</div>`;
        decorateTables();
        bindView(view);
        $$('[data-admin-view]').forEach(a => {
            const active = a.dataset.adminView === view;
            if(active) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
        });
        $$('[data-action]').forEach(btn => {
            const action = btn.dataset.action;
            if(action === 'plaza-refresh') btn.onclick = () => {renderView('plaza');toast('审核队列已刷新');};
            if(action === 'reports-refresh') btn.onclick = () => {renderView('reports');toast('举报队列已刷新');};
            if(action === 'players-export') btn.onclick = () => downloadFile('玩家列表.json', players.map(([name,handle,balance,status,joined]) => ({name,handle,balance,status,joined})));
            if(action === 'orders-export') btn.onclick = () => downloadFile('订单记录.json', orders.map(([id,player,amount,points,status,time]) => ({id,player,amount,points,status,time})));
            if(action === 'audit-export') btn.onclick = () => downloadFile('审计日志.json', audit.map(([operator,action,target,time]) => ({operator,action,target,time})));
            if(action === 'codes-generate') btn.onclick = () => dialog('生成卡密', `<div class="p-field"><label class="p-label" for="code-count">数量（1–100）</label><input class="p-input" id="code-count" inputmode="numeric" value="10"></div><div class="p-field"><label class="p-label" for="code-points">每张点数</label><input class="p-input" id="code-points" inputmode="numeric" value="1000"></div>`, {confirm:'生成',onConfirm:(overlay,close)=>{const count=Math.min(100,Math.max(1,Number($('#code-count',overlay).value)||1));const points=Number($('#code-points',overlay).value)||1000;for(let i=0;i<count;i++)state.codes.unshift({code:`INV-${Math.random().toString(36).slice(2,6).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,points});close();renderView('codes');toast(`已生成 ${count} 张卡密`);}});
            if(action === 'invite-create') btn.onclick = () => {state.invites.unshift({code:`INV-${Math.random().toString(36).slice(2,6).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`});renderView('invites');toast('邀请码已生成');};
            if(action === 'gateway-save') btn.onclick = () => toast('网关配置已保存；真实实现会写入运行时配置并记录审计');
            if(action === 'gateway-test') btn.onclick = () => toast('连接测试中…真实后台会显示网关返回结果');
            if(action === 'channel-refresh') btn.onclick = () => {renderView('channels');toast('渠道列表已刷新');};
            if(action === 'announcement-save') btn.onclick = () => {state.announcement = $('#announcement-text')?.value.trim() || '';localStorage.setItem('rp-site-announcement', state.announcement);sessionStorage.removeItem('rp-announcement-dismissed');toast(state.announcement?'公告已保存，玩家端已更新':'公告已关闭，玩家端不再展示');renderView('announcement');};
            if(action === 'announcement-clear') btn.onclick = () => {state.announcement='';localStorage.setItem('rp-site-announcement','');sessionStorage.removeItem('rp-announcement-dismissed');renderView('announcement');toast('公告已关闭');};
        });
    };

    document.addEventListener('click', e => {
        const link = e.target.closest('[data-admin-view]');
        if (!link) return;
        e.preventDefault();
        const view = link.dataset.adminView;
        history.replaceState(null,'',`#/${view}`);
        renderView(view);
    });

    window.addEventListener('hashchange', () => {
        const view = location.hash.replace('#/','') || 'overview';
        renderView(meta[view] ? view : 'overview');
    });

    const initial = location.hash.replace('#/','') || 'overview';
    renderView(meta[initial] ? initial : 'overview');
})();

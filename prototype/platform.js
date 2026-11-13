/* Shared, local-only platform demo. No requests or account data are sent anywhere. */
(() => {
    'use strict';

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const path = name => new URL(name, location.href).pathname.split('/').pop();
    const current = path(location.href) || 'home.html';
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const page = document.body.dataset.page || current.replace('.html', '');
    const viewModeKey = 'rp-view-mode';
    const readViewMode = () => {
        try { return localStorage.getItem(viewModeKey) === 'classic' ? 'classic' : 'cinema'; }
        catch { return 'cinema'; }
    };
    let viewMode = readViewMode();
    const isCinema = () => viewMode === 'cinema';
    const narrativePage = () => ['home','plaza','character','author'].includes(page);
    function applyViewMode() {
        document.body.classList.toggle('p-cinema', isCinema());
        document.documentElement.dataset.viewMode = viewMode;
    }
    applyViewMode();

    const icons = {
        home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
        compass: '<circle cx="12" cy="12" r="8"/><path d="m15.2 8.8-2 4.4-4.4 2 2-4.4z"/>',
        chat: '<path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-4.6A7 7 0 0 1 8 5h5a7 7 0 0 1 7 7z"/>',
        create: '<path d="M12 5v14M5 12h14"/>',
        user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
        coin: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>',
        users: '<circle cx="9" cy="8" r="3"/><path d="M3 19a6 6 0 0 1 12 0m1-14a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5"/>',
        search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
        back: '<path d="m15 18-6-6 6-6"/>',
        next: '<path d="m9 6 6 6-6 6"/>',
        heart: '<path d="M12 20.4S4 15.4 4 9.9A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 8 2.6c0 5.5-8 10.5-8 10.5z"/>',
        more: '<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
        close: '<path d="m6 6 12 12M6 18 18 6"/>',
        check: '<path d="m5 12 4 4L19 6"/>',
        send: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
        arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
        down: '<path d="M12 5v14m-6-6 6 6 6-6"/>',
        book: '<path d="M4 5a3 3 0 0 1 3-2h13v16H7a3 3 0 0 0-3 3z"/><path d="M4 5v14m5-12h7m-7 4h5"/>',
        edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14.5 6.5 3 3"/>',
        trash: '<path d="M4 7h16m-10 4v6m4-6v6M9 7l1-3h4l1 3m3 0-1 14H7L6 7"/>',
        download: '<path d="M12 16V4m-4.5 8.5L12 17l4.5-4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
        clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
        info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5m0-8h.01"/>',
        warning: '<path d="M12 4.5 21 19.5H3z"/><path d="M12 10v4m0 3h.01"/>',
        eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/>',
        branch: '<path d="M6 4v12m0-8h9a4 4 0 0 1 4 4v8m-4-4 4 4 4-4"/>',
        refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4.5h-4.5"/>',
        copy: '<rect x="8" y="8" width="11" height="12" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/>',
        stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
        shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-5"/>',
        upload: '<path d="M12 16V4m-4.5 4.5L12 4l4.5 4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
        settings: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
        bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
        ban: '<circle cx="12" cy="12" r="8"/><path d="m6 6 12 12"/>',
        file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>',
    };
    const icon = (name, cls = '') => `<svg class="p-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.info}</svg>`;

    const characters = {
        'shen-yanzhi': {scene:'cityscape medieval night.jpg',id:'shen-yanzhi',name:'沈砚之',author:'青梧',initial:'沈',hue:212,category:'悬疑',tags:['民国','悬疑','慢热'],nsfw:true,added:true,favorite:true,chats:'2.1 万',greeting:'民国二十三年，上海的雨下了整整四十天。报馆的灯到深夜还亮着。他放下红笔，抬眼看向门口：「这么晚，你也是来等消息的？」',hook:'《申报》的夜班编辑，也是唯一记得你名字的人。',description:'话少，习惯把判断留在心里。好感都藏在替你留着的灯和多倒的一杯温水里。',pace:'慢热 · 细节叙事 · 重视长期关系'},
        'lin-wanzhao': {scene:'japan university.jpg',id:'lin-wanzhao',name:'林晚照',author:'青梧',initial:'林',hue:330,category:'现代',tags:['现代','久别重逢'],nsfw:false,added:true,favorite:true,chats:'1.8 万',greeting:'画廊的灯已经熄了一半。她没有回头，只将那份三年前的请柬推到你面前：「这次，你迟到了三年。」',hook:'三年前的雨夜你没能赴约，如今她站在你的画廊门口。',description:'外表冷静，心里仍留着未完成的约定。愿意听你说完，也会追问那些被回避的回答。',pace:'克制 · 情感拉扯 · 慢热'},
        'bai-lu': {scene:'landscape winter lake house.jpg',id:'bai-lu',name:'白露',author:'照野',initial:'白',hue:150,category:'奇幻',tags:['仙侠','守护'],nsfw:false,added:true,favorite:true,chats:'9,412',greeting:'山门之外，雪落了一夜。她收剑入鞘，将一盏热茶放在你身旁：「你答应会回来。我守在这里，并不是因为这句话。」',hook:'昆仑最后一位守山人，等一个说好会回来的人。',description:'沉静而坚定。比起把想念说出口，更愿意替你挡下山路上的风雪。',pace:'温柔守护 · 仙侠冒险 · 缓慢靠近'},
        'lu-shiyan': {scene:'bedroom clean.jpg',id:'lu-shiyan',name:'陆时衍',author:'南枝',initial:'陆',hue:200,category:'现代',tags:['都市','职场'],nsfw:false,added:false,favorite:false,chats:'2.4 万',greeting:'电梯门合上前，他伸手挡了一下。熟悉的目光在你身上停了两秒，随后恢复谈判桌上的冷静：「上去吧。我们把三年前没谈完的事，也一起谈了。」',hook:'并购案的最后一次谈判，对面坐着你的前男友。',description:'理性、敏锐、分寸感极强。工作里不给你特权，私下里却会记得你的每个习惯。',pace:'都市情感 · 智性拉扯 · 双向试探'},
        'a-heng': {scene:'landscape autumn great tree.jpg',id:'a-heng',name:'阿蘅',author:'鹿鸣',initial:'蘅',hue:145,category:'治愈',tags:['古风','治愈'],nsfw:false,added:false,favorite:false,chats:'6,203',greeting:'药铺快要打烊了，她仍在院子里给新采的草药挂牌子。见你进来，她自然地往炉边挪了挪：「外面冷，先坐。你的药，我煎在第二炉了。」',hook:'药铺的学徒，会给每一株草取名字，也会给你留一盏灯。',description:'温和细心，记得每一位病人的习惯。对草木和人都很有耐心。',pace:'日常治愈 · 温柔陪伴 · 轻剧情'},
        'xie-wujiu': {scene:'tavern day.jpg',id:'xie-wujiu',name:'谢无咎',author:'不系舟',initial:'谢',hue:340,category:'奇幻',tags:['武侠','暗黑'],nsfw:true,added:false,favorite:false,chats:'1.1 万',greeting:'他把那张写着自己名字的委托折好，放进灯焰里。火光映着唇边一点笑：「江湖第一杀手，最后一单，是杀我自己。你要接吗？」',hook:'江湖第一杀手，接的最后一单，是杀他自己。',description:'玩世不恭的外表下藏着秘密。习惯用玩笑回避危险，却把生死看得很认真。',pace:'武侠悬疑 · 危险关系 · 高张力'},
    };
    const openingSets = {
        'shen-yanzhi': [
            {id:'default',title:'雨夜报馆',text:characters['shen-yanzhi'].greeting},
            {id:'letters',title:'未寄出的信',text:'排字房只剩一盏灯。他把一封没有寄出的信折回原样，抬眼看你：「这么晚，你也是来等消息的？」'},
        ],
        'lin-wanzhao': [
            {id:'default',title:'画廊重逢',text:characters['lin-wanzhao'].greeting},
            {id:'alt',title:'迟到三年',text:'那张请柬在画框后面压了三年。她把灯调亮了一点，问你：「这次，准备坐多久？」'},
        ],
        'bai-lu': [
            {id:'default',title:'山门初雪',text:characters['bai-lu'].greeting},
            {id:'alt',title:'守山人的灯',text:'雪停之后，山门前的灯还亮着。她把一盏热茶放在石阶上，像是知道你会来。'},
        ],
        'lu-shiyan': [
            {id:'default',title:'电梯之后',text:characters['lu-shiyan'].greeting},
            {id:'alt',title:'谈判桌外',text:'会议室的灯还亮着。他合上并购案，问你：「三年前没谈完的事，现在可以谈了吗？」'},
        ],
        'a-heng': [
            {id:'default',title:'药铺灯下',text:characters['a-heng'].greeting},
            {id:'alt',title:'第二炉药',text:'药铺打烊后，她还在炉边看着第二炉药。见你进来，只把凳子往火边挪了挪：「外面冷，先坐。」'},
        ],
        'xie-wujiu': [
            {id:'default',title:'最后一单',text:characters['xie-wujiu'].greeting},
            {id:'alt',title:'灯焰里的名字',text:'灯焰卷起那张委托，他的名字先烧成灰。他抬眼看你：「接不接，今晚都得给个答案。」'},
        ],
    };
    const openingsFor = character => character.local ? [
        {id:'default',title:'初遇',text:character.greeting},
        ...(character.alternateGreetings || []).filter(text => text.trim()).map((text,index) => ({id:`alt-${index+1}`,title:`备用开场 ${index+1}`,text})),
    ] : openingSets[character.id] || [
        {id:'default',title:'初遇',text:character.greeting},
        {id:'alt',title:'另一种开始',text:character.greeting},
    ];
    const authors = {
        '青梧': {name:'青梧',initial:'青',hue:212,bio:'写雨、旧城和没有说完的话。喜欢把关系放进具体的生活细节里，让角色先成为一个真实的人。',joined:'2025 年 8 月'},
        '照野': {name:'照野',initial:'照',hue:150,bio:'偏爱山野与传说，故事多从一场漫长的等待开始。',joined:'2025 年 11 月'},
        '南枝': {name:'南枝',initial:'南',hue:200,bio:'都市关系与智性拉扯，写成年人之间克制又诚实的靠近。',joined:'2026 年 1 月'},
        '鹿鸣': {name:'鹿鸣',initial:'鹿',hue:145,bio:'日常治愈和古风小人物，喜欢为每一株草和每一个人留一盏灯。',joined:'2026 年 2 月'},
        '不系舟': {name:'不系舟',initial:'舟',hue:340,bio:'武侠、危险关系和不肯认输的人。故事常常从一封信或一场雨开始。',joined:'2025 年 12 月'},
    };
    const personas = [
        {id:'wuxia',name:'古风女侠',initial:'侠',hue:18,description:'行走江湖的剑客，重承诺，不轻易向人示弱。'},
        {id:'night',name:'都市夜行',initial:'夜',hue:210,description:'习惯独自生活的都市人，敏锐、克制，愿意慢慢打开自己。'},
        {id:'default',name:'默认身份',initial:'林',hue:28,description:'林见白 · 不附加额外的角色设定。'},
    ];
    const rooms = [
        {id:'room-teahouse',name:'雨夜茶室',members:['shen-yanzhi','lin-wanzhao'],chatId:'room-1',lastMessage:'林晚照：这壶茶，总不能只给一个人留。',time:'昨天',updated:Date.now()-86400000,count:18},
    ];
    const seedChats = [
        {id:'chat-shen-1',characterId:'shen-yanzhi',title:'雨夜报馆',opening:'default',personaId:'night',updated:Date.now(),time:'刚刚',count:12,lastMessage:'他把温着的茶推到你面前：「这就够了。」',messages:[
            {role:'assistant',text:'门几乎是立刻就开了。他站在门口，肩上还搭着没穿完的外套。「别站在雨里。」他侧过身让开半步，「进来吧，地板脏了不要紧。」'},
            {role:'user',text:'伞落在报馆了，走到半路才想起来。'},
            {role:'assistant',text:'他的目光在你湿透的袖口停了一瞬，先接过你手里滴水的包。「先去把头发擦干。稿子的事，等雨小了再说。」'},
            {role:'user',text:'那今晚呢。今晚你等到的人是我。'},
            {role:'assistant',text:'他转过身来，手指在窗框上停了一下。「今晚不一样。」灯光落进他眼里，很浅，也很稳，「今晚门响了，我去开了——站在门外的是你。」'},
        ]},
        {id:'chat-shen-2',characterId:'shen-yanzhi',title:'未寄出的信',opening:'letters',personaId:'wuxia',updated:Date.now()-86400000,time:'昨天',count:8,lastMessage:'墨迹停在“见字如面”四个字后，迟迟没有下文。',messages:[{role:'assistant',text:'报馆的排字房里只剩一盏灯。他把那封没寄出的信折回原样，抬眼看你：「这么晚，你也是来等消息的？」'}]},
        {id:'chat-lin-1',characterId:'lin-wanzhao',title:'三年之后',opening:'default',personaId:'night',updated:Date.now()-172800000,time:'周一',count:22,lastMessage:'她把烟按灭，说：你迟到了三年。',messages:[{role:'assistant',text:'她把烟按灭，目光落在那张三年前的请柬上：「你迟到了三年。这次，准备用什么理由？」'}]},
        {id:'chat-bai-1',characterId:'bai-lu',title:'山门初雪',opening:'default',personaId:'wuxia',updated:Date.now()-259200000,time:'周日',count:16,lastMessage:'山门之外，雪落了一夜。',messages:[{role:'assistant',text:'山门之外，雪落了一夜。她替你扫去肩上的雪，只淡淡道：「回来就好。」'}]},
    ];
    let chats = seedChats.map(chat => ({...chat, messages: chat.messages.map(message => ({...message}))}));
    // Private resources deliberately stay outside `characters`, the public discovery catalogue.
    const creatorWorks = [];
    let loreBooks = [];
    const stateKey = 'rp-platform-state';
    const stateVersion = 2;
    let selectedPersona = 'night';
    let stateExtras = {};
    let stateBackupPending = null;
    let stateReadOnly = false;
    let resourceSequence = 0;
    // 提示词块：键名固定，顺序与开关由预设决定；缺省顺序在 normalizePresetOrder 里补齐，
    // 这样旧存档缺块时也不会把新块吞掉。
    // 上下文模板（ST 的 story string）：决定角色块如何拼进上下文。占位符为空时整行省略。
    const DEFAULT_CONTEXT_TEMPLATE = ['【角色名】{{char}}','【一句话简介】{{hook}}','【角色描述】{{description}}','【人设】{{personality}}','【场景】{{scenario}}','【设定】{{legacy}}','【作者提示词】{{instructions}}'].join('\n');
    const contextTemplatePlaceholders = ['char','hook','description','personality','scenario','legacy','instructions'];

    function renderContextTemplate(template, values) {
        const source = textValue(template, DEFAULT_CONTEXT_TEMPLATE);
        return source.split('\n').map(line => {
            let replaced = line;
            let touched = false;
            for (const key of contextTemplatePlaceholders) {
                if (!replaced.includes(`{{${key}}}`)) continue;
                touched = true;
                replaced = replaced.split(`{{${key}}}`).join(textValue(values?.[key]));
            }
            if (!touched) return line.trim() ? line : '';
            // 占位符为空时整行丢弃，避免留下只有标签的空行
            return replaced.replace(/【[^】]*】/g,'').trim() === '' ? '' : replaced;
        }).filter(Boolean).join('\n');
    }

    // ST 的 story_string 带 handlebars 条件：去掉条件标记，只保留含受支持占位符的行
    function convertStoryString(source) {
        if (!textValue(source).trim()) return '';
        return String(source)
            .replace(/\{\{#if[^}]*\}\}/g,'').replace(/\{\{\/if\}\}/g,'').replace(/\{\{else\}\}/g,'')
            .split('\n').map(line => line.trim())
            .filter(line => line && /\{\{(char|description|personality|scenario)\}\}/.test(line))
            .join('\n');
    }

    const promptBlockDefs = [
        ['system','系统提示','来自当前预设：整体语气、格式与规则。'],
        ['character','角色设定','本故事冻结的角色快照（人设、场景、作者提示词）。'],
        ['persona','玩家身份','你在本故事里扮演的身份。'],
        ['lore','世界书命中','位置为「角色设定之前」的世界书条目；其他位置的条目插到对应的块或历史里。'],
        ['autosummary','自动摘要','本地抽取式摘要：把「最近消息」之前的旧对话压成一行一条的梗概。'],
        ['rag','记忆检索','按当前输入从更早的对话里检索相关片段（本地关键词近似，不是向量检索）。'],
        ['memory','记忆摘要','手动记录的剧情要点，与自动摘要一起进入上下文。'],
        ['note','作者注释','作者备注，只影响上下文。'],
        ['examples','对话示例','角色卡的 mes_example，按 <START> 分段；世界书「对话示例前/后」的条目贴在这里。'],
        ['history','最近消息','按时间顺序进入上下文的对话。'],
        ['jailbreak','后置提示','预设末尾的补充规则，社区里常叫“破限”。'],
    ];
    const promptCharBudget = 6000;
    const regexTextLimit = 20000;
    const regexSourceLimit = 400;
    let presets = [];
    let regexRules = [];
    let activePresetId = '';
    // 变量：会话变量存在 chat.context.vars，全局变量存在这里（跨会话共享）。
    let globalVars = {};
    let hideStatusBlock = true;
    const varKeyLimit = 40;
    const varValueLimit = 2000;
    const varCountLimit = 60;
    // 世界书：插入位置、次要关键词逻辑、角色与生成类型与 SillyTavern 1.19.0 的枚举一一对应（顺序即 ST 的数值）。
    const lorePositions = [
        ['before','角色设定之前','对应 ST「↑Char」'],
        ['after','角色设定之后','对应 ST「↓Char」'],
        ['anTop','作者注释之前','对应 ST「↑AN」'],
        ['anBottom','作者注释之后','对应 ST「↓AN」'],
        ['depth','插入历史深度','对应 ST「@D」：插入到倒数第 N 条消息之前'],
        ['emTop','对话示例之前','对应 ST「↑EM」'],
        ['emBottom','对话示例之后','对应 ST「↓EM」'],
        ['outlet','出口（宏引用）','对应 ST「Outlet」：只在 {{outlet::名称}} 处展开'],
    ];
    const loreLogics = [['andAny','包含任一'],['notAll','不全包含'],['notAny','都不包含'],['andAll','全部包含']];
    const loreRoles = ['system','user','assistant'];
    const loreDefaultDepth = 4;
    const loreDefaultWeight = 100;
    const loreMaxScanDepth = 1000;
    const loreTriggerTypes = [['normal','普通发送'],['continue','继续剧情'],['impersonate','代写'],['swipe','切换候选'],['regenerate','重新生成'],['quiet','后台生成']];
    // 全局扫描设置对应 ST 的 world_info_* 设置。扫描深度沿用原型原来的 12 条（ST 默认 2），递归与「包含发言者名字」取 ST 默认值。
    const loreSettingsDefault = {scanDepth:12,budget:2000,recursive:true,maxRecursionSteps:0,caseSensitive:false,matchWholeWords:false,includeNames:true,useGroupScoring:false,minActivations:0,minActivationsDepthMax:0};
    let loreSettings = {...loreSettingsDefault};
    // 卡内正则的运行授权：用户设置，按角色 ID 记录（ST 的 character_allowed_regex）。不写进角色卡，也不随会话快照冻结。
    let allowedCardRegex = [];
    // 快捷回复：一组按钮放在输入框上方（ST 的 Quick Reply 扩展）。内容以 / 开头时当斜杠命令执行。
    let quickReplies = {enabled:true,injectInput:false,placeBeforeInput:false,disableSend:false,items:[]};
    // 作者注释位置：「按预设顺序」是本原型原有的作者注释块（默认，旧会话不变）；其余三种对应 ST 的 extension_prompt_types：
    // 主提示词之后（IN_PROMPT = 0）、聊天内按深度（IN_CHAT = 1，ST 的默认）、主提示词之前（BEFORE_PROMPT = 2）。
    const notePositions = [['block','按预设顺序（作者注释块）'],['after','主提示词之后'],['depth','聊天内 · 按深度'],['before','主提示词之前']];
    const noteDefaults = {interval:1,position:'block',depth:4,role:'system'};
    const stNotePositions = ['after','depth','before'];
    // 身份描述位置与 ST 的 persona_description_positions 对应。
    const personaPositions = [['prompt','提示词里（身份块）'],['anTop','作者注释之前'],['anBottom','作者注释之后'],['depth','聊天内 · 按深度'],['none','不进入上下文']];

    function resourceId(prefix) {
        return `${prefix}-${Date.now()}-${++resourceSequence}-${Math.random().toString(36).slice(2,8)}`;
    }

    function plainRecord(value) {
        return Boolean(value && typeof value === 'object' && !Array.isArray(value));
    }

    function textValue(value, fallback = '') {
        return typeof value === 'string' ? value : fallback;
    }

    function stableId(value, fallback) {
        return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value) ? value : fallback;
    }

    function normalizeMessages(value, withCandidates = true) {
        if (!withCandidates) return Array.isArray(value) ? value.filter(plainRecord).map(message=>({...message,role:['user','assistant','system'].includes(message.role)?message.role:'system',text:textValue(message.text)})) : [];
        const used = new Set();
        return Array.isArray(value) ? value.filter(plainRecord).map(message => {
            let id = stableId(message.id, resourceId('message'));
            if (used.has(id)) id = resourceId('message');
            used.add(id);
            const candidates = Array.isArray(message.candidates) ? message.candidates.filter(item => typeof item === 'string') : [];
            if (!candidates.length) candidates.push(textValue(message.text));
            const selectedCandidate = Number.isInteger(message.selectedCandidate) && message.selectedCandidate >= 0 && message.selectedCandidate < candidates.length ? message.selectedCandidate : 0;
            return {...message,id,role:['user','assistant','system'].includes(message.role) ? message.role : 'system',candidates,selectedCandidate,text:candidates[selectedCandidate]};
        }) : [];
    }

    function cloneChatValue(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function chatContext(chat) {
        const context = plainRecord(chat.context) ? chat.context : {};
        return {...context,memory:textValue(context.memory),note:textValue(context.note),vars:normalizeVars(context.vars),loreTimed:normalizeLoreTimed(context.loreTimed),lore:Array.isArray(context.lore) ? context.lore.filter(plainRecord).map((entry,index) => ({...normalizeLoreEntry(entry,index),id:stableId(entry.id,resourceId('lore'))})) : []};
    }

    function prepareChat(chat) {
        chat.messages = normalizeMessages(chat.messages);
        chat.context = chatContext(chat);
        if (!plainRecord(chat.characterSnapshot)) {
            chat.characterSnapshot = cloneChatValue(getCharacter(chat.characterId));
            chat.snapshotNote = '旧记录未保存历史版本；此快照取自首次成功保存时的角色资料，仅在当前标签页保留。';
        }
    }

    function chatCharacter(chat) {
        return plainRecord(chat.characterSnapshot) ? chat.characterSnapshot : getCharacter(chat.characterId);
    }

    function commitChat(chat, change) {
        const previous = cloneChatValue(chat);
        const previousGlobals = {...globalVars};
        const previousCount = chat.messages.length;
        prepareChat(chat);
        change(chat);
        syncMessageMetadata(chat);
        chat.updated = Date.now();
        chat.time = '刚刚';
        if (saveState()) {
            // 自动快照（ST 的 chat backups）：消息条数发生变化时拍一份，每会话保留最近 5 份
            if (chat.messages.length !== previousCount) snapshotChat(chat);
            return true;
        }
        Object.keys(chat).forEach(key => delete chat[key]);
        Object.assign(chat,previous);
        globalVars = previousGlobals;
        return false;
    }


    function branchChat(chat, index, change = () => {}) {
        if (busy) { toast('请先停止本地模拟，再修改故事。','err'); return null; }
        const clone = cloneChatValue(chat);
        prepareChat(clone);
        clone.id = resourceId('chat-branch');
        clone.title = `${chat.title} · 分支`;
        clone.messages = clone.messages.slice(0,index+1);
        clone.branchSource = {chatId:chat.id,messageId:chat.messages[index]?.id || clone.messages[index]?.id || '',label:`${chat.title} · 第 ${index+1} 条`};
        change(clone);
        syncMessageMetadata(clone);
        clone.updated = Date.now();
        clone.time = '刚刚';
        chats.push(clone);
        if (!saveState()) { chats.pop(); return null; }
        return clone;
    }

    function loreMatches(chat) {
        return scanLore(chat).entries;
    }

    function simulatedReply(chat, variation = 0) {
        const character = chatCharacter(chat);
        const templates = {
            'shen-yanzhi':['把手边的稿纸摆正。「先从你愿意讲的线索开始。」','在空白纸页上留下一行位置。「这件事，你打算怎样继续？」'],
            'lin-wanzhao':['将画框扶正。「先看看这幅画吧。你想从哪里说起？」','把请柬放在桌上。「下一步，由你来决定。」'],
            'bai-lu':['收好行囊，望向山路。「沿着石阶走，还是先在此歇一会儿？」','将茶盏放回桌边。「不必着急，我们可以慢慢商量。」'],
            'lu-shiyan':['合上文件。「先说说你的方案，我们逐项讨论。」','将一张空白便签推到桌面中央。「从最重要的一项开始吧。」'],
            'a-heng':['整理好草药标签。「先坐一会儿，想聊些什么？」','把窗边的凳子挪好。「今天想从哪件小事开始？」'],
            'xie-wujiu':['将纸笺折好。「不妨换条思路，你有什么打算？」','收起桌面的杂物。「接下来的方向，听你的。」'],
        };
        const lines = templates[character.id] || ['停下手边的事。「你想怎样继续这个故事？」','留出思考的片刻。「下一步，由你选择。」'];
        return `【本地模板模拟 · 方案 ${variation+1}】\n\n${character.name}${lines[variation % lines.length]}`;
    }

    // 角色表情（对齐 ST 的 expressions 扩展）：角色没有专属立绘时，ST 用 default-expressions 的通用表情图。
    // 原型同样使用这套图（assets/expressions/），情绪由本地关键词分类得出，不调用模型。
    const emotionLabels = {
        neutral:['平静'], joy:['喜悦'], amusement:['愉悦','好笑','打趣'], admiration:['钦佩','佩服'],
        approval:['认可','赞许'], caring:['关心','体贴'], curiosity:['好奇'], excitement:['兴奋','激动'],
        gratitude:['感激','谢谢'], love:['爱意','心动'], optimism:['乐观','期待'], pride:['得意','骄傲'],
        relief:['释然','松了口气'], realization:['恍然','明白了'], annoyance:['烦躁','不耐烦'],
        anger:['愤怒','生气','恼火'], disapproval:['不认同','反对'], disgust:['厌恶','恶心'],
        confusion:['困惑','疑惑','不明白'], disappointment:['失望'], embarrassment:['害羞','脸红','尴尬'],
        fear:['恐惧','害怕'], grief:['悲痛'], nervousness:['紧张','不安'], remorse:['懊悔','愧疚'],
        sadness:['难过','悲伤','伤心'], surprise:['惊讶','吃惊','意外'], desire:['渴望','想要'],
    };
    const emotionKeywords = {
        joy:['笑','开心','高兴','喜悦','愉快'], amusement:['笑出声','好笑','打趣','逗'],
        admiration:['佩服','钦佩','了不起'], approval:['点头','认可','赞许','很好'],
        caring:['关心','小心','别着凉','照顾好'], curiosity:['好奇','问','有意思'],
        excitement:['激动','兴奋','太好了'], gratitude:['谢谢','感激','多谢'],
        love:['爱你','喜欢','心动','温柔'], optimism:['会好起来','期待','一定'],
        pride:['得意','骄傲','当然'], relief:['松了口气','终于','幸好'],
        realization:['原来','明白了','恍然'], annoyance:['皱眉','不耐烦','啧'],
        anger:['怒','生气','恼火','拍桌','厉声'], disapproval:['不同意','反对','摇头'],
        disgust:['恶心','厌恶','嫌弃'], confusion:['困惑','疑惑','不明白','皱眉'],
        disappointment:['失望','叹气','落空'], embarrassment:['脸红','红着脸','害羞','尴尬','别开脸','别开视线','耳根'],
        fear:['害怕','恐惧','颤抖','发抖'], grief:['悲痛','哀','恸'], nervousness:['紧张','不安','攥紧'],
        remorse:['懊悔','愧疚','对不起','道歉'], sadness:['难过','伤心','泪','低落'],
        surprise:['惊讶','吃惊','意外','瞪大'], desire:['渴望','想要','靠近'],
    };
    const emotionPriority = ['anger','sadness','fear','surprise','embarrassment','love','caring','remorse','grief','nervousness','disappointment','disgust','annoyance','disapproval','confusion','realization','relief','pride','excitement','joy','amusement','admiration','approval','gratitude','optimism','curiosity','desire','neutral'];

    // 本地情绪分类：按关键词命中计分，同分按 emotionPriority 取靠前的（强情绪优先）
    function classifyEmotion(text) {
        const raw = String(text || '');
        if (!raw.trim()) return 'neutral';
        let best = 'neutral', bestScore = 0;
        for (const emotion of emotionPriority) {
            const keywords = emotionKeywords[emotion] || [];
            const score = keywords.reduce((sum, keyword) => sum + (raw.includes(keyword) ? 1 : 0), 0);
            if (score > bestScore || (score === bestScore && score > 0 && emotionPriority.indexOf(emotion) < emotionPriority.indexOf(best))) {
                best = emotion;
                bestScore = score;
            }
        }
        return bestScore ? best : 'neutral';
    }

    function emotionLabel(emotion) {
        return (emotionLabels[emotion] || emotionLabels.neutral)[0];
    }

    // 只在情绪不是「平静」时显示表情——每行都挂 emoji 太吵，情绪变化才值得标注
    function emotionBadge(text) {
        const emotion = classifyEmotion(text);
        if (emotion === 'neutral') return '';
        const label = emotionLabel(emotion);
        return `<span class="p-msg-emotion" title="情绪：${esc(label)}（本地关键词判断）"><img src="assets/expressions/${emotion}.png" alt="${esc(label)}" loading="lazy"></span>`;
    }

    // 消息富文本：中文卡生态的 Markdown 子集（加粗/斜体/删除线/行内代码/代码块/引用/列表/表格/分隔线）
    // + 状态栏卡片（【状态】…的 key: value 块）+ <think> 思考折叠 + 白名单 HTML 表格。
    // 安全边界：所有文本先 esc 转义再按规则还原有限标记；白名单之外的 HTML 一律以原文显示，不做注入。
    // 真实代码注意：换成成熟的 sanitize + marked 组合，白名单策略保持一致（见 DEV-CONSTRAINTS §9）。
    const mdTableLine = /^\s*\|.+\|\s*$/;
    const mdTableSplit = /^\s*\|[\s:|-]+\|\s*$/;
    const mdStatusLine = /^\s*[【\[]状态[】\]]\s*$/;
    const mdStatusEnd = /^\s*[【\[]\/状态[】\]]\s*$/;

    function mdInline(line) {
        let out = line;
        const codes = [];
        out = out.replace(/`([^`]+)`/g, (_,code) => { codes.push(code); return `\u0000${codes.length - 1}\u0000`; });
        out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                 .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
                 .replace(/~~([^~]+)~~/g, '<del>$1</del>');
        out = out.replace(/\u0000(\d+)\u0000/g, (_,index) => `<code class="p-md-code">${codes[Number(index)]}</code>`);
        return out;
    }

    function mdStatusCard(lines) {
        const rows = lines.map(line => {
            const match = line.match(/^([^：:]{1,40})\s*[：:]\s*(.*)$/);
            if (!match) return null;
            return `<div class="p-status-row"><span class="p-status-key">${mdInline(match[1].trim())}</span><span class="p-status-value">${mdInline(match[2].trim())}</span></div>`;
        }).filter(Boolean);
        if (!rows.length) return mdInline(lines.join('\n'));
        return `<div class="p-status-block"><div class="p-status-title">状态</div>${rows.join('')}</div>`;
    }

    function mdTableBlock(headerCells, bodyRows) {
        const cell = (content, tag) => `<${tag}>${mdInline(content.trim())}</${tag}>`;
        const head = headerCells.length ? `<thead><tr>${headerCells.map(cellValue => cell(cellValue,'th')).join('')}</tr></thead>` : '';
        const body = bodyRows.map(row => `<tr>${row.map(cellValue => cell(cellValue,'td')).join('')}</tr>`).join('');
        return `<div class="p-md-table"><table>${head}<tbody>${body}</tbody></table></div>`;
    }

    function renderMarkdownText(escaped) {
        const lines = escaped.split('\n');
        const blocks = [];
        let paragraph = [], list = null, quote = null, table = null, code = null, status = null;
        const flushParagraph = () => { if (paragraph.length) { blocks.push(`<p>${paragraph.map(mdInline).join('<br>')}</p>`); paragraph = []; } };
        const flushList = () => { if (list) { blocks.push(`<${list.tag} class="p-md-list">${list.items.map(item => `<li>${mdInline(item)}</li>`).join('')}</${list.tag}>`); list = null; } };
        const flushQuote = () => { if (quote) { blocks.push(`<blockquote class="p-md-quote">${quote.map(mdInline).join('<br>')}</blockquote>`); quote = null; } };
        const flushTable = () => { if (table) { blocks.push(mdTableBlock(table.header, table.rows)); table = null; } };
        const flushStatus = () => { if (status) { blocks.push(mdStatusCard(status)); status = null; } };
        const flushAll = () => { flushParagraph(); flushList(); flushQuote(); flushTable(); flushStatus(); };
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            const trimmed = line.trim();
            if (code !== null) { if (/^```/.test(trimmed)) { blocks.push(`<pre class="p-md-codeblock"><code>${code.join('\n')}</code></pre>`); code = null; } else code.push(line); continue; }
            if (/^```/.test(trimmed)) { flushAll(); code = []; continue; }
            if (!trimmed) { flushAll(); continue; }
            if (mdStatusLine.test(trimmed)) { flushAll(); status = []; continue; }
            if (mdStatusEnd.test(trimmed)) { flushAll(); continue; }
            if (status !== null) { if (/^([^：:]{1,40})\s*[：:]\s*(.*)$/.test(trimmed)) status.push(trimmed); else { flushStatus(); paragraph.push(line); } continue; }
            if (/^(-{3,}|\*{3,})$/.test(trimmed)) { flushAll(); blocks.push('<hr class="p-md-hr">'); continue; }
            if (mdTableLine.test(trimmed) && index + 1 < lines.length && mdTableSplit.test(lines[index + 1])) {
                flushAll();
                table = {header: trimmed.replace(/^\||\|$/g,'').split('|'), rows: []};
                index += 1;
                continue;
            }
            if (table !== null && mdTableLine.test(trimmed)) { table.rows.push(trimmed.replace(/^\||\|$/g,'').split('|')); continue; }
            flushTable();
            const quoteMatch = trimmed.match(/^&gt;\s?(.*)$/);
            if (quoteMatch) { if (quote === null) { flushParagraph(); flushList(); quote = []; } quote.push(quoteMatch[1]); continue; }
            flushQuote();
            const listMatch = trimmed.match(/^(?:[-*]|\d+[.、])\s+(.*)$/);
            if (listMatch) {
                if (paragraph.length) flushParagraph();
                const tag = /^\d/.test(trimmed) ? 'ol' : 'ul';
                if (list === null || list.tag !== tag) { flushList(); list = {tag, items: []}; }
                list.items.push(listMatch[1]);
                continue;
            }
            flushList();
            const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
            if (heading) { flushParagraph(); blocks.push(`<div class="p-md-heading" data-level="${heading[1].length}">${mdInline(heading[2])}</div>`); continue; }
            paragraph.push(line);
        }
        flushAll();
        if (code !== null) blocks.push(`<pre class="p-md-codeblock"><code>${code.join('\n')}</code></pre>`);
        if (status !== null) blocks.push(mdStatusCard(status));
        return blocks.join('');
    }

    function sanitizeRichTable(html) {
        const allowed = ['table','thead','tbody','tfoot','tr','th','td','caption','colgroup','col','br'];
        return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
            .replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^<>]*)?)>/g, (whole, closing, tag, attrs) => {
                const name = tag.toLowerCase();
                if (!allowed.includes(name)) return esc(whole);
                const keep = [...attrs.matchAll(/\s(colspan|rowspan|scope)="?([^"\s>]*)"?/gi)].map(entry => ` ${entry[1].toLowerCase()}="${esc(entry[2])}"`).join('');
                return `<${closing}${name}${keep}>`;
            });
    }

    function renderMarkdownBlocks(raw) {
        const text = String(raw ?? '');
        const segments = [];
        const pattern = /<(think|table)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
        let cursor = 0, match;
        while ((match = pattern.exec(text))) {
            if (match.index > cursor) segments.push({type:'md', content:text.slice(cursor, match.index)});
            if (match[1].toLowerCase() === 'think') segments.push({type:'think', content:match[0].replace(/^<think\b[^>]*>/i,'').replace(/<\/think\s*>$/i,'')});
            else segments.push({type:'table', content:match[0]});
            cursor = match.index + match[0].length;
        }
        if (cursor < text.length) segments.push({type:'md', content:text.slice(cursor)});
        return segments.map(segment => {
            if (segment.type === 'think') return `<details class="p-md-think"><summary>思考过程</summary><div class="p-md-think-body">${renderMarkdownText(esc(segment.content))}</div></details>`;
            if (segment.type === 'table') return `<div class="p-md-table">${sanitizeRichTable(segment.content)}</div>`;
            return renderMarkdownText(esc(segment.content));
        }).join('');
    }

    function messageMarkup(text) {
        return renderMarkdownBlocks(text);
    }

    function syncMessageMetadata(record) {
        record.count = record.messages.length;
        record.lastMessage = record.messages.at(-1)?.text || '';
    }

    function normalizeWork(value, index = 0) {
        const id = stableId(value.id, `recovered-work-${index}`);
        const name = textValue(value.name);
        // 「公开性格」老字段里同时存过 description；分开后旧草稿的 description 仍回填到性格，避免丢字。
        const personality = textValue(value.personality, value.cardDescription === undefined ? textValue(value.description) : '');
        const cardDescription = textValue(value.cardDescription);
        const depthPrompt = plainRecord(value.depthPrompt) ? value.depthPrompt : {};
        return {...value,id,name,local:true,author:'林见白',initial:Array.from(name)[0] || '新',hue:24,
            added:true,favorite:value.favorite === true,chats:'0',
            hook:textValue(value.hook),greeting:textValue(value.greeting),
            personality,scenario:textValue(value.scenario),
            // ST 卡的 description 是「角色描述」，与性格、场景分开保存；详情页展示用的 description 仍是三者拼接。
            cardDescription,
            description:[cardDescription,personality,textValue(value.scenario)].filter(Boolean).join('\n'),
            instructions:textValue(value.instructions),category:textValue(value.category,'现代'),
            // 以下字段对应 ST 角色卡 V2：mes_example / system_prompt / post_history_instructions / extensions.depth_prompt / creator_notes。
            mesExample:textValue(value.mesExample),
            systemPrompt:textValue(value.systemPrompt),
            postHistory:textValue(value.postHistory),
            depthPrompt:{text:textValue(depthPrompt.text),depth:optionalNumber(depthPrompt.depth,0,999) ?? 4,role:loreRoles.includes(depthPrompt.role) ? depthPrompt.role : 'system'},
            creatorNotes:textValue(value.creatorNotes),
            regexScripts:Array.isArray(value.regexScripts) ? value.regexScripts.filter(plainRecord).map(normalizeRegexRule) : [],
            tags:Array.isArray(value.tags) ? value.tags.filter(tag => typeof tag === 'string') : [],
            nsfw:value.nsfw === true,pace:textValue(value.pace,'私人角色 · 本地模拟'),
            alternateGreetings:Array.isArray(value.alternateGreetings) ? value.alternateGreetings.filter(item => typeof item === 'string') : [],
            avatarData:textValue(value.avatarData),coverData:textValue(value.coverData),
            status:['draft','pending','published','rejected'].includes(value.status) ? value.status : 'draft',
            revision:Number.isInteger(value.revision) && value.revision > 0 ? value.revision : 1,
            updated:Number.isFinite(value.updated) ? value.updated : 0,
        };
    }

    function normalizeRoom(value, index = 0) {
        const members = Array.isArray(value.members) ? [...new Set(value.members.filter(id => typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id)))] : [];
        // v1 stored only a preview, not a transcript. Preserve that preview without inventing history.
        const messages = Array.isArray(value.messages) ? normalizeMessages(value.messages,false) :
            (typeof value.lastMessage === 'string' && value.lastMessage ? [{role:'system',text:`旧版房间摘要（原版未保存完整消息）：${value.lastMessage}`}] : []);
        const room = {...value,id:stableId(value.id,`recovered-room-${index}`),chatId:stableId(value.chatId,`recovered-room-chat-${index}`),
            name:textValue(value.name,'未命名房间'),members,messages,draft:textValue(value.draft),
            strategy:['natural','round-robin','manual','pooled','free'].includes(value.strategy) ? value.strategy : 'round-robin',
            muted:Array.isArray(value.muted) ? value.muted.filter(id => members.includes(id)) : [],
            autoMode:value.autoMode === true,
            speakerId:members.includes(value.speakerId) ? value.speakerId : members[0] || '',
            nextSpeaker:Number.isInteger(value.nextSpeaker) && value.nextSpeaker >= 0 ? value.nextSpeaker : 0,
            time:textValue(value.time,'本地记录'),updated:Number.isFinite(value.updated) ? value.updated : 0,
        };
        syncMessageMetadata(room);
        return room;
    }

    function statePayload() {
        return {...stateExtras,version:stateVersion,chats,rooms,personas,creatorWorks,loreBooks,loreSettings,allowedCardRegex,quickReplies,presets,regexRules,activePresetId,globalVars,hideStatusBlock,selectedPersona,
            characters:Object.fromEntries(Object.values(characters).map(character => [character.id,{added:character.added,favorite:character.favorite}])),
        };
    }

    function saveState(silent = false) {
        try {
            if (stateReadOnly) throw new Error('unsupported state version');
            if (stateBackupPending !== null) {
                // Never overwrite a v1/corrupt payload without first preserving its exact bytes.
                sessionStorage.setItem(resourceId(`${stateKey}-recovery`), stateBackupPending);
                stateBackupPending = null;
            }
            const serialized = JSON.stringify(statePayload());
            sessionStorage.setItem(stateKey, serialized);
            if (sessionStorage.getItem(stateKey) !== serialized) throw new Error('state readback failed');
            return true;
        } catch {
            if (!silent) toast(stateReadOnly ? '存档版本较新，已保留原数据；当前页面不能覆盖保存。' : '本地保存失败（存储不可用或空间不足）。内容未确认保存，请勿离开页面。','err');
            return false;
        }
    }

    function loadState() {
        let raw = null;
        personas.splice(0,personas.length,...personas.map(normalizePersonaFields));
        try {
            raw = sessionStorage.getItem(stateKey);
            const stored = JSON.parse(raw || 'null');
            if (stored !== null && (!plainRecord(stored) || ![1,stateVersion].includes(stored.version))) {
                stateReadOnly = true;
                chats.forEach(syncMessageMetadata);
                rooms.splice(0,rooms.length,...rooms.map(normalizeRoom));
                return;
            }
            if (stored) {
                stateExtras = {...stored};
                if (Array.isArray(stored.creatorWorks)) creatorWorks.push(...stored.creatorWorks.filter(plainRecord).map(normalizeWork));
                if (Array.isArray(stored.loreBooks)) loreBooks = stored.loreBooks.filter(plainRecord).map(normalizeLoreBook);
                loreSettings = normalizeLoreSettings(stored.loreSettings);
                quickReplies = normalizeQuickReplies(stored.quickReplies);
                allowedCardRegex = Array.isArray(stored.allowedCardRegex) ? [...new Set(stored.allowedCardRegex.filter(id => typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id)))] : [];
                if (Array.isArray(stored.presets)) presets = stored.presets.filter(plainRecord).map(normalizePreset);
                if (Array.isArray(stored.regexRules)) regexRules = stored.regexRules.filter(plainRecord).map(normalizeRegexRule);
                activePresetId = typeof stored.activePresetId === 'string' ? stored.activePresetId : '';
                globalVars = normalizeVars(stored.globalVars);
                hideStatusBlock = stored.hideStatusBlock !== false;
                if (Array.isArray(stored.personas)) {
                    const merged = new Map(personas.map(persona => [persona.id,persona]));
                    stored.personas.filter(plainRecord).forEach((value,index) => {
                        const id = stableId(value.id,`recovered-persona-${index}`);
                        const name = textValue(value.name,'未命名身份');
                        merged.set(id,normalizePersonaFields({...value,id,name,description:textValue(value.description),initial:textValue(value.initial,Array.from(name)[0] || '我'),hue:Number.isFinite(value.hue) ? value.hue : 28}));
                    });
                    personas.splice(0,personas.length,...merged.values());
                }
                selectedPersona = personas.some(persona => persona.id === stored.selectedPersona) ? stored.selectedPersona : 'night';
                if (Array.isArray(stored.chats)) chats = stored.chats.filter(plainRecord).map((chat,index) => ({...chat,
                    id:stableId(chat.id,`recovered-chat-${index}`),characterId:stableId(chat.characterId,'missing-character'),
                    title:textValue(chat.title,'未命名故事'),opening:textValue(chat.opening,'default'),
                    personaId:stableId(chat.personaId,'default'),updated:Number.isFinite(chat.updated) ? chat.updated : 0,
                    time:textValue(chat.time,'本地记录'),messages:normalizeMessages(chat.messages),
                    summary:plainRecord(chat.summary) ? {text:textValue(chat.summary.text),covered:Number.isFinite(chat.summary.covered)?chat.summary.covered:0,source:chat.summary.source === 'manual' ? 'manual' : 'auto'} : {text:'',covered:0,source:'auto'},
                    summaryPrefs:{enabled:!(plainRecord(chat.summaryPrefs) && chat.summaryPrefs.enabled === false),interval:Number.isFinite(chat.summaryPrefs?.interval) && chat.summaryPrefs.interval >= 4 && chat.summaryPrefs.interval <= 40 ? chat.summaryPrefs.interval : 12},
                }));
                if (Array.isArray(stored.rooms)) rooms.splice(0,rooms.length,...stored.rooms.filter(plainRecord));
                if (plainRecord(stored.characters)) for (const [id,values] of Object.entries(stored.characters)) {
                    if (Object.hasOwn(characters,id) && plainRecord(values)) {
                        if (typeof values.added === 'boolean') characters[id].added = values.added;
                        if (typeof values.favorite === 'boolean') characters[id].favorite = values.favorite;
                    }
                }
            }
            chats.forEach(syncMessageMetadata);
            rooms.splice(0,rooms.length,...rooms.map(normalizeRoom));
            if (stored && JSON.stringify(statePayload()) !== raw) {
                stateBackupPending = raw;
                saveState(true);
            }
        } catch {
            // A malformed JSON value remains untouched until a successful, backed-up explicit save.
            stateBackupPending = raw;
            chats.forEach(syncMessageMetadata);
            rooms.splice(0,rooms.length,...rooms.map(normalizeRoom));
        }
    }

    function normalizePersonaFields(persona) {
        return {...persona,
            descriptionPosition:personaPositions.some(([key]) => key === persona.descriptionPosition) ? persona.descriptionPosition : 'prompt',
            descriptionDepth:optionalNumber(persona.descriptionDepth,0,999) ?? 2,
            descriptionRole:loreRoles.includes(persona.descriptionRole) ? persona.descriptionRole : 'system',
            // ST 的 connections：绑定到某个角色后，和这个角色开新故事默认用这个身份。
            boundCharacters:[...new Set((Array.isArray(persona.boundCharacters) ? persona.boundCharacters : []).filter(id => typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id)))],
        };
    }

    // 开新故事时的身份：绑定了这个角色的身份优先（ST 的 character lock），否则沿用上次选择。
    function personaForCharacter(characterId,fallback) {
        return personas.find(persona => persona.boundCharacters?.includes(characterId))?.id || fallback;
    }

    function savePersona(id, values) {
        const name = textValue(values.name).trim();
        if (!name) return null;
        const index = personas.findIndex(persona => persona.id === id);
        const previous = personas[index];
        const previousSelection = selectedPersona;
        const persona = normalizePersonaFields({...previous,...values,id:previous?.id || resourceId('persona'),name,
            initial:Array.from(name)[0],hue:previous?.hue ?? 28,description:textValue(values.description).trim()});
        if (index < 0) personas.push(persona); else personas[index] = persona;
        selectedPersona = persona.id;
        if (!saveState()) {
            if (index < 0) personas.pop(); else personas[index] = previous;
            selectedPersona = previousSelection;
            return null;
        }
        return persona;
    }

    // 版本快照：每次保存前把上一版存进 versions（最多 5 版），恢复时也走 saveCreatorWork，
    // 因此恢复本身也会留下当前版本的快照——历史不会被覆盖。
    function workSnapshot(work) {
        return {
            revision:work.revision || 0, at:work.updated || Date.now(), name:work.name, hook:work.hook,
            greeting:work.greeting, personality:work.personality, scenario:work.scenario,
            instructions:work.instructions, cardDescription:work.cardDescription,
            tags:[...(work.tags || [])], category:work.category, nsfw:work.nsfw === true,
        };
    }

    function saveCreatorWork(id, values, publish = false) {
        const index = creatorWorks.findIndex(work => work.id === id);
        const previous = creatorWorks[index];
        const versions = Array.isArray(previous?.versions) ? [...previous.versions] : [];
        if (previous) versions.push(workSnapshot(previous));
        const work = normalizeWork({...previous,...values,id:previous?.id || id || resourceId('created'),
            status:publish ? 'pending' : previous?.status || 'draft',updated:Date.now(),revision:(previous?.revision || 0)+1,
            versions:versions.slice(-5)});
        if (publish) work.review = {status:'local-pending',submittedAt:Date.now(),revision:work.revision,note:'本地模拟审核；未发送到服务端，也不会公开到广场。'};
        if (index < 0) creatorWorks.push(work); else creatorWorks[index] = work;
        if (!saveState()) {
            if (index < 0) creatorWorks.pop(); else creatorWorks[index] = previous;
            return null;
        }
        return work;
    }

    loadState();
    // 存档里没有预设时补一个可直接用的默认预设；空规则库是合法状态，不预置规则。
    ensureDefaultPreset();
    const readStore = (key, fallback) => {
        try {
            const value = JSON.parse(sessionStorage.getItem(key) || 'null');
            if (Array.isArray(fallback)) return Array.isArray(value) ? value.filter(item => typeof item === 'string' || plainRecord(item)) : fallback;
            return value ?? fallback;
        } catch { return fallback; }
    };
    const writeStore = (key, value) => sessionStorage.setItem(key, JSON.stringify(value));
    let notifications = readStore('rp-notifications', [
        {id:'n1',type:'reply',title:'青柠汽水回复了你的评论',text:'「沉默的时候也有戏，细节和关系推进都很自然。」',time:'10 分钟前',unread:true,link:'character.html?id=shen-yanzhi'},
        {id:'n2',type:'version',title:'星港列车长更新到 v2',text:'作者更新了公开版本，旧会话仍保留原版本。',time:'2 小时前',unread:true,link:'character.html?id=lu-shiyan'},
        {id:'n3',type:'moderation',title:'你的举报已处理',text:'管理员已对被举报作品进行核查，处理结果已记录。',time:'昨天',unread:false,link:'settings.html#security'},
        {id:'n4',type:'system',title:'社区安全提醒',text:'请尊重创作者的公开设定，不要在评论中披露他人的私有提示词。',time:'2 天前',unread:false,link:'home.html'},
    ]);
    let reports = readStore('rp-reports', [
        {id:'r1',work:'雨夜便利店',reason:'未标记的成人内容',time:'昨天 21:40',status:'pending'},
        {id:'r2',work:'星港列车长',reason:'其他',time:'3 天前',status:'resolved'},
    ]);
    let blockedCreators = readStore('rp-blocked-creators', []);
    // 余额链要能对上：1,072 − 96 = 976 → +300 = 1,276 → −36 = 1,240（当前余额）
    const transactions = [
        {id:'t1',type:'usage',title:'与沈砚之对话',amount:-36,balance:1240,time:'今天 14:32'},
        {id:'t2',type:'recharge',title:'在线充值 ¥3',amount:300,balance:1276,time:'昨天 09:16'},
        {id:'t3',type:'usage',title:'与林晚照对话',amount:-96,balance:976,time:'周一 22:08'},
        {id:'t4',type:'recharge',title:'卡密兑换 1,000 点',amount:1000,balance:1072,time:'10 月 24 日'},
    ];
    // 点数：余额与本月用量。生图、语音还没有接后端，先按「未开启」展示价格，
    // 这样面板在功能上线前也不会显得是空壳。真实扣点以服务端用量记录为准。
    const pointsAccount = { balance: 1240, used: 760, period: '本月', rate: '1 元 = 100 点' };
    const pointCategories = [
        {key:'text',  label:'文本对话', used:760, on:true,  note:'按上下文长度计费'},
        {key:'image', label:'生图',     used:0,   on:false, note:'每次约 20 点'},
        {key:'voice', label:'语音',     used:0,   on:false, note:'每千字约 30 点'},
    ];
    const pointsLabel = () => `${pointsAccount.balance.toLocaleString()} 点`;
    // 相对时间：列表里的「刚刚 / N 分钟前 / N 天前」一律由 updated 实时算出，不再写死「刚刚」
    const relativeTime = timestamp => {
        if (!Number.isFinite(timestamp) || timestamp <= 0) return '本地记录';
        const diff = Date.now() - timestamp;
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
        if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)} 天前`;
        return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    };
    const unreadCount = () => notifications.filter(item => item.unread).length;
    const saveNotifications = () => writeStore('rp-notifications', notifications);
    const pushNotification = (title, text, type = 'system', link = 'notifications.html') => {
        notifications.unshift({id:`n-${Date.now()}`,type,title,text,time:'刚刚',unread:true,link});
        saveNotifications();
    };
    const saveReports = () => writeStore('rp-reports', reports);
    const saveBlockedCreators = () => writeStore('rp-blocked-creators', blockedCreators);
    // 自动快照：与存档分离存放，防止误删/误改后无可回退。只在标签页内有效，不联网。
    let chatSnapshots = readStore('rp-chat-backups', {});
    const saveChatSnapshots = () => writeStore('rp-chat-backups', chatSnapshots);
    const chatSnapshotsFor = chatId => chatSnapshots[chatId] || [];
    function snapshotChat(chat) {
        const list = chatSnapshots[chat.id] || [];
        list.push({at:Date.now(),count:chat.messages.length,title:chat.title,messages:cloneChatValue(chat.messages)});
        chatSnapshots[chat.id] = list.slice(-5);
        saveChatSnapshots();
    }

    // 角色评论：按 characterId 持久化；首次评论时把种子评论一并落库，之后可删自己的评论
    const commentSeed = [{name:'青柠汽水',initial:'青',hue:206,time:'2 天前',text:'沉默的时候也有戏，细节和关系推进都很自然。'}];
    let characterComments = readStore('rp-character-comments', {});
    const saveComments = () => writeStore('rp-character-comments', characterComments);
    const commentsFor = characterId => characterComments[characterId] || commentSeed;

    let currentChat = null;
    let selectedGreeting = 'default';
    let selectedOpening = 'default';
    let busy = false;
    let generationTimer = null;
    let generationRequest = 0;
    let modalId = 0;
    const modalStack = [];
    let cinemaNavCleanup = null;
    let showcaseGallery = null;
    let showcaseRequest = 0;

    function disposeShowcase() {
        showcaseRequest += 1;
        showcaseGallery?.destroy();
        showcaseGallery = null;
    }

    let modalBackground = null;
    function syncModals() {
        const body = document.body;
        if (modalStack.length && !modalBackground) {
            modalBackground = {x:window.scrollX || 0,y:window.scrollY || 0,styles:{},inert:new Map()};
            for (const key of ['overflow','position','top','width']) modalBackground.styles[key] = body.style[key];
            body.style.overflow = 'hidden';
            body.style.position = 'fixed';
            body.style.top = `-${modalBackground.y}px`;
            body.style.width = '100%';
        }
        for (const element of [...body.children]) {
            if (element.classList?.contains('p-modal-root')) {
                const top = element === modalStack.at(-1);
                element.inert = !top;
                element.setAttribute('aria-hidden', String(!top));
            } else if (element.id !== 'modal-sentinel' && !element.classList?.contains('p-toast-region') && modalBackground) {
                if (!modalBackground.inert.has(element)) modalBackground.inert.set(element,element.inert);
                element.inert = true;
            }
        }
        if (!modalStack.length && modalBackground) {
            const saved = modalBackground;
            modalBackground = null;
            Object.assign(body.style,saved.styles);
            for (const [element,inert] of saved.inert) element.inert = inert;
            window.scrollTo?.(saved.x,saved.y);
        }
    }

    // Editorial Monocle: one visible-height budget; keyboard simulation is not device validation.
    // Single IME guard shared by the composer and dialogs so a candidate-confirming
    // Enter can never submit a message or a destructive confirm.
    function isImeCommit(event) {
        const target = event.target;
        return Boolean(event.isComposing) || event.keyCode === 229 ||
            target?.dataset?.composing === 'true' ||
            Date.now() - Number(target?.dataset?.compositionEnded || 0) <= 80;
    }
    function inputType(target) {
        return target.type || target.getAttribute?.('type') || '';
    }
    function visibleViewport() {
        const viewport = window.visualViewport;
        const usable = viewport && (!viewport.scale || Math.abs(viewport.scale - 1) < .01);
        return {height:usable ? viewport.height : (window.innerHeight || 800),top:usable ? viewport.offsetTop || 0 : 0};
    }
    function resizeChatInput(input = $('#message-input')) {
        if (!input) return;
        const cap = Math.max(56,Math.min(160,visibleViewport().height * .24));
        input.style.height = '56px';
        if (input.value) input.style.height = `${Math.min(Math.max(input.scrollHeight,56),cap)}px`;
    }
    function syncVisibleViewport() {
        const {height,top} = visibleViewport();
        document.documentElement.style.setProperty('--rp-viewport-height',`${height}px`);
        document.documentElement.style.setProperty('--rp-viewport-top',`${top}px`);
        document.documentElement.dataset.rpCompact = String(height < 480);
        // Retain the reading offset, rather than forcing the latest message on every resize.
        const scroll = $('#chat-scroll'), offset = scroll?.scrollTop;
        resizeChatInput();
        if (scroll && offset !== undefined) scroll.scrollTop = offset;
    }

    const getCharacter = id => (Object.hasOwn(characters,id) ? characters[id] : creatorWorks.find(work => work.id === id)) ||
        (id ? {id,name:'角色资料暂不可用',initial:'?',hue:0,author:'本地记录',tags:[],greeting:'',hook:'原始会话仍保留。',description:'',pace:'资料缺失',missing:true} : undefined);
    const getPersona = id => personas.find(persona => persona.id === id) || personas.find(persona => persona.id === 'default') || personas[0];
    const chatFor = id => chats.find(chat => chat.id === id);
    const chatsFor = characterId => chats.filter(chat => chat.characterId === characterId).sort((a,b) => b.updated-a.updated);
    const recentChat = characterId => chatsFor(characterId)[0];
    const avatar = (character, size = 36) => `<span class="p-avatar" style="--size:${size}px;--h:${character.hue}">${esc(character.initial)}</span>`;

    const sceneImage = character => character.scene ? `<img src="scenes/${encodeURI(character.scene)}" alt="" loading="lazy" onerror="this.remove();this.parentElement.classList.remove('has-scene')">` : '';
    const cover = (character, className = 'p-work-cover') => {
        const gated = character.nsfw && sessionStorage.getItem('rp-nsfw') !== 'true';
        const compact = /p-library|p-create|p-row|p-avatar/.test(className);
        const artSrc = ['shen-yanzhi','lin-wanzhao','bai-lu','lu-shiyan','a-heng','xie-wujiu'].includes(character.id)
            ? `assets/characters/${encodeURI(character.id)}.jpg`
            : (typeof character.portrait === 'string' ? character.portrait : '');
        const art = Boolean(artSrc);
        return `<div class="p-cover ${className}${art?' has-portrait':character.scene?' has-scene':''}${gated?' is-obscured':''}" style="--h:${character.hue}" data-initial="${esc(character.initial)}" role="img" aria-label="${esc(character.name)}的${art?'立绘':'场景封面'}">${art?`<img src="${artSrc}" alt="" loading="lazy" onerror="this.remove();this.parentElement.classList.remove('has-portrait')">`:sceneImage(character)}${gated?`<div class="p-cover-gate${compact?' p-cover-gate--sm':''}"><strong>18+</strong>${compact?'':'<span>开启“显示 NSFW”后查看</span>'}</div>`:''}</div>`;
    };
    const roomChat = id => rooms.find(room => room.chatId === id);
    const isRoom = id => Boolean(roomChat(id));

    function toast(message, type = 'ok') {
        let region = $('.p-toast-region');
        if (!region) {
            region = document.createElement('div');
            region.className = 'p-toast-region';
            region.setAttribute('aria-live', 'polite');
            document.body.appendChild(region);
        }
        const item = document.createElement('div');
        item.className = `p-toast p-toast--${type}`;
        item.innerHTML = `${icon(type === 'err' ? 'warning' : 'check')}<span>${esc(message)}</span><button class="p-toast-close" type="button" aria-label="关闭提示">${icon('close')}</button>`;
        $('.p-toast-close',item).addEventListener('click', () => item.remove());
        region.appendChild(item);
        setTimeout(() => item.remove(), 4200);
    }

    function openModal({title,body,confirmText = '确定',cancelText = '取消',danger = false,onConfirm = null,wide = false}) {
        const focusBefore = document.activeElement;
        const id = `modal-title-${++modalId}`;
        const overlay = document.createElement('div');
        overlay.className = 'p-modal-root';
        overlay.innerHTML = `<section class="p-modal" role="dialog" aria-modal="true" aria-labelledby="${id}" ${wide ? 'style="width:min(680px,100%)"' : ''}>
            <header class="p-modal-head"><h3 id="${id}">${esc(title)}</h3><button class="p-modal-close" type="button" aria-label="关闭弹窗">${icon('close')}</button></header>
            <div class="p-modal-body">${body}</div>
            <div class="p-modal-actions"><button class="p-btn" type="button" data-modal-cancel>${esc(cancelText)}</button><button class="p-btn ${danger ? 'p-btn--danger' : 'p-btn--primary'}" type="button" data-modal-confirm>${esc(confirmText)}</button></div>
        </section>`;
        document.body.appendChild(overlay);
        modalStack.push(overlay);
        syncModals();
        const close = () => {
            overlay.remove();
            const index = modalStack.indexOf(overlay);
            if (index >= 0) modalStack.splice(index, 1);
            syncModals();
            if (focusBefore?.isConnected && !focusBefore.closest('[inert]')) focusBefore.focus?.({preventScroll:true});
        };
        $('.p-modal-close',overlay).addEventListener('click', close);
        $('[data-modal-cancel]',overlay).addEventListener('click', close);
        overlay.addEventListener('click', event => { if(event.target === overlay) close(); });
        $('[data-modal-confirm]',overlay).addEventListener('click', () => {
            if (onConfirm?.(overlay,close) === false) return;
            if (onConfirm) return;
            close();
        });
        overlay.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); close(); }
            if (event.key === 'Tab') {
                const elements = $$('button:not([disabled]),a[href],input,textarea,select,[tabindex="0"]',overlay).filter(el => el.offsetParent !== null);
                const first = elements[0], last = elements.at(-1);
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
            if (event.key === 'Enter' && event.target.tagName === 'INPUT' && inputType(event.target) !== 'checkbox' && !isImeCommit(event)) $('[data-modal-confirm]',overlay)?.click();
        });
        setTimeout(() => { if (modalStack.at(-1) === overlay) $('.p-modal-close',overlay)?.focus({preventScroll:true}); },0);
        return {overlay,close};
    }

    function confirmAction(title, text, confirmText, action, danger = true) {
        openModal({title,body:`<p>${esc(text)}</p>`,confirmText,danger,onConfirm: (_,close) => {close(); action();}});
    }

    function cinemaNav(active) {
        const items = [
            ['home','home.html','发现'],
            ['plaza','plaza.html','广场'],
            ['chats','chats.html','对话'],
            ['create','create.html','创作'],
            ['settings','settings.html','我的'],
        ];
        // 首页不再裁掉主导航：桌面端没有底部标签栏，少了「对话/创作/我的」就进不去
        const links = items.map(([id,href,label]) => `<a href="${href}" ${active === id ? 'aria-current="page"' : ''}>${label}</a>`).join('');
        return `<div class="p-cinema-shell">
            <header class="p-cinema-nav">
                <nav class="p-cinema-nav-left" aria-label="主导航">${links}</nav>
                <a class="p-cinema-logo" href="home.html">酒馆</a>
                <div class="p-cinema-nav-right">
                    <div class="p-view-switch" role="group" aria-label="浏览模式"><button type="button" data-view-mode="classic" aria-pressed="${viewMode === 'classic'}">经典</button><button type="button" data-view-mode="cinema" aria-pressed="${viewMode === 'cinema'}">影院</button></div>
                    <button class="p-cinema-icon" id="notification-button" type="button" aria-label="通知${unreadCount() ? `，${unreadCount()} 条未读` : ''}">${icon('bell')}${unreadCount() ? `<span class="p-unread-badge">${unreadCount()}</span>` : ''}</button>
                    ${pointsMenu()}
                    <a class="p-cinema-account" href="settings.html" aria-label="我的账号">林</a>
                </div>
            </header>
            <main class="p-cinema-main"><div class="p-cinema-page" id="app"></div></main>
            <nav class="p-tabbar" aria-label="主导航">${items.map(([id,href,label]) => `<a href="${href}" ${active === id ? 'aria-current="page"' : ''}>${icon(id === 'home' ? 'home' : id === 'plaza' ? 'compass' : id === 'chats' ? 'chat' : id === 'create' ? 'create' : 'user')}<span>${label}</span></a>`).join('')}</nav>
        </div>`;
    }

    let settingsSpy = null;
    // 「我的」的分区目录：桌面端直接放进主站侧栏（带返回上一级），正文里不再重复一列
    const settingsSections = [
        ['account', '账号', 'user'],
        ['points', '点数与充值', 'coin'],
        ['appearance', '聊天外观', 'eye'],
        ['identities', '我的身份', 'users'],
        ['characters', '角色库', 'book'],
        ['security', '安全与隐私', 'shield'],
        ['import', '导入与数据', 'download'],
    ];

    // 顶栏点数：悬停或点击展开，显示本月分项消耗（文本 / 生图 / 语音）。
    // 生图与语音还没有后端，先按「未开启」展示价格，避免面板看起来是空壳。
    function pointsMenu() {
        const rows = pointCategories.map(item => `<li class="p-points-row${item.on ? '' : ' is-off'}"><span class="p-points-name">${esc(item.label)}</span><span class="p-points-meta">${item.on ? `−${item.used.toLocaleString()} 点` : `<em>未开启</em>${esc(item.note)}`}</span></li>`).join('');
        return `<div class="p-points" data-points-menu>
            <button class="p-points-trigger" id="points-trigger" type="button" aria-expanded="false" aria-controls="points-panel" aria-haspopup="dialog">${icon('coin')}<span>${pointsLabel()}</span></button>
            <div class="p-points-panel" id="points-panel" role="dialog" aria-label="点数与消耗" hidden>
                <div class="p-points-head"><span>余额</span><strong>${pointsLabel()}</strong></div>
                <p class="p-points-sub">${pointsAccount.period}已用 ${pointsAccount.used.toLocaleString()} 点 · ${esc(pointsAccount.rate)}</p>
                <ul class="p-points-list">${rows}</ul>
                <div class="p-points-actions"><a class="p-btn p-btn--primary p-btn--sm" href="settings.html#points">充值</a><button class="p-btn p-btn--sm" id="points-history" type="button">点数记录</button></div>
                <p class="p-points-foot">本地演示：不调用模型、不扣点，数值为示例。</p>
            </div>
        </div>`;
    }

    function nav(active) {
        if (isCinema() && narrativePage()) return cinemaNav(active);
        const items = [
            ['home','home.html','发现','home'],
            ['plaza','plaza.html','广场','compass'],
            ['chats','chats.html','对话','chat'],
            ['create','create.html','创作','create'],
            ['settings','settings.html','我的','user'],
        ];
        const links = items.map(([id,href,label,iconName]) => `<a class="p-nav-item" href="${href}" ${active === id ? 'aria-current="page"' : ''}>${icon(iconName)}<span>${label}</span></a>`).join('');
        const recent = chats.slice().sort((a,b)=>b.updated-a.updated).slice(0,3).map(chat => {
            const character = getCharacter(chat.characterId);
            return `<a class="p-side-recent" href="chat.html?chat=${chat.id}">${['shen-yanzhi','lin-wanzhao','bai-lu','lu-shiyan','a-heng','xie-wujiu'].includes(character.id)?`<span class="p-avatar p-avatar--art" style="--size:26px;--h:${character.hue}"><img src="assets/characters/${encodeURI(character.id)}.jpg" alt=""></span>`:avatar(character,26)}<span>${esc(character.name)}<small>${esc(chat.title)}</small></span></a>`;
        }).join('');
        // 切换入口在所有页面都保留：只放在叙事页时，进到对话列表/设置就回不去经典视图了
        // 设置页用分区目录替换主导航，顶部给一个返回上一级
        const sectionSide = page === 'settings';
        const viewSwitch = `<div class="p-view-switch" role="group" aria-label="浏览模式"><button type="button" data-view-mode="classic" aria-pressed="${viewMode === 'classic'}">经典</button><button type="button" data-view-mode="cinema" aria-pressed="${viewMode === 'cinema'}">影院</button></div>`;
        return `<div class="p-shell">
            <aside class="p-side">
                <a class="p-brand" href="home.html"><div class="p-mark">酒</div><div class="p-brand-name">酒馆</div></a>
                ${sectionSide ? `<button class="p-side-back" id="side-back" type="button" aria-label="返回上一级">${icon('back')}<span>返回上一级</span></button>
                <div class="p-nav-label">我的</div>
                <nav class="p-nav" aria-label="设置目录">${settingsSections.map(([id, label, ic]) => `<a class="p-nav-item" href="#${id}" data-side-toc="${id}">${icon(ic)}<span>${label}</span></a>`).join('')}</nav>` : `<nav class="p-nav" aria-label="主导航">${links}</nav>
                <div class="p-nav-label">继续故事</div>
                <nav class="p-nav p-side-recents" aria-label="最近会话">${recent}</nav>
                <a class="p-side-recent" href="rooms.html">${icon('users')}<span>多角色房间</span></a>
                <a class="p-side-recent" href="library.html">${icon('book')}<span>我的角色库</span></a>`}
                <div class="p-side-foot"><a class="p-user-row" href="settings.html">${avatar({initial:'林',hue:28},32)}<span><span class="p-user-name">林见白</span><br><span class="p-user-sub">${pointsLabel()}</span></span></a></div>
            </aside>
            <div class="p-main">
                <header class="p-topbar">
                    <label class="p-search">${icon('search')}<input class="p-input" type="search" data-global-search placeholder="搜索角色、作者或剧情" aria-label="搜索角色、作者或剧情"></label>
                    ${viewSwitch}
                    <button class="p-topbar-icon" id="notification-button" type="button" aria-label="通知${unreadCount() ? `，${unreadCount()} 条未读` : ''}">${icon('bell')}${unreadCount() ? `<span class="p-unread-badge">${unreadCount()}</span>` : ''}</button>
                    ${pointsMenu()}
                    <a class="p-avatar" href="settings.html" style="--size:36px;--h:28" aria-label="我的账号">林</a>
                </header>
                <main class="p-page"><div class="p-inner" id="app"></div></main>
            </div>
        </div>
        <nav class="p-tabbar" aria-label="主导航">${items.map(([id,href,label,iconName]) => `<a href="${href}" ${active === id ? 'aria-current="page"' : ''}>${icon(iconName)}<span>${label}</span></a>`).join('')}</nav>`;
    }

    function bindCinemaNav() {
        cinemaNavCleanup?.();
        cinemaNavCleanup = null;
        const cinemaNav = $('.p-cinema-nav');
        if (!cinemaNav) return;
        const overHero = page === 'character';
        const threshold = innerHeight - 80;
        const update = () => cinemaNav.classList.toggle('is-solid', !overHero || scrollY > threshold);
        update();
        addEventListener('scroll', update, { passive: true });
        cinemaNavCleanup = () => removeEventListener('scroll', update);
    }

    function bindPointsMenu() {
        const root = $('[data-points-menu]');
        if (!root) return;
        const trigger = $('#points-trigger', root), panel = $('#points-panel', root);
        if (!trigger || !panel) return;
        // 悬停只是临时展开，移开就收；点一下把它钉住，再点一下才关闭。
        // 否则「悬停打开 → 点击关闭」会让人觉得按钮是坏的。
        let pinned = false, closeTimer = null;
        const open = () => { clearTimeout(closeTimer); panel.hidden = false; trigger.setAttribute('aria-expanded', 'true'); };
        const close = () => { clearTimeout(closeTimer); pinned = false; panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
        trigger.addEventListener('click', () => { if (pinned) close(); else { pinned = true; open(); } });
        trigger.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); pinned = true; open(); $('#points-history', panel)?.focus(); }
        });
        root.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') open(); });
        root.addEventListener('pointerleave', event => {
            if (event.pointerType === 'mouse' && !pinned) closeTimer = setTimeout(close, 180);
        });
        root.addEventListener('focusout', event => { if (!pinned && !root.contains(event.relatedTarget)) close(); });
        document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { close(); trigger.focus(); } });
        document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) close(); });
        $('#points-history', panel)?.addEventListener('click', () => { close(); openBillingHistory(); });
    }

    function mount(active) {
        disposeShowcase();
        cinemaNavCleanup?.();
        cinemaNavCleanup = null;
        document.body.innerHTML = nav(active);
        $('#notification-button')?.addEventListener('click', () => { location.href = 'notifications.html'; });
        bindPointsMenu();
        if (!window.__navHelpers) {
            window.__navHelpers = true;
            const prefetched = new Set();
            const resolve = link => {
                const href = link.getAttribute && link.getAttribute('href');
                if (!href || href.startsWith('#')) return null;
                try { return new URL(href, location.href); } catch { return null; }
            };
            // 多页原型每次跳转都是整页重载；悬停先取目标 HTML，浏览器缓存命中后跳转明显变快
            document.addEventListener('pointerover', event => {
                if (typeof fetch !== 'function') return;
                const link = event.target?.closest?.('a[href]');
                const url = link && resolve(link);
                if (!url || url.origin !== new URL(location.href, 'http://localhost/').origin || !url.pathname.endsWith('.html')) return;
                if (prefetched.has(url.pathname) || navigator?.connection?.saveData) return;
                prefetched.add(url.pathname);
                fetch(url.href, { priority: 'low' }).catch(() => {});
            }, true);
            // 进设置前记下来源，给侧栏「返回上一级」用
            document.addEventListener('click', event => {
                const link = event.target?.closest?.('a[href]');
                const url = link && resolve(link);
                if (!url) return;
                const here = new URL(location.href, 'http://localhost/');
                if (url.pathname.endsWith('settings.html') && !here.pathname.endsWith('settings.html')) {
                    sessionStorage.setItem('rp-settings-return', here.pathname + here.search);
                }
            }, true);
        }
        $('#side-back')?.addEventListener('click', () => {
            // 进设置时已把来源写进 sessionStorage；直接跳转，不依赖 history（新标签打开时 back 无效，慢了还会被兜底劫持）
            location.href = sessionStorage.getItem('rp-settings-return') || 'home.html';
        });
        $('#side-back')?.addEventListener('pointerenter', () => {
            const back = sessionStorage.getItem('rp-settings-return');
            if (back && typeof fetch === 'function') fetch(back, { priority: 'low' }).catch(() => {});
        });
        $$('button[data-view-mode]').forEach(button => button.addEventListener('click', () => setViewMode(button.dataset.viewMode)));
        document.body.dataset.chatBg = stateExtras.preferences?.chatBackground || 'default';
        // 公告文案与后台共享（localStorage['rp-site-announcement']），后台清空即关闭；
        // 「已关闭」记录的是文案本身：后台换了新内容，关过的玩家会重新看到。
        if (!isCinema() && page !== 'chat') {
            // 后台从未配置（键不存在）→ 显示默认社区提醒；后台保存过（含空串=关闭）→ 以后台为准
            const storedAnnouncement = localStorage.getItem('rp-site-announcement');
            const announcementText = storedAnnouncement === null ? '社区提醒：请尊重创作者的公开设定，不要在评论中披露他人的私有提示词。' : storedAnnouncement.trim();
            if (announcementText && sessionStorage.getItem('rp-announcement-dismissed') !== announcementText) {
                const announcement = document.createElement('div');
                announcement.className = 'p-site-announcement';
                announcement.setAttribute('role', 'status');
                announcement.innerHTML = `${icon('info')}<span>${esc(announcementText)}</span><button type="button" aria-label="关闭公告">${icon('close')}</button>`;
                $('.p-page').before(announcement);
                $('button', announcement).addEventListener('click', () => {
                    sessionStorage.setItem('rp-announcement-dismissed', announcementText);
                    announcement.remove();
                });
            }
        }
        if (isCinema()) bindCinemaNav();
        $('.p-proto-link')?.remove();
        if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
            const link = document.createElement('a');
            link.className = 'p-proto-back';
            link.href = 'index.html';
            link.innerHTML = `←<span class="pb-txt"> 原型总览</span>`;
            document.body.appendChild(link);
        }
    }

    function setViewMode(mode) {
        if (!['classic','cinema'].includes(mode) || mode === viewMode) return;
        viewMode = mode;
        try { localStorage.setItem(viewModeKey, mode); } catch {}
        showcaseGallery?.destroy();
        showcaseGallery = null;
        applyViewMode();
        mount(activePages[page]);
        renderers[page]?.();
        window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
        $(`button[data-view-mode="${mode}"]`)?.focus({ preventScroll: true });
    }

    function title(title, subtitle = '', actions = '') {
        return `<header class="p-page-title"><div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${actions ? `<div class="p-page-title-actions">${actions}</div>` : ''}</header>`;
    }

    function workCard(character, {shelf = false} = {}) {
        const fav = character.favorite;
        const gated = character.nsfw && sessionStorage.getItem('rp-nsfw') !== 'true';
        return `<article class="p-card p-work" data-character="${character.id}">
            <div class="p-work-media">
                <a class="p-work-cover p-cover${['shen-yanzhi','lin-wanzhao','bai-lu','lu-shiyan','a-heng','xie-wujiu'].includes(character.id)?' has-portrait':character.scene?' has-scene':''}${gated?' is-obscured':''}" style="--h:${character.hue}" data-initial="${esc(character.initial)}" href="character.html?id=${character.id}" aria-label="查看${esc(character.name)}">${['shen-yanzhi','lin-wanzhao','bai-lu','lu-shiyan','a-heng','xie-wujiu'].includes(character.id)?`<img src="assets/characters/${encodeURI(character.id)}.jpg" alt="" loading="lazy" onerror="this.remove();this.parentElement.classList.remove('has-portrait')">`:sceneImage(character)}${gated?'<div class="p-cover-gate"><strong>18+</strong><span>开启“显示 NSFW”后查看</span></div>':''}</a>
                ${character.nsfw ? '<span class="p-pill p-pill--glass p-pill--sm p-work-nsfw">18+</span>' : ''}
                <button class="p-work-fav" type="button" data-favorite="${character.id}" aria-pressed="${fav}" aria-label="${fav ? '取消收藏' : '收藏'}${esc(character.name)}">${icon('heart')}</button>
            </div>
            <div class="p-work-body">
                <a class="p-card-link" href="character.html?id=${character.id}"><h3 class="p-work-name">${esc(character.name)}</h3><p class="p-work-author">@${esc(character.author)}</p><p class="p-work-desc">${esc(character.hook)}</p></a>
                <div class="p-work-meta"><span class="p-pill p-pill--sm ${character.added ? 'p-pill--ok' : 'p-pill--outline'}">${character.added ? '已添加' : esc(character.category)}</span><span class="p-work-stat">${esc(character.chats)} 人聊过</span></div>
            </div>
        </article>`;
    }

    function continueCard(chat) {
        const character = getCharacter(chat.characterId);
        return `<a class="p-continue-card" href="chat.html?chat=${chat.id}">${['shen-yanzhi','lin-wanzhao','bai-lu','lu-shiyan','a-heng','xie-wujiu'].includes(character.id)?`<span class="p-avatar p-avatar--art" style="--size:40px;--h:${character.hue}"><img src="assets/characters/${encodeURI(character.id)}.jpg" alt=""></span>`:avatar(character,40)}<span class="p-continue-text"><span class="p-continue-name">${esc(character.name)}<span class="p-continue-time"> · ${esc(chat.title)}</span></span><span class="p-continue-last">${esc(chat.lastMessage)}</span></span>${icon('next')}</a>`;
    }

    function roomCard(room) {
        const memberNames = room.members.map(id => getCharacter(id).name).join('、');
        return `<a class="p-continue-card" href="chat.html?chat=${room.chatId}">${avatar({initial:'房',hue:210},40)}<span class="p-continue-text"><span class="p-continue-name">${esc(room.name)}</span><span class="p-continue-last">${esc(memberNames)} · ${esc(room.lastMessage)}</span></span>${icon('users')}</a>`;
    }

    const nsfwAllowed = () => sessionStorage.getItem('rp-nsfw') === 'true';
    const cinemaGate = () => '<div class="p-cover-gate"><strong>18+</strong><span>开启“显示 NSFW”后查看</span></div>';
    const cinemaSectionHead = (kicker, heading, note = '', more = '') => `<div class="p-cinema-section-head"><div><span class="p-cinema-kicker">${esc(kicker)}</span><h2>${esc(heading)}</h2></div><div class="p-cinema-section-side"><span>${esc(note)}</span>${more}</div></div>`;

    function cinemaHero(character, allowed) {
        const gated = !allowed;
        return `<a class="p-cinema-hero${gated?' is-gated':''}" href="character.html?id=${character.id}" data-cinema-open data-cinema-title="${esc(character.name)}">
            <div class="p-cinema-hero-media">${sceneImage(character)}</div>
            <div class="p-cinema-hero-shade"></div>
            ${gated?cinemaGate():''}
            <div class="p-cinema-hero-copy"><span class="p-cinema-kicker">A FILM BY ${esc(character.author)} · 01</span><h1>${esc(character.name)}</h1><p>${gated?'成人向角色。开启“显示 NSFW”后查看场景封面。':esc(character.hook)}</p><span class="p-cinema-cta">进入放映 <i>→</i></span></div>
            <div class="p-cinema-hero-rail">${character.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}<span>${esc(character.chats)} 人聊过</span></div>
            <span class="p-cinema-hero-number">01</span>
        </a>`;
    }

    function cinemaDisc(character, index) {
        const gated = character.nsfw && !nsfwAllowed();
        return `<a class="p-cinema-disc" href="character.html?id=${character.id}" data-cinema-open data-cinema-title="${esc(character.name)}" style="--h:${character.hue}">
            <span class="p-cinema-disc-cover p-cover${character.scene?' has-scene':''}${gated?' is-obscured':''}">${sceneImage(character)}${gated?cinemaGate():''}</span>
            <span class="p-cinema-disc-caption"><span class="p-cinema-disc-index">${String(index+1).padStart(2,'0')}</span><span class="p-cinema-disc-name">${esc(character.name)}</span><span class="p-cinema-disc-author">@${esc(character.author)}</span></span>
        </a>`;
    }

    function cinemaRow(character, index) {
        const gated = character.nsfw && !nsfwAllowed();
        return `<a class="p-cinema-row" href="character.html?id=${character.id}" data-cinema-open data-cinema-title="${esc(character.name)}">
            <span class="p-cinema-row-index">${String(index+1).padStart(2,'0')}</span>
            <span class="p-cinema-row-thumb p-cover${character.scene?' has-scene':''}${gated?' is-obscured':''}">${sceneImage(character)}${gated?cinemaGate():''}</span>
            <span class="p-cinema-row-main"><span class="p-cinema-row-title">${esc(character.name)}</span><span class="p-cinema-row-meta">@${esc(character.author)} · ${character.tags.map(esc).join(' / ')}</span><span class="p-cinema-row-hook">${esc(character.hook)}</span></span>
            <span class="p-cinema-row-end"><span>${esc(character.chats)} 人聊过</span><span class="p-cinema-row-arrow">↗</span></span>
        </a>`;
    }

    function cinemaContinue(chat) {
        const character = getCharacter(chat.characterId);
        return `<a class="p-cinema-continue" href="chat.html?chat=${chat.id}"><span class="p-cinema-continue-cover p-cover${character.scene?' has-scene':''}">${sceneImage(character)}</span><span class="p-cinema-continue-main"><span class="p-cinema-kicker">CONTINUE · ${esc(character.name)}</span><span class="p-cinema-continue-title">${esc(chat.title)}</span><span class="p-cinema-continue-last">${esc(chat.lastMessage)}</span></span><span class="p-cinema-continue-arrow">→</span></a>`;
    }

    function cinemaRoom(room) {
        const members = room.members.map(id => getCharacter(id).name).join(' / ');
        return `<a class="p-cinema-room" href="chat.html?chat=${room.chatId}"><span class="p-cinema-room-mark">房</span><span class="p-cinema-room-main"><span class="p-cinema-kicker">ROOM · ${room.members.length} CHARACTERS</span><span class="p-cinema-room-name">${esc(room.name)}</span><span class="p-cinema-room-last">${esc(members)} · ${esc(room.lastMessage)}</span></span><span class="p-cinema-room-arrow">→</span></a>`;
    }

    function cinemaFilm(character, index, allowed) {
        const gated = !allowed;
        const heading = index === 0 ? 'h1' : 'h2';
        return `<a class="p-cinema-film${gated?' is-gated':''}" href="character.html?id=${character.id}" data-cinema-open data-cinema-title="${esc(character.name)}" style="--name-len:${character.name.length}">
            <div class="p-cinema-film-media">${sceneImage(character)}</div>
            <div class="p-cinema-film-shade"></div>
            ${gated?cinemaGate():''}
            <div class="p-cinema-film-top"><span>FEATURE ${String(index+1).padStart(2,'0')}</span><span>${character.tags.map(esc).join(' · ')}</span></div>
            <div class="p-cinema-film-copy"><span class="p-cinema-kicker">A FILM BY ${esc(character.author)}</span><${heading}>${esc(character.name)}</${heading}><p>${gated?'成人向角色。开启“显示 NSFW”后查看场景封面。':esc(character.hook)}</p><span class="p-cinema-film-cta">进入放映</span></div>
        </a>`;
    }

    function cinemaPoster(character, index) {
        const gated = character.nsfw && !nsfwAllowed();
        return `<article class="p-cinema-poster"><a class="p-cinema-poster-link" href="character.html?id=${character.id}" data-cinema-open data-cinema-title="${esc(character.name)}">
            <span class="p-cinema-poster-media p-cover${character.scene?' has-scene':''}${gated?' is-obscured':''}">${sceneImage(character)}${gated?cinemaGate():''}</span>
            <span class="p-cinema-poster-status">${character.nsfw?'成人向':index < 3 ? '正在上映' : '更多作品'}</span>
            <span class="p-cinema-poster-title">${esc(character.name)}</span>
            <span class="p-cinema-poster-meta">@${esc(character.author)} · ${character.tags.map(esc).join(' / ')}</span>
            <span class="p-cinema-poster-cta">进入放映</span>
        </a></article>`;
    }

    function cinemaWatch(chat) {
        const character = getCharacter(chat.characterId);
        return `<a class="p-cinema-watch" href="chat.html?chat=${chat.id}"><span class="p-cinema-watch-media p-cover${character.scene?' has-scene':''}">${sceneImage(character)}</span><span class="p-cinema-kicker">CONTINUE · ${esc(character.name)}</span><span class="p-cinema-watch-title">${esc(chat.title)}</span><span class="p-cinema-watch-last">${esc(chat.lastMessage)}</span></a>`;
    }

    function renderCinemaHome() {
        disposeShowcase();
        const request = showcaseRequest;
        const works = Object.values(characters).filter(character => (!character.nsfw || nsfwAllowed()) && !blockedCreators.includes(character.author));
        const recent = chats.slice().sort((a,b)=>b.updated-a.updated)[0];
        const initialIndex = Math.min(2, works.length - 1);
        let currentWork = works[initialIndex];
        let currentIndex = initialIndex;
        $('#app').innerHTML = `<div class="p-cinema-discovery">
            <div class="p-cinema-discovery-canvas" id="discover-gallery" role="group" aria-label="角色光盘浏览" aria-describedby="discover-help"></div>
            <aside class="p-cinema-discovery-meta">
                <h1 id="discover-title"></h1>
                <dl class="p-cinema-credits"><div><dt>CREATED BY / 作者</dt><dd id="discover-author"></dd></div><div><dt>GENRE / 题材</dt><dd id="discover-tags"></dd></div><div><dt>PACE / 节奏</dt><dd id="discover-pace"></dd></div></dl>
                <a class="p-disc-detail-link" id="discover-open" href="plaza.html">查看角色 ↗</a>
            </aside>
            <div class="p-disc-navigation"><button type="button" id="disc-previous" aria-label="上一个角色">←</button><span id="discover-index" role="status" aria-live="polite"></span><button type="button" id="disc-next" aria-label="下一个角色">→</button></div>
            <div class="p-cinema-discovery-quotes"><blockquote><span class="p-cinema-quote-source">故事钩子 · 公开简介</span><p id="discover-hook"></p></blockquote><blockquote><span class="p-cinema-quote-source">互动节奏 · 作者设定</span><p id="discover-description"></p></blockquote></div>
            <p class="p-disc-help" id="discover-help">滚轮 / 左右方向键换片 · 拖动浏览 · 空格翻面 · 点击当前盘进入</p>
            <details class="p-disc-index"><summary>作品索引 <span>${String(works.length).padStart(2,'0')}</span></summary><div class="p-disc-index-list">${works.map((work,index)=>`<button type="button" data-disc-index="${index}"><span>${esc(work.name)}</span><small>${esc(work.category)}</small></button>`).join('')}<a href="plaza.html">搜索与筛选 →</a><a href="library.html">我的角色库 →</a><a href="chats.html">对话中心 →</a><a href="rooms.html">多角色房间 →</a><a href="create.html">创作工作台 →</a><a href="notifications.html">通知中心 →</a><a href="settings.html">我的账号 →</a>${recent?`<a href="chat.html?chat=${recent.id}">继续上次故事 →</a>`:''}</div></details>
        </div>`;
        const host = $('#discover-gallery');
        const live = () => request === showcaseRequest && host.isConnected && isCinema();
        const updateMeta = (work, index = works.indexOf(work)) => {
            if (!live() || !work) return;
            currentWork = work;
            currentIndex = index;
            $('#discover-title').textContent = work.name;
            $('#discover-author').textContent = `@${work.author}`;
            $('#discover-tags').textContent = work.tags.join(' / ');
            $('#discover-pace').textContent = work.pace.split(' · ').join(' / ');
            $('#discover-hook').textContent = `“${work.hook}”`;
            $('#discover-description').textContent = work.pace;
            $('#discover-index').textContent = `${String(index + 1).padStart(2,'0')} / ${String(works.length).padStart(2,'0')}`;
            $('#discover-open').href = `character.html?id=${work.id}`;
            $('#disc-previous').disabled = index === 0;
            $('#disc-next').disabled = index === works.length - 1;
            $$('[data-disc-index]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.discIndex) === index)));
        };
        const openWork = (work, rect) => {
            if (!live() || !work) return;
            const href = `character.html?id=${work.id}`;
            if (!reducedMotion) cinemaTransition({ href, dataset: { cinemaTitle: work.name }, querySelector: () => null }, rect);
            else location.href = href;
        };
        const fallback = () => {
            if (!live()) return;
            showcaseGallery?.destroy();
            showcaseGallery = null;
            host.dataset.renderer = 'fallback';
            host.setAttribute('aria-label', '角色列表：3D 不可用，使用链接查看角色');
            host.removeAttribute('aria-keyshortcuts');
            host.removeAttribute('aria-roledescription');
            $('#discover-help').textContent = '3D 展示已降级为角色列表，所有角色仍可打开。';
            host.innerHTML = `<div class="p-cinema-discovery-fallback"><p>3D 展示暂不可用，可直接从以下列表选择角色。</p>${works.map(cinemaPoster).join('')}</div>`;
        };
        if (!works.length) {
            host.innerHTML = '<div class="p-cinema-showcase-empty">没有可展示的角色。请调整成人内容或屏蔽设置。</div>';
            $('#discover-title').textContent = '暂无作品';
            $('#disc-previous').disabled = $('#disc-next').disabled = true;
            return;
        }
        updateMeta(currentWork);
        $('#disc-previous').addEventListener('click', () => showcaseGallery ? showcaseGallery.previous() : updateMeta(works[Math.max(0,currentIndex-1)]));
        $('#disc-next').addEventListener('click', () => showcaseGallery ? showcaseGallery.next() : updateMeta(works[Math.min(works.length-1,currentIndex+1)]));
        $$('[data-disc-index]').forEach(button => button.addEventListener('click', () => {
            const index = Number(button.dataset.discIndex);
            if (showcaseGallery) showcaseGallery.setActive(index);
            else updateMeta(works[index]);
            $('.p-disc-index').open = false;
            $('.p-disc-index summary').focus({preventScroll:true});
        }));
        $('.p-disc-index').addEventListener('keydown', event => { if (event.key === 'Escape') { $('.p-disc-index').open = false; $('.p-disc-index summary').focus(); } });
        $('#discover-open').addEventListener('click', event => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            if (showcaseGallery) { event.preventDefault(); showcaseGallery.openCurrent(); }
        });
        (async () => {
            try {
                const { mountDiscGallery } = await import('./disc-gallery.js?v=20261102-4');
                if (!live()) return;
                showcaseGallery = mountDiscGallery(host, works, { initialIndex, onHover: updateMeta, onSelect: openWork, onError: fallback });
            } catch (error) {
                console.warn('Disc gallery unavailable:', error.message);
                fallback();
            }
        })();
    }

    function renderCinemaPlaza() {
        const query = new URLSearchParams(location.search).get('q') || sessionStorage.getItem('rp-search') || '';
        const nsfw = nsfwAllowed();
        $('#app').innerHTML = `<div class="p-cinema-showcase">
            <div class="p-cinema-showcase-canvas" id="disc-gallery" aria-label="3D 光盘作品展示"></div>
            <aside class="p-cinema-showcase-meta">
                <span class="p-cinema-kicker">酒馆 · SELECTED WORKS · 2026</span>
                <h1 id="showcase-title"></h1>
                <p id="showcase-hook"></p>
                <dl class="p-cinema-credits"><div><dt>DIRECTED BY</dt><dd id="showcase-author"></dd></div><div><dt>YEAR</dt><dd>2026</dd></div><div><dt>GENRE</dt><dd id="showcase-tags"></dd></div></dl>
                <div class="p-cinema-showcase-actions"><button type="button" id="showcase-open">进入放映</button><button type="button" data-import>导入角色卡</button><a href="create.html">创建角色</a></div>
            </aside>

            <div class="p-cinema-showcase-bottom"><label class="p-search">${icon('search')}<input class="p-input" id="plaza-query" type="search" placeholder="搜索角色、作者或剧情" value="${esc(query)}" aria-label="搜索广场角色"></label><select class="p-select" id="plaza-sort" aria-label="排序方式"><option value="hot">最热</option><option value="new">最新</option></select><div class="p-cinema-filterrow" id="plaza-tags"><button type="button" data-plaza-tag="all" aria-pressed="true">全部</button>${['奇幻','现代','悬疑','治愈'].map(tag=>`<button type="button" data-plaza-tag="${tag}" aria-pressed="false">${tag}</button>`).join('')}</div><div class="p-cinema-showcase-side"><span id="showcase-index">01</span><span>酒馆放映室</span><span>滚轮 / 方向键换片 · 点击当前盘进入</span><div class="p-disc-showcase-controls"><button class="p-btn" id="showcase-previous" type="button" aria-label="上一个角色">←</button><button class="p-btn" id="showcase-next" type="button" aria-label="下一个角色">→</button></div></div> <button class="p-cinema-toggle" id="nsfw-toggle" aria-pressed="${nsfw}">${nsfw?'已显示 NSFW':'显示 NSFW'}</button><span class="p-cinema-count" id="plaza-count"></span></div>
        </div>`;
        let tag = 'all';
        let currentWork = null;
        let token = 0;

        const updateMeta = work => {
            if (!work) return;
            currentWork = work;
            $('#showcase-title').textContent = work.name;
            $('#showcase-hook').textContent = work.hook;
            $('#showcase-author').textContent = `@${work.author}`;
            $('#showcase-tags').textContent = work.tags.join(' / ');
            $('#showcase-index').textContent = String(Object.values(characters).indexOf(work) + 1).padStart(2, '0');
        };

        const openWork = (work, rect) => {
            if (!work) return;
            const href = `character.html?id=${work.id}`;
            if (isCinema() && !reducedMotion) {
                cinemaTransition({ href, dataset: { cinemaTitle: work.name }, querySelector: () => null }, rect);
            } else {
                location.href = href;
            }
        };

        const fallback = works => {
            $('#disc-gallery').innerHTML = `<div class="p-cinema-showcase-fallback">${works.map(cinemaPoster).join('')}</div>`;
        };

        const draw = async () => {
            const host = $('#disc-gallery');
            const q = $('#plaza-query').value.trim().toLowerCase();
            const showNsfw = nsfwAllowed();
            const matches = Object.values(characters).filter(c => !blockedCreators.includes(c.author) && (!c.nsfw || showNsfw) && (tag === 'all' || c.category === tag) && (!q || `${c.name} ${c.author} ${c.hook} ${c.tags.join(' ')}`.toLowerCase().includes(q)));
            const sorted = $('#plaza-sort').value === 'new' ? matches.slice().reverse() : matches;
            $('#plaza-count').textContent = `${String(sorted.length).padStart(2, '0')} 个作品`;
            disposeShowcase();
            const generation = showcaseRequest;
            const request = ++token;
            const live = () => request === token && generation === showcaseRequest && host.isConnected && isCinema();
            $('#showcase-open').disabled = !sorted.length;
            $('#showcase-previous').disabled = $('#showcase-next').disabled = !sorted.length;
            if (!sorted.length) {
                host.innerHTML = '<div class="p-cinema-showcase-empty">没有找到匹配的角色。试试角色名、作者或“雨夜”“慢热”等关键词。</div>';
                currentWork = null;
                $('#showcase-title').textContent = '没有匹配角色';
                ['#showcase-hook','#showcase-author','#showcase-tags','#showcase-index'].forEach(selector => $(selector).textContent = '');
                return;
            }
            const onActive = (work, index) => {
                if (!live()) return;
                updateMeta(work);
                $('#showcase-index').textContent = `${String(index + 1).padStart(2,'0')} / ${String(sorted.length).padStart(2,'0')}`;
                $('#showcase-previous').disabled = index === 0;
                $('#showcase-next').disabled = index === sorted.length - 1;
            };
            onActive(sorted[Math.min(2, sorted.length - 1)], Math.min(2, sorted.length - 1));
            const useFallback = () => { if (live()) { showcaseGallery?.destroy(); showcaseGallery = null; fallback(sorted); } };
            try {
                const { mountDiscGallery } = await import('./disc-gallery.js?v=20261102-4');
                if (!live()) return;
                showcaseGallery = mountDiscGallery(host, sorted, { onHover: onActive, onSelect: openWork, onError: useFallback });
            } catch (error) {
                console.warn('Disc gallery unavailable:', error.message);
                useFallback();
            }
        };

        $('#plaza-query').addEventListener('input', () => { draw(); });
        $('#plaza-sort').addEventListener('change', draw);
        $$('[data-plaza-tag]').forEach(button => button.addEventListener('click', () => { tag = button.dataset.plazaTag; $$('[data-plaza-tag]').forEach(b=>b.setAttribute('aria-pressed',String(b===button))); draw(); }));
        $('#showcase-previous').addEventListener('click', () => showcaseGallery?.previous());
        $('#showcase-next').addEventListener('click', () => showcaseGallery?.next());
        $('#showcase-open').addEventListener('click', () => {
            if (!currentWork) return;
            if (showcaseGallery) showcaseGallery.openCurrent();
            else location.href = `character.html?id=${currentWork.id}`;
        });
        $('#nsfw-toggle').addEventListener('click', () => {
            if (nsfwAllowed()) {
                sessionStorage.setItem('rp-nsfw','false');
                $('#nsfw-toggle').setAttribute('aria-pressed','false');
                $('#nsfw-toggle').textContent = '显示 NSFW';
                draw();
                return;
            }
            openModal({title:'显示成人向作品',body:`<p>这些作品可能包含成人内容。请确认你已年满 18 周岁，并愿意浏览相关角色。</p><label class="p-check"><input type="checkbox" id="nsfw-age">我已年满 18 周岁</label><div class="p-form-error" id="nsfw-error" hidden>请先确认年龄。</div>`,confirmText:'确认并开启',onConfirm: (overlay,close) => {
                if (!$('#nsfw-age',overlay).checked) {$('#nsfw-error',overlay).hidden = false;return false;}
                sessionStorage.setItem('rp-nsfw','true');close();$('#nsfw-toggle').setAttribute('aria-pressed','true');$('#nsfw-toggle').textContent = '已显示 NSFW';draw();
            }});
        });
        draw();
    }

    function cinemaDetailBanner(character, publicNsfw, backHref) {
        return `<section class="p-cinema-detail-banner${publicNsfw?' is-gated':''}">
            <div class="p-cinema-detail-banner-media">${sceneImage(character)}</div>
            <div class="p-cinema-detail-banner-shade"></div>
            ${publicNsfw?cinemaGate():''}
            <a class="p-cinema-detail-back" href="${backHref}">← 返回</a>
            <div class="p-cinema-detail-banner-copy"><span class="p-cinema-kicker">A FILM BY ${esc(character.author)} · v2</span><h1 style="--name-len:${character.name.length}">${esc(character.name)}</h1><p>${publicNsfw?'成人向角色。开启“显示 NSFW”后查看场景封面。':esc(character.hook)}</p><div class="p-cinema-detail-tags">${character.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div>${publicNsfw?'<a class="p-cinema-notice-link" href="plaza.html">去开启 NSFW →</a>':''}</div>
        </section>`;
    }

    function cinemaTransition(link, rectOverride) {
        if (reducedMotion || document.querySelector('.p-cinema-transition')) return false;
        const image = link.querySelector?.('img');
        const rect = rectOverride || (image || link).getBoundingClientRect();
        const title = link.dataset?.cinemaTitle || '';
        const overlay = document.createElement('div');
        const fromDisc = Boolean(rectOverride?.image);
        overlay.className = `p-cinema-transition${fromDisc ? ' p-cinema-transition--disc' : ''}`;
        overlay.setAttribute('aria-hidden','true');
        if (fromDisc) {
            overlay.classList.add('is-active');
            document.body.appendChild(overlay);
            const canvas = $('#discover-gallery canvas') || $('#disc-gallery canvas');
            canvas?.animate([{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(1.045)'}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards'});
            setTimeout(() => { location.href = link.href; }, 230);
            return true;
        }
        const imageSource = image?.src;
        overlay.innerHTML = `<div class="p-cinema-transition-cover">${imageSource ? `<img src="${esc(imageSource)}" alt="">` : ''}</div><div class="p-cinema-transition-title">${esc(title)}</div>`;
        document.body.appendChild(overlay);
        const cover = $('.p-cinema-transition-cover', overlay);
        cover.style.left = `${rect.left}px`;
        cover.style.top = `${rect.top}px`;
        cover.style.width = `${rect.width}px`;
        cover.style.height = `${rect.height}px`;
        const coverElement = link.querySelector?.('.p-cover') || image;
        cover.style.borderRadius = coverElement ? getComputedStyle(coverElement).borderRadius : '50%';
        overlay.classList.add('is-active');
        setTimeout(() => {
            cover.style.left = '0';
            cover.style.top = '0';
            cover.style.width = '100vw';
            cover.style.height = '100vh';
            cover.style.borderRadius = '0';
        }, 24);
        setTimeout(() => { location.href = link.href; }, 480);
        return true;
    }

    function renderHome() {
        if (isCinema()) { renderCinemaHome(); return; }
        const recent = chats.slice().sort((a,b)=>b.updated-a.updated).slice(0,4);
        const featured = getCharacter('shen-yanzhi');
        const featuredAllowed = !featured.nsfw || sessionStorage.getItem('rp-nsfw') === 'true';
        const list = Object.values(characters).filter(c => c.id !== featured.id && !c.nsfw);
        const heroCover = featuredAllowed ? cover(featured,'p-hero-cover') : `<div class="p-hero-cover p-cover is-obscured" style="--h:${featured.hue}" data-initial="${featured.initial}" role="img" aria-label="${featured.name}的成人向场景封面">${sceneImage(featured)}<div class="p-cover-gate"><strong>18+</strong><span>开启“显示 NSFW”后查看</span></div></div>`;
        const recs = [featured,...list].filter(c => (!c.nsfw || sessionStorage.getItem('rp-nsfw') === 'true') && !blockedCreators.includes(c.author)).slice(0,4);
        const recCard = c => `<a class="ca-rec" href="character.html?id=${esc(c.id)}">${cover(c,'ca-rec-cover')}<div class="ca-rec-main"><div class="ca-rec-name">${esc(c.name)}</div><div class="ca-rec-author">由 @${esc(c.author || '本地创作者')} 创建</div><p class="ca-rec-hook">${esc(c.hook || c.description || '')}</p><div class="ca-rec-meta">${icon('chat')}<span>${esc(c.chats || '—')}</span></div></div></a>`;
        const sceneCard = c => `<div class="ca-scene-item"><a class="ca-scene" href="character.html?id=${esc(c.id)}">${cover(c,'ca-scene-cover')}<div class="ca-scene-foot"><span class="ca-scene-title">${esc(c.name)}</span><span class="ca-scene-cta">${['shen-yanzhi','lin-wanzhao','bai-lu','lu-shiyan','a-heng','xie-wujiu'].includes(c.id)?`<span class="p-avatar p-avatar--art" style="--size:20px;--h:${c.hue}"><img src="assets/characters/${encodeURI(c.id)}.jpg" alt=""></span>`:avatar(c,20)}<span>开始对话</span></span></div></a><div class="ca-scene-author">由 @${esc(c.author || '本地创作者')} 创建</div></div>`;
        $('#app').innerHTML = `
            <div class="ca-home">
                <header class="ca-welcome"><span class="p-avatar" style="--size:40px;--h:28">林</span><div><h1>欢迎回来，林见白</h1><p>今天想和谁说说话？</p></div></header>
                <section class="ca-block"><div class="ca-block-head"><h2>为您推荐</h2><a href="plaza.html">查看全部 ${icon('next')}</a></div><div class="ca-rec-row">${recs.map(recCard).join('')}</div></section>
                <section class="ca-block"><div class="ca-block-head"><h2>场景</h2><a href="plaza.html">更多场景 ${icon('next')}</a></div><div class="ca-scene-row">${list.slice(0,5).map(sceneCard).join('')}</div></section>
                <section class="ca-block"><div class="ca-block-head"><h2>继续上次的故事</h2><a href="chats.html">全部对话 ${icon('next')}</a></div><div class="ca-chat-list">${recent.map(continueCard).join('')}</div></section>
                <section class="ca-block"><div class="ca-block-head"><h2>多角色房间</h2><a href="rooms.html">全部房间 ${icon('next')}</a></div><div class="ca-chat-list">${rooms.map(roomCard).join('')}<button class="p-continue-card" type="button" data-new-room>${icon('create')}<span class="p-continue-name">创建房间</span></button></div></section>
                <section class="ca-block"><div class="ca-block-head"><h2>全部角色</h2><span class="ca-block-sub" id="home-count"></span></div><div class="ca-chips" aria-label="角色题材"><button class="ca-chip" aria-pressed="true" data-home-filter="all">全部</button>${['奇幻','现代','悬疑','治愈'].map(tag => `<button class="ca-chip" aria-pressed="false" data-home-filter="${tag}">${tag}</button>`).join('')}</div><div class="ca-grid" id="home-grid"></div></section>
            </div>`;
        const draw = filter => {
            const matches = Object.values(characters).filter(c => (filter === 'all' || c.category === filter) && (!c.nsfw || sessionStorage.getItem('rp-nsfw') === 'true'));
            $('#home-grid').innerHTML = matches.length ? matches.map(character => workCard(character)).join('') : '<div class="p-empty" style="grid-column:1/-1"><div class="p-empty-title">这个分类还没有角色</div><p class="p-empty-text">去广场看看其他故事。</p></div>';
            $('#home-count').textContent = `${matches.length} 个角色`;
        };
        draw('all');
        $$('[data-home-filter]').forEach(button => button.addEventListener('click', () => {
            $$('[data-home-filter]').forEach(item => item.setAttribute('aria-pressed',String(item===button)));
            draw(button.dataset.homeFilter);
        }));
    }

    function renderAuthor() {
        const name = new URLSearchParams(location.search).get('name') || '青梧';
        const author = authors[name] || {name,initial:name.slice(0,1),hue:210,bio:'这位创作者还没有填写公开简介。',joined:'最近加入'};
        const blocked = blockedCreators.includes(name);
        const works = blocked ? [] : Object.values(characters).filter(character => character.author === name);
        const totalChats = works.reduce((sum, character) => sum + Number(String(character.chats).replace(/[^\d.]/g,'')) * (String(character.chats).includes('万') ? 10000 : 1),0);
        const worksHtml = works.length
            ? (isCinema() ? `<div class="p-cinema-poster-grid p-cinema-author-grid">${works.map(cinemaPoster).join('')}</div>` : `<div class="p-work-grid p-author-works">${works.map(character => workCard(character)).join('')}</div>`)
            : `<div class="p-empty" style="grid-column:1/-1"><div class="p-empty-title">${blocked?'你已屏蔽这位创作者':'暂无公开作品'}</div><p class="p-empty-text">${blocked?'解除屏蔽后可以重新查看其公开作品。':'创作者的作品通过审核后会显示在这里。'}</p></div>`;
        $('#app').innerHTML = `<a class="p-back" href="plaza.html">${icon('back')}返回广场</a>
            <section class="p-card p-card--pad p-author-hero">${avatar(author,80)}<div class="p-author-main"><h1>${esc(author.name)}</h1><p>@${esc(author.name)} · 创作者 · 加入于 ${esc(author.joined)}</p><div class="p-author-stats"><span><strong>${works.length}</strong> 个公开作品</span><span><strong>${totalChats ? (totalChats >= 10000 ? (totalChats/10000).toFixed(1) + ' 万' : totalChats) : 0}</strong> 人聊过</span></div></div><div class="p-author-actions"><button class="p-btn p-btn--sm" id="author-block" type="button" aria-pressed="${blocked}">${blocked?'已屏蔽':'屏蔽创作者'}</button><button class="p-btn p-btn--sm" id="author-report" type="button">举报创作者</button></div></section>
            <div class="p-author-grid"><section class="p-card p-card--pad"><h2 class="p-form-section-title">关于创作者</h2><p class="p-author-bio">${esc(author.bio)}</p></section><section class="p-card p-card--pad"><h2 class="p-form-section-title">创作声明</h2><p class="p-small">公开作品仅展示作者主动公开的设定。角色对话中的私有提示词、未公开世界书和生成配置不会出现在作者主页。</p></section></div>
            <section class="p-section"><div class="p-section-head"><h2>公开作品</h2><span class="p-section-sub">${works.length} 个</span><a class="p-section-more" href="plaza.html">去广场 ${icon('next')}</a></div>${worksHtml}</section>`;
        $('#author-block').addEventListener('click',()=>{
            if (blockedCreators.includes(name)) blockedCreators = blockedCreators.filter(item=>item!==name);
            else blockedCreators.push(name);
            saveBlockedCreators();
            renderAuthor();
            toast(blockedCreators.includes(name)?`已屏蔽 ${name}`:`已解除对 ${name} 的屏蔽`);
        });
        $('#author-report').addEventListener('click',()=>openModal({title:'举报创作者',body:`<div class="p-field"><label class="p-label" for="author-report-reason">原因</label><select class="p-select" id="author-report-reason"><option>作品侵犯版权</option><option>冒充他人身份</option><option>骚扰或不当行为</option><option>其他</option></select></div><p class="p-small">管理员会根据作品和账号记录进行核查。本地演示：举报只写入本标签页的「举报记录」，不会发送给真实管理员。</p>`,confirmText:'提交举报',onConfirm:(_,close)=>{const reason=$('#author-report-reason',overlay).value;reports.unshift({id:`r-${Date.now()}`,work:`创作者 ${name}`,reason,time:'刚刚',status:'pending'});saveReports();pushNotification('举报已提交','管理员会尽快核查，你可以在“我的 → 安全与隐私 → 举报记录”查看状态。','moderation','settings.html#security');close();toast('举报已提交，管理员会尽快处理');}}));
    }

    function renderNotifications() {
        let filter = 'all';
        $('#app').innerHTML = `${title('通知','评论、作品版本、审核和系统提醒。',`<button class="p-btn" id="mark-all-read" type="button">全部标为已读</button>`)}
            <div class="p-tabs" role="tablist" aria-label="通知筛选"><button role="tab" data-notification-filter="all" aria-selected="true">全部</button><button role="tab" data-notification-filter="unread" aria-selected="false">未读</button></div>
            <div class="p-notification-list" id="notification-list"></div>`;
        const draw = () => {
            const rows = notifications.filter(item => filter === 'all' || item.unread);
            $('#notification-list').innerHTML = rows.length ? rows.map(item => `<button class="p-notification-row ${item.unread?'is-unread':''}" data-notification="${item.id}" type="button"><span class="p-notification-icon">${icon(item.type==='reply'?'chat':item.type==='version'?'branch':item.type==='moderation'?'shield':'bell')}</span><span class="p-notification-main"><span class="p-notification-title">${esc(item.title)}${item.unread?'<span class="p-unread-dot" aria-label="未读"></span>':''}</span><span class="p-notification-text">${esc(item.text)}</span><span class="p-notification-time">${esc(item.time)}</span></span>${icon('next')}</button>`).join('') : `<div class="p-empty"><div class="p-empty-icon">${icon('bell')}</div><div class="p-empty-title">${filter==='unread'?'没有未读通知':'暂时没有通知'}</div><p class="p-empty-text">评论、版本更新和审核结果会出现在这里。</p></div>`;
        };
        $$('[data-notification-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.notificationFilter; $$('[data-notification-filter]').forEach(item => item.setAttribute('aria-selected', String(item === button))); draw(); }));
        $('#mark-all-read').addEventListener('click', () => {
            notifications.forEach(item => { item.unread = false; });
            saveNotifications();
            $('.p-unread-badge')?.remove();
            $('#notification-button')?.setAttribute('aria-label','通知');
            draw();
            toast('全部通知已标为已读');
        });
        draw();
        $('#notification-list').addEventListener('click', event => {
            const button = event.target.closest('[data-notification]');
            if (!button || !event.currentTarget.contains(button)) return;
            const item = notifications.find(notification => notification.id === button.dataset.notification);
            if (!item) return;
            item.unread = false;
            saveNotifications();
            if (item.link) location.href = item.link;
            else draw();
        });
    }

    function renderPlaza() {
        if (isCinema()) { renderCinemaPlaza(); return; }
        const query = new URLSearchParams(location.search).get('q') || sessionStorage.getItem('rp-search') || '';
        const nsfw = sessionStorage.getItem('rp-nsfw') === 'true';
        $('#app').innerHTML = `${title('广场','找到值得一起走下去的角色。','<button class="p-btn" data-import>导入角色卡</button><a class="p-btn p-btn--primary" href="create.html">创建角色</a>')}
            <div class="p-filterbar"><div class="p-filterbar-main"><label class="p-search">${icon('search')}<input class="p-input" id="plaza-query" type="search" placeholder="搜索角色、作者或剧情" value="${esc(query)}" aria-label="搜索广场角色"></label><select class="p-select" id="plaza-sort" aria-label="排序方式"><option value="hot">最热</option><option value="new">最新</option></select><button class="p-chip" id="nsfw-toggle" aria-pressed="${nsfw}">${nsfw ? '已显示 NSFW' : '显示 NSFW'}</button><span class="p-filterbar-count" id="plaza-count"></span></div><div class="p-chips" id="plaza-tags"><button class="p-chip" data-plaza-tag="all" aria-pressed="true">全部</button>${['奇幻','现代','悬疑','治愈'].map(tag => `<button class="p-chip" data-plaza-tag="${tag}" aria-pressed="false">${tag}</button>`).join('')}</div></div>
            <div class="p-work-grid" id="plaza-grid"></div><div class="p-loadmore"><span id="plaza-note"></span><button class="p-btn" id="plaza-load">加载更多</button></div>`;
        let tag = 'all';
        let visible = 6;
        const draw = () => {
            const q = $('#plaza-query').value.trim().toLowerCase();
            const showNsfw = sessionStorage.getItem('rp-nsfw') === 'true';
            const matches = Object.values(characters).filter(c => (!c.nsfw || showNsfw) && !blockedCreators.includes(c.author) && (tag === 'all' || c.category === tag) && (!q || `${c.name} ${c.author} ${c.hook} ${c.tags.join(' ')}`.toLowerCase().includes(q)));
            const sorted = $('#plaza-sort').value === 'new' ? matches.reverse() : matches;
            $('#plaza-grid').innerHTML = sorted.length ? sorted.slice(0,visible).map(character => workCard(character)).join('') : `<div class="p-empty" style="grid-column:1/-1"><div class="p-empty-icon">${icon('search')}</div><div class="p-empty-title">没有找到匹配的角色</div><p class="p-empty-text">试试角色名、作者或“雨夜”“慢热”等关键词。</p><button class="p-btn" id="clear-plaza">清除筛选</button></div>`;
            $('#plaza-count').textContent = `${sorted.length} 个作品`;
            $('#plaza-note').textContent = sorted.length ? `已显示 ${Math.min(visible,sorted.length)} / ${sorted.length}` : '没有结果';
            $('#plaza-load').hidden = visible >= sorted.length;
            $('#clear-plaza')?.addEventListener('click', () => { $('#plaza-query').value = ''; tag = 'all'; visible = 6; $$('[data-plaza-tag]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.plazaTag==='all'))); draw(); });
        };
        $('#plaza-query').addEventListener('input', () => {visible = 6;draw();});
        $('#plaza-sort').addEventListener('change',draw);
        $$('[data-plaza-tag]').forEach(button => button.addEventListener('click', () => {tag = button.dataset.plazaTag;visible = 6;$$('[data-plaza-tag]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));draw();}));
        $('#plaza-load').addEventListener('click', () => {visible += 6;draw();});
        $('#nsfw-toggle').addEventListener('click', () => {
            if (sessionStorage.getItem('rp-nsfw') === 'true') {
                sessionStorage.setItem('rp-nsfw','false');
                $('#nsfw-toggle').setAttribute('aria-pressed','false');
                $('#nsfw-toggle').textContent = '显示 NSFW';
                draw();
                return;
            }
            openModal({title:'显示成人向作品',body:`<p>这些作品可能包含成人内容。请确认你已年满 18 周岁，并愿意浏览相关角色。</p><label class="p-check"><input type="checkbox" id="nsfw-age">我已年满 18 周岁</label><div class="p-form-error" id="nsfw-error" hidden>请先确认年龄。</div>`,confirmText:'确认并开启',onConfirm: (overlay,close) => {
                if (!$('#nsfw-age',overlay).checked) {$('#nsfw-error',overlay).hidden = false;return false;}
                sessionStorage.setItem('rp-nsfw','true');close();$('#nsfw-toggle').setAttribute('aria-pressed','true');$('#nsfw-toggle').textContent = '已显示 NSFW';draw();
            }});
        });
        draw();
    }

    function renderCharacter() {
        const detailParams = new URLSearchParams(location.search);
        const character = getCharacter(detailParams.get('id') || 'shen-yanzhi');
        const history = chatsFor(character.id);
        const startNew = detailParams.get('start') === 'new';
        const openings = openingsFor(character);
        selectedOpening = 'default';
        selectedPersona = history[0]?.personaId || personaForCharacter(character.id,selectedPersona);
        const publicNsfw = character.nsfw && sessionStorage.getItem('rp-nsfw') !== 'true';
        const cinema = isCinema();
        const backHref = document.referrer.includes('/plaza') ? 'plaza.html' : 'home.html';
        $$('.p-nav-item, .p-cinema-nav-left a').forEach(link => {
            if (link.getAttribute('href') === backHref) link.setAttribute('aria-current','page');
            else link.removeAttribute('aria-current');
        });
        $('#app').innerHTML = `${cinema ? `<div class="p-cinema-curtain" aria-hidden="true"><span>酒馆 · 放映</span></div>${cinemaDetailBanner(character, publicNsfw, backHref)}` : `<a class="p-back" href="${backHref}">${icon('back')}返回</a>
            ${publicNsfw ? `<div class="p-notice">${icon('shield')}<div class="p-notice-main"><div class="p-notice-title">这是一个成人向角色</div><div>开启“显示 NSFW”后可查看场景封面；公开设定仍可阅读，也可以直接开始对话。</div></div><a class="p-btn p-btn--sm" href="plaza.html">去开启</a></div>` : ''}`}
            <div class="p-detail${cinema?' p-cinema-detail':''}"><div class="p-detail-sticky"><div class="p-detail-id">
                <div class="p-detail-cover p-cover${['shen-yanzhi','lin-wanzhao','bai-lu','lu-shiyan','a-heng','xie-wujiu'].includes(character.id)?' has-portrait':character.scene?' has-scene':''}${publicNsfw?' is-obscured':''}" style="--h:${character.hue}" data-initial="${character.initial}" role="img" aria-label="${esc(character.name)}的封面">${['shen-yanzhi','lin-wanzhao','bai-lu','lu-shiyan','a-heng','xie-wujiu'].includes(character.id)?`<img src="assets/characters/${encodeURI(character.id)}.jpg" alt="" loading="lazy">`:sceneImage(character)}${publicNsfw?(cinema?'<div class="p-cover-gate p-cover-gate--sm"><strong>18+</strong></div>':'<div class="p-cover-gate"><strong>18+</strong><span>开启“显示 NSFW”后查看场景封面</span></div>'):''}</div>
                <div class="p-detail-title"><h1>${esc(character.name)}${character.nsfw ? '<span class="p-pill p-pill--sm" style="margin-left:8px;vertical-align:middle">18+</span>' : ''}</h1><p class="p-detail-by"><a class="p-link" href="author.html?name=${encodeURIComponent(character.author)}">@${esc(character.author)}</a> · 公开角色</p><div class="p-detail-tags">${character.tags.map(tag=>`<span class="p-pill p-pill--sm p-pill--outline">${esc(tag)}</span>`).join('')}</div></div></div>
                <div class="p-card p-card--flat p-detail-stats"><div class="p-stat"><div class="p-stat-n">${character.chats}</div><div class="p-stat-l">人聊过</div></div><div class="p-stat"><div class="p-stat-n">${history.length}</div><div class="p-stat-l">我的会话</div></div><div class="p-stat"><div class="p-stat-n">v2</div><div class="p-stat-l">作品版本</div></div></div>
                <div><button class="p-btn p-btn--primary p-btn--lg p-btn--block" id="start-chat">${history.length && !startNew ? '继续最近对话' : '按当前设定开始新故事'}</button><div class="p-detail-minor"><button class="p-btn" id="new-story">${icon('create')}新故事</button><button class="p-btn p-btn--icon" id="detail-fav" aria-pressed="${character.favorite}" aria-label="${character.favorite ? '取消收藏' : '收藏'}">${icon('heart')}</button><button class="p-btn p-btn--icon" id="detail-more" aria-label="更多操作">${icon('more')}</button></div></div>
            </div><div class="p-detail-main">
                ${character.added ? '' : `<div class="p-notice">${icon('book')}<div class="p-notice-main"><div class="p-notice-title">这个角色还未加入你的角色库</div><div>添加后可在角色库快速找到；开始新故事时保存角色快照，已有故事不随角色修改。</div><div class="p-notice-actions"><button class="p-btn p-btn--sm" id="add-character">添加到角色库</button></div></div></div>`}
                <section class="p-card p-card--pad"><div class="p-eyebrow">故事的开端</div><blockquote class="p-quote"><p>${esc(character.greeting)}</p></blockquote></section>
                <section class="p-card"><div class="p-card-head"><h2>公开设定</h2><span class="p-small">作者公开内容</span></div><div class="p-sub"><div class="p-eyebrow">角色与场景</div><p>${esc(character.description)}</p></div><div class="p-sub"><div class="p-eyebrow">互动节奏</div><p>${esc(character.pace)}。每轮会保留剧情连续性，你可以决定自己的行动和回应方式。</p></div></section>
                <section class="p-card"><div class="p-card-head"><h2>选择你的开场</h2><span class="p-small">用于新故事</span></div><div class="p-choice-list" style="padding:12px">${openings.map((opening,index) => `<button class="p-choice" data-opening="${opening.id}" aria-pressed="${index === 0}"><span class="p-choice-main"><span class="p-choice-title">${esc(opening.title)}</span><span class="p-choice-sub">${esc(opening.text.slice(0,100))}</span></span>${icon('check','p-choice-check')}</button>`).join('')}</div></section>
                <section class="p-card"><div class="p-card-head"><h2>以谁的身份进入故事</h2></div><div class="p-sub"><label class="p-label" for="persona-select">当前身份</label><select class="p-select" id="persona-select">${personas.map(persona => `<option value="${persona.id}" ${persona.id === selectedPersona ? 'selected' : ''}>${esc(persona.name)}</option>`).join('')}</select><p class="p-small" id="persona-hint" style="margin-top:10px"></p></div></section>
                <section class="p-card"><div class="p-card-head"><h2>评论 <span id="comment-count"></span></h2><button class="p-text-btn" id="comment-open">写评论</button></div><div id="comments"></div></section>
            </div></div>`;
        const updatePersona = () => { const persona = getPersona($('#persona-select').value); selectedPersona = persona.id; $('#persona-hint').textContent = persona.description; };
        updatePersona();
        $('#persona-select').addEventListener('change',updatePersona);
        $$('[data-opening]').forEach(button => button.addEventListener('click', () => {selectedOpening = button.dataset.opening;$$('[data-opening]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}));
        $('#start-chat').addEventListener('click', () => {
            const existing = history[0];
            if (existing && !startNew) location.href = `chat.html?chat=${existing.id}`;
            else newStory(character.id);
        });
        $('#new-story').addEventListener('click', () => newStory(character.id));
        $('#detail-fav').addEventListener('click', () => {const previous=character.favorite;character.favorite=!previous;if(!saveState()){character.favorite=previous;return;}$('#detail-fav').setAttribute('aria-pressed',String(character.favorite));$('#detail-fav').setAttribute('aria-label',character.favorite?'取消收藏':'收藏');toast(character.favorite?'已加入收藏':'已取消收藏');});
        $('#add-character')?.addEventListener('click', event => {const previous=character.added;character.added=true;if(!saveState()){character.added=previous;return;}event.currentTarget.closest('.p-notice')?.remove();toast('已添加到你的角色库');});
        $('#detail-more').addEventListener('click', () => openCharacterMenu(character));
        commentCharacterId = character.id;
        renderCommentsPanel(character.id);
        $('#comments').addEventListener('click', event => {
            const button = event.target.closest('[data-comment-del]');
            if (!button) return;
            const id = button.dataset.commentDel;
            confirmAction('删除这条评论？','只删除你自己发表的这条评论。','删除',()=>{
                const list = characterComments[character.id] || [];
                const index = list.findIndex(item => item.id === id);
                if (index < 0) return;
                list.splice(index,1);
                characterComments[character.id] = list;
                saveComments();
                renderCommentsPanel(character.id);
                toast('评论已删除');
            });
        });
        $('#comment-open').addEventListener('click', () => openComment());
        if (history.length) {
            const sessions = document.createElement('button');sessions.className='p-btn p-btn--ghost p-btn--block';sessions.textContent=`查看该角色全部 ${history.length} 个会话`;sessions.addEventListener('click',()=>location.href=`chats.html?character=${character.id}`);$('.p-detail-sticky').appendChild(sessions);
        }
    }

    function newStory(characterId) {
        const character = getCharacter(characterId);
        if (!character || character.missing || !character.name.trim() || !character.greeting.trim()) { toast('请先保存角色名称与开场白，再开始本地试聊。','err'); return null; }
        const count = chatsFor(characterId).length + 1;
        const openings = openingsFor(character);
        const opening = openings.find(item => item.id === selectedOpening) || openings[0];
        const id = resourceId(`chat-${characterId}`);
        const chat = {id,characterId,summary:{text:'',covered:0,source:'auto'},summaryPrefs:{enabled:true,interval:12},title:count === 1 ? opening.title : `${opening.title} · ${count}`,opening:opening.id,openingTitle:opening.title,openingText:opening.text,characterSnapshot:cloneChatValue(character),snapshotNote:'创建故事时冻结的角色版本；后续修改角色不会改写此故事。',context:{memory:'',note:'',lore:(Array.isArray(character.loreBook?.entries) ? character.loreBook.entries.map(entry => ({...entry})) : [])},personaId:getPersona(selectedPersona).id,updated:Date.now(),time:'刚刚',count:1,lastMessage:opening.text,
            // ST：备用开场白就是第一条消息的其他候选（swipes），故事开始后仍可左右切换。所选开场排在第一位。
            messages:normalizeMessages([{role:'assistant',text:opening.text,opening:true,candidates:character.local ? [opening.text,...openings.filter(item => item.id !== opening.id).map(item => item.text).filter(text => text.trim() && text !== opening.text)] : [opening.text],selectedCandidate:0}])};
        chats.push(chat);
        if (!saveState()) { chats.pop(); return null; }
        location.href = `chat.html?chat=${id}`;
        return chat;
    }

    function openCharacterMenu(character) {
        openModal({title:character.name,body:`<div class="p-choice-list"><button class="p-choice" id="menu-sessions">${icon('chat')}<span class="p-choice-main"><span class="p-choice-title">该角色全部会话</span><span class="p-choice-sub">查看、继续或创建另一条故事线</span></span>${icon('next')}</button><button class="p-choice" id="menu-author">${icon('user')}<span class="p-choice-main"><span class="p-choice-title">作者主页 @${esc(character.author)}</span><span class="p-choice-sub">查看作者的其他公开角色</span></span>${icon('next')}</button><button class="p-choice" id="menu-share">${icon('copy')}<span class="p-choice-main"><span class="p-choice-title">复制角色分享链接</span><span class="p-choice-sub">只分享公开资料，不包含私有提示词</span></span></button><button class="p-choice" id="menu-report">${icon('warning')}<span class="p-choice-main"><span class="p-choice-title">举报作品</span><span class="p-choice-sub">提交给管理员审核，不会影响你的会话</span></span></button></div>`,confirmText:'完成',cancelText:'关闭',onConfirm:(_,close)=>close()});
        $('#menu-sessions').addEventListener('click',()=>location.href=`chats.html?character=${character.id}`);
        $('#menu-author').addEventListener('click',()=>location.href=`author.html?name=${encodeURIComponent(character.author)}`);
        $('#menu-share').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);toast('角色分享链接已复制');}catch{toast('可从浏览器地址栏复制分享链接');}});
        $('#menu-report').addEventListener('click',()=>openModal({title:'举报作品',body:`<p>举报会提交给管理员审核，请选择最接近的原因。</p><p class="p-small">本地演示：举报只写入本标签页的「举报记录」，不会发送给真实管理员，也不会有处理结果回执。</p><div class="p-field"><label class="p-label" for="report-reason">原因</label><select class="p-select" id="report-reason"><option>未标记的成人内容</option><option>侵犯版权或未经授权转载</option><option>骚扰、仇恨或危险内容</option><option>其他</option></select></div><div class="p-field"><label class="p-label" for="report-note">补充说明（选填）</label><textarea class="p-textarea" id="report-note" placeholder="提供必要的信息即可"></textarea></div>`,confirmText:'提交举报',onConfirm:(overlay,close)=>{const reason=$('#report-reason',overlay).value;const note=$('#report-note',overlay).value.trim();reports.unshift({id:`r-${Date.now()}`,work:character.name,reason,note,time:'刚刚',status:'pending'});saveReports();pushNotification('举报已提交','管理员会尽快核查，你可以在“我的 → 安全与隐私 → 举报记录”查看状态。','moderation','settings.html#security');close();toast('举报已提交，管理员会尽快处理');}}));
    }

    let commentCharacterId = null;

    function renderCommentsPanel(characterId) {
        const container = document.querySelector('#comments');
        if (!container || !characterId) return;
        const list = commentsFor(characterId);
        const count = document.querySelector('#comment-count');
        if (count) count.textContent = String(list.length);
        container.innerHTML = list.map(item => `<article class="p-comment">${avatar({initial:item.initial,hue:item.hue},36)}<div><div class="p-comment-top"><span class="p-comment-name">${esc(item.name)}</span><span class="p-comment-time">${esc(item.time)}</span></div><p class="p-comment-body">${esc(item.text)}</p>${item.mine?`<button class="p-text-btn" data-comment-del="${item.id}">删除</button>`:''}</div></article>`).join('');
    }

    function openComment() {
        const characterId = commentCharacterId;
        if (!characterId) return;
        openModal({title:'写下你的体验',body:`<p class="p-small">本地演示：评论只保存在当前标签页，其他人看不到，也不会出现在真实角色页。</p><div class="p-field"><label class="p-label" for="comment-text">评论</label><textarea class="p-textarea" id="comment-text" maxlength="500" placeholder="不涉及未公开设定，友善分享你的体验"></textarea></div>`,confirmText:'发表评论',onConfirm:(overlay,close)=>{
            const text=$('#comment-text',overlay).value.trim();
            if(!text){$('#comment-text',overlay).focus();return false;}
            const list = (characterComments[characterId] || commentSeed.map((item,index)=>({...item,id:`c-seed-${index}`}))).slice();
            list.push({id:`c-${Date.now()}`,name:'林见白',initial:'林',hue:28,time:'刚刚',text,mine:true});
            characterComments[characterId] = list;
            saveComments();
            renderCommentsPanel(characterId);
            close();
            toast('评论已发表');
        }});
    }

    function matchingStories(query = '', filter = 'all') {
        const needle = query.trim().toLowerCase();
        const entries = [...chats.map(record => ({record,room:false})),...rooms.map(record => ({record,room:true}))];
        return entries.filter(({record,room}) => {
            const ids = room ? record.members : [record.characterId];
            if (filter !== 'all' && !(filter === 'rooms' ? room : ids.includes(filter))) return false;
            return !needle || [record.title,record.name,...ids.map(id => getCharacter(id).name),...(record.messages || []).map(message => message.text)].join(' ').toLowerCase().includes(needle);
        }).sort((a,b) => (Number(b.record.updated) || 0) - (Number(a.record.updated) || 0));
    }

    function renderChats() {
        const characterFilter = new URLSearchParams(location.search).get('character') || 'all';
        $('#app').innerHTML = `${title('对话','每一段未完的剧情，都可以从这里继续。','<button class="p-btn" id="chat-import" type="button">导入聊天记录</button><a class="p-btn p-btn--primary" href="home.html">发现新角色</a>')}
            <div class="p-filterbar"><div class="p-filterbar-main"><label class="p-search">${icon('search')}<input class="p-input" id="chat-query" type="search" placeholder="搜索角色或对话内容" aria-label="搜索会话"></label><select class="p-select" id="chat-character" aria-label="按角色筛选"><option value="all">全部角色</option>${[...Object.values(characters),...creatorWorks].map(c=>`<option value="${c.id}" ${c.id===characterFilter?'selected':''}>${esc(c.name || '未命名角色')}${c.local?' · 私人':''}</option>`).join('')}<option value="rooms" ${characterFilter==='rooms'?'selected':''}>多角色房间</option></select><span class="p-filterbar-count" id="chat-count"></span></div></div><div class="p-chat-list" id="chat-list"></div>`;
        const draw = () => {
            const query = $('#chat-query').value.trim().toLowerCase();
            const filter = $('#chat-character').value;
            const stories = matchingStories(query,filter);
            $('#chat-count').textContent = `${stories.length} 个故事 · 最近更新优先 · 本标签页保存`;
            $('#chat-list').innerHTML = stories.map(({record,room}) => {
                const c = room ? {initial:'房',hue:210,name:record.name} : getCharacter(record.characterId);
                const messages = record.messages || [];
                const persona = record.personaSnapshot?.name || getPersona(record.personaId || selectedPersona).name;
                const branch = record.branchSource?.label || record.branchSource?.chatId || record.branch?.sourceTitle || record.branch?.sourceChatId || record.branch?.chatId || record.branchFrom || record.parentChatId;
                const metadata = `${room?`${record.members.length} 位角色 · `:''}玩家：${persona}${branch?` · 分支来源：${typeof branch==='string'?branch:'原故事'}`:''} · 本地保存`;
                return `<div class="p-chat-row"><a class="p-chat-open" href="chat.html?chat=${esc(room?record.chatId:record.id)}">${cover(c,'p-row-cover')}<div class="p-chat-row-main"><div class="p-chat-row-title"><span class="p-chat-row-name">${esc(c.name)}</span><span class="p-chat-row-session">${esc(room?'多角色房间':record.title)}</span></div><p class="p-chat-row-preview">${esc(messages.at(-1)?.text || '还没有消息，进入故事写下第一句。')}</p><div class="p-library-sub">${esc(metadata)}</div></div></a><div class="p-chat-row-meta"><span>${relativeTime(record.updated)}</span><span>${messages.length} 条</span></div>${room?`<a class="p-btn p-btn--sm p-btn--icon" href="rooms.html" aria-label="管理${esc(record.name)}">${icon('more')}</a>`:`<button class="p-btn p-btn--sm p-btn--icon p-chat-row-action" data-chat-menu="${esc(record.id)}" aria-label="管理${esc(record.title)}">${icon('more')}</button>`}</div>`;
            }).join('') || `<div class="p-empty"><div class="p-empty-icon">${icon('chat')}</div><div class="p-empty-title">${query||filter!=='all'?'没有找到匹配的故事':'还没有进行中的故事'}</div><p class="p-empty-text">${query||filter!=='all'?'换个历史消息关键词，或清除筛选查看全部故事。':'去发现一个角色，写下故事的第一句。'}</p><button class="p-btn" id="clear-chat-search">清除筛选</button><a class="p-btn p-btn--primary" href="home.html">去发现</a></div>`;
            $('#clear-chat-search')?.addEventListener('click',() => { $('#chat-query').value=''; $('#chat-character').value='all'; draw(); });
        };
        $('#chat-query').addEventListener('input',draw);$('#chat-character').addEventListener('change',draw);draw();
        $('#chat-import')?.addEventListener('click',() => openChatImport($('#chat-character').value === 'all' ? '' : $('#chat-character').value));
    }

    function chatMenu(id) {
        const chat = chatFor(id);
        if (!chat) return;
        if (busy) { toast('请先停止本地模拟，再管理故事。','err'); return; }
        openModal({title:'管理会话',body:`<div class="p-choice-list"><button class="p-choice" id="rename-chat">${icon('edit')}<span class="p-choice-main"><span class="p-choice-title">重命名故事</span><span class="p-choice-sub">${esc(chat.title)}</span></span></button><button class="p-choice" id="export-chat-txt">${icon('download')}<span class="p-choice-main"><span class="p-choice-title">导出阅读用 txt</span><span class="p-choice-sub">纯文本对白，方便外发阅读</span></span></button><button class="p-choice" id="export-chat">${icon('download')}<span class="p-choice-main"><span class="p-choice-title">导出聊天记录</span><span class="p-choice-sub">SillyTavern 的 .jsonl，可直接导入 ST；仅保存在你的设备上</span></span></button><button class="p-choice" id="branch-chat">${icon('branch')}<span class="p-choice-main"><span class="p-choice-title">复制为新分支</span><span class="p-choice-sub">保留原故事，从当前剧情探索另一种可能</span></span></button><button class="p-choice" id="delete-chat">${icon('trash')}<span class="p-choice-main"><span class="p-choice-title">删除会话</span><span class="p-choice-sub">此操作不可撤销</span></span></button></div>`,confirmText:'完成',cancelText:'关闭',onConfirm:(_,close)=>close()});
        $('#rename-chat').addEventListener('click',()=>openModal({title:'重命名故事',body:`<div class="p-field"><label class="p-label" for="chat-title">故事名称</label><input class="p-input" id="chat-title" value="${esc(chat.title)}" maxlength="40"></div>`,confirmText:'保存',onConfirm:(overlay,close)=>{const name=$('#chat-title',overlay).value.trim();if(busy||!name)return false;if(!commitChat(chat,item=>{item.title=name;}))return false;close();if($('#message-input')&&currentChat?.id===chat.id)drawMessages();else renderChats();toast('故事已重命名');}}));
        $('#export-chat').addEventListener('click',()=>exportChat(chat));
        $('#export-chat-txt').addEventListener('click',()=>exportChatTxt(chat));
        $('#branch-chat').addEventListener('click',()=>{const clone=branchChat(chat,chat.messages.length-1);if(clone)location.href=`chat.html?chat=${clone.id}`;});
        $('#delete-chat').addEventListener('click',()=>confirmAction('删除这段故事？',`「${chat.title}」将从当前标签页的本地记录移除。请先导出需要保留的内容，此操作不可撤销。`,'删除',()=>{if(busy)return;const previous=chats;chats=chats.filter(c=>c.id!==id);if(!saveState()){chats=previous;return;}if(page==='chats')renderChats();else location.href='chats.html';}));
    }

    // ── 聊天记录：与 SillyTavern 的 .jsonl 互通 ─────────────────────────────────────────
    // ST 第一行是 {chat_metadata,user_name,character_name}，之后每行一条 {name,is_user,is_system,send_date,mes,swipes,swipe_id,extra}。
    // 本原型的会话信息（角色快照、身份、记忆、世界书…）放进 chat_metadata.cai_story，ST 读取时会原样保留不认识的键。
    function chatToSillyTavern(chat) {
        const character = chatCharacter(chat);
        const persona = getPersona(chat.personaId);
        const note = noteSettings(chat);
        const header = {chat_metadata:{note_prompt:textValue(chatContext(chat).note),note_interval:note.interval,note_depth:note.depth,note_role:Math.max(loreRoles.indexOf(note.role),0),
            ...(stNotePositions.includes(note.position) ? {note_position:stNotePositions.indexOf(note.position)} : {}),variables:{...chatVars(chat)},
            cai_story:{version:2,title:chat.title,characterSnapshot:chatCharacter(chat),personaId:chat.personaId,context:chatContext(chat),branchSource:chat.branchSource || null,opening:chat.opening,openingTitle:chat.openingTitle,simulation:true}},
            user_name:'unused',character_name:'unused'};
        const lines = chat.messages.map(message => {
            const isUser = message.role === 'user';
            const name = isUser ? textValue(message.personaSnapshot?.name,persona.name) : message.role === 'system' ? 'System' : character.name;
            const candidates = Array.isArray(message.candidates) && message.candidates.length ? message.candidates : [message.text];
            return {name,is_user:isUser,is_system:message.role === 'system' || message.hidden === true,send_date:new Date(chat.updated || Date.now()).toISOString(),
                mes:message.text,swipes:candidates,swipe_id:message.selectedCandidate || 0,
                extra:{cai:{id:message.id,role:message.role,hidden:message.hidden === true,personaSnapshot:message.personaSnapshot || null,simulation:message.simulation === true}}};
        });
        return [header,...lines].map(line => JSON.stringify(line)).join('\n');
    }

    // 读入 ST .jsonl、本原型旧版 .jsonl（story-metadata 首行），以及 ST 能导入的几种 .json（Agnai / ooba / RisuAI / CAI Tools）。
    function parseChatImport(text) {
        const source = String(text || '').trim();
        if (!source) return null;
        const messages = [];
        let meta = {};
        const push = (role,mes,extra = {}) => { if (typeof mes === 'string' && (mes.trim() || extra.keepEmpty)) messages.push({role,text:mes,...extra}); };
        let whole = null;
        try { whole = JSON.parse(source); } catch {}
        const isJsonFormat = plainRecord(whole) && (Array.isArray(whole.messages) || Array.isArray(whole.data_visible) || whole.type === 'risuChat' || whole.histories !== undefined);
        if (isJsonFormat) {
            const data = whole;
            if (Array.isArray(data?.messages)) data.messages.forEach(item => push(item.userId ? 'user' : 'assistant',textValue(item.msg)));
            else if (Array.isArray(data?.data_visible)) data.data_visible.forEach(pair => { push('user',textValue(pair?.[0])); push('assistant',textValue(pair?.[1])); });
            else if (data?.type === 'risuChat' && Array.isArray(data.data?.message)) data.data.message.forEach(item => push(item.role === 'user' ? 'user' : 'assistant',textValue(item.data)));
            else if (Array.isArray(data?.histories?.histories)) (data.histories.histories[0]?.msgs || []).forEach(item => push(item.src?.is_human ? 'user' : 'assistant',textValue(item.text)));
            else return null;
            return messages.length ? {meta,messages,format:'json'} : null;
        }
        const lines = source.split('\n').map(line => line.trim()).filter(Boolean);
        let header = null;
        try { header = JSON.parse(lines[0]); } catch { return null; }
        if (!plainRecord(header)) return null;
        const legacy = header.type === 'story-metadata';
        if (!legacy && !(header.user_name !== undefined || header.name !== undefined || header.chat_metadata !== undefined)) return null;
        meta = legacy ? {cai_story:{title:header.title,characterSnapshot:header.characterSnapshot,context:header.context,branchSource:header.branchSource}} : (plainRecord(header.chat_metadata) ? header.chat_metadata : {});
        for (const line of lines.slice(1)) {
            let item = null;
            try { item = JSON.parse(line); } catch { continue; }
            if (!plainRecord(item)) continue;
            if (legacy) { push(['user','assistant','system'].includes(item.role) ? item.role : 'system',textValue(item.text),{candidates:item.candidates,selectedCandidate:item.selectedCandidate,personaSnapshot:item.personaSnapshot,hidden:item.hidden === true,simulation:item.simulation === true}); continue; }
            // Chub 的 mes / swipes 可能是 {message} 对象（ST 的 flattenChubChat）。
            const flat = value => plainRecord(value) && typeof value.message === 'string' ? value.message : value;
            const cai = plainRecord(item.extra?.cai) ? item.extra.cai : {};
            const role = cai.role || (item.is_user ? 'user' : item.is_system && !cai.hidden && item.extra?.type !== undefined ? 'system' : 'assistant');
            const swipes = Array.isArray(item.swipes) ? item.swipes.map(flat).filter(value => typeof value === 'string') : [];
            const selected = Number.isInteger(item.swipe_id) && item.swipe_id >= 0 && item.swipe_id < swipes.length ? item.swipe_id : 0;
            // ST 把隐藏消息记成 is_system（/hide）；带 extra.type 的才是真正的系统旁白。
            const hidden = cai.hidden === true || (item.is_system === true && role !== 'system');
            push(role,textValue(flat(item.mes)),{candidates:swipes.length ? swipes : undefined,selectedCandidate:selected,hidden,
                personaSnapshot:role === 'user' ? (plainRecord(cai.personaSnapshot) ? cai.personaSnapshot : {name:textValue(item.name,'玩家'),initial:Array.from(textValue(item.name,'玩'))[0],hue:28}) : undefined,
                simulation:cai.simulation === true});
        }
        return messages.length ? {meta,messages,format:legacy ? 'legacy' : 'jsonl'} : null;
    }

    function importChatRecord(characterId,parsed,fileName = '') {
        const character = getCharacter(characterId);
        if (!character || character.missing) { toast('先选择一个角色，再导入聊天记录。','err'); return null; }
        const story = plainRecord(parsed.meta?.cai_story) ? parsed.meta.cai_story : {};
        const context = plainRecord(story.context) ? cloneChatValue(story.context) : {memory:'',note:textValue(parsed.meta?.note_prompt),lore:[]};
        if (plainRecord(parsed.meta?.variables)) context.vars = {...parsed.meta.variables,...(context.vars || {})};
        // ST 的作者注释设置（没有 cai_story 时才用，避免覆盖本平台自己的设置）
        if (!plainRecord(story.context) && parsed.meta && (parsed.meta.note_interval !== undefined || parsed.meta.note_position !== undefined)) {
            context.noteSettings = {interval:parsed.meta.note_interval,position:stNotePositions[Number(parsed.meta.note_position)] || 'depth',depth:parsed.meta.note_depth,role:loreRoles[Number(parsed.meta.note_role)] || 'system'};
        }
        const messages = normalizeMessages(parsed.messages.map(message => ({...message,candidates:Array.isArray(message.candidates) ? message.candidates : undefined})));
        const id = resourceId(`chat-${characterId}`);
        const title = textValue(story.title,fileName.replace(/\.(jsonl?|json)$/i,'') || `${character.name} · 导入`).slice(0,40);
        const chat = {id,characterId,title:`${title} · 导入`,opening:'imported',openingTitle:'导入的记录',openingText:messages[0]?.text || '',
            characterSnapshot:plainRecord(story.characterSnapshot) ? cloneChatValue(story.characterSnapshot) : cloneChatValue(character),
            snapshotNote:plainRecord(story.characterSnapshot) ? '导入记录自带的角色快照。' : '导入的记录没有角色快照，取自导入时的角色资料。',
            context,personaId:getPersona(textValue(story.personaId,selectedPersona)).id,updated:Date.now(),time:'刚刚',messages};
        prepareChat(chat);
        syncMessageMetadata(chat);
        chats.push(chat);
        if (!saveState()) { chats.pop(); return null; }
        return chat;
    }

    function openChatImport(defaultCharacterId = '') {
        const roles = [...Object.values(characters),...creatorWorks].filter(item => item && !item.missing);
        const dialog = openModal({
            title:'导入聊天记录',
            body:`<p class="p-rp-context-note">支持 SillyTavern 的 .jsonl（含候选、隐藏消息、变量与作者注释），本平台导出的记录，以及 Agnai / oobabooga / RisuAI / CAI Tools 的 .json。文件只在当前标签页解析，导入后成为一条新故事，不会覆盖已有记录。</p>
                <div class="p-field"><label class="p-label" for="chat-import-character">属于哪个角色</label><select class="p-select" id="chat-import-character">${roles.map(item => `<option value="${esc(item.id)}" ${item.id === defaultCharacterId ? 'selected' : ''}>${esc(item.name || '未命名角色')}</option>`).join('')}</select></div>
                <div class="p-field"><label class="p-label" for="chat-import-file">选择文件</label><input class="p-input" id="chat-import-file" type="file" accept=".jsonl,.json,application/json"></div>
                <div class="p-field"><label class="p-label" for="chat-import-text">或粘贴内容</label><textarea class="p-textarea" id="chat-import-text" placeholder='{"user_name":"unused","character_name":"unused","chat_metadata":{}}'></textarea></div>
                <p class="p-hint" id="chat-import-status">导入的回复会保留原文，不会标成本地模板模拟。</p>`,
            confirmText:'导入',
            cancelText:'关闭',
            onConfirm:(overlay,close) => { run(overlay,close); return false; },
        });
        const run = async (overlay,close) => {
            const status = $('#chat-import-status',overlay);
            const fail = message => { status.textContent = message; status.className = 'p-hint p-hint--err'; };
            const file = $('#chat-import-file',overlay)?.files?.[0];
            const pasted = $('#chat-import-text',overlay)?.value.trim();
            if (!file && !pasted) { fail('请选择文件或粘贴内容。'); return; }
            if (file && file.size > CARD_MAX_BYTES) { fail('文件超过 8MB。'); return; }
            try {
                const text = pasted || bytesToText(new Uint8Array(await file.arrayBuffer()));
                const parsed = parseChatImport(text);
                if (!parsed) { fail('没有识别出聊天记录。请确认是 SillyTavern 的 .jsonl，或支持的 .json 格式。'); return; }
                const chat = importChatRecord($('#chat-import-character',overlay).value,parsed,file?.name || '');
                if (!chat) { fail('保存失败，导入已撤销。'); return; }
                close();
                toast(`已导入 ${chat.messages.length} 条消息`);
                location.href = `chat.html?chat=${chat.id}`;
            } catch { fail('读取失败，请重试。'); }
        };
        return dialog;
    }

    function downloadText(name, text) {
        const blob = new Blob([text],{type:'text/plain;charset=utf-8'});
        const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();
        setTimeout(()=>URL.revokeObjectURL(url),500);
    }

    // 阅读用 txt：标题、身份与逐条对白，不含隐藏消息
    function chatToPlainText(chat) {
        const persona = getPersona(chat.personaId);
        const lines = [`《${chat.title}》`,`角色：${chatCharacter(chat).name}`,`你的身份：${persona.name}`,''];
        chat.messages.forEach(message => {
            if (message.hidden) return;
            const who = message.role === 'system' ? '旁白' : message.role === 'user' ? `你（${persona.name}）` : chatCharacter(chat).name;
            lines.push(`【${who}】`);
            lines.push(...String(message.text || '').split('\n'));
            lines.push('');
        });
        return lines.join('\n');
    }

    function exportChatTxt(chat) {
        downloadText(`${chat.title}.txt`, chatToPlainText(chat));
        toast('已导出阅读用 txt');
    }

    function roomToPlainText(room) {
        const lines = [`《${room.name}》· 多角色故事`, `成员：${room.members.map(id=>roomCharacter(room,id).name).join('、')}`,''];
        room.messages.forEach(message => {
            if (message.hidden) return;
            const who = message.role === 'system' ? '旁白' : message.role === 'user' ? `你` : (roomCharacter(room,message.speakerId)?.name || '成员');
            lines.push(`【${who}】`);
            lines.push(...String(message.text || '').split('\n'));
            lines.push('');
        });
        return lines.join('\n');
    }

    function exportRoomTxt(room) {
        downloadText(`${room.name}.txt`, roomToPlainText(room));
        toast('已导出阅读用 txt');
    }

    function exportChat(chat) {
        const blob = new Blob([chatToSillyTavern(chat)],{type:'application/jsonl'});
        const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${chat.title}.jsonl`;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);toast('聊天记录已导出（SillyTavern .jsonl，可直接导入 ST）');
    }

    function renderChat() {
        const id = new URLSearchParams(location.search).get('chat') || recentChat('shen-yanzhi')?.id || chats[0]?.id;
        if (isRoom(id)) { renderRoomChat(id); return; }
        currentChat = chatFor(id);
        if (!currentChat) { location.replace('chats.html');return; }
        if (!currentChat.characterSnapshot || currentChat.messages.some(message=>!message.id)) commitChat(currentChat,()=>{});
        const character = chatCharacter(currentChat);
        const persona = getPersona(currentChat.personaId);
        document.title = `${character.name} · ${currentChat.title} · 酒馆`;
        $('#app').innerHTML = `<div class="p-rp-workbench"><div class="p-chat"><header class="p-chat-head"><div class="p-chat-col p-chat-head-in"><a class="p-chat-icon" href="chats.html" aria-label="返回会话列表">${icon('back')}</a><div class="p-chat-title">${['shen-yanzhi','lin-wanzhao','bai-lu','lu-shiyan','a-heng','xie-wujiu'].includes(character.id)?`<span class="p-avatar p-avatar--art" style="--size:34px;--h:${character.hue}"><img src="assets/characters/${encodeURI(character.id)}.jpg" alt=""></span>`:avatar(character,34)}<div class="p-chat-title-text"><div class="p-chat-name">${esc(character.name)}</div><div class="p-chat-sub" id="rp-story-title">${esc(currentChat.title)}</div></div></div><button class="p-chat-icon" id="chat-search" type="button" aria-label="搜索与书签">${icon('search')}</button><button class="p-chat-icon" id="chat-more" type="button" aria-label="故事设定">${icon('settings')}</button></div></header><div class="p-rp-status">本地模拟 · 模板回复 · 不调用模型 / 不扣点</div><div class="p-chat-scroll" id="chat-scroll" tabindex="0" aria-label="对话消息"><div class="p-chat-col" id="messages"></div></div><div class="p-chat-compose"><div class="p-chat-col"><div class="p-compose-bar"><div class="p-compose-bar-main"><div class="p-var-strip" id="rp-var-strip" hidden></div><div class="p-qr-bar" id="rp-qr-bar" hidden></div></div><div class="p-rp-compose-context"><span class="p-compose-persona" title="你在这段故事里的身份">以 <b id="rp-compose-persona">${esc(persona.name)}</b> 的身份</span><button class="p-text-btn" id="compose-settings" type="button">故事设定</button></div></div><div class="p-chat-compose-row"><textarea class="p-chat-input" id="message-input" rows="1" placeholder="写下台词，或用 *行动描述* 推进故事…" aria-label="输入消息"></textarea><button class="p-chat-send" id="send-message" type="button" aria-label="发送">${icon('send')}</button><button class="p-chat-send" id="stop-message" type="button" aria-label="停止生成" hidden>${icon('stop')}</button></div><div class="p-compose-meta"><span id="draft-status">草稿自动保存 · Shift+Enter 换行 · 输入 / 用命令</span><span class="p-compose-actions"><button class="p-text-btn" id="impersonate-message" type="button" title="以你的身份写一段草稿，放进输入框，不会直接发出">代写</button><button class="p-text-btn" id="continue-message" type="button" title="接着最后一条角色回复往下写">继续剧情</button></span></div></div></div><button class="p-chat-jump" id="chat-jump" type="button" aria-label="回到最新消息" hidden>${icon('down')}</button></div><aside class="p-rp-context" id="rp-context" aria-label="故事设定"></aside></div>`;
        const sceneLayer=$('.p-chat');
        if(sceneLayer&&character.scene)sceneLayer.style.setProperty('--scene',`url('scenes/${encodeURI(character.scene)}')`);
        refreshChatContext();
        drawMessages();
        scrollChat();
        const input=$('#message-input');
        try { input.value=sessionStorage.getItem(`draft-${id}`)||''; } catch { toast('无法读取本地草稿，请保持当前页面。','err'); }
        resizeChatInput(input);
        input.addEventListener('input',()=>{resizeChatInput(input);try{sessionStorage.setItem(`draft-${id}`,input.value);(()=>{const d=$('#draft-status');d.textContent='草稿已保存到当前标签页';d.classList?.remove('is-alert');})();}catch{(()=>{const d=$('#draft-status');d.textContent='草稿未保存，请勿关闭页面';d.classList?.add('is-alert');})();toast('草稿保存失败，请复制保留输入内容。','err');}});
        input.addEventListener('compositionstart',()=>{input.dataset.composing='true';});
        input.addEventListener('compositionend',()=>{input.dataset.composing='false';input.dataset.compositionEnded=String(Date.now());});
        input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!isImeCommit(event)){event.preventDefault();sendMessage(false);}});
        $('#send-message').addEventListener('click',()=>sendMessage(false));
        $('#stop-message').addEventListener('click',()=>{clearTimeout(generationTimer);generationTimer=null;generationRequest+=1;busy=false;$('#stop-message').hidden=true;$('#send-message').hidden=false;$('#continue-message').disabled=false;if($('#impersonate-message'))$('#impersonate-message').disabled=false;$('#thinking')?.remove();toast('已停止生成');});
        $('#continue-message').addEventListener('click',()=>sendMessage(true));
        $('#impersonate-message').addEventListener('click',()=>impersonate());
        $('#chat-more').addEventListener('click',()=>openChatTools(currentChat));
        $('#chat-search')?.addEventListener('click',()=>openChatSearch(currentChat,{messages:currentChat.messages,scope:'chat'}));
        $('#compose-settings').addEventListener('click',()=>openChatTools(currentChat));
        $('#chat-jump').addEventListener('click',()=>scrollChat(true));
        $('#chat-scroll').addEventListener('scroll',()=>{$('#chat-jump').hidden=$('#chat-scroll').scrollHeight-$('#chat-scroll').scrollTop-$('#chat-scroll').clientHeight<100;});
    }

    function drawMessages() {
        const container=$('#messages'), scroll=$('#chat-scroll');
        const scrollTop=scroll?.scrollTop || 0;
        const nearBottom=!scroll || scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<100;
        const c=chatCharacter(currentChat), persona=getPersona(currentChat.personaId);
        container.innerHTML=`<section class="p-rp-prologue"><div class="p-eyebrow">STORY</div><h1>${esc(currentChat.title)}</h1><p>当前身份 · ${esc(persona.name)}</p><small>开场 · ${esc(currentChat.openingTitle || (currentChat.opening==='default'?'初遇':currentChat.opening || '原始记录'))}</small></section>`;
        currentChat.messages.forEach((message,index)=>{
            const row=document.createElement('article');
            const latestReply=message.role==='assistant'&&index===currentChat.messages.map(item=>item.role).lastIndexOf('assistant');
            row.className=`${message.role==='system'?'p-rp-system':`p-msg${message.role==='user'?' p-msg-user':''}`}${message.hidden?' is-hidden':''}${latestReply?' is-latest':''}`;
            const speaker=plainRecord(message.personaSnapshot)?message.personaSnapshot:{name:'你 · 旧记录未标注身份',initial:'你',hue:28};
            const name=message.role==='system'?'系统记录':message.role==='user'?speaker.name:c.name;
            const control=(action,label,symbol,disabled=false)=>`<button type="button" data-message-action="${action}" data-message-index="${index}" aria-label="${label}" title="${label}" ${disabled?'disabled':''}>${icon(symbol)}</button>`;
            const candidates=message.candidates || [message.text];
            row.dataset.msgIndex=String(index);
            row.innerHTML=`${message.role==='system'?'':avatar(message.role==='user'?speaker:c,32)}<div><div class="p-msg-name">${esc(name)}${message.role==='assistant'&&!message.hidden?emotionBadge(message.text):''}${message.bookmark?'<span class="p-msg-flag p-bookmark-flag">书签</span>':''}${message.simulation?' · 模板模拟':''}${message.hidden?'<span class="p-msg-flag">已隐藏 · 不进入上下文</span>':''}</div><div class="p-msg-copy p-msg-text">${messageMarkup(displayMessageText(message,currentChat.messages.length-1-index))}</div><div class="p-msg-tools">${control('copy','复制消息','copy')}${control('edit','编辑消息','edit')}${control('branch','从这里创建分支','branch')}${control('bookmark',message.bookmark?'移除书签':'加书签：跳转与分支','bookmark')}${message.role==='assistant'?`${control('regenerate','保留原文并生成候选','refresh')}${candidates.length>1?`${control('previous','上一个候选','back',!(message.selectedCandidate>0))}<span class="p-rp-candidate-index">${(message.selectedCandidate || 0)+1} / ${candidates.length}</span>${control('next','下一个候选','next',(message.selectedCandidate || 0)>=candidates.length-1)}`:''}`:''}${control('more','更多：隐藏、删除','more')}</div></div>`;
            container.appendChild(row);
        });
        $$('[data-message-action]',container).forEach(button=>button.addEventListener('click',()=>messageAction(button.dataset.messageAction,Number(button.dataset.messageIndex))));
        $$('.p-msg',container).forEach(row=>row.addEventListener('click',event=>{if(event.target.closest('button, a, textarea, input'))return;const open=!row.classList.contains('is-tools-open');$$('.p-msg.is-tools-open',container).forEach(item=>item.classList.remove('is-tools-open'));row.classList.toggle('is-tools-open',open);}));
        refreshChatContext();
        if(nearBottom)scrollChat();else if(scroll)scroll.scrollTop=scrollTop;
    }

    function scrollChat(smooth=false) { const scroll=$('#chat-scroll');if(scroll)scroll.scrollTo({top:scroll.scrollHeight,behavior:smooth&&!reducedMotion?'smooth':'instant'}); }

    function messageAction(action,index) {
        const chat=currentChat, message=chat?.messages[index];
        if(!message)return;
        if(action==='copy'){if(!navigator.clipboard){toast('复制不可用，请手动选择文本','err');return;}navigator.clipboard.writeText(message.text).then(()=>toast('消息已复制')).catch(()=>toast('复制失败，请手动选择文本','err'));return;}
        if(action==='bookmark'){
            // 书签只是标记，不改历史文本——不走「改历史建分支」的确认流程
            if(!commitChat(chat,target=>{target.messages[index].bookmark=!target.messages[index].bookmark;}))return;
            drawMessages();
            toast(message.bookmark?'书签已移除':'已加书签；在右侧「搜索与书签」里跳转');
            return;
        }
        if(busy){toast('请先停止本地模拟，再修改消息。','err');return;}
        const apply=change=>{
            if(busy)return false;
            if(index<chat.messages.length-1){
                openModal({title:'从此处创建新分支？',body:'<p>修改历史消息会创建一条截至此处的新故事线。原消息、原候选和后续剧情都保持不变。</p>',confirmText:'创建分支并修改',onConfirm:(_,close)=>{const clone=branchChat(chat,index,change);if(!clone)return false;close();location.href=`chat.html?chat=${clone.id}`;}});
                return true;
            }
            if(!commitChat(chat,change))return false;
            drawMessages();toast('已保存到当前故事');return true;
        };
        // 重试 / 切换候选 / 编辑都会改变当前选中的消息链，状态栏随之按新链重放。
        const withStatus=change=>apply(target=>{const before=cloneChatValue(target.messages);change(target);syncStatusVars(target,before);});
        if(action==='branch'){const clone=branchChat(chat,index);if(clone)location.href=`chat.html?chat=${clone.id}`;return;}
        if(action==='more'){openMessageMenu(chat,index);return;}
        // ST 的 /hide：消息留在记录里，但不进入上下文与世界书扫描（is_system）。隐藏与删除都直接作用于当前故事，不建分支。
        if(action==='hide'){
            const hidden=!message.hidden;
            if(!commitChat(chat,target=>{const before=cloneChatValue(target.messages);target.messages[index].hidden=hidden;syncStatusVars(target,before);}))return;
            drawMessages();toast(hidden?'这条消息已隐藏，不再进入上下文':'这条消息重新进入上下文');return;
        }
        if(action==='delete'){
            const count=chat.messages.length-index;
            openModal({title:count>1?`删除这条及之后的 ${count} 条消息？`:'删除这条消息？',body:`<p>${count>1?'与 SillyTavern 的删除模式一致：选中的消息和它之后的全部消息一起删除。':'只删除这一条。'}想保留原剧情可以先「从这里创建分支」。删除不可撤销。</p>`,confirmText:'删除',danger:true,onConfirm:(_,close)=>{
                if(busy)return false;
                if(!commitChat(chat,target=>{const before=cloneChatValue(target.messages);target.messages.splice(index);syncStatusVars(target,before);}))return false;
                close();drawMessages();toast(count>1?`已删除 ${count} 条消息`:'消息已删除');
            }});
            return;
        }
        if(action==='delete-candidate'&&message.role==='assistant'){
            const count=message.candidates?.length || 1;
            if(count<=1){toast('只剩一个候选，不能删除；可以删除整条消息。','err');return;}
            const current=message.selectedCandidate || 0;
            withStatus(target=>{const item=target.messages[index];item.candidates.splice(current,1);item.selectedCandidate=Math.min(current,item.candidates.length-1);item.text=item.candidates[item.selectedCandidate];});
            return;
        }
        if(action==='regenerate'&&message.role==='assistant'){withStatus(target=>{const item=target.messages[index];generationEffects(target,index,'regenerate');const block=parseStatusBlock(item.text).found||message.simulation?`\n\n${statusBlockText(target,candidateTurn(target,index))}`:'';item.candidates.push(`${simulatedReply(target,item.candidates.length)}${block}`);item.selectedCandidate=item.candidates.length-1;item.text=item.candidates[item.selectedCandidate];item.simulation=true;});return;}
        if((action==='previous'||action==='next')&&message.role==='assistant'){
            const count=message.candidates?.length || 1;
            const selected=(message.selectedCandidate || 0)+(action==='next'?1:-1);
            if(selected<0||selected>=count){toast('已经是这一侧的最后一个候选');return;}
            withStatus(target=>{const item=target.messages[index];item.selectedCandidate=selected;item.text=item.candidates[selected];});return;
        }
        if(action==='edit')openModal({title:'编辑消息',body:`<label class="p-label" for="edit-message">${index<chat.messages.length-1?'保存后需确认创建分支，原故事不变':'保留旧文本为候选'}</label><textarea class="p-textarea" id="edit-message" style="min-height:180px">${esc(message.text)}</textarea>${message.role==='assistant'?'<p class="p-hint">消息里的【状态】块会在保存后重新解析，状态栏随之更新。</p>':''}`,confirmText:'保存',onConfirm:(overlay,close)=>{const text=$('#edit-message',overlay).value.trim();if(busy||!text){toast('消息不能为空，且模拟运行中不可修改。','err');return false;}if(text===message.text){close();return;}if(withStatus(target=>{const item=target.messages[index];item.candidates.push(text);item.selectedCandidate=item.candidates.length-1;item.text=text;}))close();}});
    }

    // 一次「生成」的副作用：按截至 upto（不含）的上下文组装并 commit——执行提示词里的 setvar / incvar，登记世界书粘滞与冷却。
    // 发送与重新生成共用，与 ST 每次调用模型前都跑一遍 getWorldInfoPrompt 的语义一致。
    function generationEffects(chat,upto,trigger) {
        const view={...chat,messages:chat.messages.slice(0,upto)};
        const prompt=assemblePrompt(view,{trigger,commit:true});
        if(prompt.lore.timed)chat.context.loreTimed=prompt.lore.timed;
        return prompt;
    }

    function openMessageMenu(chat,index) {
        const message=chat.messages[index];
        if(!message)return;
        const later=chat.messages.length-1-index;
        const candidates=message.candidates?.length || 1;
        const dialog=openModal({title:'消息操作',body:`<div class="p-choice-list">
            <button class="p-choice" data-menu-action="copy">${icon('copy')}<span class="p-choice-main"><span class="p-choice-title">复制</span><span class="p-choice-sub">复制这条消息的原文</span></span></button>
            <button class="p-choice" data-menu-action="branch">${icon('branch')}<span class="p-choice-main"><span class="p-choice-title">从这里创建分支</span><span class="p-choice-sub">保留原故事，截至这条消息另开一条故事线</span></span></button>
            <button class="p-choice" data-menu-action="hide">${icon('eye')}<span class="p-choice-main"><span class="p-choice-title">${message.hidden?'取消隐藏':'隐藏这条消息'}</span><span class="p-choice-sub">${message.hidden?'重新进入上下文与世界书扫描':'保留在记录里，但不再进入上下文与世界书扫描'}</span></span></button>
            ${message.role==='assistant'&&candidates>1?`<button class="p-choice" data-menu-action="delete-candidate">${icon('trash')}<span class="p-choice-main"><span class="p-choice-title">删除当前候选</span><span class="p-choice-sub">第 ${(message.selectedCandidate || 0)+1} 个，共 ${candidates} 个；其余候选保留</span></span></button>`:''}
            <button class="p-choice" data-menu-action="delete">${icon('trash')}<span class="p-choice-main"><span class="p-choice-title">${later?`删除这条及之后的 ${later+1} 条`:'删除这条消息'}</span><span class="p-choice-sub">删除不可撤销；想保留原剧情可以先创建分支</span></span></button>
        </div>`,confirmText:'完成',cancelText:'关闭',onConfirm:(_,close)=>close()});
        $$('[data-menu-action]',dialog.overlay).forEach(button=>button.addEventListener('click',()=>{dialog.close();messageAction(button.dataset.menuAction,index);}));
    }

    // ── 斜杠命令：SillyTavern 1.19.0 STscript 里聊天时最常用的一组，名字、别名与参数写法照 ST ──────────
    // 只支持单条命令（不支持 | 管道与闭包）；参数写成 /命令 名=值 文本。未知命令报错，不当成普通消息发出去。
    const slashCommands = [
        ['sys','nar','/sys 文本','以系统旁白发一条消息，不触发回复'],
        ['send','','/send 文本','以玩家身份追加一条消息，不触发回复'],
        ['trigger','','/trigger','让角色接着回复（不发玩家消息）'],
        ['continue','cont','/continue','继续最后一条角色回复'],
        ['regenerate','regen','/regenerate','重新生成最后一条角色回复'],
        ['impersonate','imp','/impersonate','代写：把一段玩家草稿放进输入框'],
        ['hide','','/hide 序号 或 /hide 起-止','隐藏消息（序号从 0 开始，与 ST 一致）'],
        ['unhide','','/unhide 序号 或 /unhide 起-止','取消隐藏'],
        ['del','cut','/del 数量','删除最后 N 条消息（默认 1）'],
        ['setvar','','/setvar key=名 值','写会话变量'],
        ['getvar','','/getvar 名','查看会话变量'],
        ['addvar','','/addvar key=名 值','数字相加，否则接在后面'],
        ['incvar','','/incvar 名','会话变量加 1'],
        ['decvar','','/decvar 名','会话变量减 1'],
        ['flushvar','','/flushvar 名','删除会话变量'],
        ['listvar','','/listvar','列出会话变量'],
        ['setglobalvar','','/setglobalvar key=名 值','写全局变量'],
        ['getglobalvar','','/getglobalvar 名','查看全局变量'],
        ['roll','r','/roll 2d6','掷骰子（droll 写法）'],
        ['note','','/note 文本','设置作者注释'],
        ['echo','','/echo 文本','只在页面上提示，不写入记录'],
        ['help','?','/help','列出可用命令'],
    ];

    function parseSlashCommand(text) {
        const match = String(text ?? '').match(/^\/([a-zA-Z?][\w-]*)\s*([^]*)$/);
        if (!match) return null;
        const name = match[1].toLowerCase();
        const command = slashCommands.find(([key,alias]) => key === name || (alias && alias.split(',').includes(name)));
        // 命名参数：key=值 或 key="带空格的值"，其余是无名参数
        const named = {};
        const rest = match[2].replace(/(^|\s)([a-zA-Z_]\w*)=(?:"([^"]*)"|(\S+))/g,(_,lead,key,quoted,plain) => { named[key] = quoted ?? plain; return lead; }).trim();
        return {name:command ? command[0] : name,known:Boolean(command),named,text:rest};
    }

    function messageRange(chat,spec) {
        const match = String(spec ?? '').trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
        if (!match) return null;
        const start = Number(match[1]), end = Number(match[2] ?? match[1]);
        if (start > end || end >= chat.messages.length) return null;
        return [start,end];
    }

    // 返回 true 表示命令已处理（输入框清空）；false 表示命令有误、保留输入让玩家修改。
    function runSlashCommand(chat,command) {
        const say = (text,kind = '') => toast(text,kind);
        const varKey = () => textValue(command.named.key,command.text.split(/\s+/)[0]).trim();
        const varValue = () => command.named.key !== undefined ? command.text : command.text.split(/\s+/).slice(1).join(' ');
        const commit = change => commitChat(chat,change) ? (drawMessages(),true) : false;
        switch (command.name) {
            case 'help':
                openModal({title:'斜杠命令',wide:true,body:`<p class="p-rp-context-note">写法与 SillyTavern 一致；本原型只支持单条命令，不支持 | 管道、闭包与 STscript 流程控制。消息序号从 0 开始。</p><div class="p-rp-context-list">${slashCommands.map(([key,alias,usage,note]) => `<p class="p-rp-context-note"><strong>${esc(usage)}</strong>${alias ? ` · 别名 /${esc(alias)}` : ''} — ${esc(note)}</p>`).join('')}</div>`,confirmText:'完成',onConfirm:(_,close) => close()});
                return true;
            case 'sys':
                if (!command.text) { say('/sys 后面要写内容。','err'); return false; }
                return commit(target => { target.messages.push(...normalizeMessages([{role:'system',text:resolveMacros(command.text,target,{commit:true}).text}])); });
            case 'send':
                if (!command.text) { say('/send 后面要写内容。','err'); return false; }
                return commit(target => { target.messages.push(...normalizeMessages([{role:'user',text:resolveMacros(command.text,target,{commit:true}).text,personaSnapshot:cloneChatValue(getPersona(target.personaId))}])); });
            case 'trigger': startGeneration(false); return true;
            case 'continue': startGeneration(true); return true;
            case 'impersonate': impersonate(); return true;
            case 'regenerate': {
                const index = chat.messages.length - 1;
                if (chat.messages[index]?.role !== 'assistant') { say('最后一条不是角色回复，不能重新生成。','err'); return false; }
                messageAction('regenerate',index);
                return true;
            }
            case 'hide': case 'unhide': {
                const range = messageRange(chat,command.text);
                if (!range) { say(`序号要在 0 到 ${chat.messages.length - 1} 之间，例如 /${command.name} 2 或 /${command.name} 1-3。`,'err'); return false; }
                return commit(target => { const before = cloneChatValue(target.messages); for (let index = range[0]; index <= range[1]; index += 1) target.messages[index].hidden = command.name === 'hide'; syncStatusVars(target,before); });
            }
            case 'del': {
                const count = command.text ? Number(command.text) : 1;
                if (!Number.isInteger(count) || count < 1 || count > chat.messages.length) { say(`要删除 1 到 ${chat.messages.length} 条。`,'err'); return false; }
                return commit(target => { const before = cloneChatValue(target.messages); target.messages.splice(target.messages.length - count); syncStatusVars(target,before); });
            }
            case 'setvar': case 'setglobalvar': case 'addvar': {
                const key = varKey();
                if (!key) { say(`写法：/${command.name} key=名字 值`,'err'); return false; }
                const scope = command.name === 'setglobalvar' ? 'global' : 'local';
                return commit(target => { if (command.name === 'addvar') addVar(target,'local',key,varValue(),true,[]); else writeVar(target,scope,key,varValue()); });
            }
            case 'incvar': case 'decvar': {
                const key = varKey();
                if (!key) { say(`写法：/${command.name} 名字`,'err'); return false; }
                return commit(target => { stepVar(target,'local',key,command.name === 'incvar' ? 1 : -1,true,[]); });
            }
            case 'flushvar': {
                const key = varKey();
                if (!key) { say('写法：/flushvar 名字','err'); return false; }
                return commit(target => { removeVar(target,'local',key); });
            }
            case 'getvar': case 'getglobalvar': {
                const key = varKey();
                const value = readVar(chat,command.name === 'getglobalvar' ? 'global' : 'local',key);
                say(key ? `${key} = ${value === '' ? '（未设置）' : value}` : '写法：/getvar 名字',key ? '' : 'err');
                return Boolean(key);
            }
            case 'listvar': {
                const vars = chatVars(chat);
                const keys = Object.keys(vars);
                say(keys.length ? keys.map(key => `${key} = ${vars[key]}`).join('；') : '本会话还没有变量。');
                return true;
            }
            case 'roll': {
                const total = rollDice(command.text || '1d6');
                if (total === null) { say('掷骰写法：/roll 2d6、/roll d20+3。','err'); return false; }
                return commit(target => { target.messages.push(...normalizeMessages([{role:'system',text:`${getPersona(target.personaId).name} 掷了 ${command.text || '1d6'}：${total}`}])); });
            }
            case 'note':
                return commit(target => { target.context.note = command.text; }) && (refreshChatContext(),true);
            case 'echo':
                say(command.text || '（空）');
                return true;
            default:
                say(`没有 /${command.name} 这个命令。输入 /help 查看本原型支持的命令。`,'err');
                return false;
        }
    }

    function normalizeQuickReplies(value) {
        const source = plainRecord(value) ? value : {};
        const seen = new Set();
        return {
            enabled:source.enabled !== false,
            injectInput:source.injectInput === true,
            placeBeforeInput:source.placeBeforeInput === true,
            disableSend:source.disableSend === true,
            items:(Array.isArray(source.items) ? source.items : []).filter(plainRecord).map((item,index) => ({
                id:stableId(item.id,`qr-${index + 1}`),label:textValue(item.label).trim().slice(0,24) || `按钮 ${index + 1}`,
                message:textValue(item.message).slice(0,2000),title:textValue(item.title).slice(0,80),
            })).filter(item => item.message.trim() && !seen.has(item.id) && seen.add(item.id)).slice(0,24),
        };
    }

    function drawQuickReplies() {
        const bar = $('#rp-qr-bar');
        if (!bar) return;
        const items = quickReplies.enabled ? quickReplies.items : [];
        bar.hidden = !items.length;
        bar.innerHTML = items.map(item => `<button class="p-qr-btn" type="button" data-qr="${esc(item.id)}" title="${esc(item.title || item.message)}" aria-label="${esc(item.label)}：${esc(item.title || item.message)}">${esc(item.label)}</button>`).join('');
        $$('[data-qr]',bar).forEach(button => button.addEventListener('click',() => runQuickReply(button.dataset.qr)));
    }

    // ST 的 QuickReplySet.execute：拼进输入框（可放在已有文字前或后）；以 / 开头且允许发送时按命令执行；否则放进输入框并（可选）直接发送。
    function runQuickReply(id) {
        const item = quickReplies.items.find(entry => entry.id === id);
        const input = $('#message-input');
        if (!item || !input || busy) return;
        const current = input.value;
        const text = quickReplies.injectInput && current.length ? (quickReplies.placeBeforeInput ? `${item.message} ${current}` : `${current} ${item.message}`) : item.message;
        if (text.trim().startsWith('/') && !quickReplies.disableSend) {
            const command = parseSlashCommand(text.trim());
            if (command && runSlashCommand(currentChat,command) && quickReplies.injectInput) { input.value = ''; resizeChatInput(input); }
            return;
        }
        input.value = resolveMacros(text,currentChat).text;
        resizeChatInput(input);
        input.focus();
        if (!quickReplies.disableSend) sendMessage(false);
    }

    function openQuickReplyEditor() {
        const working = normalizeQuickReplies(quickReplies);
        const rows = () => working.items.map((item,index) => `<section class="p-rp-context-section"><div class="p-lore-grid"><div><label class="p-label" for="qr-label-${index}">按钮文字</label><input class="p-input" id="qr-label-${index}" data-qr-label="${index}" maxlength="24" value="${esc(item.label)}"></div><div><label class="p-label" for="qr-title-${index}">提示（悬停显示）</label><input class="p-input" id="qr-title-${index}" data-qr-title="${index}" maxlength="80" value="${esc(item.title)}"></div></div><label class="p-label" for="qr-message-${index}">内容（普通文字直接发送；以 / 开头按斜杠命令执行；支持宏）</label><textarea class="p-textarea" id="qr-message-${index}" data-qr-message="${index}" rows="2">${esc(item.message)}</textarea><button class="p-btn p-btn--sm" type="button" data-qr-remove="${index}">删除</button></section>`).join('') || '<p class="p-rp-context-note">还没有快捷回复。</p>';
        const dialog = openModal({
            title:'快捷回复',
            wide:true,
            body:`<p class="p-rp-context-note">对应 SillyTavern 的 Quick Reply：按钮放在输入框上方，所有会话共用。例：「/roll 1d20」掷骰，「*看向窗外*」发一句动作。</p>
                <div class="p-lore-toggles"><label><input type="checkbox" id="qr-enabled" ${working.enabled ? 'checked' : ''}>显示快捷回复条</label><label><input type="checkbox" id="qr-inject" ${working.injectInput ? 'checked' : ''}>拼进输入框已有的文字</label><label><input type="checkbox" id="qr-before" ${working.placeBeforeInput ? 'checked' : ''}>放在已有文字之前</label><label><input type="checkbox" id="qr-nosend" ${working.disableSend ? 'checked' : ''}>只放进输入框，不自动发送</label></div>
                <div id="qr-rows">${rows()}</div>
                <div class="p-lore-actions"><button class="p-btn p-btn--sm" id="qr-add" type="button">添加按钮</button></div>`,
            confirmText:'保存',
            onConfirm:(overlay,close) => {
                collect(overlay);
                const before = quickReplies;
                quickReplies = normalizeQuickReplies({...working,enabled:$('#qr-enabled',overlay).checked,injectInput:$('#qr-inject',overlay).checked,placeBeforeInput:$('#qr-before',overlay).checked,disableSend:$('#qr-nosend',overlay).checked});
                if (!saveState()) { quickReplies = before; toast('保存失败，修改已撤销。','err'); return false; }
                close();
                drawQuickReplies();
                toast(`快捷回复已保存（${quickReplies.items.length} 个）`);
                return false;
            },
        });
        const collect = overlay => {
            working.items = working.items.map((item,index) => ({...item,label:$(`#qr-label-${index}`,overlay)?.value ?? item.label,title:$(`#qr-title-${index}`,overlay)?.value ?? item.title,message:$(`#qr-message-${index}`,overlay)?.value ?? item.message}));
        };
        const redraw = () => { $('#qr-rows',dialog.overlay).innerHTML = rows(); bind(); };
        const bind = () => $$('[data-qr-remove]',dialog.overlay).forEach(button => button.addEventListener('click',() => { collect(dialog.overlay); working.items.splice(Number(button.dataset.qrRemove),1); redraw(); }));
        $('#qr-add',dialog.overlay)?.addEventListener('click',() => { collect(dialog.overlay); working.items.push({id:resourceId('qr'),label:`按钮 ${working.items.length + 1}`,message:'',title:''}); redraw(); });
        bind();
        return dialog;
    }

    function sendMessage(continueStory=false) {
        if(busy)return;
        const input=$('#message-input');
        if(input.dataset.composing==='true')return;
        const text=continueStory?'':input.value.trim();
        if(!continueStory&&!text){input.focus();return;}
        if(!continueStory&&text.startsWith('/')&&!text.startsWith('//')){
            const command=parseSlashCommand(text);
            if(command){
                if(runSlashCommand(currentChat,command)){input.value='';resizeChatInput(input);try{sessionStorage.removeItem(`draft-${currentChat.id}`);}catch{}}
                return;
            }
        }
        if(!continueStory){
            if (!commitChat(currentChat,chat=>{chat.messages.push(...normalizeMessages([{role:'user',text,personaSnapshot:cloneChatValue(getPersona(chat.personaId))}]));})) return;
            input.value='';input.style.height='56px';
            try{sessionStorage.removeItem(`draft-${currentChat.id}`);(()=>{const d=$('#draft-status');d.textContent='消息已保存';d.classList?.remove('is-alert');})();}catch{(()=>{const d=$('#draft-status');d.textContent='消息已保存，但旧草稿清理失败';d.classList?.add('is-alert');})();toast('消息已保存，旧草稿可能在刷新后再次显示。','err');}
        }
        updateAutoSummary(currentChat);
        startGeneration(continueStory);
    }

    function startGeneration(continueStory=false) {
        if(busy)return;
        busy=true;drawMessages();
        const status=document.createElement('div');status.className='p-msg-thinking';status.id='thinking';status.innerHTML=`<span></span><span></span><span></span><span class="p-thinking-label">正在准备本地模板回复…</span>`;$('#messages').appendChild(status);scrollChat(true);
        $('#send-message').hidden=true;$('#stop-message').hidden=false;$('#continue-message').disabled=true;if($('#impersonate-message'))$('#impersonate-message').disabled=true;
        const request=++generationRequest, targetChat=currentChat;
        generationTimer=setTimeout(()=>{
            if(!busy||request!==generationRequest||currentChat!==targetChat)return;
            generationTimer=null;
            commitChat(targetChat,chat=>{
                // 「发送那一刻」：按真实生成的语义组装一次上下文——执行提示词里的 setvar / incvar，并登记世界书的粘滞与冷却。
                generationEffects(chat,chat.messages.length,continueStory?'continue':'normal');
                const last=chat.messages.at(-1);
                if(continueStory&&last&&last.role==='assistant'&&!last.hidden){
                    // ST 的 continue：生成内容追加到最后一条角色回复（lastMessage.mes += …），改的是当前选中的候选。
                    const before=cloneChatValue(chat.messages);
                    const body=stripStatusBlock(last.text);
                    const addition=continuationText(chat,chat.messages.filter(message=>message.simulation).length);
                    const next=`${body}${body?'\n\n':''}${addition}\n\n${statusBlockText(chat,candidateTurn(chat,chat.messages.length-1))}`;
                    last.candidates[last.selectedCandidate||0]=next;
                    last.text=next;
                    last.simulation=true;
                    syncStatusVars(chat,before);
                    return;
                }
                const reply=`${simulatedReply(chat,chat.messages.filter(message=>message.simulation).length)}\n\n${statusBlockText(chat)}`;
                chat.messages.push(...normalizeMessages([{role:'assistant',text:reply,simulation:true}]));
                // 模板输出里的状态块写回会话变量：这是「输出 → 解析 → 状态栏」的完整链路。
                readStatusIntoVars(chat,reply);
            });
            busy=false;
            drawMessages();$('#stop-message').hidden=true;$('#send-message').hidden=false;$('#continue-message').disabled=false;if($('#impersonate-message'))$('#impersonate-message').disabled=false;
        },1100);
    }

    // 代写：ST 的 impersonate 生成一段玩家发言，放进输入框让玩家改，不会自动发出、也不进历史。
    // 它同样是一次生成：按「代写」类型扫描世界书、执行提示词里的宏。本原型的草稿来自模板。
    function impersonate() {
        if(busy)return;
        const input=$('#message-input');
        if(!input||input.dataset.composing==='true')return;
        if(input.value.trim()){confirmAction('替换输入框里的草稿？','代写会用一段新的草稿替换你已经写的内容。','替换',()=>writeImpersonation(input),false);return;}
        writeImpersonation(input);
    }

    function writeImpersonation(input) {
        if(!commitChat(currentChat,chat=>{generationEffects(chat,chat.messages.length,'impersonate');}))return;
        const persona=getPersona(currentChat.personaId);
        const character=chatCharacter(currentChat);
        const drafts=[`*看着${character.name}，想了想* 先说说你知道的吧。`,`*把手里的东西放下* 我在听，你继续。`,`*没有立刻回答* ……让我想一想。`];
        const draft=drafts[currentChat.messages.filter(message=>message.role==='user').length % drafts.length];
        input.value=draft;
        input.dispatchEvent?.(new Event('input',{bubbles:true}));
        resizeChatInput(input);
        try{sessionStorage.setItem(`draft-${currentChat.id}`,input.value);}catch{}
        input.focus();
        toast(`已以「${persona.name}」的身份写好草稿，修改后再发送`);
    }

    function continuationText(chat,variation) {
        const lines=['停了一下，又补上一句：「还有一件事，我刚才没说。」','把话题接了下去：「……所以，接下来才是关键。」','沉默片刻，继续道：「你应该已经猜到了。」'];
        return `${chatCharacter(chat).name}${lines[variation % lines.length]}`;
    }

    // 右栏分两层：「故事」是玩家每次都会看的（角色、身份、状态、记忆、本章提示、世界），用玩家的话写；
    // 「高级」收起 SillyTavern 的工具（世界书、预设、正则、变量、快捷回复、上下文、记录），展开后与 ST 一一对应。
    function contextSections(chat) {
        const c=chatCharacter(chat), context=chatContext(chat), hits=loreMatches(chat);
        const bookmarkCount=chat.messages.filter(message=>message.bookmark).length;
        const preset=activePreset(chat), enabledRules=regexRules.filter(rule=>rule.enabled!==false).length;
        const vars=chatVars(chat), varKeys=Object.keys(vars);
        const note=noteSettings(chat);
        const advancedOpen=stateExtras.preferences?.contextAdvancedOpen===true;
        const row=(label,value,action,hint='',extra='')=>`<section class="p-rp-context-section"><button class="p-rp-context-action" type="button" data-context-action="${action}" aria-label="${esc(label)}：查看或编辑"><span class="p-rp-context-main"><span class="p-rp-context-label">${esc(label)}</span>${extra || `<span class="p-rp-context-value">${esc(value)}</span>`}${hint?`<span class="p-rp-context-note">${esc(hint)}</span>`:''}</span><span class="p-rp-context-go">${icon('next')}</span></button></section>`;
        const chips=varKeys.length?`<span class="p-var-bar">${varKeys.slice(0,6).map(key=>`<span class="p-var-chip"><span class="p-var-key">${esc(key)}</span><span class="p-var-value">${esc(vars[key]||'空')}</span></span>`).join('')}${varKeys.length>6?`<span class="p-var-chip"><span class="p-var-value">+${varKeys.length-6}</span></span>`:''}</span>`:'';
        const noteState=!context.note?'':note.interval<=0?'已关闭':`${note.position==='depth'?'插在最近消息里':note.position==='block'?'每轮提醒':'放在开头'}${note.interval>1?` · 每 ${note.interval} 条`:''}`;
        const story=[
            row('角色',`${c.name}${c.revision?` · v${c.revision}`:''}`,'snapshot',chat.snapshotNote?'开始故事时冻结的版本，之后修改角色不影响这里':'旧记录没有保存版本快照'),
            row('你的身份',getPersona(chat.personaId).name,'persona','只在这段故事里生效'),
            row('状态',varKeys.length?'':'还没有状态','vars',varKeys.length?`${varKeys.length} 项${hideStatusBlock?'':' · 回复里显示状态块'}`:'回复里的【状态】块会自动记到这里',chips),
            row('书签',bookmarkCount?`已标 ${bookmarkCount} 处`:'还没有书签','bookmark',bookmarkCount?'点击跳回标记的消息，或另开分支':'在消息操作里标记，随时跳回'),
            row('记忆',summaryStatus(chat).text?`自动摘要 · 覆盖 ${summaryStatus(chat).covered} 条${context.memory?' · 另有手写':''}`:context.memory || '还没记下什么','memory','自动抽取式摘要 + 手动记录；点开编辑与设置'),
            row('本章提示',context.note || '还没写','note',noteState || '写给回复的方向，比如「放慢节奏」'),
            row('世界',hits.length?hits.slice(0,2).map(entry=>entry.title).join(' · ')+(hits.length>2?` 等 ${hits.length} 条`:''):'这一轮没有用到设定','lore',`${activeLoreEntries(chat).length} 条设定可用 · 提到关键词时自动带上`),
        ].join('');
        const advanced=[
            row('世界书',`${hits.length} 条进入上下文 / ${activeLoreEntries(chat).length} 条启用`,'lore',`扫描最近 ${loreSettings.scanDepth} 条消息 · 规则同 SillyTavern`),
            row('提示词预设',`${preset.name}${chat.presetId===preset.id?' · 本会话指定':' · 全局默认'}`,'preset',`温度 ${preset.params.temperature} · top_p ${preset.params.topP} · top_k ${preset.params.topK} · 上限 ${preset.params.maxTokens}`),
            row('正则规则',`${enabledRules} 条启用 / ${regexRules.length} 条${c.regexScripts?.length?` · 卡内 ${c.regexScripts.length} 条${cardRegexAllowed(c)?'':'（未授权）'}`:''}`,'regex','显示与发送两套作用域'),
            row('变量与状态栏',`${varKeys.length} 个会话变量 · 全局 ${Object.keys(globalVars).length} 个`,'vars',hideStatusBlock?'消息里的【状态】块已隐藏':'状态块按原文显示'),
            row('作者注释',context.note?`${notePositions.find(([key])=>key===note.position)?.[1]}${note.position==='depth'?` ${note.depth}`:''} · ${note.interval<=0?'已关闭':note.interval===1?'每轮':`每 ${note.interval} 条`}`:'尚未填写','note','频率、位置、深度与身份'),
            row('快捷回复',`${quickReplies.items.length} 个按钮`,'qr','输入框上方的一键动作'),
            row('上下文预览','发送前组装的完整文本','preview','本地演示引擎 · 未调用真实模型'),
            row('分支来源',chat.branchSource?.label || '独立故事线','source'),
            row('记录管理',`${chat.messages.length} 条消息 · 导出 / 导入 / 删除`,'manage'),
        ].join('');
        return `<div class="p-rp-context-head"><span>STORY</span><h2>故事设定</h2></div>
            <div class="p-rp-context-group">${story}</div>
            <details class="p-rp-context-advanced" ${advancedOpen?'open':''}><summary><span class="p-rp-context-advanced-title">高级设置</span><span class="p-rp-context-advanced-sub">世界书、预设、正则等 9 项 · 与 SillyTavern 一一对应</span></summary><div class="p-rp-context-group">${advanced}</div></details>`;
    }

    function bindContextActions(root,chat) {
        $$('[data-context-action]',root).forEach(button=>button.addEventListener('click',()=>{if(button.dataset.contextAction==='bookmark'){openChatSearch(chat,{messages:chat.messages,scope:'chat'});return;}openContextEditor(chat,button.dataset.contextAction);}));
        const advanced=$('.p-rp-context-advanced',root);
        advanced?.addEventListener('toggle',()=>{stateExtras.preferences={...(stateExtras.preferences||{}),contextAdvancedOpen:advanced.open};saveState(true);});
    }

    function refreshChatContext() {
        if(!currentChat)return;
        const sidebar=$('#rp-context');
        if(sidebar){sidebar.innerHTML=contextSections(currentChat);bindContextActions(sidebar,currentChat);}
        drawQuickReplies();
        // 窄屏右栏隐藏时，状态栏挪到输入框上方，仍可一键打开变量面板。
        const strip=$('#rp-var-strip');
        if(strip){const vars=chatVars(currentChat),keys=Object.keys(vars);strip.hidden=!keys.length;strip.innerHTML=keys.length?`<button class="p-var-strip-btn" type="button" data-context-action="vars" aria-label="状态栏：${keys.map(key=>`${esc(key)} ${esc(vars[key]||'空')}`).join('，')}。点击查看或编辑变量">${keys.map(key=>`<span class="p-var-chip"><span class="p-var-key">${esc(key)}</span><span class="p-var-value">${esc(vars[key]||'空')}</span></span>`).join('')}</button>`:'';bindContextActions(strip,currentChat);}
        const story=$('#rp-story-title');if(story)story.textContent=currentChat.title;
        const persona=$('#rp-compose-persona');if(persona)persona.textContent=getPersona(currentChat.personaId).name;
        document.title=`${chatCharacter(currentChat).name} · ${currentChat.title} · 酒馆`;
    }

    // 搜索与书签：当前故事（或房间）消息内全文搜索 + 书签跳转/分支/移除。
    // ST 的书签是独立存档检查点；原型里书签记在消息上，「从此创建分支」复用 branchChat 生成检查点故事线。
    function openChatSearch(target, {messages,scope = 'chat'} = {}) {
        const jumpTo = index => {
            const row = document.querySelector(`[data-msg-index="${index}"]`);
            if (!row) return false;
            row.scrollIntoView({block:'center'});
            row.classList.add('is-search-flash');
            setTimeout(() => row.classList.remove('is-search-flash'), 1400);
            return true;
        };
        const dialog = openModal({title:'搜索与书签',wide:true,body:`<div class="p-field"><label class="p-label" for="chat-search-input">在这${scope==='room'?'个房间':'个故事'}的消息里搜索</label><input class="p-input" id="chat-search-input" type="search" placeholder="关键词（不区分大小写）" aria-label="消息关键词"></div><div id="chat-search-results"></div><details class="p-lore-advanced" open><summary>书签 · <span id="bookmark-count">0</span> 处</summary><p class="p-hint">书签记在消息上；跳回原处，或从书签处另开一条分支故事线。</p><div id="bookmark-list" class="p-choice-list"></div></details>`,confirmText:'完成',cancelText:'关闭',onConfirm:(_,close)=>close()});
        const previewWithMark = (text,needle) => {
            const escaped = esc(String(text || '').split('\n').map(line => line.trim()).find(Boolean) || '');
            if (!needle) return escaped;
            const safe = needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
            try { return escaped.replace(new RegExp(safe.replace(/&[a-z]+;/g, m => m), 'ig'), hit => `<mark class="p-search-hit">${hit}</mark>`); } catch { return escaped; }
        };
        const drawResults = () => {
            const needle = ($('#chat-search-input',dialog.overlay)?.value || '').trim();
            const matches = !needle ? [] : messages.map((message,index) => ({message,index}))
                .filter(({message}) => !message.hidden && String(displayMessageText(message) || '').toLowerCase().includes(needle.toLowerCase()))
                .slice(0,40);
            $('#chat-search-results',dialog.overlay).innerHTML = needle && matches.length
                ? `<p class="p-hint">${matches.length} 条匹配${matches.length >= 40 ? '（只显示前 40 条）' : ''}；点击跳到原处。</p>` + matches.map(({message,index}) =>
                    `<button class="p-choice" data-search-jump="${index}"><span class="p-choice-main"><span class="p-choice-title">${message.role === 'user' ? '你' : esc(scope === 'room' ? (roomCharacter(target,message.speakerId)?.name || '成员') : chatCharacter(target).name)} · 第 ${index + 1} 条</span><span class="p-choice-sub">${previewWithMark(displayMessageText(message),needle)}</span></span>${icon('next')}</button>`).join('')
                : `<p class="p-hint">${needle ? '没有匹配的消息；书签在下方。' : '输入关键词开始搜索；下方的书签可直接跳转。'}</p>`;
            $$('[data-search-jump]',dialog.overlay).forEach(button => button.addEventListener('click',() => {
                const index = Number(button.dataset.searchJump);
                dialog.close();
                setTimeout(() => jumpTo(index), 60);
            }));
        };
        const drawBookmarks = () => {
            const bookmarks = messages.map((message,index) => ({message,index})).filter(({message}) => message.bookmark);
            $('#bookmark-count',dialog.overlay).textContent = String(bookmarks.length);
            $('#bookmark-list',dialog.overlay).innerHTML = bookmarks.length ? bookmarks.map(({message,index}) =>
                `<div class="p-choice"><span class="p-choice-main"><span class="p-choice-title">${message.role === 'user' ? '你' : esc(scope === 'room' ? (roomCharacter(target,message.speakerId)?.name || '成员') : chatCharacter(target).name)} · 第 ${index + 1} 条</span><span class="p-choice-sub">${esc(String(displayMessageText(message) || '').split('\n')[0].slice(0,50))}</span></span><span class="admin-actions" style="display:flex;gap:6px"><button class="p-btn p-btn--sm" type="button" data-bookmark-jump="${index}">跳转</button>${scope==='chat'?`<button class="p-btn p-btn--sm" type="button" data-bookmark-branch="${index}">创建分支</button>`:''}<button class="p-btn p-btn--sm p-btn--icon" type="button" data-bookmark-remove="${index}" aria-label="移除书签">${icon('close')}</button></span></div>`).join('')
                : '<div class="admin-empty">还没有书签；消息操作里的书签按钮可以添加。</div>';
            $$('[data-bookmark-jump]',dialog.overlay).forEach(button => button.addEventListener('click',() => {
                dialog.close();
                setTimeout(() => jumpTo(Number(button.dataset.bookmarkJump)), 60);
            }));
            $$('[data-bookmark-branch]',dialog.overlay).forEach(button => button.addEventListener('click',() => {
                const index = Number(button.dataset.bookmarkBranch);
                const clone = branchChat(target,index);
                if (!clone) return;
                clone.title = `${target.title} · 书签`;
                if (!saveState()) return;
                dialog.close();
                location.href = `chat.html?chat=${clone.id}`;
                toast('已从书签处创建分支故事线');
            }));
            $$('[data-bookmark-remove]',dialog.overlay).forEach(button => button.addEventListener('click',() => {
                const index = Number(button.dataset.bookmarkRemove);
                const apply = () => { messages[index].bookmark = false; saveState(); };
                if (scope === 'room') {
                    const previous = {...target,messages:target.messages};
                    messages[index].bookmark = false;
                    if (!saveState()) { Object.keys(target).forEach(key=>delete target[key]);Object.assign(target,previous);return; }
                    drawBookmarks();
                } else {
                    apply();
                    drawBookmarks();
                }
                toast('书签已移除');
            }));
        };
        $('#chat-search-input',dialog.overlay).addEventListener('input',drawResults);
        drawResults();
        drawBookmarks();
        setTimeout(() => $('#chat-search-input',dialog.overlay)?.focus(), 0);
    }

    function openChatTools(chat) {
        const item=([action,label,sub])=>`<button class="p-choice" id="tool-${action}" data-context-action="${action==='rename'?'manage':action}"><span class="p-choice-main"><span class="p-choice-title">${esc(label)}</span><span class="p-choice-sub">${esc(sub)}</span></span>${icon('next')}</button>`;
        const bookmarkCount=currentChat.messages.filter(message=>message.bookmark).length;
        const story=[['snapshot','角色','开始故事时冻结的版本'],['persona','你的身份','只在这段故事里生效'],['vars','状态','回复里的【状态】块记到这里'],['bookmark','书签',bookmarkCount?`已标 ${bookmarkCount} 处 · 可跳转或另开分支`:'在消息操作里标记，随时跳回'],['memory','记忆','自动摘要 + 手写的剧情要点'],['note','本章提示','写给回复的方向'],['lore','世界','提到关键词时自动带上的设定']];
        const advanced=[['preset','提示词预设','系统提示、块顺序、采样参数'],['regex','正则规则','显示与发送时的文本替换'],['qr','快捷回复','输入框上方的一键动作'],['preview','上下文预览','发送前组装的完整文本'],['source','分支来源','这条故事线从哪里分出来'],['rename','记录管理','重命名、导出、导入、删除']];
        const dialog=openModal({title:'故事设定',body:`<div class="p-choice-list">${story.map(item).join('')}</div><p class="p-tools-group">高级设置 · 与 SillyTavern 一一对应</p><div class="p-choice-list">${advanced.map(item).join('')}</div><p class="p-rp-context-note">本地演示：设定只用于上下文预览，没有发送给真实模型。</p>`,confirmText:'完成',cancelText:'关闭',onConfirm:(_,close)=>close()});
        bindContextActions(dialog.overlay,chat);
    }

    function snapshotForPreview(chat) {
        const snapshot=cloneChatValue(chatCharacter(chat));
        if(!snapshot.local)delete snapshot.instructions;
        return snapshot;
    }

    function readableSnapshot(chat) {
        const c=snapshotForPreview(chat);
        const fields=[['名称',c.name],['简介',c.hook],['角色描述',c.cardDescription],['性格',c.personality || c.description],['场景',c.scenario],['开场',chat.openingText || c.greeting],['对话示例',c.mesExample],['角色系统提示',c.systemPrompt],['历史后指令',c.postHistory],['角色深度提示',c.depthPrompt?.text?`${c.depthPrompt.text}（深度 ${c.depthPrompt.depth} · ${({system:'系统',user:'玩家',assistant:'角色'})[c.depthPrompt.role] || '系统'}）`:''],['卡内正则',c.regexScripts?.length?`${c.regexScripts.length} 条 · ${cardRegexAllowed(c)?'已授权运行':'未授权，不运行'}`:''],['修订',c.revision?`v${c.revision}`:'未标注版本']].filter(([label,value]) => value || ['名称','简介','性格','场景','开场','修订'].includes(label));
        if(c.local&&c.instructions)fields.push(['私有指令（仅本地自创）',c.instructions]);
        return `<p class="p-rp-context-note">${esc(chat.snapshotNote || '尚未保存快照；首次成功保存时才会冻结当前资料，原始历史版本不可追溯。')}</p>${fields.map(([label,value])=>`<section class="p-rp-context-section"><h3 class="p-rp-context-label">${label}</h3><div class="p-rp-context-value">${messageMarkup(value || '未填写')}</div></section>`).join('')}`;
    }

    function openContextEditor(chat,action) {
        if(action==='manage'){chatMenu(chat.id);return;}
        if(action==='snapshot'){openModal({title:'故事的角色快照',body:readableSnapshot(chat),confirmText:'完成',onConfirm:(_,close)=>close()});return;}
        if(action==='source'){openModal({title:'分支来源',body:`<p>${esc(chat.branchSource?.label || '这是一条独立故事线。')}</p>${chat.branchSource?`<p>来源会话：${esc(chat.branchSource.chatId)}</p><p>来源消息：${esc(chat.branchSource.messageId)}</p><p>分支保存独立副本，不会回写原故事。</p>`:''}`,confirmText:'完成',onConfirm:(_,close)=>close()});return;}
        if(action==='preview'){openContextPreview(chat);return;}
        if(action==='lore'){openLoreEditor(chat);return;}
        if(action==='preset'){openPresetEditor(chat);return;}
        if(action==='regex'){openRegexEditor();return;}
        if(action==='vars'){openVarEditor(chat);return;}
        if(action==='bookmark'){openChatSearch(chat,{messages:chat.messages,scope:'chat'});return;}
        if(action==='qr'){openQuickReplyEditor();return;}
        if(busy){toast('请先停止本地模拟，再编辑故事设定。','err');return;}
        if(action==='persona'){
            const dialog=openModal({title:'本会话身份',body:`<p>切换仅影响本会话；历史文本不会改写。</p><div class="p-choice-list">${personas.map(p=>`<button class="p-choice" data-persona-choice="${p.id}" aria-pressed="${p.id===chat.personaId}">${avatar(p,36)}<span>${esc(p.name)} · ${esc(p.description)}</span></button>`).join('')}</div>`,confirmText:'完成',onConfirm:(_,close)=>close()});
            $$('[data-persona-choice]',dialog.overlay).forEach(choice=>choice.addEventListener('click',()=>{if(busy)return;if(!commitChat(chat,item=>{item.personaId=choice.dataset.personaChoice;}))return;dialog.close();drawMessages();toast('本会话身份已保存；回复仍为模拟');}));return;
        }
        if(!['memory','note'].includes(action))return;
        const label=action==='memory'?'记忆与剧情摘要':'作者注释';
        const note=noteSettings(chat), status=noteActive(chat);
        const noteFields=action==='note'?`<details class="p-lore-advanced" ${note.position!=='block'||note.interval!==1?'open':''}><summary>插入频率与位置（与 SillyTavern 的作者注释一致）</summary>
            <div class="p-lore-grid"><div><label class="p-label" for="note-interval">每隔几条玩家消息插入（0 = 关闭）</label><input class="p-input" id="note-interval" type="number" min="0" max="999" value="${note.interval}"></div><div><label class="p-label" for="note-position">位置</label><select class="p-select" id="note-position">${notePositions.map(([key,text])=>`<option value="${key}" ${key===note.position?'selected':''}>${esc(text)}</option>`).join('')}</select></div></div>
            <div class="p-lore-grid"><div><label class="p-label" for="note-depth">深度（聊天内时）</label><input class="p-input" id="note-depth" type="number" min="0" max="999" value="${note.depth}"></div><div><label class="p-label" for="note-role">以谁的身份插入（聊天内时）</label><select class="p-select" id="note-role">${[['system','系统'],['user','玩家'],['assistant','角色']].map(([key,text])=>`<option value="${key}" ${key===note.role?'selected':''}>${text}</option>`).join('')}</select></div></div>
            <p class="p-hint" id="note-status">${note.interval<=0?'已关闭：不会进入上下文。':status.active?'本轮会插入。':`还差 ${status.remaining} 条玩家消息插入。`}世界书「作者注释前/后」的条目与放在注释两侧的身份描述，只在注释本轮插入时一起出现。</p></details>`:'';
        const summary = summaryStatus(chat);
        const summaryFields = action==='memory' ? `<details class="p-lore-advanced"><summary>自动摘要 · 本地抽取式，不是模型总结</summary>
            <label class="p-choice"><input type="checkbox" id="summary-enabled" ${summary.enabled?'checked':''}><span class="p-choice-main">开启自动更新<span class="p-choice-sub">消息数超过「最近消息」+间隔时自动重写；会覆盖手写内容</span></span></label>
            <div class="p-field"><label class="p-label" for="summary-interval">每隔几条消息更新一次（4–40）</label><input class="p-input" id="summary-interval" type="number" min="4" max="40" value="${summary.interval}"></div>
            <div class="p-field"><label class="p-label" for="summary-text">摘要内容（可手改）</label><textarea class="p-textarea" id="summary-text" rows="6">${esc(summary.text)}</textarea><p class="p-hint" id="summary-status">已覆盖 ${summary.covered} 条 · 落后 ${summary.behind} 条未进摘要${summary.behind >= summary.interval && summary.enabled ? ' · 下次发送时更新' : ''}。摘要块插在「世界书命中」与「记忆摘要」之间。</p></div>
            <button class="p-btn p-btn--sm" id="summary-refresh" type="button">立即按当前覆盖范围重生成</button></details>
            <details class="p-lore-advanced"><summary>记忆检索 · 本地关键词近似，不是向量检索</summary>
                <label class="p-choice"><input type="checkbox" id="rag-enabled" ${ragPrefs(chat).enabled?'checked':''}><span class="p-choice-main">开启记忆检索<span class="p-choice-sub">按最新一句玩家输入，从更早的对话里挑相关片段注入上下文</span></span></label>
                <div class="p-field"><label class="p-label" for="rag-topk">每次返回几条（1–5）</label><input class="p-input" id="rag-topk" type="number" min="1" max="5" value="${ragPrefs(chat).topK}"></div>
                <p class="p-hint">最近 8 条消息已经在「最近消息」里，不参与检索；片段插在「自动摘要」之后。真实接入时换成向量检索，接口不变。</p>
            </details>` : '';
        const dialog = openModal({title:label,body:`<p>手动记录 / 包含在上下文预览，未调用真实模型。${action==='memory'?'自动摘要是本地抽取式梗概，不声称模型已经理解；自动更新会覆盖手写内容。':'不会自动总结或声称模型已经理解。'}</p><label class="p-label" for="context-text">${label}</label><textarea class="p-textarea" id="context-text" rows="8">${esc(chatContext(chat)[action])}</textarea>${summaryFields}${noteFields}`,confirmText:'保存',onConfirm:(overlay,close)=>{
            if(busy)return false;
            const value=$('#context-text',overlay).value.trim();
            const settings=action==='note'?{interval:$('#note-interval',overlay).value,position:$('#note-position',overlay).value,depth:$('#note-depth',overlay).value,role:$('#note-role',overlay).value}:null;
            const summaryState=action==='memory'?{enabled:$('#summary-enabled',overlay)?.checked !== false,interval:Math.min(40,Math.max(4,Number($('#summary-interval',overlay)?.value)||12)),text:$('#summary-text',overlay)?.value.trim() || ''}:null;
            if(!commitChat(chat,item=>{
                item.context[action]=value;
                if(settings)item.context.noteSettings=settings;
                if(summaryState){item.summaryPrefs={enabled:summaryState.enabled,interval:summaryState.interval};item.summary={...(plainRecord(item.summary)?item.summary:{text:'',covered:0}),text:summaryState.text,covered:Math.min(item.summary?.covered || 0,item.messages.length),source:'manual'};}
                if(action==='memory'){item.ragPrefs={enabled:$('#rag-enabled',overlay)?.checked !== false,topK:Math.min(5,Math.max(1,Number($('#rag-topk',overlay)?.value)||3))};}
            }))return false;
            close();refreshChatContext();toast(`${label}已本地保存`);
        }});
        $('#summary-refresh',dialog.overlay)?.addEventListener('click',() => {
            const text = generateAutoSummary(chat, Math.max(0, chat.messages.length - 8));
            $('#summary-text',dialog.overlay).value = text;
            $('#summary-text',dialog.overlay).dispatch?.('input');
            toast('已按当前覆盖范围重新生成；保存后生效');
        });
    }

    function openContextPreview(chat) {
        const context=chatContext(chat), persona=getPersona(chat.personaId), assembled=assemblePrompt(chat), hits=assembled.lore.entries;
        const sendRules=regexRules.filter(rule=>rule.enabled!==false&&rule.scope!=='display');
        const preview={engine:'本地演示引擎；仅预览，不调用模型；token 为按 UTF-8 字节 ÷ 3.35 的估算',preset:{id:assembled.preset.id,name:assembled.preset.name,params:assembled.preset.params,order:assembled.preset.order},budget:{used:assembled.chars,limit:assembled.budget,over:assembled.overBudget},blocks:assembled.blocks.map(block=>({key:block.key,label:block.label,enabled:block.enabled,chars:block.chars,dropped:block.dropped || 0})),system:{characterSnapshot:snapshotForPreview(chat),snapshotNote:chat.snapshotNote,persona,memory:context.memory,authorNote:context.note,loreMatches:hits},messages:chat.messages.map(message=>({id:message.id,role:message.role,personaSnapshot:message.personaSnapshot,selectedCandidate:message.selectedCandidate || 0,text:message.text}))};
        const section=(label,value)=>`<section class="p-rp-context-section"><h3>${esc(label)}</h3><div class="p-rp-context-value">${messageMarkup(value || '尚未填写')}</div></section>`;
        const blocks=assembled.blocks.map(block=>`<section class="p-rp-context-section p-block-row"><div class="p-block-head"><strong class="p-block-name">${esc(block.label)}${block.enabled?'':' · 已关闭'}</strong><span class="p-block-meta">${block.enabled?`${block.chars} 字符 · 约 ${block.tokens} token${block.dropped?` · 省略 ${block.dropped} 条消息`:''}`:'不进入上下文'}</span></div></section>`).join('');
        const macroNote=assembled.macroActions.length||assembled.macroUnknown.length?`<p class="p-rp-context-note">宏：${assembled.macroActions.length?`有 ${assembled.macroActions.length} 个写操作（${esc([...new Set(assembled.macroActions.map(action=>action.kind))].join('、'))}）会在发送时执行，预览不改动变量`:'本次没有写操作'}${assembled.macroUnknown.length?`；未支持的宏保持原样：${esc(assembled.macroUnknown.join('、'))}`:''}。</p>`:'';
        const body=`<p class="p-rp-context-note">本地演示引擎 · 以下仅为上下文预览，未发送给真实模型。设定不代表模板已经理解。</p>
            <section class="p-rp-context-section"><h3>发送前的上下文 · 预设《${esc(assembled.preset.name)}》</h3><p>${assembled.chars} / ${assembled.budget} 字符 · 约 ${assembled.tokens} token（按 SillyTavern 的估算法：UTF-8 字节 ÷ 3.35，非真实分词）${assembled.overBudget?' · 已超出预算，建议关闭部分块或减少历史':''} · 发送作用域的正则规则 ${sendRules.length} 条已应用</p>${macroNote}<div class="p-rp-context-list">${blocks}</div></section>
            <details><summary>将进入上下文的完整文本</summary><pre class="p-rp-context-value">${esc(assembled.text || '（没有启用的块）')}</pre></details>
            <details><summary>角色设定 · ${esc(chatCharacter(chat).name)}</summary>${readableSnapshot(chat)}</details>${section('当前玩家身份',`${persona.name}\n${persona.description || ''}`)}${section('手动记忆',context.memory)}${section('作者注释',context.note)}<section class="p-rp-context-section"><h3>世界书 · ${hits.length} 条进入上下文</h3>${hits.map(entry=>section(`${entry.title} · ${lorePositionLabel(entry)} · ${loreHitSources(chat,entry)}`,entry.text)).join('') || `<p>最近 ${loreSettings.scanDepth} 条消息没有命中本地条目。</p>`}${assembled.lore.log.length?`<details><summary>未进入的条目 · ${assembled.lore.log.length}</summary>${assembled.lore.log.map(item=>`<p class="p-rp-context-note"><strong>${esc(item.title)}</strong>：${esc(item.reason)}</p>`).join('')}</details>`:''}</section><section class="p-rp-context-section"><h3>消息 · ${chat.messages.length} 条</h3><p>系统记录、玩家发言与角色回复分开展示，只包含当前选中的候选。正文为原始文本，不受显示作用域的正则规则影响。</p>${chat.messages.map(message=>section(`${message.role==='system'?'系统记录':message.role==='user'?`玩家 · ${message.personaSnapshot?.name || '你（旧记录未标注身份）'}`:`角色 · ${chatCharacter(chat).name}`} · 候选 ${(message.selectedCandidate || 0)+1}`,message.text)).join('')}</section><details><summary>高级 · 完整原始结构</summary><pre class="p-rp-context-value">${esc(JSON.stringify(preview,null,2))}</pre></details>`;
        openModal({title:'上下文预览',body,wide:true,confirmText:'完成',onConfirm:(_,close)=>close()});
    }

    function openLoreEditor(chat) {
        const opened = [];
        const refresh = () => {
            [...opened].reverse().forEach(item => item.close());
            // 弹窗内任何改动都会改变命中数与本地条目数，右栏必须同步，否则显示的是导入前的旧数字。
            refreshChatContext();
            openLoreEditor(chat);
        };
        const sessionEntries = chatContext(chat).lore;
        const scan = scanLore(chat);
        const hits = scan.entries;
        const budget = loreBudget(chat);
        const bound = boundBookIds(chat);
        const bookRow = book => {
            const constant = book.entries.filter(entry => entry.constant).length;
            return `<div class="p-lore-book"><input type="checkbox" data-book-bind="${book.id}" ${bound.includes(book.id) ? 'checked' : ''} aria-label="绑定《${esc(book.name)}》"><span class="p-lore-book-main"><strong>${esc(book.name)}</strong><small>${book.entries.length} 条 · 常驻 ${constant}${book.source === 'import' ? ' · 导入' : ''}</small></span><button class="p-btn p-btn--sm" type="button" data-book-edit="${book.id}">条目</button><button class="p-btn p-btn--sm" type="button" data-book-export="${book.id}">导出</button><button class="p-btn p-btn--sm" type="button" data-book-delete="${book.id}">删除</button></div>`;
        };
        const entryRow = entry => {
            const hit = hits.find(item => item.source === 'session' && item.id === entry.id);
            const badge = !entry.enabled ? '停用' : entry.constant ? '常驻' : '启用';
            return `<section class="p-rp-context-section"><strong>${esc(entry.title)}<span class="p-lore-badge">${badge}</span></strong><p class="p-rp-context-note">${esc(loreEntrySummary(entry))}</p><p>${hit ? `命中：${esc([...new Set(hit.hits.map(item => item.keyword))].join('、'))}` : '未命中'}</p>${hit ? `<p class="p-rp-context-note">来源：${esc(loreHitSources(chat,hit))}</p>` : ''}<button class="p-btn p-btn--sm" data-lore-edit="${entry.id}">编辑</button><button class="p-btn p-btn--sm" data-lore-delete="${entry.id}">删除</button></section>`;
        };
        const skipped = scan.log.filter(item => item.reason);
        const dialog = openModal({
            title:'世界书',
            body:`<p class="p-rp-context-note">扫描最近 ${loreSettings.scanDepth} 条消息（不含系统记录与隐藏消息）。匹配规则与 SillyTavern 一致：主关键词、次要关键词逻辑、/正则/ 关键词、包含组、概率、递归、粘滞/冷却/延迟。勾选即把整本书绑定到本会话；命中只用于本地上下文预览，未注入真实模型。</p>
                <section class="p-lore-block"><div class="p-lore-head"><h3>世界书库</h3><span>${bound.length} / ${loreBooks.length} 已绑定</span></div>
                ${loreBooks.map(bookRow).join('') || '<p class="p-rp-context-note">还没有世界书。可以导入世界书 JSON，或新建一本。</p>'}
                <div class="p-lore-actions"><button class="p-btn p-btn--sm" id="lore-import" type="button">导入世界书 JSON</button><button class="p-btn p-btn--sm" id="lore-new-book" type="button">新建世界书</button><button class="p-btn p-btn--sm" id="lore-settings" type="button">全局扫描设置</button></div></section>
                <section class="p-lore-block"><div class="p-lore-head"><h3>本会话条目</h3><span>${sessionEntries.length} 条</span></div>
                <div class="p-rp-context-list">${sessionEntries.map(entryRow).join('') || '<p class="p-rp-context-note">本会话还没有专属条目。</p>'}</div>
                <div class="p-lore-actions"><button class="p-btn p-btn--sm" id="lore-add" type="button">添加会话条目</button>${sessionEntries.length ? '<button class="p-btn p-btn--sm" id="lore-export-session" type="button">导出会话条目</button>' : ''}</div></section>
                <section class="p-lore-block"><div class="p-lore-head"><h3>本次扫描</h3><span>${scan.loops} 轮${loreSettings.recursive ? ' · 含递归' : ''}</span></div>
                <p class="p-rp-context-note" id="lore-budget">本次进入上下文的条目 ${budget.entries.length} 条 · ${budget.chars} / ${budget.budget} 字符${budget.truncated ? ` · 超出预算被省略 ${budget.truncated} 条` : ''}</p>
                ${hits.length ? `<div class="p-rp-context-list">${hits.map(entry => `<p class="p-rp-context-note"><strong>${esc(entry.title)}</strong> · ${esc(entry.bookName)} · ${esc(lorePositionLabel(entry))} · ${esc(loreHitSources(chat,entry))}</p>`).join('')}</div>` : ''}
                ${skipped.length ? `<details class="p-lore-advanced"><summary>未进入上下文的条目 · ${skipped.length}</summary>${skipped.map(item => `<p class="p-rp-context-note"><strong>${esc(item.title)}</strong>：${esc(item.reason)}</p>`).join('')}</details>` : ''}
                ${scan.sticky.length || scan.cooldown.length ? `<p class="p-rp-context-note">定时效果：粘滞 ${scan.sticky.length} 条 · 冷却 ${scan.cooldown.length} 条（按会话保存，发送时更新）</p>` : ''}</section>`,
            confirmText:'完成',
            cancelText:'关闭',
            onConfirm:(_,close) => close(),
        });
        opened.push(dialog);

        const editEntry = (book,entryId) => {
            if (busy) { toast('请先停止本地模拟，再修改世界书。','err'); return; }
            const list = book ? book.entries : chatContext(chat).lore;
            const entry = list.find(item => item.id === entryId) || normalizeLoreEntry({title:'',keywords:[],text:'',enabled:true,priority:0});
            const check = (id,label,on,extra = '') => `<label><input id="${id}" type="checkbox" ${on ? 'checked' : ''} ${extra}>${label}</label>`;
            const number = (id,label,value,attrs = '') => `<div><label class="p-label" for="${id}">${label}</label><input class="p-input" id="${id}" type="number" ${attrs} value="${value ?? ''}"></div>`;
            const triState = (id,label,value) => `<div><label class="p-label" for="${id}">${label}</label><select class="p-select" id="${id}"><option value="" ${value === null ? 'selected' : ''}>跟随全局</option><option value="true" ${value === true ? 'selected' : ''}>开</option><option value="false" ${value === false ? 'selected' : ''}>关</option></select></div>`;
            const options = (list,value) => list.map(([key,label]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${esc(label)}</option>`).join('');
            const editor = openModal({
                title:entryId ? '编辑世界书条目' : '添加世界书条目',
                wide:true,
                body:`<label class="p-label" for="lore-title">标题</label><input class="p-input" id="lore-title" value="${esc(entry.title)}">
                    <label class="p-label" for="lore-keywords">主关键词（逗号分隔；写成 /表达式/flags 按正则匹配）</label><input class="p-input" id="lore-keywords" value="${esc(entry.keywords.join(', '))}" placeholder="常驻条目可留空">
                    <label class="p-label" for="lore-text">正文</label><textarea class="p-textarea" id="lore-text">${esc(entry.text)}</textarea>
                    <div class="p-lore-grid">${number('lore-priority','插入顺序（越大越靠前）',Number(entry.priority) || 0)}<div><label class="p-label" for="lore-position">插入位置</label><select class="p-select" id="lore-position">${options(lorePositions,entry.position)}</select></div></div>
                    <div class="p-lore-grid" id="lore-depth-row" ${entry.position === 'depth' ? '' : 'hidden'}>${number('lore-depth','深度（0 = 最新一条之后）',entry.depth,'min="0" max="1000"')}<div><label class="p-label" for="lore-role">以谁的身份插入</label><select class="p-select" id="lore-role">${options([['system','系统'],['user','玩家'],['assistant','角色']],entry.role)}</select></div></div>
                    <div id="lore-outlet-row" ${entry.position === 'outlet' ? '' : 'hidden'}><label class="p-label" for="lore-outlet">出口名称</label><input class="p-input" id="lore-outlet" maxlength="40" value="${esc(entry.outletName)}"><p class="p-hint">在提示词或其他条目里写 {{outlet::名称}} 引用；没有引用时不进入上下文。</p></div>
                    <div class="p-lore-toggles">${check('lore-enabled','启用条目',entry.enabled)}${check('lore-constant','常驻（无需关键词）',entry.constant)}</div>
                    <details class="p-lore-advanced" ${entry.secondaryKeywords.length || entry.scanDepth !== null || entry.caseSensitive !== null || entry.matchWholeWords !== null ? 'open' : ''}><summary>次要关键词与匹配</summary>
                        <label class="p-label" for="lore-secondary">次要关键词（逗号分隔）</label><input class="p-input" id="lore-secondary" value="${esc(entry.secondaryKeywords.join(', '))}" placeholder="留空则只看主关键词">
                        <div class="p-lore-grid"><div><label class="p-label" for="lore-logic">次要关键词逻辑</label><select class="p-select" id="lore-logic">${options(loreLogics,entry.logic)}</select></div>${number('lore-scan-depth',`扫描深度（留空 = 全局 ${loreSettings.scanDepth} 条）`,entry.scanDepth,'min="0" max="1000"')}</div>
                        <div class="p-lore-grid">${triState('lore-case','区分大小写',entry.caseSensitive)}${triState('lore-whole','整词匹配',entry.matchWholeWords)}</div>
                        <p class="p-label">额外扫描这些资料</p><div class="p-lore-toggles">${check('lore-match-persona','玩家身份说明',entry.matchPersona)}${check('lore-match-character','角色描述',entry.matchCharacter)}${check('lore-match-personality','角色人设',entry.matchPersonality)}${check('lore-match-scenario','场景',entry.matchScenario)}${check('lore-match-notes','一句话简介',entry.matchCreatorNotes)}</div>
                    </details>
                    <details class="p-lore-advanced" ${entry.group || entry.probability < 100 ? 'open' : ''}><summary>概率与包含组</summary>
                        <div class="p-lore-grid">${number('lore-probability','触发概率（%）',entry.probability,'min="0" max="100"')}<div class="p-lore-toggles">${check('lore-use-probability','启用概率',entry.useProbability)}</div></div>
                        <label class="p-label" for="lore-group">包含组（多个用逗号分隔；同组每次只进入一条）</label><input class="p-input" id="lore-group" value="${esc(entry.group)}">
                        <div class="p-lore-grid">${number('lore-group-weight','组内权重',entry.groupWeight,'min="1" max="10000"')}${triState('lore-group-scoring','按关键词得分淘汰',entry.useGroupScoring)}</div>
                        <div class="p-lore-toggles">${check('lore-group-override','组内优先（同组命中时总是选它）',entry.groupOverride)}</div>
                    </details>
                    <details class="p-lore-advanced" ${entry.sticky || entry.cooldown || entry.delay || entry.delayUntilRecursion || entry.triggers.length ? 'open' : ''}><summary>定时效果、递归与生成类型</summary>
                        <div class="p-lore-grid p-lore-grid--3">${number('lore-sticky','粘滞（条消息）',entry.sticky,'min="0" max="999"')}${number('lore-cooldown','冷却（条消息）',entry.cooldown,'min="0" max="999"')}${number('lore-delay','延迟（第 N 条后才可触发）',entry.delay,'min="0" max="999"')}</div>
                        <div class="p-lore-toggles">${check('lore-exclude-recursion','不被递归触发',entry.excludeRecursion)}${check('lore-prevent-recursion','不触发递归',entry.preventRecursion)}${check('lore-ignore-budget','忽略预算',entry.ignoreBudget)}</div>
                        ${number('lore-delay-recursion','仅在第 N 层递归时触发（0 = 关）',entry.delayUntilRecursion,'min="0" max="99"')}
                        <p class="p-label">只在这些生成类型触发（都不勾 = 全部）</p><div class="p-lore-toggles">${loreTriggerTypes.map(([key,label]) => `<label><input type="checkbox" data-lore-trigger="${key}" ${entry.triggers.includes(key) ? 'checked' : ''}>${esc(label)}</label>`).join('')}</div>
                    </details>`,
                confirmText:'保存',
                onConfirm:(overlay,close) => {
                    if (busy) return false;
                    const field = id => $(id,overlay);
                    const tri = id => field(id).value === '' ? null : field(id).value === 'true';
                    const title = field('#lore-title').value.trim();
                    const text = field('#lore-text').value.trim();
                    const keywords = loreKeyList(field('#lore-keywords').value);
                    const constant = field('#lore-constant').checked;
                    if (!title || !text) { toast('请填写标题和正文。','err'); return false; }
                    if (!constant && !keywords.length) { toast('非常驻条目至少需要一个关键词。','err'); return false; }
                    const id = entryId || resourceId('lore');
                    const value = {...normalizeLoreEntry({...entry,id,title,text,keywords,constant,selective:true,
                        secondaryKeywords:loreKeyList(field('#lore-secondary').value),logic:field('#lore-logic').value,
                        enabled:field('#lore-enabled').checked,priority:Number(field('#lore-priority').value) || 0,
                        position:field('#lore-position').value,depth:field('#lore-depth').value,role:field('#lore-role').value,outletName:field('#lore-outlet').value,
                        scanDepth:field('#lore-scan-depth').value,caseSensitive:tri('#lore-case'),matchWholeWords:tri('#lore-whole'),
                        matchPersona:field('#lore-match-persona').checked,matchCharacter:field('#lore-match-character').checked,matchPersonality:field('#lore-match-personality').checked,
                        matchScenario:field('#lore-match-scenario').checked,matchCreatorNotes:field('#lore-match-notes').checked,
                        probability:field('#lore-probability').value,useProbability:field('#lore-use-probability').checked,
                        group:field('#lore-group').value,groupWeight:field('#lore-group-weight').value,useGroupScoring:tri('#lore-group-scoring'),groupOverride:field('#lore-group-override').checked,
                        sticky:field('#lore-sticky').value,cooldown:field('#lore-cooldown').value,delay:field('#lore-delay').value,
                        excludeRecursion:field('#lore-exclude-recursion').checked,preventRecursion:field('#lore-prevent-recursion').checked,ignoreBudget:field('#lore-ignore-budget').checked,
                        delayUntilRecursion:Number(field('#lore-delay-recursion').value) || 0,
                        triggers:$$('[data-lore-trigger]',overlay).filter(input => input.checked).map(input => input.dataset.loreTrigger),
                    }),id};
                    if (value.position === 'outlet' && !value.outletName) { toast('「出口」位置需要填写出口名称。','err'); return false; }
                    if (book) {
                        const before = book.entries.map(row => ({...row}));
                        const index = book.entries.findIndex(row => row.id === entryId);
                        if (index < 0) book.entries.push(value); else book.entries[index] = value;
                        if (!saveState()) { book.entries = before; return false; }
                    } else if (!commitChat(chat,item => {
                        const index = item.context.lore.findIndex(row => row.id === entryId);
                        if (index < 0) item.context.lore.push(value); else item.context.lore[index] = value;
                    })) return false;
                    close();
                    refresh();
                    toast('世界书条目已保存');
                    return false;
                },
            });
            opened.push(editor);
            const position = $('#lore-position',editor.overlay);
            position?.addEventListener('change',() => {
                const depthRow = $('#lore-depth-row',editor.overlay), outletRow = $('#lore-outlet-row',editor.overlay);
                if (depthRow) depthRow.hidden = position.value !== 'depth';
                if (outletRow) outletRow.hidden = position.value !== 'outlet';
            });
        };

        const openBook = bookId => {
            const book = bookById(bookId);
            if (!book) return;
            const editor = openModal({
                title:`世界书 · ${book.name}`,
                body:`<p class="p-rp-context-note">这本书的条目在绑定到会话后参与匹配；常驻条目始终进入上下文。</p>
                    <div class="p-rp-context-list">${book.entries.map(entry => `<section class="p-rp-context-section"><strong>${esc(entry.title)}<span class="p-lore-badge">${entry.constant ? '常驻' : (entry.enabled ? '启用' : '停用')}</span></strong><p>${entry.constant ? '无需关键词' : esc(entry.keywords.join('、') || '未设置关键词')}</p><p class="p-rp-context-note">${esc(loreEntrySummary(entry))}</p><p class="p-rp-context-note">${esc(entry.text.slice(0,60))}${entry.text.length > 60 ? '…' : ''}</p><button class="p-btn p-btn--sm" data-book-entry-edit="${entry.id}">编辑</button><button class="p-btn p-btn--sm" data-book-entry-delete="${entry.id}">删除</button></section>`).join('') || '<p class="p-rp-context-note">这本书还没有条目。</p>'}</div>
                    <div class="p-lore-actions"><button class="p-btn p-btn--sm" id="book-add-entry" type="button">添加条目</button><button class="p-btn p-btn--sm" id="book-rename" type="button">重命名</button></div>`,
                confirmText:'完成',
                onConfirm:(_,close) => close(),
            });
            opened.push(editor);
            $('#book-add-entry',editor.overlay)?.addEventListener('click',() => editEntry(book,null));
            $('#book-rename',editor.overlay)?.addEventListener('click',() => {
                const rename = openModal({title:'重命名世界书',body:`<label class="p-label" for="book-name">名称</label><input class="p-input" id="book-name" maxlength="40" value="${esc(book.name)}">`,confirmText:'保存',onConfirm:(overlay,close) => {
                    const name = $('#book-name',overlay).value.trim();
                    if (!name) { toast('名称不能为空。','err'); return false; }
                    const before = book.name;
                    book.name = name;
                    if (!saveState()) { book.name = before; return false; }
                    close();
                    refresh();
                    return false;
                }});
                opened.push(rename);
            });
            $$('[data-book-entry-edit]',editor.overlay).forEach(button => button.addEventListener('click',() => editEntry(book,button.dataset.bookEntryEdit)));
            $$('[data-book-entry-delete]',editor.overlay).forEach(button => button.addEventListener('click',() => {
                const before = book.entries.map(row => ({...row}));
                book.entries = book.entries.filter(row => row.id !== button.dataset.bookEntryDelete);
                if (!saveState()) { book.entries = before; toast('保存失败，删除已撤销。','err'); return; }
                refresh();
            }));
        };

        $$('[data-book-bind]',dialog.overlay).forEach(input => input.addEventListener('change',() => {
            if (busy) { input.checked = !input.checked; toast('请先停止本地模拟，再切换世界书。','err'); return; }
            const id = input.dataset.bookBind;
            const next = input.checked ? [...boundBookIds(chat),id] : boundBookIds(chat).filter(item => item !== id);
            if (!commitChat(chat,item => { item.context.bookIds = [...new Set(next)]; })) { input.checked = !input.checked; return; }
            refreshChatContext();
            refresh();
        }));
        $$('[data-book-edit]',dialog.overlay).forEach(button => button.addEventListener('click',() => openBook(button.dataset.bookEdit)));
        $$('[data-book-delete]',dialog.overlay).forEach(button => button.addEventListener('click',() => {
            const id = button.dataset.bookDelete;
            const book = bookById(id);
            if (!book) return;
            openModal({title:'删除这本世界书？',body:`<p>《${esc(book.name)}》与其中的 ${book.entries.length} 条条目将一起移除；已绑定它的会话会解除绑定，历史消息不受影响。</p>`,confirmText:'删除',danger:true,onConfirm:(_,close) => {
                const snapshot = loreBooks.slice();
                loreBooks = loreBooks.filter(item => item.id !== id);
                if (!saveState()) { loreBooks = snapshot; toast('保存失败，删除已撤销。','err'); return false; }
                close();
                refresh();
                return false;
            }});
        }));
        $$('[data-book-export]',dialog.overlay).forEach(button => button.addEventListener('click',() => {
            const book = bookById(button.dataset.bookExport);
            if (book) downloadJson(`${book.name}.json`,loreBookToSillyTavern(book),'世界书已导出为 SillyTavern 格式');
        }));
        $('#lore-export-session',dialog.overlay)?.addEventListener('click',() => downloadJson(`${chat.title} · 会话条目.json`,loreBookToSillyTavern({name:`${chat.title} · 会话条目`,entries:chatContext(chat).lore}),'会话条目已导出为 SillyTavern 格式'));
        $('#lore-settings',dialog.overlay)?.addEventListener('click',() => openLoreSettings(refresh,opened));
        $('#lore-import',dialog.overlay)?.addEventListener('click',() => openLoreImport(chat,refresh,opened));
        $('#lore-new-book',dialog.overlay)?.addEventListener('click',() => {
            const book = {id:resourceId('book'),name:`世界书 ${loreBooks.length + 1}`,source:'manual',entries:[]};
            loreBooks.push(book);
            if (!saveState()) { loreBooks.pop(); toast('保存失败，未创建。','err'); return; }
            refresh();
            openBook(book.id);
        });
        $('#lore-add',dialog.overlay)?.addEventListener('click',() => editEntry(null,null));
        $$('[data-lore-edit]',dialog.overlay).forEach(button => button.addEventListener('click',() => editEntry(null,button.dataset.loreEdit)));
        $$('[data-lore-delete]',dialog.overlay).forEach(button => button.addEventListener('click',() => {
            if (busy) return;
            openModal({title:'删除此世界书条目？',body:'<p>仅移除当前会话的条目，已有消息不受影响。</p>',confirmText:'删除',danger:true,onConfirm:(_,close) => {
                if (busy) return false;
                if (!commitChat(chat,item => { item.context.lore = item.context.lore.filter(entry => entry.id !== button.dataset.loreDelete); })) return false;
                close();
                refresh();
                return false;
            }});
        }));
    }

    function lorePositionLabel(entry) {
        const label = lorePositions.find(([key]) => key === entry.position)?.[1] || '角色设定之前';
        if (entry.position === 'depth') return `${label} ${entry.depth}`;
        if (entry.position === 'outlet') return `${label}「${entry.outletName || '未命名'}」`;
        return label;
    }

    function loreEntrySummary(entry) {
        const parts = [lorePositionLabel(entry),`顺序 ${Number(entry.priority) || 0}`];
        if (entry.secondaryKeywords.length) parts.push(`次要关键词 ${entry.secondaryKeywords.length} 个 · ${loreLogics.find(([key]) => key === entry.logic)?.[1]}`);
        if (entry.scanDepth !== null) parts.push(`扫描 ${entry.scanDepth} 条`);
        if (entry.useProbability && entry.probability < 100) parts.push(`概率 ${entry.probability}%`);
        if (entry.group) parts.push(`组「${entry.group}」`);
        if (entry.sticky) parts.push(`粘滞 ${entry.sticky}`);
        if (entry.cooldown) parts.push(`冷却 ${entry.cooldown}`);
        if (entry.delay) parts.push(`延迟 ${entry.delay}`);
        if (entry.triggers.length) parts.push(`仅 ${entry.triggers.map(key => loreTriggerTypes.find(([value]) => value === key)?.[1] || key).join('、')}`);
        return parts.join(' · ');
    }

    function loreHitSources(chat,entry) {
        const labels = {user:'玩家消息',assistant:'角色回复',system:'系统',recursion:'其他条目（递归）',profile:'角色或身份资料'};
        return [...new Set(entry.hits.map(hit => {
            if (hit.keyword === '常驻' || hit.keyword === '粘滞' || hit.keyword === '@@activate') return hit.keyword === '粘滞' ? '粘滞生效中' : hit.keyword === '常驻' ? '常驻' : '强制激活';
            const index = chat.messages.findIndex(message => message.id === hit.messageId);
            return index >= 0 ? `${labels[hit.role] || hit.role} · 第 ${index + 1} 条「${hit.keyword}」` : `${labels[hit.role] || hit.role}「${hit.keyword}」`;
        }))].join('；');
    }

    function downloadJson(filename,value,message) {
        const blob = new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url;
        link.download = filename.replace(/[\\/:*?"<>|]/g,'_');
        link.click();
        setTimeout(() => URL.revokeObjectURL(url),500);
        toast(message);
    }

    function openLoreSettings(refresh,opened = []) {
        const s = loreSettings;
        const check = (id,label,on) => `<label><input id="${id}" type="checkbox" ${on ? 'checked' : ''}>${label}</label>`;
        const number = (id,label,value,attrs) => `<div><label class="p-label" for="${id}">${label}</label><input class="p-input" id="${id}" type="number" ${attrs} value="${value}"></div>`;
        const dialog = openModal({
            title:'世界书 · 全局扫描设置',
            body:`<p class="p-rp-context-note">对应 SillyTavern 的「世界信息」全局设置，作用于所有会话。条目自己的设置（扫描深度、大小写、整词、组评分）优先于这里。</p>
                <div class="p-lore-grid">${number('lore-set-depth','扫描深度（条消息）',s.scanDepth,'min="0" max="1000"')}${number('lore-set-budget','预算（字符）',s.budget,'min="100" max="50000"')}</div>
                <div class="p-lore-grid">${number('lore-set-steps','最大递归轮数（0 = 不限）',s.maxRecursionSteps,'min="0" max="50"')}${number('lore-set-min','最少激活条数（0 = 关）',s.minActivations,'min="0" max="100"')}</div>
                ${number('lore-set-min-depth','最少激活时最多扫到第几条（0 = 不限）',s.minActivationsDepthMax,'min="0" max="1000"')}
                <div class="p-lore-toggles">${check('lore-set-recursive','递归扫描',s.recursive)}${check('lore-set-case','区分大小写',s.caseSensitive)}${check('lore-set-whole','整词匹配',s.matchWholeWords)}${check('lore-set-names','扫描时带上发言者名字',s.includeNames)}${check('lore-set-scoring','包含组按关键词得分淘汰',s.useGroupScoring)}</div>
                <p class="p-hint">ST 的预算按 token 计、默认是上下文的 25%；本原型没有分词器，按字符计。</p>`,
            confirmText:'保存',
            onConfirm:(overlay,close) => {
                const field = id => $(id,overlay);
                const before = loreSettings;
                loreSettings = normalizeLoreSettings({scanDepth:field('#lore-set-depth').value,budget:field('#lore-set-budget').value,maxRecursionSteps:field('#lore-set-steps').value,
                    minActivations:field('#lore-set-min').value,minActivationsDepthMax:field('#lore-set-min-depth').value,recursive:field('#lore-set-recursive').checked,
                    caseSensitive:field('#lore-set-case').checked,matchWholeWords:field('#lore-set-whole').checked,includeNames:field('#lore-set-names').checked,useGroupScoring:field('#lore-set-scoring').checked});
                if (!saveState()) { loreSettings = before; return false; }
                close();
                refresh();
                toast('世界书扫描设置已保存');
                return false;
            },
        });
        opened.push(dialog);
    }

    function openLoreImport(chat,refresh,opened = []) {
        const dialog = openModal({
            title:'导入世界书',
            body:`<p class="p-rp-context-note">支持 SillyTavern 世界书 JSON（entries 为对象或数组），也支持直接选角色卡 JSON（读取卡内世界书）。次要关键词、插入位置、概率、包含组、定时效果等字段一并导入。文件只在当前标签页解析。</p>
                <label class="p-label" for="lore-file">选择文件</label><input class="p-input" id="lore-file" type="file" accept=".json,application/json">
                <label class="p-label" for="lore-json">或粘贴 JSON</label><textarea class="p-textarea" id="lore-json" placeholder='{"entries":{"0":{"key":["旧城"],"content":"…"}}}'></textarea>
                <p class="p-hint" id="lore-import-status">导入后会新建一本世界书，并自动绑定到当前会话。</p>`,
            confirmText:'导入',
            cancelText:'关闭',
            onConfirm:(overlay,close) => { runImport(overlay,close); return false; },
        });
        opened.push(dialog);
        const runImport = async (overlay,close) => {
            const status = $('#lore-import-status',overlay);
            const setStatus = (text,isError = false) => { if (!status) return; status.textContent = text; status.className = isError ? 'p-hint p-hint--err' : 'p-hint'; };
            const file = $('#lore-file',overlay)?.files?.[0];
            const pasted = $('#lore-json',overlay)?.value.trim();
            if (!file && !pasted) { setStatus('请选择文件或粘贴 JSON。',true); return; }
            try {
                const text = pasted || bytesToText(new Uint8Array(await file.arrayBuffer()));
                const book = parseWorldInfo(text);
                if (!book) { setStatus('没有解析到可用的世界书条目。',true); return; }
                const value = normalizeLoreBook({...book,id:resourceId('book')});
                const snapshot = loreBooks.slice();
                loreBooks.push(value);
                const nextIds = [...boundBookIds(chat),value.id];
                const committed = commitChat(chat,item => { item.context.bookIds = [...new Set(nextIds)]; });
                if (!committed) { loreBooks = snapshot; setStatus('保存失败，导入已撤销。',true); return; }
                close();
                refresh();
                toast(`已导入《${value.name}》，${value.entries.length} 条条目`);
            } catch {
                setStatus('读取失败，请确认是世界书 JSON。',true);
            }
        };
    }

    function openPresetEditor(chat) {
        const opened = [];
        const refresh = () => {
            [...opened].reverse().forEach(item => item.close());
            refreshChatContext();
            openPresetEditor(chat);
        };
        const selected = activePreset(chat);
        const assembled = assemblePrompt(chat);
        const row = preset => {
            const active = preset.id === selected.id;
            const enabledBlocks = normalizePresetOrder(preset.order,preset.custom || []).filter(item => item.enabled).length;
            return `<div class="p-lore-book"><input type="radio" name="preset-pick" data-preset-pick="${preset.id}" ${active?'checked':''} aria-label="本会话使用《${esc(preset.name)}》"><span class="p-lore-book-main"><strong>${esc(preset.name)}${preset.id===activePresetId?' · 全局默认':''}</strong><small>温度 ${preset.params.temperature} · top_p ${preset.params.topP} · top_k ${preset.params.topK} · 上限 ${preset.params.maxTokens} · ${enabledBlocks}/${normalizePresetOrder(preset.order,preset.custom || []).length} 块启用</small></span><button class="p-btn p-btn--sm" type="button" data-preset-edit="${preset.id}">编辑</button><button class="p-btn p-btn--sm" type="button" data-preset-delete="${preset.id}" ${presets.length<2?'disabled':''}>删除</button></div>`;
        };
        const dialog = openModal({
            title:'提示词预设',
            wide:true,
            body:`<p class="p-rp-context-note">预设决定进入上下文的块、顺序与采样参数。这里只做本地组装：不调用模型、不产生费用，参数也不会真的生效。</p>
                <section class="p-lore-block"><div class="p-lore-head"><h3>预设库</h3><span>${presets.length} 个 · 当前 ${esc(selected.name)}</span></div>
                ${presets.map(row).join('')}
                <div class="p-lore-actions"><button class="p-btn p-btn--sm" id="preset-new" type="button">新建预设</button><button class="p-btn p-btn--sm" id="preset-import" type="button">导入 SillyTavern 预设</button><button class="p-btn p-btn--sm" id="preset-default" type="button">把《${esc(selected.name)}》设为全局默认</button>${chat.presetId?`<button class="p-btn p-btn--sm" id="preset-follow" type="button">本会话改用全局默认</button>`:''}</div></section>
                <section class="p-lore-block"><div class="p-lore-head"><h3>本次组装</h3><span>${assembled.chars} / ${assembled.budget} 字符 · 约 ${assembled.tokens} token${assembled.overBudget?' · 超出预算':''}</span></div>
                <div class="p-rp-context-list">${assembled.blocks.map(block => `<section class="p-rp-context-section p-block-row"><div class="p-block-head"><strong class="p-block-name">${esc(block.label)}${block.enabled?'':' · 已关闭'}</strong><span class="p-block-meta">${block.enabled?`${block.chars} 字符 · 约 ${block.tokens} token${block.dropped?` · 省略 ${block.dropped} 条消息`:''}`:'不进入上下文'}</span></div><p class="p-rp-context-note">${esc(block.note)}</p></section>`).join('')}</div>
                <details><summary>查看将进入上下文的完整文本</summary><pre class="p-rp-context-value">${esc(assembled.text || '（没有启用的块）')}</pre></details></section>`,
            confirmText:'完成',
            cancelText:'关闭',
            onConfirm:(_,close) => close(),
        });
        opened.push(dialog);

        const openPresetForm = preset => {
            const working = {custom:(preset.custom || []).map(block => ({...block,triggers:[...block.triggers]})),order:normalizePresetOrder(preset.order,preset.custom || []).map(item => ({...item}))};
            const blockLabel = key => { const block = working.custom.find(item => item.id === key); return block ? [key,`${block.name}${block.injection === 'depth' ? ` · 聊天内深度 ${block.depth}` : ''}`,`自定义块 · ${({system:'系统',user:'玩家',assistant:'角色'})[block.role]}${block.triggers.length ? ` · 仅 ${block.triggers.map(value => loreTriggerTypes.find(([key]) => key === value)?.[1] || value).join('、')}` : ''}`] : null; };
            const orderRows = () => working.order.map((item,index) => {
                const def = blockLabel(item.key) || promptBlockDefs.find(([key]) => key === item.key) || [item.key,item.key,''];
                const custom = Boolean(blockLabel(item.key));
                return `<div class="p-lore-book"><input type="checkbox" data-block-toggle="${item.key}" ${item.enabled?'checked':''} aria-label="启用${esc(def[1])}"><span class="p-lore-book-main"><strong>${esc(def[1])}</strong><small>${esc(def[2])}</small></span><button class="p-btn p-btn--sm" type="button" data-block-up="${item.key}" ${index===0?'disabled':''} aria-label="上移">↑</button><button class="p-btn p-btn--sm" type="button" data-block-down="${item.key}" ${index===working.order.length-1?'disabled':''} aria-label="下移">↓</button>${custom ? `<button class="p-btn p-btn--sm" type="button" data-block-edit="${item.key}">编辑</button>` : ''}</div>`;
            }).join('');
            const editor = openModal({
                title:`编辑预设 · ${preset.name}`,
                wide:true,
                body:`<label class="p-label" for="preset-name">预设名称</label><input class="p-input" id="preset-name" maxlength="40" value="${esc(preset.name)}">
                    <label class="p-label" for="preset-system">系统提示</label><textarea class="p-textarea" id="preset-system" rows="4">${esc(preset.system)}</textarea>
                    <label class="p-label" for="preset-jailbreak">后置提示（可留空）</label><textarea class="p-textarea" id="preset-jailbreak" rows="3">${esc(preset.jailbreak)}</textarea>
                    <div class="p-inline"><div><label class="p-label" for="preset-temp">温度</label><input class="p-input" id="preset-temp" type="number" step="0.05" min="0" max="2" value="${preset.params.temperature}"></div><div><label class="p-label" for="preset-topp">top_p</label><input class="p-input" id="preset-topp" type="number" step="0.05" min="0.05" max="1" value="${preset.params.topP}"></div><div><label class="p-label" for="preset-max">回复上限</label><input class="p-input" id="preset-max" type="number" step="16" min="16" max="8192" value="${preset.params.maxTokens}"></div></div>
                    <details class="p-lore-advanced"><summary>高级采样（与 SillyTavern 一致，仅本地保存）</summary>
                        <div class="p-lore-grid">
                            <div><label class="p-label" for="preset-topk">top_k（0 = 关闭）</label><input class="p-input" id="preset-topk" type="number" step="1" min="0" max="200" value="${preset.params.topK}"></div>
                            <div><label class="p-label" for="preset-minp">min_p</label><input class="p-input" id="preset-minp" type="number" step="0.01" min="0" max="1" value="${preset.params.minP}"></div>
                            <div><label class="p-label" for="preset-typicalp">typical_p</label><input class="p-input" id="preset-typicalp" type="number" step="0.01" min="0" max="1" value="${preset.params.typicalP}"></div>
                            <div><label class="p-label" for="preset-reppen">重复惩罚 rep_pen</label><input class="p-input" id="preset-reppen" type="number" step="0.05" min="1" max="2" value="${preset.params.repetitionPenalty}"></div>
                            <div><label class="p-label" for="preset-reprange">惩罚范围</label><input class="p-input" id="preset-reprange" type="number" step="1" min="0" max="8192" value="${preset.params.repetitionPenaltyRange}"></div>
                            <div><label class="p-label" for="preset-repslope">惩罚斜率</label><input class="p-input" id="preset-repslope" type="number" step="0.05" min="0" max="10" value="${preset.params.repetitionPenaltySlope}"></div>
                            <div><label class="p-label" for="preset-prespen">presence_penalty</label><input class="p-input" id="preset-prespen" type="number" step="0.1" min="-2" max="2" value="${preset.params.presencePenalty}"></div>
                            <div><label class="p-label" for="preset-freqpen">frequency_penalty</label><input class="p-input" id="preset-freqpen" type="number" step="0.1" min="-2" max="2" value="${preset.params.frequencyPenalty}"></div>
                            <div><label class="p-label" for="preset-seed">随机种子（-1 = 每次随机）</label><input class="p-input" id="preset-seed" type="number" step="1" min="-1" value="${preset.params.seed}"></div>
                        </div>
                    </details>
                    <p class="p-rp-context-note">采样参数只保存在本地预设里。本原型不调用模型，参数不会真正生效；真实接入时按这套字段下发。</p>
                    <details class="p-lore-advanced"><summary>上下文模板（角色块如何拼进上下文）</summary>
                        <p class="p-rp-context-note">占位符：{{char}} 角色名 · {{hook}} 一句话简介 · {{description}} 角色描述 · {{personality}} 人设 · {{scenario}} 场景 · {{legacy}} 旧字段设定 · {{instructions}} 作者提示词。占位符为空的整行会自动省略。</p>
                        <textarea class="p-textarea" id="preset-context-template" rows="7">${esc(preset.contextTemplate || DEFAULT_CONTEXT_TEMPLATE)}</textarea>
                    </details>
                    <details class="p-lore-advanced"><summary>Instruct 序列（与 SillyTavern 的 Instruct 模式一致）</summary>
                        <label class="p-check"><input type="checkbox" id="preset-instruct-enabled" ${preset.instruct?.enabled ? 'checked' : ''}><span>启用<span class="p-small">每条历史消息前加序列前缀；历史块末尾追加停止序列</span></span></label>
                        <div class="p-lore-grid">
                            <div><label class="p-label" for="preset-instruct-input">玩家消息前缀 input</label><input class="p-input" id="preset-instruct-input" value="${esc(preset.instruct?.input || '')}" placeholder="例如：USER: "></div>
                            <div><label class="p-label" for="preset-instruct-output">角色消息前缀 output</label><input class="p-input" id="preset-instruct-output" value="${esc(preset.instruct?.output || '')}" placeholder="例如：CHAR: "></div>
                            <div><label class="p-label" for="preset-instruct-system">系统消息前缀 system</label><input class="p-input" id="preset-instruct-system" value="${esc(preset.instruct?.system || '')}" placeholder="例如：SYSTEM: "></div>
                            <div><label class="p-label" for="preset-instruct-stop">停止序列 stop（可留空）</label><input class="p-input" id="preset-instruct-stop" value="${esc(preset.instruct?.stop || '')}" placeholder="例如：USER:"></div>
                        </div>
                    </details>
                    <div class="p-lore-head"><h3>提示词顺序</h3><span>从上到下进入上下文</span></div>
                    <div id="preset-order">${orderRows()}</div>
                    <div class="p-lore-actions"><button class="p-btn p-btn--sm" id="preset-add-block" type="button">添加自定义块</button></div>
                    <label class="p-check"><input type="checkbox" id="preset-forbid" ${preset.forbidOverrides ? 'checked' : ''}><span>禁止角色卡覆盖系统提示与后置提示<span class="p-small">对应 ST 的 forbid_overrides；勾选后角色卡的 system_prompt / post_history_instructions 不生效</span></span></label>`,
                confirmText:'保存',
                onConfirm:(overlay,close) => {
                    if (busy) { toast('请先停止本地模拟，再修改预设。','err'); return false; }
                    const name = $('#preset-name',overlay).value.trim();
                    if (!name) { toast('预设名称不能为空。','err'); return false; }
                    const before = {name:preset.name,system:preset.system,jailbreak:preset.jailbreak,params:{...preset.params},order:preset.order.map(item => ({...item})),custom:(preset.custom || []).map(block => ({...block})),forbidOverrides:preset.forbidOverrides,contextTemplate:preset.contextTemplate,instruct:{...(preset.instruct || {})}};
                    preset.name = name;
                    preset.system = $('#preset-system',overlay).value;
                    preset.jailbreak = $('#preset-jailbreak',overlay).value;
                    preset.params = {
                        temperature:clampNumber($('#preset-temp',overlay).value,0,2,0.9),
                        topP:clampNumber($('#preset-topp',overlay).value,0.05,1,0.95),
                        topK:Math.round(clampNumber($('#preset-topk',overlay).value,0,200,0)),
                        minP:clampNumber($('#preset-minp',overlay).value,0,1,0),
                        typicalP:clampNumber($('#preset-typicalp',overlay).value,0,1,1),
                        repetitionPenalty:clampNumber($('#preset-reppen',overlay).value,1,2,1.1),
                        repetitionPenaltyRange:Math.round(clampNumber($('#preset-reprange',overlay).value,0,8192,1024)),
                        repetitionPenaltySlope:clampNumber($('#preset-repslope',overlay).value,0,10,0.7),
                        presencePenalty:clampNumber($('#preset-prespen',overlay).value,-2,2,0),
                        frequencyPenalty:clampNumber($('#preset-freqpen',overlay).value,-2,2,0),
                        maxTokens:Math.round(clampNumber($('#preset-max',overlay).value,16,8192,400)),
                        seed:Math.round(clampNumber($('#preset-seed',overlay).value,-1,2147483647,-1)),
                    };
                    preset.contextTemplate = $('#preset-context-template',overlay).value.trim() || DEFAULT_CONTEXT_TEMPLATE;
                    // 序列是精确字符串（含尾随空格），不能 trim
                    preset.instruct = {
                        enabled:$('#preset-instruct-enabled',overlay).checked,
                        input:$('#preset-instruct-input',overlay).value,
                        output:$('#preset-instruct-output',overlay).value,
                        system:$('#preset-instruct-system',overlay).value,
                        stop:$('#preset-instruct-stop',overlay).value,
                    };
                    preset.custom = working.custom.map(normalizeCustomBlock);
                    preset.order = normalizePresetOrder(working.order,preset.custom);
                    preset.forbidOverrides = $('#preset-forbid',overlay).checked;
                    if (!saveState()) { Object.assign(preset,before); toast('保存失败，修改已撤销。','err'); return false; }
                    close();
                    refresh();
                    toast('预设已保存');
                    return false;
                },
            });
            opened.push(editor);
            const drawOrder = () => {
                const box = $('#preset-order',editor.overlay);
                if (!box) return;
                box.innerHTML = orderRows();
                bindOrder();
            };
            const move = (key,step) => {
                const index = working.order.findIndex(item => item.key === key);
                const target = index + step;
                if (index < 0 || target < 0 || target >= working.order.length) return;
                [working.order[index],working.order[target]] = [working.order[target],working.order[index]];
                drawOrder();
            };
            const editBlock = id => {
                const block = working.custom.find(item => item.id === id) || normalizeCustomBlock({id:`custom-${Date.now().toString(36)}`},working.custom.length);
                const form = openModal({title:working.custom.includes(block) ? `编辑自定义块 · ${block.name}` : '添加自定义块',wide:true,
                    body:`<label class="p-label" for="block-name">名称</label><input class="p-input" id="block-name" maxlength="40" value="${esc(block.name)}">
                        <label class="p-label" for="block-content">内容（支持宏，如 {{char}}、{{getvar::好感}}）</label><textarea class="p-textarea" id="block-content" rows="6">${esc(block.content)}</textarea>
                        <div class="p-lore-grid"><div><label class="p-label" for="block-injection">位置</label><select class="p-select" id="block-injection"><option value="relative" ${block.injection === 'relative' ? 'selected' : ''}>按预设顺序</option><option value="depth" ${block.injection === 'depth' ? 'selected' : ''}>聊天内 · 按深度</option></select></div><div><label class="p-label" for="block-role">身份</label><select class="p-select" id="block-role">${[['system','系统'],['user','玩家'],['assistant','角色']].map(([key,label]) => `<option value="${key}" ${key === block.role ? 'selected' : ''}>${label}</option>`).join('')}</select></div></div>
                        <div class="p-lore-grid"><div><label class="p-label" for="block-depth">深度（聊天内时，0 = 最新一条之后）</label><input class="p-input" id="block-depth" type="number" min="0" max="999" value="${block.depth}"></div><div><label class="p-label" for="block-order">同深度内的顺序（越大越靠前）</label><input class="p-input" id="block-order" type="number" min="0" max="9999" value="${block.order}"></div></div>
                        <p class="p-label">只在这些生成类型使用（都不勾 = 全部）</p><div class="p-lore-toggles">${loreTriggerTypes.map(([key,label]) => `<label><input type="checkbox" data-block-trigger="${key}" ${block.triggers.includes(key) ? 'checked' : ''}>${esc(label)}</label>`).join('')}</div>
                        <p class="p-hint">对应 SillyTavern 提示词管理器里的自定义提示（injection_position / injection_depth / injection_order / injection_trigger）。</p>
                        ${working.custom.includes(block) ? '<button class="p-btn p-btn--sm" id="block-delete" type="button">删除这个块</button>' : ''}`,
                    confirmText:'确定',
                    onConfirm:(overlay,close) => {
                        const name = $('#block-name',overlay).value.trim();
                        if (!name) { toast('请填写块的名称。','err'); return false; }
                        const next = normalizeCustomBlock({...block,name,content:$('#block-content',overlay).value,injection:$('#block-injection',overlay).value,role:$('#block-role',overlay).value,depth:$('#block-depth',overlay).value,order:$('#block-order',overlay).value,triggers:$$('[data-block-trigger]',overlay).filter(input => input.checked).map(input => input.dataset.blockTrigger)},working.custom.length);
                        const index = working.custom.findIndex(item => item.id === block.id);
                        if (index < 0) working.custom.push(next); else working.custom[index] = next;
                        working.order = normalizePresetOrder(working.order,working.custom);
                        close();
                        drawOrder();
                        return false;
                    }});
                opened.push(form);
                $('#block-delete',form.overlay)?.addEventListener('click',() => {
                    working.custom = working.custom.filter(item => item.id !== block.id);
                    working.order = working.order.filter(item => item.key !== block.id);
                    form.close();
                    drawOrder();
                });
            };
            $('#preset-add-block',editor.overlay)?.addEventListener('click',() => editBlock(null));
            const bindOrder = () => {
                $$('[data-block-edit]',editor.overlay).forEach(button => button.addEventListener('click',() => editBlock(button.dataset.blockEdit)));
                $$('[data-block-up]',editor.overlay).forEach(button => button.addEventListener('click',() => move(button.dataset.blockUp,-1)));
                $$('[data-block-down]',editor.overlay).forEach(button => button.addEventListener('click',() => move(button.dataset.blockDown,1)));
                $$('[data-block-toggle]',editor.overlay).forEach(input => input.addEventListener('change',() => {
                    const item = working.order.find(entry => entry.key === input.dataset.blockToggle);
                    if (item) item.enabled = input.checked;
                }));
            };
            bindOrder();
        };

        $$('[data-preset-pick]',dialog.overlay).forEach(input => input.addEventListener('change',() => {
            if (busy) { input.checked = true; toast('请先停止本地模拟，再切换预设。','err'); return; }
            const before = chat.presetId;
            if (!commitChat(chat,item => { item.presetId = input.dataset.presetPick; })) { chat.presetId = before; return; }
            toast('本会话已改用《' + activePreset(chat).name + '》');
            refresh();
        }));
        $$('[data-preset-edit]',dialog.overlay).forEach(button => button.addEventListener('click',() => {
            const preset = presetById(button.dataset.presetEdit);
            if (preset) openPresetForm(preset);
        }));
        $$('[data-preset-delete]',dialog.overlay).forEach(button => button.addEventListener('click',() => {
            const preset = presetById(button.dataset.presetDelete);
            if (!preset || presets.length < 2) return;
            openModal({title:'删除这个预设？',body:`<p>《${esc(preset.name)}》将被移除。用它的会话会退回全局默认预设，历史消息不受影响。</p>`,confirmText:'删除',danger:true,onConfirm:(_,close) => {
                if (busy) return false;
                const snapshot = presets.slice();
                presets = presets.filter(item => item.id !== preset.id);
                if (activePresetId === preset.id) activePresetId = presets[0].id;
                const chatOverrides = chats.filter(item => item.presetId === preset.id);
                const before = chatOverrides.map(item => item.presetId);
                chatOverrides.forEach(item => { item.presetId = ''; });
                if (!saveState()) { presets = snapshot; chatOverrides.forEach((item,index) => { item.presetId = before[index]; }); toast('保存失败，删除已撤销。','err'); return false; }
                close();
                refresh();
                return false;
            }});
        }));
        $('#preset-default',dialog.overlay)?.addEventListener('click',() => {
            if (busy) { toast('请先停止本地模拟，再修改预设。','err'); return; }
            const before = activePresetId;
            activePresetId = selected.id;
            if (!saveState()) { activePresetId = before; toast('保存失败，未修改全局默认。','err'); return; }
            refresh();
            toast(`《${selected.name}》现在是全局默认预设`);
        });
        $('#preset-follow',dialog.overlay)?.addEventListener('click',() => {
            if (busy) { toast('请先停止本地模拟，再修改预设。','err'); return; }
            if (!commitChat(chat,item => { item.presetId = ''; })) return;
            refresh();
        });
        $('#preset-new',dialog.overlay)?.addEventListener('click',() => {
            if (busy) { toast('请先停止本地模拟，再新建预设。','err'); return; }
            const preset = normalizePreset({name:`预设 ${presets.length + 1}`,system:selected.system,jailbreak:selected.jailbreak,params:{...selected.params},order:selected.order.map(item => ({...item}))},presets.length);
            presets.push(preset);
            if (!saveState()) { presets.pop(); toast('保存失败，未创建。','err'); return; }
            refresh();
            openPresetForm(preset);
        });
        $('#preset-import',dialog.overlay)?.addEventListener('click',() => {
            const importer = openModal({
                title:'导入预设',
                body:`<p class="p-rp-context-note">支持 SillyTavern 预设 JSON：采样参数（temperature / top_p / top_k / min_p / typical_p / rep_pen / presence_pen / freq_pen / seed / max_tokens）、story_string 上下文模板、instruct 序列与 prompts 提示词块。只读取系统提示与后置提示，其余块按本原型的结构映射。</p><label class="p-label" for="preset-json">粘贴 JSON</label><textarea class="p-textarea" id="preset-json" rows="8" placeholder='{"name":"我的预设","temperature":1,"prompts":[{"identifier":"main","content":"…"}]}'></textarea><p class="p-hint" id="preset-import-status">导入后会新增一个预设，不会覆盖现有预设。</p>`,
                confirmText:'导入',
                onConfirm:(overlay,close) => {
                    const status = $('#preset-import-status',overlay);
                    const text = $('#preset-json',overlay).value.trim();
                    if (!text) { status.textContent = '请先粘贴预设 JSON。'; status.className = 'p-hint p-hint--err'; return false; }
                    const preset = parsePresetImport(text);
                    if (!preset) { status.textContent = '没有解析到可用的预设结构。'; status.className = 'p-hint p-hint--err'; return false; }
                    presets.push(preset);
                    if (!saveState()) { presets.pop(); status.textContent = '保存失败，导入已撤销。'; status.className = 'p-hint p-hint--err'; return false; }
                    close();
                    refresh();
                    toast(`已导入预设《${preset.name}》`);
                    return false;
                },
            });
            opened.push(importer);
        });
    }

    function regexSummary(rule) {
        const scope = {'display':'仅显示','send':'仅发送','both':'显示+发送'}[rule.scope] || '显示+发送';
        const target = {'assistant':'角色回复','user':'玩家输入','all':'全部消息'}[rule.target] || '全部消息';
        return `${scope} · ${target} · ${rule.find} → ${rule.replace || '（删除）'}`;
    }

    function openRegexEditor() {
        const opened = [];
        const refresh = () => {
            [...opened].reverse().forEach(item => item.close());
            refreshRenderedMessages();
            refreshChatContext();
            openRegexEditor();
        };
        const sample = '她把烟按灭，说：「你迟到了三年。」\n\n……请柬还压在抽屉里。';
        const dialog = openModal({
            title:'正则规则',
            wide:true,
            body:`<p class="p-rp-context-note">规则按顺序作用在消息文本上：显示作用域只改页面，发送作用域只改进入上下文的文本。替换结果一律按纯文本渲染，不会变成 HTML。</p>
                <section class="p-lore-block"><div class="p-lore-head"><h3>规则库</h3><span>${regexRules.filter(rule => rule.enabled !== false).length} 条启用 / ${regexRules.length} 条</span></div>
                <div class="p-rp-context-list">${regexRules.length ? regexRules.map(rule => `<section class="p-rp-context-section"><label class="p-lore-book"><input type="checkbox" data-rule-toggle="${rule.id}" ${rule.enabled !== false?'checked':''} aria-label="启用《${esc(rule.name)}》"><span class="p-lore-book-main"><strong>${esc(rule.name)}</strong><small>${esc(regexSummary(rule))}</small></span><button class="p-btn p-btn--sm" type="button" data-rule-edit="${rule.id}">编辑</button><button class="p-btn p-btn--sm" type="button" data-rule-delete="${rule.id}">删除</button></label></section>`).join('') : '<p class="p-rp-context-note">还没有规则。可以从 SillyTavern 导入，或新建一条。</p>'}</div>
                <div class="p-lore-actions"><button class="p-btn p-btn--sm" id="rule-new" type="button">新建规则</button><button class="p-btn p-btn--sm" id="rule-import" type="button">导入 SillyTavern 正则</button></div></section>
                <section class="p-lore-block"><div class="p-lore-head"><h3>试跑</h3><span>用样本文本检查效果</span></div>
                <label class="p-label" for="regex-sample">样本文本（角色回复）</label><textarea class="p-textarea" id="regex-sample" rows="3">${esc(sample)}</textarea>
                <div id="regex-test-result"></div></section>
                ${(() => { const character = currentChat ? chatCharacter(currentChat) : null; const scripts = character?.regexScripts || []; if (!scripts.length) return ''; return `<section class="p-lore-block"><div class="p-lore-head"><h3>角色卡内正则 · ${esc(character.name)}</h3><span>${scripts.length} 条 · ${cardRegexAllowed(character) ? '已授权' : '未授权'}</span></div><label class="p-lore-book"><input type="checkbox" id="card-regex-allowed" ${cardRegexAllowed(character) ? 'checked' : ''} aria-label="允许这张卡的正则运行"><span class="p-lore-book-main"><strong>允许运行这张卡自带的正则</strong><small>与 SillyTavern 一样逐卡授权；在全局规则之后运行，替换结果仍按纯文本显示</small></span></label><div class="p-rp-context-list">${scripts.map(rule => `<p class="p-rp-context-note"><strong>${esc(rule.name)}</strong> · ${esc(regexSummary(rule))}</p>`).join('')}</div></section>`; })()}`,
            confirmText:'完成',
            cancelText:'关闭',
            onConfirm:(_,close) => close(),
        });
        opened.push(dialog);

        const runTest = () => {
            const box = $('#regex-test-result',dialog.overlay);
            if (!box) return;
            const text = $('#regex-sample',dialog.overlay)?.value || '';
            const display = applyRegexRules(text,{target:'assistant',purpose:'display',chat:currentChat});
            const send = applyRegexRules(text,{target:'assistant',purpose:'send',chat:currentChat});
            const errors = [...display.errors,...send.errors].filter((item,index,list) => list.findIndex(other => other.id === item.id && other.message === item.message) === index);
            box.innerHTML = `<section class="p-rp-context-section"><strong>显示结果</strong><pre class="p-rp-context-value">${esc(display.text)}</pre><p class="p-rp-context-note">${display.applied.length ? `命中规则：${esc(display.applied.map(item => `${item.name}（${item.count} 处）`).join('、'))}` : '没有规则命中'}</p></section>
                <section class="p-rp-context-section"><strong>发送结果</strong><pre class="p-rp-context-value">${esc(send.text)}</pre><p class="p-rp-context-note">${send.applied.length ? `命中规则：${esc(send.applied.map(item => `${item.name}（${item.count} 处）`).join('、'))}` : '没有规则命中'}</p></section>
                ${errors.length ? `<p class="p-hint p-hint--err">${esc(errors.map(item => `${item.name}：${item.message}`).join('；'))}</p>` : ''}`;
        };

        const openRuleForm = rule => {
            const editor = openModal({
                title:rule.id ? `编辑规则 · ${rule.name}` : '新建规则',
                wide:true,
                body:`<label class="p-label" for="rule-name">规则名称</label><input class="p-input" id="rule-name" maxlength="40" value="${esc(rule.name)}">
                    <label class="p-label" for="rule-find">查找</label><input class="p-input" id="rule-find" value="${esc(rule.find)}" placeholder="/「([^」]+)」/g 或纯文本">
                    <label class="p-label" for="rule-replace">替换为</label><input class="p-input" id="rule-replace" value="${esc(rule.replace)}" placeholder="可以用 $1 引用捕获组；留空表示删除">
                    <div class="p-inline"><div><label class="p-label" for="rule-scope">作用域</label><select class="p-select" id="rule-scope">${[['display','仅显示'],['send','仅发送'],['both','显示+发送']].map(([value,label]) => `<option value="${value}" ${rule.scope===value?'selected':''}>${label}</option>`).join('')}</select></div><div><label class="p-label" for="rule-target">适用对象</label><select class="p-select" id="rule-target">${[['all','全部消息'],['assistant','角色回复'],['user','玩家输入']].map(([value,label]) => `<option value="${value}" ${rule.target===value?'selected':''}>${label}</option>`).join('')}</select></div><div><label class="p-label" for="rule-order">顺序</label><input class="p-input" id="rule-order" type="number" step="1" value="${Number(rule.order) || 0}"></div></div>
                    <p class="p-rp-context-note">纯文本按字面替换全部出现；写成 /表达式/flags 时按正则处理，flags 支持 g i m s u y。</p>
                    <label class="p-label" for="rule-sample">试跑文本</label><textarea class="p-textarea" id="rule-sample" rows="3">${esc(sample)}</textarea>
                    <div id="rule-preview"></div>`,
                confirmText:'保存',
                onConfirm:(overlay,close) => {
                    if (busy) { toast('请先停止本地模拟，再修改规则。','err'); return false; }
                    const name = $('#rule-name',overlay).value.trim();
                    const find = $('#rule-find',overlay).value.trim();
                    if (!name || !find) { toast('规则名称与查找内容都不能为空。','err'); return false; }
                    const check = compileRegexRule({find});
                    if (check.error) { toast(check.error,'err'); return false; }
                    const next = normalizeRegexRule({
                        id:rule.id || resourceId('regex'),
                        name,
                        find,
                        replace:$('#rule-replace',overlay).value,
                        scope:$('#rule-scope',overlay).value,
                        target:$('#rule-target',overlay).value,
                        enabled:rule.enabled !== false,
                        order:Number($('#rule-order',overlay).value) || 0,
                    },regexRules.length);
                    const index = regexRules.findIndex(item => item.id === rule.id);
                    const snapshot = regexRules.slice();
                    if (index < 0) regexRules.push(next); else regexRules[index] = next;
                    if (!saveState()) { regexRules = snapshot; toast('保存失败，修改已撤销。','err'); return false; }
                    close();
                    refresh();
                    toast('规则已保存');
                    return false;
                },
            });
            opened.push(editor);
            const preview = () => {
                const box = $('#rule-preview',editor.overlay);
                if (!box) return;
                const find = $('#rule-find',editor.overlay).value.trim();
                const replace = $('#rule-replace',editor.overlay).value;
                const scope = $('#rule-scope',editor.overlay).value;
                const target = $('#rule-target',editor.overlay).value;
                const compiled = compileRegexRule({find});
                if (compiled.error) { box.innerHTML = `<p class="p-hint p-hint--err">${esc(compiled.error)}</p>`; return; }
                const text = $('#rule-sample',editor.overlay)?.value || '';
                // 试跑的是「正在编辑的草稿 + 其余已保存规则」，不必先保存才能看到效果。
                const draft = normalizeRegexRule({id:rule.id || 'draft',name:'当前编辑',find,replace,scope,target,enabled:true,order:Number($('#rule-order',editor.overlay).value) || 0},regexRules.length);
                const ruleset = [...regexRules.filter(item => item.id !== (rule.id || 'draft')),draft];
                const purpose = scope === 'send' ? 'send' : 'display';
                const result = applyRuleset(ruleset,text,{target,purpose});
                const other = applyRuleset(ruleset,text,{target,purpose:purpose === 'send' ? 'display' : 'send'});
                box.innerHTML = `<section class="p-rp-context-section"><strong>${scope === 'send' ? '发送结果' : '显示结果'}</strong><pre class="p-rp-context-value">${esc(result.text)}</pre><p class="p-rp-context-note">${result.applied.length ? `命中 ${result.applied[0].count} 处` : '这条规则不会命中这段文本'}</p>${scope === 'both' ? `<p class="p-rp-context-note">发送结果：${esc(other.text)}</p>` : ''}</section>`;
            };
            ['rule-find','rule-replace','rule-sample'].forEach(id => $('#' + id,editor.overlay)?.addEventListener('input',preview));
            ['rule-scope','rule-target'].forEach(id => $('#' + id,editor.overlay)?.addEventListener('change',preview));
            preview();
        };

        $$('[data-rule-toggle]',dialog.overlay).forEach(input => input.addEventListener('change',() => {
            if (busy) { input.checked = !input.checked; toast('请先停止本地模拟，再切换规则。','err'); return; }
            const rule = regexRules.find(item => item.id === input.dataset.ruleToggle);
            if (!rule) return;
            const before = rule.enabled;
            rule.enabled = input.checked;
            if (!saveState()) { rule.enabled = before; input.checked = before; toast('保存失败，开关已还原。','err'); return; }
            refreshRenderedMessages();
            refreshChatContext();
            runTest();
        }));
        $$('[data-rule-edit]',dialog.overlay).forEach(button => button.addEventListener('click',() => {
            const rule = regexRules.find(item => item.id === button.dataset.ruleEdit);
            if (rule) openRuleForm(rule);
        }));
        $$('[data-rule-delete]',dialog.overlay).forEach(button => button.addEventListener('click',() => {
            const rule = regexRules.find(item => item.id === button.dataset.ruleDelete);
            if (!rule) return;
            openModal({title:'删除这条规则？',body:`<p>《${esc(rule.name)}》将被移除，已渲染的消息会恢复原文。</p>`,confirmText:'删除',danger:true,onConfirm:(_,close) => {
                if (busy) return false;
                const snapshot = regexRules.slice();
                regexRules = regexRules.filter(item => item.id !== rule.id);
                if (!saveState()) { regexRules = snapshot; toast('保存失败，删除已撤销。','err'); return false; }
                close();
                refresh();
                return false;
            }});
        }));
        $('#card-regex-allowed',dialog.overlay)?.addEventListener('change',event => {
            const character = currentChat ? chatCharacter(currentChat) : null;
            if (!character || !setCardRegexAllowed(character.id,event.target.checked)) { event.target.checked = !event.target.checked; return; }
            refresh();
        });
        $('#rule-new',dialog.overlay)?.addEventListener('click',() => {
            if (busy) { toast('请先停止本地模拟，再新建规则。','err'); return; }
            openRuleForm(normalizeRegexRule({name:`规则 ${regexRules.length + 1}`,find:'',replace:'',order:regexRules.length},regexRules.length));
        });
        $('#rule-import',dialog.overlay)?.addEventListener('click',() => {
            const importer = openModal({
                title:'导入正则规则',
                body:`<p class="p-rp-context-note">支持 SillyTavern 的正则导出：name / findRegex / replaceString / disabled / placement。导入后按本原型的作用域规则执行。</p><label class="p-label" for="rule-json">粘贴 JSON</label><textarea class="p-textarea" id="rule-json" rows="8" placeholder='[{"name":"去除括号","findRegex":"/（[^）]*）/g","replaceString":""}]'></textarea><p class="p-hint" id="rule-import-status">导入会新增规则，不会覆盖现有规则。</p>`,
                confirmText:'导入',
                onConfirm:(overlay,close) => {
                    const status = $('#rule-import-status',overlay);
                    const text = $('#rule-json',overlay).value.trim();
                    if (!text) { status.textContent = '请先粘贴规则 JSON。'; status.className = 'p-hint p-hint--err'; return false; }
                    const rules = parseRegexImport(text);
                    if (!rules) { status.textContent = '没有解析到可用的规则。'; status.className = 'p-hint p-hint--err'; return false; }
                    const snapshot = regexRules.slice();
                    regexRules = [...regexRules,...rules.map((rule,index) => ({...rule,id:resourceId('regex'),order:regexRules.length + index}))];
                    if (!saveState()) { regexRules = snapshot; status.textContent = '保存失败，导入已撤销。'; status.className = 'p-hint p-hint--err'; return false; }
                    close();
                    refresh();
                    toast(`已导入 ${rules.length} 条规则`);
                    return false;
                },
            });
            opened.push(importer);
        });
        $('#regex-sample',dialog.overlay)?.addEventListener('input',runTest);
        runTest();
    }

    function openVarEditor(chat) {
        const opened = [];
        const refresh = () => {
            [...opened].reverse().forEach(item => item.close());
            refreshRenderedMessages();
            refreshChatContext();
            openVarEditor(chat);
        };
        const vars = chatVars(chat), localKeys = Object.keys(vars), globalKeys = Object.keys(globalVars);
        const list = (store,scope) => {
            const keys = Object.keys(store);
            if (!keys.length) return `<p class="p-rp-context-note">${scope === 'global' ? '还没有全局变量。' : '这个会话还没有变量。发送一次回复，或手动新增一条。'}</p>`;
            return `<div class="p-rp-context-list">${keys.map(key => `<section class="p-rp-context-section"><strong>${esc(key)}</strong><p>${esc(store[key] || '（空值）')}</p><div class="p-lore-actions"><button class="p-btn p-btn--sm" type="button" data-var-edit data-var-scope="${scope}" data-var-key="${esc(key)}">编辑</button><button class="p-btn p-btn--sm" type="button" data-var-delete data-var-scope="${scope}" data-var-key="${esc(key)}">删除</button></div></section>`).join('')}</div>`;
        };
        const dialog = openModal({
            title:'变量与状态栏',
            wide:true,
            body:`<p class="p-rp-context-note">变量是本地字符串，供提示词里的宏读取。预览只读不写；真正执行 setvar / incvar 的是发送那一刻。解析全部在本地完成，不涉及模型。</p>
                <section class="p-lore-block"><div class="p-lore-head"><h3>本会话变量</h3><span>${localKeys.length} 个 · 只在《${esc(chat.title)}》里生效</span></div>${list(vars,'local')}<div class="p-lore-actions"><button class="p-btn p-btn--sm" id="var-new-local" type="button">新增会话变量</button></div></section>
                <section class="p-lore-block"><div class="p-lore-head"><h3>全局变量</h3><span>${globalKeys.length} 个 · 所有会话共用</span></div>${list(globalVars,'global')}<div class="p-lore-actions"><button class="p-btn p-btn--sm" id="var-new-global" type="button">新增全局变量</button></div></section>
                <section class="p-lore-block"><div class="p-lore-head"><h3>状态块</h3><span>${hideStatusBlock?'消息里已隐藏':'消息里按原文显示'}</span></div>
                <label class="p-lore-book"><input type="checkbox" id="var-hide-block" ${hideStatusBlock?'checked':''} aria-label="隐藏消息里的状态块"><span class="p-lore-book-main"><strong>隐藏消息里的【状态】块</strong><small>模板回复会在末尾附带状态块；解析成变量后由右栏状态栏展示</small></span></label>
                <p class="p-rp-context-note">约定写法：单独一行「【状态】」，随后每行「键：值」，遇到空行结束。解析出的键写入本会话变量。类脑那边通常由世界书要求模型这样输出，再用正则美化。</p></section>
                <section class="p-lore-block"><div class="p-lore-head"><h3>可用宏</h3><span>组装与发送时解析</span></div>
                ${macroGroups.map(([group,items]) => `<p class="p-label">${esc(group)}</p><pre class="p-rp-context-value">${esc(items.map(item => `{{${item}}}`).join('  '))}</pre>`).join('')}
                <p class="p-rp-context-note">名字与写法和 SillyTavern 一致；未支持的宏原样保留。{{random}} 每次重抽，{{pick}} 在同一会话里保持同一个结果。条件宏（{{if}}）与 STscript 脚本尚未实现，输入框支持常用斜杠命令（输入 /help 查看）。</p></section>`,
            confirmText:'完成',
            cancelText:'关闭',
            onConfirm:(_,close) => close(),
        });
        opened.push(dialog);

        const openVarForm = (scope,key) => {
            const store = scope === 'global' ? globalVars : vars;
            const editing = typeof key === 'string' && key in store;
            const editor = openModal({
                title:editing ? `编辑变量 · ${key}` : (scope === 'global' ? '新增全局变量' : '新增会话变量'),
                body:`<label class="p-label" for="var-key">变量名</label><input class="p-input" id="var-key" maxlength="${varKeyLimit}" value="${esc(editing ? key : '')}" placeholder="例如 时间 / 好感 / 地点">
                    <label class="p-label" for="var-value">值</label><textarea class="p-textarea" id="var-value" rows="3" placeholder="字符串值；需要计数就用 incvar / decvar">${esc(editing ? store[key] : '')}</textarea>
                    <p class="p-rp-context-note">宏只在组装与发送时读取这些值；这里保存不会改动任何历史消息。</p>`,
                confirmText:'保存',
                onConfirm:(overlay,close) => {
                    if (busy) { toast('请先停止本地模拟，再修改变量。','err'); return false; }
                    const name = $('#var-key',overlay).value.trim();
                    const value = $('#var-value',overlay).value;
                    if (!name) { toast('变量名不能为空。','err'); return false; }
                    const before = {...store};
                    if (editing && name !== key) removeVar(chat,scope,key);
                    writeVar(chat,scope,name,value);
                    if (!saveState()) {
                        Object.keys(store).forEach(item => delete store[item]);
                        Object.assign(store,before);
                        toast('保存失败，修改已撤销。','err');
                        return false;
                    }
                    close();
                    refresh();
                    toast('变量已保存');
                    return false;
                },
            });
            opened.push(editor);
        };

        $$('[data-var-edit]',dialog.overlay).forEach(button => button.addEventListener('click',() => openVarForm(button.dataset.varScope,button.dataset.varKey)));
        $$('[data-var-delete]',dialog.overlay).forEach(button => button.addEventListener('click',() => {
            const scope = button.dataset.varScope, key = button.dataset.varKey;
            const store = scope === 'global' ? globalVars : vars;
            openModal({title:'删除这个变量？',body:`<p>${esc(key)} 将从${scope === 'global' ? '全局变量' : '本会话变量'}里移除；已经写进消息的文本不会改变。</p>`,confirmText:'删除',danger:true,onConfirm:(_,close) => {
                if (busy) return false;
                const before = {...store};
                removeVar(chat,scope,key);
                if (!saveState()) {
                    Object.keys(store).forEach(item => delete store[item]);
                    Object.assign(store,before);
                    toast('保存失败，删除已撤销。','err');
                    return false;
                }
                close();
                refresh();
                return false;
            }});
        }));
        $('#var-new-local',dialog.overlay)?.addEventListener('click',() => {
            if (busy) { toast('请先停止本地模拟，再修改变量。','err'); return; }
            openVarForm('local');
        });
        $('#var-new-global',dialog.overlay)?.addEventListener('click',() => {
            if (busy) { toast('请先停止本地模拟，再修改变量。','err'); return; }
            openVarForm('global');
        });
        $('#var-hide-block',dialog.overlay)?.addEventListener('change',event => {
            const before = hideStatusBlock;
            hideStatusBlock = event.target.checked;
            if (!saveState()) { hideStatusBlock = before; event.target.checked = before; toast('保存失败，开关已还原。','err'); return; }
            refreshRenderedMessages();
            refreshChatContext();
            toast(hideStatusBlock ? '状态块已隐藏，改由状态栏展示' : '状态块按原文显示在消息里');
        });
    }
    function setLibraryFlag(characterId, field, value) {
        if (!['added','favorite'].includes(field) || typeof value !== 'boolean') return false;
        const character = getCharacter(characterId);
        if (!character || character.missing) return false;
        const previous = character[field];
        character[field] = value;
        if (!saveState()) { character[field] = previous; return false; }
        return true;
    }

    function libraryActions(character) {
        const recent = recentChat(character.id);
        if (character.local) return `${recent?`<a class="p-btn p-btn--sm p-btn--primary" href="chat.html?chat=${esc(recent.id)}">继续故事</a>`:''}<a class="p-btn p-btn--sm" href="create.html?edit=${esc(character.id)}">编辑 / 私人试聊</a>`;
        return `<a class="p-btn p-btn--sm" href="character.html?id=${character.id}">查看角色</a>${recent?`<a class="p-btn p-btn--sm p-btn--primary" href="chat.html?chat=${esc(recent.id)}">继续故事</a>`:''}<a class="p-btn p-btn--sm" href="character.html?id=${character.id}&start=new">新故事</a>`;
    }

    function renderLibrary() {
        let tab='added';
        let query='';
        const created = creatorWorks;
        const counts={added:Object.values(characters).filter(c=>c.added).length,created:created.length,favorites:Object.values(characters).filter(c=>c.favorite).length};
        $('#app').innerHTML=`${title('角色库','已添加的作品、你的创作和收藏，都在这里。','<a class="p-btn" href="create.html?tab=works">作品管理</a><a class="p-btn p-btn--primary" href="create.html">创建角色</a>')}
            <div class="p-tabs p-library-tabs" role="tablist" aria-label="角色库分类"><button role="tab" data-library-tab="added" aria-selected="true">已添加 ${counts.added}</button><button role="tab" data-library-tab="created" aria-selected="false">我创建的 ${counts.created}</button><button role="tab" data-library-tab="favorites" aria-selected="false">收藏 ${counts.favorites}</button></div>
            <div class="p-filterbar"><div class="p-filterbar-main"><label class="p-search">${icon('search')}<input class="p-input" id="library-query" type="search" placeholder="搜索角色名、作者或标签" aria-label="搜索角色库"></label><span class="p-filterbar-count" id="library-count"></span></div></div>
            <div id="library-undo" role="status"></div><div class="p-card p-rows" id="library-list"></div>`;
        let undo = null;
        const draw=()=>{
            const publicCharacters = Object.values(characters);
            const totals = {added:publicCharacters.filter(c=>c.added).length,created:created.length,favorites:publicCharacters.filter(c=>c.favorite).length};
            const labels = {added:'已添加',created:'我创建的',favorites:'收藏'};
            $$('[data-library-tab]').forEach(button => { button.textContent=`${labels[button.dataset.libraryTab]} ${totals[button.dataset.libraryTab]}`; });
            let list=tab==='added'?publicCharacters.filter(c=>c.added):tab==='favorites'?publicCharacters.filter(c=>c.favorite):created;
            if(query)list=list.filter(c=>`${c.name} ${c.author} ${c.pace||''} ${(c.tags||[]).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
            $('#library-count').textContent=`${list.length} 个角色 · 库操作不会删除故事`;
            $('#library-list').innerHTML=list.length?list.map(c=>`<div class="p-library-row">${cover(c,'p-library-cover')}<div class="p-library-main"><div class="p-library-name">${esc(c.name || '未命名角色')}</div><div class="p-library-sub">${c.local?`${c.status==='pending'?'本地模拟审核':'私人草稿'} · 仅本标签页`:`@${esc(c.author)} · ${c.added?'已添加':'未添加'}`} · ${esc((c.tags || []).join(' · '))}</div><div class="p-library-sub">${recentChat(c.id)?'已有故事 · 继续不会新建会话':'新故事会先选择开场与玩家身份'}</div></div><div class="p-library-actions">${libraryActions(c)}${!c.local?`<button class="p-btn p-btn--sm" data-library-remove="${c.id}" data-library-field="${tab==='favorites'?'favorite':'added'}">${tab==='favorites'?'取消收藏':'移除已添加'}</button>`:''}</div></div>`).join(''):`<div class="p-empty"><div class="p-empty-icon">${icon('heart')}</div><div class="p-empty-title">${query?'没有找到匹配的角色':'这里还没有角色'}</div><p class="p-empty-text">${query?'试试角色名、作者或标签。':'添加或收藏喜欢的角色，就能随时回来；已有故事仍在对话页。'}</p><a class="p-btn" href="plaza.html">去广场看看</a></div>`;
            $('#library-undo').innerHTML = undo ? `<div class="p-notice"><span>已${undo.field==='favorite'?'取消收藏':'移除已添加'}「${esc(undo.name)}」，故事仍保留。</span><button class="p-btn p-btn--sm" id="undo-library-change">撤销</button></div>` : '';
            $('#undo-library-change')?.addEventListener('click',() => { if (setLibraryFlag(undo.id,undo.field,undo.value)) { undo=null; draw(); } });
        };
        $('#library-list').addEventListener('click',event => {
            const button = event.target.closest('[data-library-remove]');
            if (!button) return;
            const character = getCharacter(button.dataset.libraryRemove);
            const field = button.dataset.libraryField;
            const previous = {id:character.id,name:character.name,field,value:character[field]};
            if (!setLibraryFlag(character.id,field,false)) return;
            undo=previous; draw();
        });
        $$('[data-library-tab]').forEach(button=>button.addEventListener('click',()=>{tab=button.dataset.libraryTab;$$('[data-library-tab]').forEach(b=>b.setAttribute('aria-selected',String(b===button)));draw();}));
        $('#library-query').addEventListener('input',event=>{query=event.target.value.trim();draw();});
        draw();
    }

    function renderRooms() {
        $('#app').innerHTML=`${title('多角色房间','让角色在同一场戏里相遇，彼此回应。','<button class="p-btn p-btn--primary" data-new-room>创建房间</button>')}
            <div class="p-rooms-layout"><div><div class="p-card p-rows">${rooms.length ? [...rooms].sort((a,b)=>b.updated-a.updated).map(room=>`<div class="p-room-card">${avatar({initial:'房',hue:210},52)}<div class="p-room-main"><div class="p-room-title"><span>${esc(room.name)}</span><span class="p-pill p-pill--sm p-pill--outline">${room.members.length} 个角色</span></div><div class="p-room-members">${room.members.map(id=>{const c=getCharacter(id);return `<span>${avatar(c,22)}${esc(c.name)}</span>`;}).join('')}</div><p class="p-room-last">${esc(room.lastMessage)}</p><div class="p-room-meta">${room.count} 条消息 · ${relativeTime(room.updated)}活跃</div></div><div class="p-library-actions"><a class="p-btn p-btn--sm p-btn--primary" href="chat.html?chat=${room.chatId}">进入房间</a><button class="p-btn p-btn--sm p-btn--icon" data-room-settings="${room.id}" aria-label="设置${esc(room.name)}">${icon('settings')}</button><button class="p-btn p-btn--sm p-btn--icon" data-room-del="${room.id}" aria-label="删除房间 ${esc(room.name)}">${icon('trash')}</button></div></div>`).join('') : `<div class="p-empty"><div class="p-empty-title">还没有房间</div><p class="p-empty-text">选择两个以上的角色，让他们在同一场故事里相遇。</p><button class="p-btn p-btn--primary" data-new-room>创建第一个房间</button></div>`}</div></div>
            <aside class="p-rooms-side"><section class="p-card p-card--pad"><h2 class="p-form-section-title">房间怎么玩</h2><ol class="p-room-guide"><li><strong>选择角色</strong><span>至少两个角色会共享同一场对话；可以静音个别成员。</span></li><li><strong>选择发言方式</strong><span>自然提及、顺序轮流、手动指定、随机一位，或全员各回应一次；输入里 @角色名 随时点名。</span></li><li><strong>继续同一段故事</strong><span>房间会话会出现在对话列表，可随时回来；可开启自动推进。</span></li></ol></section><section class="p-card p-card--pad"><h2 class="p-form-section-title">本地模拟的边界</h2><p class="p-small">本原型只生成本地模拟回复，不调用模型、不扣点。消息、输入草稿与发言策略保存在当前标签页；真实模型费用估计尚未实现。</p><button class="p-btn p-btn--block" data-new-room style="margin-top:14px">${icon('create')}创建房间</button></section></aside></div>`;
    }

    const roomCharacter = (room, id) => room.characterSnapshots?.[id] || getCharacter(id);

    function saveRoomConfiguration(room, values) {
        const name = textValue(values.name).trim();
        const members = [...new Set(Array.isArray(values.members) ? values.members : [])].filter(id => typeof id === 'string' && !getCharacter(id).missing);
        if (!name || name.length > 40 || members.length < 2 || !['natural','round-robin','manual','pooled','free'].includes(values.strategy)) return false;
        const muted = [...new Set(Array.isArray(values.muted) ? values.muted : [])].filter(id => members.includes(id));
        if (values.strategy === 'manual' && (!members.includes(values.speakerId) || muted.includes(values.speakerId))) return false;
        if (members.length - muted.length < 1) return false;
        const previous = {...room};
        const snapshots = {...room.characterSnapshots};
        for (const id of new Set([...room.members,...members])) if (!snapshots[id]) snapshots[id] = JSON.parse(JSON.stringify(getCharacter(id)));
        Object.assign(room,{name,members,strategy:values.strategy,speakerId:members.includes(values.speakerId) && !muted.includes(values.speakerId)?values.speakerId:members.find(id => !muted.includes(id)) || members[0],
            muted,autoMode:values.autoMode === true,
            nextSpeaker:room.nextSpeaker % members.length,characterSnapshots:snapshots});
        // Removed members' snapshots and messages stay intact. Changes apply only to future turns.
        if (!saveState()) { Object.keys(room).forEach(key=>delete room[key]);Object.assign(room,previous);return false; }
        return true;
    }

    function createRoom(name, memberIds) {
        const members = [...new Set(memberIds)].filter(id => getCharacter(id) && !getCharacter(id).missing);
        if (members.length < 2) return null;
        const room = normalizeRoom({id:resourceId('room'),chatId:resourceId('room-chat'),name:name.trim() || '新的房间',members,
            characterSnapshots:Object.fromEntries(members.map(id => [id,JSON.parse(JSON.stringify(getCharacter(id)))])),
            time:'刚刚',updated:Date.now(),messages:members.map(speakerId => ({role:'assistant',speakerId,text:getCharacter(speakerId).greeting,simulation:true}))});
        rooms.push(room);
        if (!saveState()) { rooms.pop(); return null; }
        return room;
    }

    function saveRoomSettings(room, strategy, speakerId) {
        if (!['round-robin','manual','free'].includes(strategy) || (strategy === 'manual' && !room.members.includes(speakerId))) return false;
        const previous = {strategy:room.strategy,speakerId:room.speakerId};
        room.strategy = strategy;
        room.speakerId = room.members.includes(speakerId) ? speakerId : room.members[0] || '';
        if (!saveState()) { Object.assign(room,previous); return false; }
        return true;
    }

    // ST group-chats 的激活策略对齐：natural=按 @提及点名（无提及回退顺序）、round-robin=顺序轮流（LIST）、
    // manual=由你指定（MANUAL）、pooled=随机一位成员（POOLED，原型不做 talkativeness 权重）、free=全员各回一条（APPEND 全员）。
    // muted 成员不参与发言（ST 的 mute）；@提及在任何非手动策略下都优先。
    function roomActiveMembers(room) {
        return room.members.filter(id => !room.muted?.includes(id) && roomCharacter(room,id) && !roomCharacter(room,id).missing);
    }

    function roomMentions(room, text) {
        const raw = String(text || '');
        if (!raw.includes('@')) return [];
        return room.members.filter(id => {
            if (room.muted?.includes(id)) return false;
            const character = roomCharacter(room,id);
            return character && (raw.includes(`@${character.name}`) || raw.includes(`@${character.initial}`));
        });
    }

    function roomSpeakersFor(room, text) {
        const active = roomActiveMembers(room);
        if (!active.length) return [];
        if (room.strategy === 'manual') return active.includes(room.speakerId) ? [room.speakerId] : [active[0]];
        const mentioned = roomMentions(room, text);
        if (mentioned.length) return mentioned;
        if (room.strategy === 'round-robin') return [active[room.nextSpeaker % active.length]];
        if (room.strategy === 'pooled') {
            const candidates = active.filter(id => id !== room.lastSpeaker);
            const pool = candidates.length ? candidates : active;
            return [pool[Math.floor(Math.random() * pool.length)]];
        }
        if (room.strategy === 'free') return active;
        return [active[room.nextSpeaker % active.length]];
    }

    // 模拟回复模板池：轮换使用，避免多轮后永远是同一句话
    const roomReplyTemplates = [
        (name,text) => `${name}听见你说「${text}」，指尖在桌面轻敲两下：「从这里继续吧。」`,
        (name,text) => `${name}放下手里的东西，抬眼看你：「${text}——你是认真的？」`,
        (name,text) => `${name}没有立刻接话，先把「${text}」在心里过了一遍，才慢慢开口。`,
        (name,text) => `「${text}？」${name}笑了一下，「有意思，那就这么办。」`,
        (name,text) => `${name}朝你侧过身，压低声音：「这句话，先别让第三个人听见。」`,
    ];
    const roomReplyFor = (room, name, text) => {
        const spoken = room.messages.filter(message => message.role === 'assistant').length;
        return roomReplyTemplates[spoken % roomReplyTemplates.length](name,text);
    };

    function sendRoomMessage(room, value, speakerId = room.speakerId) {
        const text = textValue(value).trim();
        if (!text) return false;
        const active = roomActiveMembers(room);
        if (!active.length) { toast('房间成员都处于静音，请先在设置里恢复至少一位。','err'); return false; }
        const speakers = roomSpeakersFor(room, text);
        if (!speakers.length) { toast('请选择资料完整的房间成员；原消息仍保留。','err'); return false; }
        const previous = {...room,messages:room.messages};
        room.characterSnapshots = {...room.characterSnapshots};
        for (const id of room.members) if (!room.characterSnapshots[id]) room.characterSnapshots[id] = JSON.parse(JSON.stringify(getCharacter(id)));
        const sentAt = Date.now();
        // 自动推进（ST auto-mode 的轻量版）：开启后首轮回应之外，按顺序再让最多两位成员接话
        const extra = room.autoMode ? roomActiveMembers(room).filter(id => !speakers.includes(id)).slice(0,2) : [];
        const messages = [{role:'user',text,sentAt},...[...speakers,...extra].map(id => ({role:'assistant',speakerId:id,sentAt,simulation:true,
            text:`【本地模拟】${roomReplyFor(room,roomCharacter(room,id).name,text)}`}))];
        room.messages = [...room.messages,...messages];
        if (room.strategy === 'manual') room.speakerId = speakers[0];
        room.lastSpeaker = room.messages.at(-1).speakerId;
        if (room.strategy === 'round-robin' || room.strategy === 'natural') room.nextSpeaker = (room.nextSpeaker + 1) % active.length;
        room.draft = '';
        room.updated = sentAt;
        room.time = '刚刚';
        syncMessageMetadata(room);
        if (!saveState()) { Object.keys(room).forEach(key=>delete room[key]);Object.assign(room,previous);return false; }
        return true;
    }

    function openRoomCreator() {
        openModal({title:'创建多角色房间',body:`<div class="p-field"><label class="p-label" for="room-name">房间名称</label><input class="p-input" id="room-name" maxlength="30" value="未完的约定"></div><div class="p-field"><span class="p-label">选择至少 2 个角色</span><div class="p-choice-list">${[...Object.values(characters).filter(c=>!blockedCreators.includes(c.author)&&(!c.nsfw||nsfwAllowed())),...creatorWorks.filter(work => work.name.trim() && work.greeting.trim())].map(c=>`<label class="p-choice"><input type="checkbox" name="room-member" value="${c.id}">${avatar(c,36)}<span class="p-choice-main"><span class="p-choice-title">${esc(c.name)}</span><span class="p-choice-sub">${esc(c.hook)}</span></span></label>`).join('')}</div></div><div class="p-form-error" id="room-error" hidden>至少选择 2 个角色。</div><p class="p-small">仅在本标签页保存。本地模拟成员回应，不调用模型，也不扣点。</p>`,confirmText:'保存并进入',onConfirm:(overlay,close)=>{
            const members = $$('input[name="room-member"]',overlay).filter(input => input.checked).map(input => input.value);
            if (members.length < 2) { $('#room-error',overlay).hidden = false; return false; }
            const room = createRoom($('#room-name',overlay).value,members);
            if (!room) return false;
            close();
            location.href = `chat.html?chat=${room.chatId}`;
        }});
    }

    function renderRoomChat(id) {
        const room = roomChat(id);
        if (!room) { location.href = 'rooms.html'; return; }
        const labels = {'natural':'自然提及','round-robin':'顺序发言',manual:'指定角色',pooled:'随机发言',free:'全员回应'};
        const activeMembers = roomActiveMembers(room);
        const strategyNote = {
            natural:'输入里 @角色名 会优先点名；没有提及就按顺序交给下一位。',
            'round-robin':'按成员顺序，每轮只由一位角色回应。',
            manual:'由你选择本轮回应角色；不会替其他成员发言。',
            pooled:'每轮随机选一位成员回应；@提及仍然优先。',
            free:'每个成员各回应一次同一条输入，不模拟成员间自主推演。',
        }[room.strategy] || '';
        const mutedCount = (room.muted || []).length;
        document.title = `${room.name} · 多角色故事 · 酒馆`;
        $('#app').innerHTML = `<div class="p-rp-workbench"><div class="p-chat"><header class="p-chat-head"><div class="p-chat-col p-chat-head-in"><a class="p-chat-icon" href="rooms.html" aria-label="返回房间列表">${icon('back')}</a><div class="p-chat-title"><div class="p-chat-title-text"><div class="p-chat-name">${esc(room.name)}</div><div class="p-chat-sub">${activeMembers.length}/${room.members.length} 位成员发言 · ${labels[room.strategy] || room.strategy}${room.autoMode?' · 自动推进':''}</div></div></div><button class="p-chat-icon" id="room-search" type="button" aria-label="搜索与书签">${icon('search')}</button><button class="p-chat-icon" id="room-settings" aria-label="房间设置">${icon('settings')}</button></div></header><div class="p-rp-status">本地模拟 · 不调用模型，不扣点 · 多角色，不是多人在线聊天</div><div class="p-chat-scroll" id="chat-scroll" tabindex="0" aria-label="房间消息"><div class="p-chat-col" id="room-messages"></div></div><div class="p-chat-compose"><div class="p-chat-col"><div class="p-compose-bar"><div class="p-compose-bar-main"><label class="p-label" for="room-speaker" ${room.strategy==='manual'?'':'hidden'}>本轮回应</label><select class="p-select" id="room-speaker" ${room.strategy==='manual'?'':'hidden'}>${room.members.filter(id=>!mutedCount || !room.muted.includes(id)).map(id=>`<option value="${id}" ${id===(room.speakerId||room.members[0])?'selected':''}>${esc(roomCharacter(room,id).name)}</option>`).join('')}</select></div><div class="p-rp-compose-context"><span class="p-compose-persona">${labels[room.strategy] || room.strategy} · 输入 @角色名 直接点名</span><button class="p-text-btn" id="room-impersonate" type="button">代写一句</button><button class="p-text-btn" id="room-narrate" type="button">插入旁白</button><button class="p-text-btn" id="room-compose-settings" type="button">调整发言</button></div></div><div class="p-chat-compose-row"><textarea class="p-chat-input" id="room-message-input" rows="1" placeholder="写下对白、*描述行动*，或 @角色名 点名回应…" aria-label="房间消息"></textarea><button class="p-chat-send" aria-label="发送" id="room-send">${icon('send')}</button></div><div class="p-compose-meta"><span id="room-draft-status">草稿保存在当前标签页</span><span>Enter 发送 · Shift + Enter 换行</span></div></div></div></div><aside class="p-rp-context" aria-label="房间设定"><div class="p-rp-context-head"><span>故事档案</span><small>ENSEMBLE</small></div><section class="p-rp-context-section"><div class="p-rp-context-label">本场角色</div><div class="p-rp-context-list">${room.members.map(id=>`<div class="p-rp-context-line">${avatar(roomCharacter(room,id),28)}<span>${esc(roomCharacter(room,id).name)}${(room.muted||[]).includes(id)?'<span class="p-msg-flag">已静音</span>':''}</span></div>`).join('')}</div><p class="p-rp-context-note">每条回复保留发言者。调整成员与静音只影响后续，历史不会被删除。</p></section><section class="p-rp-context-section"><div class="p-rp-context-label">当前调度</div><div class="p-rp-context-value">${labels[room.strategy] || room.strategy}${room.autoMode?' · 自动推进':''}</div><p class="p-rp-context-note">${strategyNote}${mutedCount?` 已静音 ${mutedCount} 位。`:''}</p><button class="p-rp-context-action" id="room-side-settings">编辑房间与成员 ${icon('next')}</button></section><section class="p-rp-context-section"><div class="p-rp-context-label">记录与边界</div><p class="p-rp-context-note">消息和草稿仅保存在当前标签页。导出包含成员快照与发言策略；没有真实 AI 或联网协作。</p><button class="p-rp-context-action" id="room-export">导出房间记录 ${icon('download')}</button></section></aside></div>`;
        const draw = () => {
            $('#room-messages').innerHTML = `<div class="p-rp-prologue"><div class="p-eyebrow">ENSEMBLE · STORY</div><h1>${esc(room.name)}</h1><p>${room.members.map(id=>esc(roomCharacter(room,id).name)).join(' / ')}</p><small>${room.messages.length} 条消息 · ${labels[room.strategy] || room.strategy}${room.autoMode?' · 自动推进':''}</small></div>` + room.messages.map((message,index) => {
                if (message.role === 'system') return `<p class="p-rp-system">${esc(displayMessageText(message))}</p>`;
                const ops = `<div class="p-msg-tools"><button type="button" data-room-msg-action="copy" data-room-message-index="${index}" aria-label="复制消息" title="复制消息">${icon('copy')}</button><button type="button" data-room-msg-action="edit" data-room-message-index="${index}" aria-label="编辑消息" title="编辑消息">${icon('edit')}</button><button type="button" data-room-msg-action="bookmark" data-room-message-index="${index}" aria-label="${message.bookmark?'移除书签':'加书签'}" title="${message.bookmark?'移除书签':'加书签'}">${icon('bookmark')}</button><button type="button" data-room-msg-action="del" data-room-message-index="${index}" aria-label="删除消息" title="删除消息">${icon('trash')}</button></div>`;
                if (message.role === 'user') return `<article class="p-msg p-msg-user" data-msg-index="${index}">${avatar({initial:'林',hue:28},32)}<div><div class="p-msg-name">你</div><div class="p-msg-copy p-msg-text">${messageMarkup(displayMessageText(message))}</div>${ops}</div></article>`;
                const speaker = roomCharacter(room,message.speakerId) || {name:'未标注成员',initial:'?',hue:0};
                return `<article class="p-msg" data-msg-index="${index}">${avatar(speaker,32)}<div><div class="p-msg-name">${esc(speaker.name)}${emotionBadge(message.text)}${message.bookmark?'<span class="p-msg-flag p-bookmark-flag">书签</span>':''}${message.simulation?' · 模板模拟':''}</div><div class="p-msg-copy p-msg-text">${messageMarkup(displayMessageText(message))}</div>${ops}</div></article>`;
            }).join('');
            $$('[data-room-msg-action]',$('#room-messages')).forEach(button => button.addEventListener('click',() => roomMessageAction(room,Number(button.dataset.roomMessageIndex),button.dataset.roomMsgAction)));
            scrollChat();
        };
        const input = $('#room-message-input');
        const resize = () => { input.style.height='auto';input.style.height=`${input.value?Math.min(Math.max(input.scrollHeight,52),160):52}px`; };
        input.value = room.draft;
        resize();
        input.addEventListener('input',() => {
            resize();
            const previous = room.draft;
            room.draft = input.value;
            const saved = saveState();
            if (!saved) room.draft = previous;
            $('#room-draft-status').textContent = saved?'草稿已保存在当前标签页':'草稿未保存，请勿关闭此页';
        });
        const send = () => {
            if (!input.value.trim()) { input.focus(); toast('请先输入房间消息。','err'); return; }
            if (!sendRoomMessage(room,input.value,$('#room-speaker')?.value)) return;
            input.value = '';resize();
            $('#room-draft-status').textContent='消息已保存';
            draw();
        };
        $('#room-send').addEventListener('click',send);
        input.addEventListener('keydown',event => { if (event.key==='Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); } });
        $('#room-speaker')?.addEventListener('change',event => { room.speakerId = event.target.value; saveState(); });
        // 代写：给玩家一句模板台词，可直接发送或改写
        const roomPlayerTemplates = ['*我环顾一圈，把话头交给在场的人。*','*我把想法摊开在桌上，等他们接话。*','*我尽量把语气放平，把刚才的事又说了一遍。*'];
        $('#room-impersonate').addEventListener('click',() => {
            input.value = roomPlayerTemplates[Math.floor(Math.random() * roomPlayerTemplates.length)];
            resize(); input.focus();
        });
        $('#room-narrate').addEventListener('click',() => openModal({title:'插入旁白',body:`<div class="p-field"><label class="p-label" for="room-narration">旁白 · 以场景口吻描述，不代入任何角色</label><textarea class="p-textarea" id="room-narration" placeholder="例如：茶凉了，谁都没有先开口。"></textarea></div>`,confirmText:'插入',onConfirm:(overlay,close)=>{
            const text = $('#room-narration',overlay).value.trim();
            if (!text) { $('#room-narration',overlay).focus(); return false; }
            if (!sendRoomNarration(room,text)) { close(); return false; }
            close(); draw(); toast('旁白已插入');
        }}));
        $('#room-search')?.addEventListener('click',() => openChatSearch(room,{messages:room.messages,scope:'room'}));
        for (const selector of ['#room-settings','#room-compose-settings','#room-side-settings']) $(selector).addEventListener('click',() => openRoomSettings(room));
        $('#room-export').addEventListener('click',() => exportRoom(room));
        draw();
    }

    function roomMessageAction(room,index,action) {
        const message = room.messages[index];
        if (!message) return;
        if (action === 'copy') {
            const text = displayMessageText(message);
            if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast('已复制'),() => toast('复制失败','err'));
            else toast('当前环境不支持复制','err');
            return;
        }
        if (action === 'edit') {
            openModal({title:'编辑这条消息',body:`<div class="p-field"><label class="p-label" for="room-edit-text">内容</label><textarea class="p-textarea" id="room-edit-text">${esc(displayMessageText(message))}</textarea></div>`,confirmText:'保存',onConfirm:(overlay,close)=>{
                const text = $('#room-edit-text',overlay).value.trim();
                if (!text) { $('#room-edit-text',overlay).focus(); return false; }
                const previous = {...room,messages:room.messages};
                room.messages[index] = {...message,text};
                if (!saveState()) { Object.keys(room).forEach(key=>delete room[key]);Object.assign(room,previous);return false; }
                close(); renderRoomChat(room.chatId); toast('消息已更新');
            }});
            return;
        }
        if (action === 'bookmark') {
            const apply = change => {
                const previous = {...room,messages:room.messages};
                change(message);
                if (!saveState()) { Object.keys(room).forEach(key=>delete room[key]);Object.assign(room,previous);return; }
                renderRoomChat(room.chatId);
            };
            apply(message => { message.bookmark = !message.bookmark; });
            toast(message.bookmark?'书签已移除':'已加书签；在「搜索与书签」里跳转');
            return;
        }
        if (action === 'del') {
            confirmAction('删除这条消息？','只删除这一条，不影响其他消息。','删除',()=>{
                const previous = {...room,messages:room.messages};
                // 用重赋值而不是 splice：previous.messages 与 room.messages 是同一个引用，原地改会连回滚底稿一起改掉
                room.messages = room.messages.filter((_,messageIndex) => messageIndex !== index);
                if (!saveState()) { Object.keys(room).forEach(key=>delete room[key]);Object.assign(room,previous);return; }
                renderRoomChat(room.chatId);
                toast('消息已删除');
            });
        }
    }

    function sendRoomNarration(room, text) {
        const value = textValue(text).trim();
        if (!value) return false;
        const previous = {...room,messages:room.messages};
        room.messages = [...room.messages,{role:'system',text:value,sentAt:Date.now()}];
        room.updated = Date.now();
        syncMessageMetadata(room);
        if (!saveState()) { Object.keys(room).forEach(key=>delete room[key]);Object.assign(room,previous);return false; }
        return true;
    }

    function exportRoom(room) {
        const blob = new Blob([JSON.stringify({format:'tavern-room',version:1,exportedAt:new Date().toISOString(),room},null,2)],{type:'application/json'});
        const url=URL.createObjectURL(blob), link=document.createElement('a');
        link.href=url;link.download=`${room.name}.json`;link.click();
        setTimeout(()=>URL.revokeObjectURL(url),500);
        toast('已发起房间记录下载');
    }

    function openRoomSettings(room) {
        if (!room) return;
        const labels = {'natural':'自然提及 · @点名或按顺序','round-robin':'顺序发言 · 每轮下一位',manual:'指定角色 · 由你选择',pooled:'随机发言 · 随机一位成员',free:'全员回应 · 每位一次'};
        const available = [...Object.values(characters),...creatorWorks].filter(c=>room.members.includes(c.id)||(!blockedCreators.includes(c.author)&&(!c.nsfw||nsfwAllowed())&&c.name.trim()&&c.greeting.trim()));
        const dialog = openModal({title:'房间与发言设定',body:`<div class="p-field"><label class="p-label" for="room-edit-name">故事名称</label><input class="p-input" id="room-edit-name" maxlength="40" value="${esc(room.name)}"></div><div class="p-field"><span class="p-label">参与角色 · 至少两位</span>${available.map(c=>`<label class="p-choice"><input type="checkbox" name="room-edit-member" value="${c.id}" ${room.members.includes(c.id)?'checked':''}>${avatar(c,28)}<span class="p-choice-main">${esc(c.name)}</span></label>`).join('')}</div><div class="p-field"><span class="p-label">静音 · 不参与发言</span>${available.filter(c=>room.members.includes(c.id)).map(c=>`<label class="p-choice"><input type="checkbox" name="room-edit-mute" value="${c.id}" ${(room.muted||[]).includes(c.id)?'checked':''}>${avatar(c,28)}<span class="p-choice-main">${esc(c.name)}<span class="p-choice-sub">勾选后 @ 也不会点名</span></span></label>`).join('')}</div><div class="p-field"><label class="p-label" for="room-strategy">发言策略</label><select class="p-select" id="room-strategy">${Object.entries(labels).map(([value,label])=>`<option value="${value}" ${value===room.strategy?'selected':''}>${label}</option>`).join('')}</select><p class="p-small">任意策略下都可以在输入里 @角色名 直接点名（静音成员除外）。</p></div><div class="p-field"><label class="p-label" for="room-settings-speaker">指定模式的默认角色</label><select class="p-select" id="room-settings-speaker">${room.members.filter(id=>!(room.muted||[]).includes(id)).map(id=>`<option value="${id}" ${id===room.speakerId?'selected':''}>${esc(roomCharacter(room,id).name)}</option>`).join('')}</select></div><div class="p-field"><label class="p-choice"><input type="checkbox" id="room-auto-mode" ${room.autoMode?'checked':''}><span class="p-choice-main">自动推进<span class="p-choice-sub">首轮回应后，按顺序再让最多两位成员接话</span></span></label></div><p class="p-small">成员变化只影响后续。移出的角色仍保留历史署名与快照。回复为本地模板模拟；“全员回应”不是自主讨论，不调用真实模型。</p><div class="p-form-error" id="room-edit-error" hidden>填写故事名称；至少两位成员、至少一位未静音；指定的角色必须在成员中且未静音。</div><button class="p-btn" id="room-dialog-export-txt" type="button">导出 txt（阅读用）</button><button class="p-btn" id="room-dialog-export" type="button">导出房间记录</button>`,confirmText:'保存房间设定',onConfirm:(overlay,close)=>{
            const members=$$('input[name="room-edit-member"]',overlay).filter(input=>input.checked).map(input=>input.value);
            const muted=$$('input[name="room-edit-mute"]',overlay).filter(input=>input.checked).map(input=>input.value);
            if (!saveRoomConfiguration(room,{name:$('#room-edit-name',overlay).value,members,muted,autoMode:$('#room-auto-mode',overlay)?.checked,strategy:$('#room-strategy',overlay).value,speakerId:$('#room-settings-speaker',overlay).value})) { $('#room-edit-error',overlay).hidden=false;return false; }
            close();
            if ($('#room-message-input')) renderRoomChat(room.chatId); else if (current==='rooms.html') renderRooms();
            toast('房间设定已保存；历史消息未改动');
        }});
        $('#room-dialog-export',dialog.overlay).addEventListener('click',()=>exportRoom(room));
        $('#room-dialog-export-txt',dialog.overlay).addEventListener('click',()=>exportRoomTxt(room));
    }

    let creatorDirty = false;

    function creatorPublicPreview(values) {
        const tags = [values.category,...(values.tags || [])].filter(Boolean);
        return `<div class="creator-preview-player p-create-preview-body"><h3 class="p-create-preview-name">${esc(values.name.trim() || '未命名角色')}</h3><p class="p-create-preview-hook">${esc(values.hook || '公开简介会显示在这里。')}</p><div class="creator-preview-tags">${tags.map(tag=>`<span class="p-pill p-pill--sm p-pill--outline">${esc(tag)}</span>`).join('')}</div>${values.nsfw?'<p class="p-small">已标记为需主动确认的内容 · 不会公开到广场</p>':''}<h4>人物与关系</h4><p>${esc(values.personality || '补充角色的公开性格与人物关系。')}</p><h4>故事场景</h4><p>${esc(values.scenario || '补充玩家进入故事时的场景。')}</p><h4>第一幕</h4><p class="p-create-preview-greeting">${esc(values.greeting || '角色的第一段话会出现在这里。')}</p>${(values.alternateGreetings || []).filter(text=>text.trim()).map((text,index)=>`<h4>备用开场 ${index+1}</h4><p>${esc(text)}</p>`).join('')}<p class="p-small">玩家身份：${esc(getPersona(selectedPersona).name)} · 私人试聊只生成本地模拟回复</p></div>`;
    }

    function renderCreate() {
        const params = new URLSearchParams(location.search);
        if (params.get('tab') === 'works') { renderCreateWorks(); return; }
        const requested = params.get('edit');
        let work = creatorWorks.find(item => item.id === requested) || (requested === '1' ? creatorWorks[0] : null);
        if (requested && !work) {
            $('#app').innerHTML = `${title('找不到这份本地草稿','没有跳转到其他角色，也没有覆盖任何存档。','<a class="p-btn" href="create.html?tab=works">返回作品管理</a>')}`;
            return;
        }
        const editing = Boolean(work);
        const workId = work?.id || resourceId('created');
        $('#app').innerHTML=`${title(editing?'编辑角色':'创建角色','把一个人物、一段关系和一个世界，写成可以进入的故事。','<a class="p-btn" href="create.html?tab=works">我的作品</a><button class="p-btn" id="create-preview">预览玩家视角</button>')}
            <form id="character-form" class="p-create-layout" novalidate><div class="p-create-main"><section class="p-card p-card--pad"><h2 class="p-form-section-title">公开展示</h2><p class="p-small creator-section-hint">名称、剧情简介与分类标签是玩家看见的内容；先写清这是谁、为什么值得进入故事。</p><div class="p-create-media"><div class="p-create-avatar-wrap"><div class="p-cover p-create-avatar" style="--h:212" data-initial="新" id="create-cover"><img id="create-avatar-img" alt="" hidden></div><button class="p-btn p-btn--sm" type="button" id="create-avatar-button">更换形象</button><button class="p-text-btn" type="button" id="create-avatar-reset" hidden>恢复默认</button><input type="file" id="create-avatar-file" accept="image/png,image/jpeg,image/webp" hidden></div><div class="p-field"><label class="p-label" for="create-name">角色名称</label><input class="p-input" id="create-name" name="name" required maxlength="32" placeholder="例如：沈砚之" value="${esc(work?.name || '')}"><span class="p-hint">让玩家第一眼认出这个角色。</span></div></div><div class="p-field"><label class="p-label" for="create-cover-file">角色封面</label><div class="p-create-cover-wrap"><div class="p-cover p-create-cover" style="--h:212" data-initial="封面" id="create-cover-banner"><img id="create-banner-img" alt="" hidden></div><div class="p-create-cover-actions"><button class="p-btn p-btn--sm" type="button" id="create-cover-button">更换封面</button><button class="p-text-btn" type="button" id="create-cover-reset" hidden>恢复默认</button><span class="p-hint">PNG/JPG/WebP，最大 10 MB；图片仅本页预览，文本存档不含图片</span></div></div><input type="file" id="create-cover-file" accept="image/png,image/jpeg,image/webp" hidden></div><div class="p-field"><label class="p-label" for="create-hook">一句话剧情钩子</label><input class="p-input" id="create-hook" name="hook" required maxlength="90" placeholder="他记得所有人，却唯独忘了你。" value="${esc(work?.hook || '')}"></div><div class="p-field"><label class="p-label" for="create-greeting">开场白</label><textarea class="p-textarea" id="create-greeting" name="greeting" required placeholder="用动作、场景和一句对白，把玩家带进故事。">${esc(work?.greeting || '')}</textarea><span class="p-hint">这是玩家看到的第一条消息，不是隐藏提示词。</span></div></section><section class="p-card p-card--pad"><h2 class="p-form-section-title">角色行为</h2><p class="p-small creator-section-hint">公开人物关系与私有生成设定分开保存；私有指令不会出现在玩家预览中。</p><div class="p-field"><label class="p-label" for="create-personality">公开性格与人物关系</label><textarea class="p-textarea" id="create-personality" placeholder="他怎样说话，怎样对待玩家，在意什么？">${esc(work?.personality || '')}</textarea><span class="p-hint">公开字段 · 玩家可在详情页看到</span></div><div class="p-field"><label class="p-label" for="create-scenario">公开场景</label><textarea class="p-textarea" id="create-scenario" placeholder="故事发生在哪里？当前正在发生什么？"></textarea><span class="p-hint">公开字段 · 用剧情吸引玩家，而不是罗列模型指令</span></div><div class="p-field"><label class="p-label" for="create-instructions">私有生成设定</label><textarea class="p-textarea" id="create-instructions" placeholder="保持角色语气、不替玩家行动、避免重复……"></textarea><span class="p-hint">私有字段 · 不会出现在公开详情、评论或分享预览中</span></div><details class="p-lore-advanced" id="create-card-fields"><summary>角色卡高级字段（与 SillyTavern 角色卡一一对应）</summary><div class="p-field"><label class="p-label" for="create-cardDescription">角色描述（description）</label><textarea class="p-textarea" id="create-cardDescription" placeholder="外貌、背景、说话方式……ST 里最主要的设定字段"></textarea></div><div class="p-field"><label class="p-label" for="create-mesExample">对话示例（mes_example）</label><textarea class="p-textarea" id="create-mesExample" placeholder="<START>&#10;{{user}}：你好。&#10;{{char}}：……"></textarea><span class="p-hint">每段以 &lt;START&gt; 开头；进入「对话示例」提示块</span></div><div class="p-field"><label class="p-label" for="create-systemPrompt">角色系统提示（system_prompt）</label><textarea class="p-textarea" id="create-systemPrompt" placeholder="留空则使用预设的系统提示；可写 {{original}} 引用预设原文"></textarea></div><div class="p-field"><label class="p-label" for="create-postHistory">历史后指令（post_history_instructions）</label><textarea class="p-textarea" id="create-postHistory" placeholder="留空则使用预设的后置提示；可写 {{original}}"></textarea></div><div class="p-field"><label class="p-label" for="create-depthText">角色深度提示（depth_prompt）</label><textarea class="p-textarea" id="create-depthText" placeholder="插入到倒数第 N 条消息之前，常用于持续提醒角色状态"></textarea><div class="p-lore-grid"><div><label class="p-label" for="create-depthDepth">深度</label><input class="p-input" id="create-depthDepth" type="number" min="0" max="999" value="4"></div><div><label class="p-label" for="create-depthRole">身份</label><select class="p-select" id="create-depthRole"><option value="system">系统</option><option value="user">玩家</option><option value="assistant">角色</option></select></div></div></div><div class="p-field"><label class="p-label" for="create-creatorNotes">作者备注（creator_notes）</label><textarea class="p-textarea" id="create-creatorNotes" placeholder="给使用者看的说明，不进入上下文"></textarea></div><div class="p-field" id="create-regex-field"></div></details></section></div><aside class="p-create-side"><section class="p-card p-card--pad"><h2 class="p-form-section-title">玩家视角 · 实时预览</h2><p class="p-small">仅展示公开内容，不含私有生成设定。图片只在本页预览，不写入存档。</p><div id="creator-live-preview" class="p-create-preview" aria-live="polite"></div></section><section class="p-card p-card--pad"><h2 class="p-form-section-title">作品信息</h2><div class="p-field"><label class="p-label" for="create-category">题材</label><select class="p-select" id="create-category"><option>现代</option><option>悬疑</option><option>奇幻</option><option>治愈</option></select></div><div class="p-field"><label class="p-label" for="create-tags">标签</label><input class="p-input" id="create-tags" placeholder="慢热、群像、久别重逢"><span class="p-hint">用逗号分隔，最多 5 个</span></div><label class="p-check"><input type="checkbox" id="create-nsfw"><span>包含成人向内容<span class="p-small">开启后默认不会出现在普通推荐中，需要玩家主动确认显示。</span></span></label></section><section class="p-card p-card--pad"><h2 class="p-form-section-title">场景与开场</h2><p class="p-small creator-section-hint">主开场是第一条消息，公开场景说明人物所处的环境。给玩家另一种进入故事的方式。选择备用开场会创建新会话，不会覆盖旧剧情。</p><button class="p-btn p-btn--block" type="button" id="add-greeting">${icon('create')}添加备用开场</button><div id="alternate-greetings"></div></section><section class="p-card p-card--pad"><h2 class="p-form-section-title">私人试聊</h2><p class="p-small">仅在本浏览器标签页保存文本，关闭标签页可能丢失。未填完也可存档；图片仅当前页预览。试聊为本地模拟，不调用模型、不扣点。投稿仅保存模拟审核状态，不会公开到广场。</p><p class="p-small" id="create-save-status" role="status">${work?'已载入本地草稿':'尚未保存'}</p><button class="p-btn p-btn--primary p-btn--block" type="submit">保存草稿</button><button class="p-btn p-btn--block" type="button" id="create-test-chat" style="margin-top:8px">保存并私人试聊</button><button class="p-btn p-btn--block" type="button" id="publish-character" style="margin-top:8px">本地模拟审核</button><div class="p-form-error" id="create-error" role="alert" hidden></div></section></aside></form>`;
        for (const [field,key] of [['scenario','scenario'],['instructions','instructions'],['category','category'],['tags','tags']]) {
            $(`#create-${field}`).value = key === 'tags' ? (work?.tags || []).join('、') : work?.[key] || (key === 'category' ? '现代' : '');
        }
        $('#create-nsfw').checked = Boolean(work?.nsfw);
        for (const field of ['cardDescription','mesExample','systemPrompt','postHistory','creatorNotes']) $(`#create-${field}`).value = work?.[field] || '';
        $('#create-depthText').value = work?.depthPrompt?.text || '';
        $('#create-depthDepth').value = String(work?.depthPrompt?.depth ?? 4);
        $('#create-depthRole').value = work?.depthPrompt?.role || 'system';
        if (['cardDescription','mesExample','systemPrompt','postHistory','creatorNotes'].some(field => work?.[field]) || work?.depthPrompt?.text || work?.regexScripts?.length) $('#create-card-fields').open = true;
        // 卡内正则：ST 要求逐卡授权后才运行，这里同样默认关闭、明确列出将要运行的规则。
        const regexField = $('#create-regex-field');
        const scripts = work?.regexScripts || [];
        regexField.innerHTML = scripts.length ? `<p class="p-label">卡内正则（${scripts.length} 条）</p><label class="p-check"><input type="checkbox" id="create-regexAllowed" ${work && cardRegexAllowed(work) ? 'checked' : ''}><span>允许这张卡的正则在对话中运行<span class="p-small">与 SillyTavern 一样需要逐卡授权；替换结果仍按纯文本显示</span></span></label><ul class="p-small">${scripts.map(rule => `<li>${esc(rule.name)} · ${esc(regexSummary(rule))}</li>`).join('')}</ul>` : '<p class="p-small">这张卡没有内置正则。导入带 regex_scripts 的 ST 角色卡后会列在这里。</p>';
        // 授权是用户设置、立即保存，不属于草稿内容：表单的「有未保存修改」监听会跳过它。
        $('#create-regexAllowed')?.addEventListener('change',event => {
            if (!work) return;
            if (!setCardRegexAllowed(work.id,event.target.checked)) { event.target.checked = !event.target.checked; return; }
            toast(event.target.checked ? '已允许这张卡的正则运行（所有会话生效）' : '已停止运行这张卡的正则');
        });
        $('#create-cover').dataset.initial = Array.from(work?.name || '')[0] || '新';
        const addGreeting = (text = '') => {
            const field = document.createElement('div');
            field.className = 'p-field';
            field.style.marginTop = '12px';
            field.innerHTML = '<textarea class="p-textarea" aria-label="备用开场白" placeholder="另一种场景或进入故事的方式"></textarea>';
            $('textarea',field).value = text;
            $('#alternate-greetings').appendChild(field);
        };
        (work?.alternateGreetings || []).forEach(addGreeting);
        creatorDirty = false;
        const updatePreview = () => { $('#creator-live-preview').innerHTML = creatorPublicPreview(readCreateForm()); };
        const markDirty = () => { creatorDirty=true; $('#create-save-status').textContent='有未保存的修改；离开前请保存草稿'; updatePreview(); };
        updatePreview();
        const save = (publish = false) => {
            const savedWork = saveCreatorWork(workId,readCreateForm(),publish);
            if (!savedWork) { creatorDirty=true; $('#create-save-status').textContent = '保存失败；请保留本页内容并重试'; return null; }
            work = savedWork;
            creatorDirty = false;
            // 保存成功后刷新仍打开当前草稿，不回退到示例角色。
            history.replaceState(null,'',`create.html?edit=${work.id}`);
            $('#create-save-status').textContent = `本地文本已保存 · ${work.name || '未命名角色'} · 修订 ${work.revision}${work.status==='pending'?' · 本地模拟审核（未发送到服务端）':''}`;
            $('#create-error').hidden = true;
            return work;
        };
        $('#character-form').addEventListener('submit',event => {
            event.preventDefault();
            if (save()) toast('角色文本草稿已保存到本标签页，图片仅本页预览');
        });
        $('#character-form').addEventListener('input',event => { if (event.target.id !== 'create-regexAllowed') markDirty(); });
        $('#character-form').addEventListener('change',event => { if (event.target.type !== 'file' && event.target.id !== 'create-regexAllowed') markDirty(); });
        $('#create-test-chat').addEventListener('click',() => {
            if (!validateCreate() || !save()) return;
            selectedOpening = 'default';
            newStory(work.id);
        });
        $('#create-name').addEventListener('input',()=>{$('#create-cover').dataset.initial=Array.from($('#create-name').value.trim())[0]||'新';});
        const bindImageUpload = (buttonId, inputId, imageId, resetId, targetId) => {
            const input = $(inputId);
            const image = $(imageId);
            const target = $(targetId);
            const reset = $(resetId);
            let objectUrl = '';
            const clear = () => {
                if (objectUrl) URL.revokeObjectURL(objectUrl);
                objectUrl = '';
                image.removeAttribute('src');
                image.hidden = true;
                target.classList.remove('has-image');
                reset.hidden = true;
            };
            $(buttonId).addEventListener('click', () => input.click());
            input.addEventListener('change', () => {
                const file = input.files?.[0];
                if (!file) return;
                if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
                    input.value = '';
                    toast('请选择 10 MB 以内的 PNG、JPG 或 WebP 图片', 'err');
                    return;
                }
                if (objectUrl) URL.revokeObjectURL(objectUrl);
                objectUrl = URL.createObjectURL(file);
                image.src = objectUrl;
                image.hidden = false;
                target.classList.add('has-image');
                reset.hidden = false;
                toast('仅更新本页图片预览；图片存档尚未实现');
            });
            reset.addEventListener('click', () => {
                clear();
                input.value = '';
                toast('已恢复默认形象');
            });
        };
        bindImageUpload('#create-avatar-button', '#create-avatar-file', '#create-avatar-img', '#create-avatar-reset', '#create-cover');
        bindImageUpload('#create-cover-button', '#create-cover-file', '#create-banner-img', '#create-cover-reset', '#create-cover-banner');
        $('#add-greeting').addEventListener('click',() => { addGreeting(); markDirty(); });
        $('#create-preview').addEventListener('click',()=>openModal({title:'玩家视角预览',wide:true,body:`<div class="p-notice">${icon('eye')}<div class="p-notice-main">这里只展示公开字段，私有生成设定不会出现。当前未发布。</div></div>${creatorPublicPreview(readCreateForm())}`,confirmText:'返回编辑',cancelText:'关闭',onConfirm:(_,close)=>close()}));
        $('#publish-character').addEventListener('click',() => {
            if (!validateCreate()) return;
            openModal({title:'本地模拟审核',body:`<p>只保存“本地模拟审核”状态和本次修订号。没有发送到服务端、没有管理员受理，不会展示到广场；真实发布与审核尚未实现。</p><label class="p-check"><input type="checkbox" id="publish-agree">我理解这是本地演示，并确认公开字段不含未授权内容</label><div class="p-form-error" id="publish-error" hidden>请先勾选确认。</div>`,confirmText:'保存模拟审核状态',onConfirm:(overlay,close) => {
                if (!$('#publish-agree',overlay).checked) { $('#publish-error',overlay).hidden = false; return false; }
                if (!save(true)) return false;
                close();
                toast('本地模拟审核状态已保存；未发送到服务端');
            }});
        });
    }

    function openWorkVersions(work) {
        const versions = [...(work.versions || [])].reverse();
        const dialog = openModal({title:`版本历史 · ${work.name}`,wide:true,confirmText:'完成',cancelText:'关闭',onConfirm:(_,close)=>close(),body: versions.length
            ? `<p class="p-small">每次保存都会留下上一版快照（最多 5 版）。恢复会以新的版本号写入，恢复前也会先存一份当前版本。</p><div class="p-choice-list">${versions.map(version => `<div class="p-choice"><span class="p-choice-main"><span class="p-choice-title">v${version.revision} · ${esc(version.name || '未命名角色')}</span><span class="p-choice-sub">${new Date(version.at).toLocaleString('zh-CN')} · ${esc(String(version.hook || '无钩子').slice(0,32))}</span></span><button class="p-btn p-btn--sm" type="button" data-restore-version="${version.revision}">恢复</button></div>`).join('')}</div>`
            : '<p>还没有历史版本。保存草稿后会自动留下上一版，最多保留 5 版。</p>'});
        $$('[data-restore-version]',dialog.overlay).forEach(button => button.addEventListener('click', () => {
            const version = (work.versions || []).find(item => String(item.revision) === button.dataset.restoreVersion);
            if (!version) return;
            confirmAction('恢复这个版本？',`「${work.name}」将回到 v${version.revision} 的内容（${new Date(version.at).toLocaleString('zh-CN')}）。恢复会写成新版本，当前内容会先存为历史。`,'恢复',() => {
                if (!saveCreatorWork(work.id,{name:version.name,hook:version.hook,greeting:version.greeting,personality:version.personality,scenario:version.scenario,instructions:version.instructions,cardDescription:version.cardDescription,tags:version.tags,category:version.category,nsfw:version.nsfw})) return;
                dialog.close();
                renderCreateWorks();
                toast(`已恢复到 v${version.revision}；当前内容已存为历史`);
            });
        }));
    }

    function renderCreateWorks() {
        const labels = {draft:'私人草稿',pending:'本地模拟审核',published:'本地发布示例',rejected:'本地未通过示例'};
        const works = [
            ...creatorWorks.map(work => ({...work,name:work.name || '未命名角色',statusLabel:labels[work.status],cover:work.initial,
                updated:work.updated ? new Date(work.updated).toLocaleString('zh-CN') : '本地记录',
                note:`仅本标签页 · 修订 ${work.revision}${work.review ? ` · 模拟送审修订 ${work.review.revision}（未发送到服务端）` : ''}`})),
            // Read-only examples retain the status/version interactions, never pretending to be user resources.
            {id:'w2',name:'雨夜便利店',example:true,status:'pending',statusLabel:'审核中 · 示例',updated:'演示数据',note:'只读示例，没有管理员受理',cover:'雨',hue:160},
            {id:'w3',name:'星港列车长',example:true,status:'published',statusLabel:'已发布 · 示例',updated:'演示数据',note:'只读版本示例，不代表真实发布',cover:'星',hue:280},
            {id:'w4',name:'旧梦邮局',example:true,status:'rejected',statusLabel:'未通过 · 示例',updated:'演示数据',note:'示例拒绝原因：开场白包含未说明的成人向内容',cover:'旧',hue:200},
        ];
        let filter = 'all';
        $('#app').innerHTML = `${title('我的作品','当前标签页的私人文本草稿与本地模拟状态；无真实发布。','<a class="p-btn p-btn--primary" href="create.html">创建角色</a>')}
            <div class="p-filterbar"><div class="p-tabs" role="tablist" aria-label="作品状态"><button data-creator-filter="all" aria-selected="true">全部 ${works.length}</button>${Object.entries(labels).map(([status,label])=>`<button data-creator-filter="${status}" aria-selected="false">${label} ${works.filter(work=>work.status===status).length}</button>`).join('')}</div></div>
            <div class="p-card p-rows" id="creator-works"></div>
            <div class="p-notice" style="margin-top:20px">${icon('info')}<div class="p-notice-main"><div class="p-notice-title">本地演示边界</div><div>只读示例不是你的作品。私人试聊保留自己的角色 ID 和已发生的消息；完整角色版本冻结、真实审核发布与图片存档尚未实现。</div></div></div>`;
        const draw = () => {
            const rows = works.filter(work => filter === 'all' || work.status === filter);
            $('#creator-works').innerHTML = rows.length ? rows.map(work => `<div class="p-library-row">${cover({name:work.name,initial:work.cover,hue:work.hue},'p-library-cover')}<div class="p-library-main"><div class="p-library-name">${esc(work.name)}</div><div class="p-library-sub">${esc(work.note)} · ${esc(work.updated)}</div></div><div class="p-library-actions"><span class="p-pill p-pill--sm ${work.status==='published'?'p-pill--ok':work.status==='rejected'?'p-pill--danger':work.status==='pending'?'p-pill--warn':'p-pill--outline'}">${work.statusLabel}</span>${!work.example?`<a class="p-btn p-btn--sm" href="create.html?edit=${work.id}">继续编辑</a><button class="p-btn p-btn--sm" data-work-test="${work.id}">私人试聊</button><button class="p-btn p-btn--sm" data-work-export="${work.id}">导出卡</button>`:''}${work.status==='pending'?`<button class="p-btn p-btn--sm" data-work-status="${work.id}">查看本地状态</button>`:''}${!work.example&&(work.versions||[]).length?`<button class="p-btn p-btn--sm" data-work-history="${work.id}">版本历史 ${work.versions.length}</button>`:''}${!work.example?`<button class="p-btn p-btn--sm p-btn--icon" data-work-del="${work.id}" aria-label="删除作品 ${esc(work.name)}">${icon('trash')}</button>`:work.status==='published'?`<button class="p-btn p-btn--sm" data-work-version="${work.id}">版本示例</button>`:work.status==='rejected'?`<button class="p-btn p-btn--sm" data-work-status="${work.id}">查看原因示例</button>`:''}</div></div>`).join('') : `<div class="p-empty"><div class="p-empty-title">这个分类还没有作品</div><p class="p-empty-text">先去创建一个人物，再决定是否发布到广场。</p></div>`;
        };
        $$('[data-creator-filter]').forEach(button => button.addEventListener('click', () => {
            filter = button.dataset.creatorFilter;
            $$('[data-creator-filter]').forEach(item => item.setAttribute('aria-selected', String(item === button)));
            draw();
        }));
        draw();
        $('#creator-works').addEventListener('click', event => {
            const button = event.target.closest('[data-work-test]');
            if (!button || !event.currentTarget.contains(button)) return;
            const work = creatorWorks.find(item => item.id === button.dataset.workTest);
            if (!work) return;
            selectedOpening = 'default';
            newStory(work.id);
        });
        $('#creator-works').addEventListener('click', event => {
            const button = event.target.closest('[data-work-export]');
            if (!button || !event.currentTarget.contains(button)) return;
            const work = creatorWorks.find(item => item.id === button.dataset.workExport);
            if (work) openCardExport(work);
        });
        $('#creator-works').addEventListener('click', event => {
            const button = event.target.closest('[data-work-status]');
            if (!button || !event.currentTarget.contains(button)) return;
            const work = works.find(item => item.id === button.dataset.workStatus);
            if (!work) return;
            openModal({title:work.name,body:`<p><strong>${esc(work.statusLabel)}</strong></p><p>${esc(work.note)}</p><p class="p-small">${work.example?'这是只读界面示例，不代表真实审核、发布或拒绝。':'这是已保存的本地模拟审核状态；没有发送到服务端，没有管理员受理，也不会公开到广场。'}</p>`,confirmText:'知道了',cancelText:'关闭',onConfirm:(_,close)=>close()});
        });
        $('#creator-works').addEventListener('click', event => {
            const button = event.target.closest('[data-work-history]');
            if (!button || !event.currentTarget.contains(button)) return;
            const work = creatorWorks.find(item => item.id === button.dataset.workHistory);
            if (work) openWorkVersions(work);
        });
        $('#creator-works').addEventListener('click', event => {
            const button = event.target.closest('[data-work-del]');
            if (!button || !event.currentTarget.contains(button)) return;
            const work = creatorWorks.find(item => item.id === button.dataset.workDel);
            if (!work) return;
            confirmAction('删除这个作品？',`「${work.name}」将从本地草稿移除，不影响已开始的会话。`,'删除',()=>{
                const index = creatorWorks.indexOf(work);
                if (index < 0) return;
                creatorWorks.splice(index, 1);
                if (!saveState()) { creatorWorks.splice(index, 0, work); return; }
                toast('作品已删除');
                renderCreateWorks();
            });
        });
        $('#creator-works').addEventListener('click', event => {
            const button = event.target.closest('[data-work-version]');
            if (!button || !event.currentTarget.contains(button)) return;
            const work = works.find(item => item.id === button.dataset.workVersion);
            if (!work) return;
            openModal({title:`版本记录 · ${work.name}`,body:`<p>只读版本界面示例：v1 首次发布 → v2 更新 → v3 草稿。</p><p class="p-small">这些不是实际的审核或发布记录。真实版本发布、会话角色快照冻结和更新差异尚未实现。</p>`,confirmText:'完成',cancelText:'关闭',onConfirm:(_,close)=>close()});
        });
    }

    function readCreateForm() {
        const values = {};
        for (const field of ['name','hook','greeting','personality','scenario','instructions','category']) values[field] = $(`#create-${field}`).value;
        values.nsfw = $('#create-nsfw').checked;
        values.tags = $('#create-tags').value.split(/[,，、]/).map(tag => tag.trim()).filter(Boolean).slice(0,5);
        values.alternateGreetings = $$('textarea',$('#alternate-greetings')).map(input => input.value);
        for (const field of ['cardDescription','mesExample','systemPrompt','postHistory','creatorNotes']) if ($(`#create-${field}`)) values[field] = $(`#create-${field}`).value;
        if ($('#create-depthText')) values.depthPrompt = {text:$('#create-depthText').value,depth:Number($('#create-depthDepth').value),role:$('#create-depthRole').value};
        return values;
    }

    function validateCreate() {
        const required=[['#create-name','请填写角色名称'],['#create-hook','请写一句剧情钩子'],['#create-greeting','请填写开场白']];
        for(const [selector,message] of required){if(!$(selector).value.trim()){$(selector).focus();$('#create-error').textContent=message;$('#create-error').hidden=false;return false;}}
        $('#create-error').hidden=true;return true;
    }

    // 自动摘要（本地抽取式）：把「最近消息」块之前的旧对话压成一行一条的梗概。
    // 不是模型总结——原型不调用模型；真实代码接 summarize 扩展时保持同样的覆盖/触发语义。
    function summaryPrefs(chat) {
        const prefs = plainRecord(chat.summaryPrefs) ? chat.summaryPrefs : {};
        const interval = Number.isFinite(prefs.interval) && prefs.interval >= 4 && prefs.interval <= 40 ? prefs.interval : 12;
        return {enabled: prefs.enabled !== false, interval};
    }

    function generateAutoSummary(chat, upTo) {
        const start = Math.max(0, upTo - 40);
        const lines = [];
        const character = chatCharacter(chat);
        for (let index = start; index < upTo; index += 1) {
            const message = chat.messages[index];
            if (!message || message.role === 'system' || message.hidden) continue;
            const who = message.role === 'user' ? '你' : character.name;
            const first = String(message.text || '').split('\n').map(line => line.trim()).find(Boolean) || '';
            if (!first) continue;
            lines.push(`${who}：${first.length > 38 ? `${first.slice(0,36)}…` : first}`);
        }
        if (!lines.length) return '';
        return `【本地抽取式摘要 · 非模型总结】\n${lines.slice(-30).join('\n')}`;
    }

    function updateAutoSummary(chat, force = false) {
        const prefs = summaryPrefs(chat);
        const summary = plainRecord(chat.summary) ? chat.summary : {text:'',covered:0};
        const covered = Math.min(summary.covered || 0, chat.messages.length);
        // 「最近消息」默认展示最后 8 条：摘要只覆盖它们之前的部分
        if (!force && (!prefs.enabled || chat.messages.length - 8 - covered < prefs.interval)) return false;
        const upTo = Math.max(0, chat.messages.length - 8);
        const text = generateAutoSummary(chat, upTo);
        const previous = {...summary};
        chat.summary = {text,covered:upTo,source:'auto',updatedAt:Date.now()};
        if (!saveState()) { chat.summary = previous; return false; }
        return true;
    }

    // 记忆检索（ST 的 vectors/Data Bank 的本地近似）：不调用 embedding 模型，
    // 用中文字符 bigram 重叠做相似度，从「最近消息」之前的历史里挑最相关的片段注入上下文。
    // 真实代码换成向量检索时，只要保持「查询 = 最新玩家输入、返回 topK 片段」的接口即可。
    function ragPrefs(chat) {
        const prefs = plainRecord(chat.ragPrefs) ? chat.ragPrefs : {};
        const topK = Number.isFinite(prefs.topK) && prefs.topK >= 1 && prefs.topK <= 5 ? prefs.topK : 3;
        return {enabled: prefs.enabled !== false, topK};
    }

    function ragBigrams(text) {
        const clean = String(text || '').toLowerCase().replace(/\s+/g,'');
        const grams = new Set();
        for (let index = 0; index < clean.length - 1; index += 1) grams.add(clean.slice(index, index + 2));
        return grams;
    }

    function ragChunks(chat, query, topK = 3) {
        const grams = ragBigrams(query);
        if (!grams.size) return [];
        const scored = [];
        chat.messages.forEach((message, index) => {
            if (message.hidden || message.role === 'system') return;
            // 最近 8 条已经在「最近消息」块里，不再重复检索
            if (index >= chat.messages.length - 8) return;
            const content = String(message.text || '').toLowerCase().replace(/\s+/g,'');
            if (!content) return;
            let hits = 0;
            for (const gram of grams) if (content.includes(gram)) hits += 1;
            if (hits < 2) return;
            const score = hits / Math.sqrt(grams.size * Math.max(content.length, 1));
            scored.push({index, score, hits, role: message.role, text: message.text});
        });
        return scored.sort((a, b) => b.score - a.score).slice(0, topK);
    }

    function summaryStatus(chat) {
        const prefs = summaryPrefs(chat);
        const summary = plainRecord(chat.summary) ? chat.summary : {text:'',covered:0};
        const covered = Math.min(summary.covered || 0, chat.messages.length);
        return {enabled:prefs.enabled, interval:prefs.interval, covered,
            behind: Math.max(0, chat.messages.length - 8 - covered),
            text: textValue(summary.text), source: summary.source || 'auto'};
    }

    function chatFontScale() {
        const value = Number(stateExtras.preferences?.chatFontScale);
        return Number.isFinite(value) && value >= .85 && value <= 1.2 ? value : 1;
    }

    function applyChatFontScale() {
        document.documentElement.style.setProperty('--rp-font-scale',String(chatFontScale()));
    }

    function saveLocalPreference(section, key, value) {
        const previous = stateExtras;
        stateExtras = {...stateExtras,[section]:{...(plainRecord(stateExtras[section])?stateExtras[section]:{}),[key]:value}};
        if (!saveState()) { stateExtras=previous; return false; }
        return true;
    }

    function renderSettings() {
        const nickname = textValue(stateExtras.profile?.nickname,'林见白');
        const fontPercent = Math.round(chatFontScale()*100);
        $('#app').innerHTML=`${title('我的','账号、身份、点数和故事偏好。')}<div class="p-settings"><nav class="p-toc" aria-label="设置目录"><a href="#account" class="is-active">账号</a><a href="#points">点数与充值</a><a href="#appearance">聊天外观</a><a href="#identities">我的身份</a><a href="#characters">角色库</a><a href="#security">安全与隐私</a><a href="#import">导入与数据</a></nav><div class="p-settings-main"><section class="p-section" id="account"><h2>账号</h2><p>昵称仅保存到当前标签页的本地资料，不会修改真实账号、历史评论或作品署名。</p><div class="p-card p-card--pad"><div class="p-acct">${avatar({initial:Array.from(nickname)[0] || '我',hue:28},64)}<div class="p-acct-id"><strong id="local-profile-name">${esc(nickname)}</strong><span>本地资料 · 未连接真实账号服务</span></div><button class="p-btn p-btn--sm" id="change-password">修改密码</button></div><div class="p-field" style="margin-top:20px"><label class="p-label" for="nickname">昵称</label><input class="p-input" id="nickname" maxlength="40" value="${esc(nickname)}"></div><div class="p-acct-actions"><button class="p-btn" id="save-account">保存修改</button></div></div></section><section class="p-section" id="points"><h2>点数与充值</h2><p>余额与账单仅为静态演示。当前聊天不调用模型、不扣点，充值与卡密未实现。</p><div class="p-card p-card--pad"><div class="p-balance-label">剩余点数</div><div class="p-balance-num p-num">${pointsAccount.balance.toLocaleString()}</div><div class="p-balance-sub">已使用 ${pointsAccount.used.toLocaleString()} 点 · ${esc(pointsAccount.rate)}</div><hr class="p-div"><div class="p-amounts"><button class="p-amount" data-amount="10"><span class="p-amount-cny">¥10</span><span class="p-amount-pts">1,000 点</span></button><button class="p-amount p-amount--rec" data-amount="30"><span class="p-amount-cny">¥30</span><span class="p-amount-pts">3,000 点</span></button><button class="p-amount" data-amount="100"><span class="p-amount-cny">¥100</span><span class="p-amount-pts">10,000 点</span></button></div><div class="p-inline"><input class="p-input" inputmode="decimal" placeholder="自定义金额 ¥" aria-label="自定义充值金额"><button class="p-btn p-btn--primary" id="pay-start">去支付</button></div><div id="pay-status" class="p-small" aria-live="polite"></div><hr class="p-div"><div class="p-inline"><input class="p-input" placeholder="演示：请勿输入真实卡密" aria-label="卡密兑换未实现" id="card-key"><button class="p-btn" id="redeem">兑换说明（未实现）</button></div><button class="p-text-btn" id="billing-history">查看点数记录</button></div></section><section class="p-section" id="appearance"><h2>聊天外观</h2><p>只影响你的阅读体验，不改变其他玩家。</p><div class="p-card p-card--pad"><div class="p-label-row"><span class="p-label">字号</span><span class="p-range-val" id="font-value">${fontPercent}%</span></div><input class="p-range" type="range" min="85" max="120" step="5" value="${fontPercent}" aria-label="聊天字号" id="font-range"><div class="p-label-row" style="margin-top:20px"><span class="p-label">背景</span></div><div class="p-swatches"><button class="p-swatch-wrap is-active" data-swatch="default" aria-pressed="true"><span class="p-swatch p-swatch--default"></span><span class="p-swatch-name">默认</span></button><button class="p-swatch-wrap" data-swatch="warm" aria-pressed="false"><span class="p-swatch p-swatch--warm"></span><span class="p-swatch-name">暖灰</span></button></div></div></section><section class="p-section" id="identities"><h2>我的身份</h2><p>身份可保存到本标签页，并在详情或会话里选择。当前回复为本地模拟，尚未将设定接入真实模型。</p><div class="p-card p-rows">${personas.map(p=>`<div class="p-row">${avatar(p,40)}<div class="p-row-main"><div class="p-row-title">${esc(p.name)}</div><div class="p-row-sub">${esc(p.description)}</div></div><button class="p-btn p-btn--sm" data-edit-persona="${p.id}">编辑</button>${p.id==='default'?'':`<button class="p-btn p-btn--sm p-btn--icon" data-del-persona="${p.id}" aria-label="删除身份 ${esc(p.name)}">${icon('trash')}</button>`}</div>`).join('')}<div class="p-rows-foot"><button class="p-btn p-btn--sm p-btn--ghost" id="new-persona">${icon('create')}新建身份</button></div></div></section><section class="p-section" id="characters"><h2>角色库与创作</h2><p>管理已添加的角色、你的作品与收藏。</p><div class="p-card p-rows"><a class="p-row" href="library.html">${icon('book')}<div class="p-row-main"><div class="p-row-title">我的角色库</div><div class="p-row-sub">已添加、我创建的、收藏</div></div>${icon('next')}</a><a class="p-row" href="create.html">${icon('create')}<div class="p-row-main"><div class="p-row-title">创建角色</div><div class="p-row-sub">先保存私人草稿，再决定是否发布到广场</div></div>${icon('next')}</a><a class="p-row" href="rooms.html">${icon('users')}<div class="p-row-main"><div class="p-row-title">多角色房间</div><div class="p-row-sub">让角色在同一个故事中相遇</div></div>${icon('next')}</a></div></section><section class="p-section" id="security"><h2>安全与隐私</h2><p>登录设备、屏蔽名单、举报记录和账号数据。</p><div class="p-card p-rows"><button class="p-row" id="active-sessions" type="button">${icon('shield')}<div class="p-row-main"><div class="p-row-title">登录设备</div><div class="p-row-sub">静态设备示例 · 未连接登录服务</div></div><span class="p-small">管理</span>${icon('next')}</button><button class="p-row" id="blocked-creators" type="button">${icon('ban')}<div class="p-row-main"><div class="p-row-title">已屏蔽的创作者</div><div class="p-row-sub">屏蔽后不会在推荐中看到他们的作品</div></div><span class="p-small">${blockedCreators.length} 位</span>${icon('next')}</button><button class="p-row" id="report-history" type="button">${icon('warning')}<div class="p-row-main"><div class="p-row-title">举报记录</div><div class="p-row-sub">查看处理状态与管理员结果</div></div><span class="p-small">${reports.filter(item=>item.status==='pending').length} 条处理中</span>${icon('next')}</button><button class="p-row" id="export-data" type="button">${icon('download')}<div class="p-row-main"><div class="p-row-title">导出我的数据</div><div class="p-row-sub">角色、身份、会话、通知和举报记录</div></div>${icon('next')}</button><button class="p-row" id="delete-account" type="button" style="color:var(--danger)">${icon('trash')}<div class="p-row-main"><div class="p-row-title">账号注销（未实现）</div><div class="p-row-sub">仅演示说明，不会删除本地存档</div></div>${icon('next')}</button></div></section><section class="p-section" id="import"><h2>导入与数据</h2><p>角色卡与对话记录由你自行管理。</p><div class="p-card p-rows"><button class="p-row" id="import-card">${icon('upload')}<div class="p-row-main"><div class="p-row-title">导入角色卡</div><div class="p-row-sub">支持 SillyTavern V2/V3 JSON 与 PNG 卡 · 可先创建私人文本草稿</div></div>${icon('next')}</button><button class="p-row" id="data-backup">${icon('download')}<div class="p-row-main"><div class="p-row-title">备份与恢复</div><div class="p-row-sub">备份你的角色、身份和会话，不包含站点密钥</div></div>${icon('next')}</button><a class="p-row" href="../SillyTavern/public/terms.html" target="_blank" rel="noopener">${icon('shield')}<div class="p-row-main"><div class="p-row-title">服务条款与隐私政策</div><div class="p-row-sub">仅限 18 周岁以上 · 了解你的数据如何使用</div></div>${icon('next')}</a></div><button class="p-btn p-btn--danger" id="logout" style="margin-top:24px">退出登录</button></section></div></div>`;
        const chatBgPref = stateExtras.preferences?.chatBackground === 'warm' ? 'warm' : 'default';
        document.body.dataset.chatBg = chatBgPref;
        $$('.p-swatch-wrap').forEach(button => {
            const on = (button.dataset.swatch || 'default') === chatBgPref;
            button.classList.toggle('is-active', on);
            button.setAttribute('aria-pressed', String(on));
            button.addEventListener('click', () => {
                if (!['default','warm'].includes(button.dataset.swatch)) return;
                document.body.dataset.chatBg = button.dataset.swatch;
                $$('.p-swatch-wrap').forEach(item => { const active = item === button; item.classList.toggle('is-active', active); item.setAttribute('aria-pressed', String(active)); });
                stateExtras.preferences = stateExtras.preferences || {};
                stateExtras.preferences.chatBackground = button.dataset.swatch;
                saveState();
            });
        });
        const sideLinks = $$('[data-side-toc]');
        if (settingsSpy) document.removeEventListener('scroll', settingsSpy);
        settingsSpy = null;
        if (sideLinks.length) {
            const sections = sideLinks.map(link => document.getElementById(link.dataset.sideToc)).filter(Boolean);
            const sync = () => {
                if (typeof sections[0]?.getBoundingClientRect !== 'function') return;
                let current = sections[0]?.id;
                for (const sec of sections) { if (sec.getBoundingClientRect().top <= 140) current = sec.id; }
                sideLinks.forEach(link => {
                    const on = link.dataset.sideToc === current;
                    link.classList.toggle('is-active', on);
                    if (on) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
                });
            };
            settingsSpy = sync;
            document.addEventListener('scroll', sync, { passive: true });
            sync();
        }
        // 目录点击平滑滚动到分区；replaceState 写 hash，不打断动画
        for (const link of [...sideLinks, ...$$('.p-toc a[href^="#"]')]) {
            if (link.dataset.smoothBound) continue;
            link.dataset.smoothBound = '1';
            link.addEventListener('click', event => {
                event.preventDefault();
                const id = link.dataset.sideToc || (link.getAttribute('href') || '').slice(1);
                const target = id && document.getElementById(id);
                if (!target) return;
                target.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
                history.replaceState(null, '', `#${id}`);
            });
        }
    }

    function openBillingHistory() {
        openModal({title:'点数记录',body:`<p class="p-small">展示最近的点数使用、充值与兑换记录。实际扣点以服务端用量记录为准。</p><div class="p-choice-list">${transactions.map(item=>`<div class="p-choice"><span class="p-choice-main"><span class="p-choice-title">${esc(item.title)}</span><span class="p-choice-sub">${esc(item.time)} · 余额 ${item.balance.toLocaleString()} 点</span></span><span class="p-pill p-pill--sm ${item.amount>0?'p-pill--ok':'p-pill--outline'}">${item.amount>0?'+':''}${item.amount} 点</span></div>`).join('')}</div>`,confirmText:'完成',cancelText:'关闭',onConfirm:(_,close)=>close()});
    }

    function openActiveSessions() {
        openModal({title:'登录设备 · 静态示例',body:`<p class="p-small">以下设备为布局示例，不是你的真实登录记录。未连接账号服务，不能查询或退出任何设备。</p><div class="p-choice-list"><div class="p-choice"><span class="p-choice-main"><span class="p-choice-title">Mac · Chrome · 示例</span><span class="p-choice-sub">未查询实际设备信息</span></span></div><div class="p-choice"><span class="p-choice-main"><span class="p-choice-title">iPad · Safari · 示例</span><span class="p-choice-sub">远程退出尚未接入</span></span><button class="p-btn p-btn--sm" disabled type="button">退出未接入</button></div></div>`,confirmText:'知道了',cancelText:'关闭'});
    }

    function openBlockedCreators() {
        const dialog = openModal({title:'已屏蔽的创作者',body:blockedCreators.length?`<div class="p-choice-list">${blockedCreators.map(name=>`<div class="p-choice"><span class="p-choice-main"><span class="p-choice-title">${esc(name)}</span><span class="p-choice-sub">已从推荐和作者页隐藏</span></span><button class="p-btn p-btn--sm" data-unblock="${esc(name)}" type="button">解除屏蔽</button></div>`).join('')}</div>`:'<div class="p-empty"><div class="p-empty-title">没有屏蔽任何人</div><p class="p-empty-text">你可以在作者主页屏蔽不想再看到的创作者。</p></div>',confirmText:'完成',cancelText:'关闭',onConfirm:(_,close)=>close()});
        $$('[data-unblock]',dialog.overlay).forEach(button=>button.addEventListener('click',()=>{blockedCreators=blockedCreators.filter(name=>name!==button.dataset.unblock);saveBlockedCreators();dialog.close();renderSettings();toast('已解除屏蔽');}));
    }

    function openReportHistory() {
        openModal({title:'举报记录',body:reports.length?`<div class="p-choice-list">${reports.map(item=>`<div class="p-choice"><span class="p-choice-main"><span class="p-choice-title">${esc(item.work)}</span><span class="p-choice-sub">${esc(item.reason)} · ${esc(item.time)}</span></span><span class="p-pill p-pill--sm ${item.status==='pending'?'p-pill--warn':'p-pill--ok'}">${item.status==='pending'?'处理中':'已处理'}</span></div>`).join('')}</div>`:'<div class="p-empty"><div class="p-empty-title">还没有举报记录</div></div>',confirmText:'完成',cancelText:'关闭',onConfirm:(_,close)=>close()});
    }

    // 恢复个人备份：先校验格式，再把当前存档整体备份一份（pre-restore，一键回退）后才整体替换并刷新。
    // 这是唯一会整档覆盖存档的入口；恢复失败不会破坏现有数据。
    function openDataBackupModal() {
        const snapshotRows = Object.entries(chatSnapshots).flatMap(([chatId,list]) => {
            const chat = chats.find(item => item.id === chatId);
            const name = chat ? chat.title : '已删除的会话';
            return list.slice().reverse().map((snapshot,index) => ({chatId,name,at:snapshot.at,count:snapshot.count,isNewest:index === 0}));
        }).slice(0,10);
        const dialog = openModal({title:'备份与恢复',wide:true,body:`<p>下载本标签页的完整状态：公共角色库标记、私人作品、身份、单聊与房间消息、候选回复、分支上下文和本地偏好。备份可能含私人设定，请自行妥善保管；点数示例不是真实余额。</p>
            <div class="p-choice-list"><button class="p-choice" id="download-backup">${icon('download')}<span class="p-choice-main"><span class="p-choice-title">下载个人备份</span><span class="p-choice-sub">JSON 格式，保存在你的设备</span></span></button>
            <button class="p-choice" id="restore-backup">${icon('upload')}<span class="p-choice-main"><span class="p-choice-title">从备份文件恢复</span><span class="p-choice-sub">选择之前下载的 JSON；恢复前会先自动备份当前存档</span></span></button>
            <input type="file" id="restore-file" accept=".json,application/json" hidden></div>
            <h3 class="p-form-section-title">聊天自动快照 · 每会话保留最近 5 份</h3><p class="p-small">发送或删除消息时自动拍摄，用于误操作后回退。仅保存在当前标签页。</p>
            <div class="p-choice-list">${snapshotRows.length ? snapshotRows.map(row => `<div class="p-choice"><span class="p-choice-main"><span class="p-choice-title">${esc(row.name)} · ${new Date(row.at).toLocaleString('zh-CN')}</span><span class="p-choice-sub">${row.count} 条消息${row.isNewest?' · 最新':''}</span></span><button class="p-btn p-btn--sm" type="button" data-restore-snapshot="${row.chatId}" data-snapshot-at="${row.at}">恢复此快照</button></div>`).join('') : '<div class="admin-empty">还没有自动快照；发送或删除消息后会自动生成。</div>'}</div>`,confirmText:'完成',cancelText:'关闭',onConfirm:(_,close)=>close()});
        $('#download-backup',dialog.overlay).addEventListener('click',exportAccountData);
        $('#restore-backup',dialog.overlay).addEventListener('click',() => $('#restore-file',dialog.overlay).click());
        $('#restore-file',dialog.overlay).addEventListener('change',event => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                let payload;
                try { payload = JSON.parse(String(reader.result)); } catch { openModal({title:'恢复失败',body:'<p>文件不是合法的 JSON，没有读取或覆盖任何数据。</p>',confirmText:'知道了',cancelText:'关闭'}); return; }
                if (payload?.format !== 'rp-platform-local-backup' || !Array.isArray(payload.chats)) { openModal({title:'恢复失败',body:'<p>文件不是本平台的个人备份（缺少备份标识或会话数据），没有读取或覆盖任何数据。</p>',confirmText:'知道了',cancelText:'关闭'}); return; }
                confirmAction('用备份覆盖当前存档？',`备份包含 ${payload.chats.length} 个会话。当前标签页的全部状态会先自动备份一份（可回退），然后被备份内容替换并刷新页面。`,'覆盖并刷新',()=>{
                    try { sessionStorage.setItem(resourceId('pre-restore'), sessionStorage.getItem(stateKey) || ''); } catch {}
                    sessionStorage.setItem(stateKey, JSON.stringify(payload));
                    location.reload();
                });
            };
            reader.readAsText(file);
        });
        $$('[data-restore-snapshot]',dialog.overlay).forEach(button => button.addEventListener('click',() => {
            const chatId = button.dataset.restoreSnapshot, at = Number(button.dataset.snapshotAt);
            const chat = chats.find(item => item.id === chatId);
            const snapshot = chatSnapshots[chatId]?.find(item => item.at === at);
            if (!chat || !snapshot) { toast('快照对应的会话已删除，无法恢复。','err'); return; }
            confirmAction('恢复这条快照？',`「${chat.title}」的消息将被快照内容（${snapshot.count} 条，${new Date(snapshot.at).toLocaleString('zh-CN')}）替换。当前消息会先自动备份一份。`,'恢复',()=>{
                const previous = cloneChatValue(chat);
                const previousSnapshots = chatSnapshots[chat.id] ? [...chatSnapshots[chat.id]] : [];
                chat.messages = cloneChatValue(snapshot.messages);
                chatSnapshots[chat.id].push({at:Date.now(),count:chat.messages.length,title:chat.title,messages:cloneChatValue(chat.messages)});
                chatSnapshots[chat.id] = chatSnapshots[chat.id].slice(-5);
                saveChatSnapshots();
                if (!saveState()) { chat.messages = cloneChatValue(previous.messages); chatSnapshots[chat.id] = previousSnapshots; return; }
                dialog.close();
                toast('快照已恢复');
                if (currentChat?.id === chat.id) { drawMessages(); refreshChatContext(); }
                else if (page === 'chats') renderChats();
            });
        }));
    }

    function exportAccountData() {
        const payload = {...statePayload(),format:'rp-platform-local-backup',exportedAt:new Date().toISOString(),notifications,reports,blockedCreators};
        const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href=url;link.download='酒馆-我的数据.json';link.click();
        setTimeout(()=>URL.revokeObjectURL(url),500);
        toast('个人数据已导出');
    }

    function openDeleteAccount() {
        openModal({title:'账号注销 · 未实现',body:'<p>当前没有真实账号服务，不能注销账号或下架作品。此入口仅为演示，不会删除你的本地身份、角色或会话。</p>',confirmText:'知道了',cancelText:'关闭'});
    }

    const CARD_MAX_BYTES = 8 * 1024 * 1024;

    function bytesToText(bytes) {
        try { return new TextDecoder('utf-8').decode(bytes); } catch { return ''; }
    }

    function base64ToJson(text) {
        const clean = String(text || '').replace(/\s+/g,'');
        if (!clean) return null;
        try {
            const binary = atob(clean);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
            return JSON.parse(bytesToText(bytes));
        } catch { return null; }
    }

    // PNG 只读 tEXt / 未压缩 iTXt 里的角色卡字段，不校验 CRC，也不解码图像数据。
    function pngTextChunks(buffer) {
        const view = new DataView(buffer);
        if (view.byteLength < 16) return null;
        const signature = [137,80,78,71,13,10,26,10];
        for (let index = 0; index < signature.length; index += 1) {
            if (view.getUint8(index) !== signature[index]) return null;
        }
        const chunks = {};
        let offset = 8;
        while (offset + 12 <= view.byteLength) {
            const length = view.getUint32(offset);
            if (length > view.byteLength) break;
            const type = String.fromCharCode(view.getUint8(offset + 4),view.getUint8(offset + 5),view.getUint8(offset + 6),view.getUint8(offset + 7));
            const start = offset + 8;
            if ((type === 'tEXt' || type === 'iTXt') && start + length <= view.byteLength) {
                const bytes = new Uint8Array(buffer,start,length);
                const zero = bytes.indexOf(0);
                if (zero > 0) {
                    if (type === 'tEXt') {
                        chunks[bytesToText(bytes.subarray(0,zero))] = bytesToText(bytes.subarray(zero + 1));
                    } else if (bytes[zero + 1] === 0) {
                        const langEnd = bytes.indexOf(0,zero + 3);
                        const textStart = langEnd < 0 ? -1 : bytes.indexOf(0,langEnd + 1);
                        if (textStart > 0) chunks[bytesToText(bytes.subarray(0,zero))] = bytesToText(bytes.subarray(textStart + 1));
                    }
                }
            }
            offset = start + length + 4;
        }
        return chunks;
    }

    // ── 角色卡导出：与 SillyTavern 的 charaFormatData 字段一致（chara_card_v2），PNG 同时写 chara 与 ccv3 两个 tEXt 块 ──
    function workToCard(work) {
        const entries = work.loreBook && Array.isArray(work.loreBook.entries) ? work.loreBook.entries : [];
        const characterBook = entries.length ? {name:textValue(work.loreBook.name,'角色世界书'),entries:entries.map((entry,uid) => {
            const st = loreBookToSillyTavern({entries:[entry]}).entries[0];
            return {id:uid,keys:st.key,secondary_keys:st.keysecondary,comment:st.comment,content:st.content,constant:st.constant,selective:st.selective,
                insertion_order:st.order,enabled:!st.disable,position:st.position === 0 ? 'before_char' : 'after_char',use_regex:true,
                extensions:{position:st.position,exclude_recursion:st.excludeRecursion,display_index:uid,probability:st.probability,useProbability:st.useProbability,
                    depth:st.depth,selectiveLogic:st.selectiveLogic,outlet_name:st.outletName,group:st.group,group_override:st.groupOverride,group_weight:st.groupWeight,
                    prevent_recursion:st.preventRecursion,delay_until_recursion:st.delayUntilRecursion,scan_depth:st.scanDepth,match_whole_words:st.matchWholeWords,
                    use_group_scoring:st.useGroupScoring,case_sensitive:st.caseSensitive,automation_id:st.automationId,role:st.role,vectorized:st.vectorized,
                    sticky:st.sticky,cooldown:st.cooldown,delay:st.delay,match_persona_description:st.matchPersonaDescription,match_character_description:st.matchCharacterDescription,
                    match_character_personality:st.matchCharacterPersonality,match_character_depth_prompt:false,match_scenario:st.matchScenario,match_creator_notes:st.matchCreatorNotes,
                    triggers:st.triggers,ignore_budget:st.ignoreBudget}};
        })} : null;
        const regexScripts = (work.regexScripts || []).map(rule => ({id:rule.id,scriptName:rule.name,findRegex:rule.find,replaceString:rule.replace,trimStrings:[...(rule.trimStrings || [])],
            placement:rule.target === 'user' ? [1] : rule.target === 'assistant' ? [2] : [1,2],disabled:rule.enabled === false,
            markdownOnly:rule.scope === 'display',promptOnly:rule.scope === 'send',runOnEdit:true,substituteRegex:0,minDepth:rule.minDepth ?? null,maxDepth:rule.maxDepth ?? null}));
        const data = {
            name:work.name,description:textValue(work.cardDescription),personality:textValue(work.personality),scenario:textValue(work.scenario),
            first_mes:textValue(work.greeting),mes_example:textValue(work.mesExample),
            creator_notes:textValue(work.creatorNotes) || textValue(work.hook),
            system_prompt:textValue(work.systemPrompt),post_history_instructions:textValue(work.postHistory),
            alternate_greetings:(work.alternateGreetings || []).filter(text => typeof text === 'string' && text.trim()),
            tags:[...(work.tags || [])],creator:textValue(work.cardSource?.creator,'林见白'),character_version:textValue(work.cardSource?.version,String(work.revision || 1)),
            extensions:{...(plainRecord(work.cardExtensions) ? work.cardExtensions : {}),talkativeness:0.5,fav:false,world:'',
                depth_prompt:{prompt:textValue(work.depthPrompt?.text),depth:work.depthPrompt?.depth ?? 4,role:work.depthPrompt?.role || 'system'},
                ...(regexScripts.length ? {regex_scripts:regexScripts} : {})},
            ...(characterBook ? {character_book:characterBook} : {}),
        };
        // V1 顶层字段与 V2 data 并存：ST 自己导出的卡就是这样，老工具也能读。
        return {name:data.name,description:data.description,personality:data.personality,scenario:data.scenario,first_mes:data.first_mes,mes_example:data.mes_example,
            creatorcomment:data.creator_notes,avatar:'none',talkativeness:0.5,fav:false,tags:data.tags,spec:'chara_card_v2',spec_version:'2.0',data};
    }

    const crcTable = (() => {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n += 1) {
            let c = n;
            for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let crc = 0xFFFFFFFF;
        for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function textToBase64(text) {
        const bytes = new TextEncoder().encode(text);
        let binary = '';
        for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index,index + 0x8000));
        return btoa(binary);
    }

    function pngTextChunk(keyword,text) {
        const ascii = value => Uint8Array.from(value,char => char.charCodeAt(0) & 0xFF);
        const body = new Uint8Array([...ascii(keyword),0,...ascii(text)]);
        const type = ascii('tEXt');
        const chunk = new Uint8Array(12 + body.length);
        const view = new DataView(chunk.buffer);
        view.setUint32(0,body.length);
        chunk.set(type,4);
        chunk.set(body,8);
        view.setUint32(8 + body.length,crc32(new Uint8Array([...type,...body])));
        return chunk;
    }

    // ST 的 write()：去掉旧的 chara / ccv3 文本块，在 IEND 前写入 base64 的 V2（chara）与 V3（ccv3）。
    function writeCardPng(buffer,card) {
        const view = new DataView(buffer);
        const bytes = new Uint8Array(buffer);
        const parts = [bytes.subarray(0,8)];
        let offset = 8, iend = null;
        while (offset + 12 <= view.byteLength) {
            const length = view.getUint32(offset);
            const type = String.fromCharCode(...bytes.subarray(offset + 4,offset + 8));
            const end = offset + 12 + length;
            if (end > view.byteLength) break;
            const chunk = bytes.subarray(offset,end);
            if (type === 'IEND') { iend = chunk; break; }
            const keyEnd = type === 'tEXt' ? bytes.indexOf(0,offset + 8) : -1;
            const keyword = keyEnd > 0 && keyEnd < end ? String.fromCharCode(...bytes.subarray(offset + 8,keyEnd)).toLowerCase() : '';
            if (!(type === 'tEXt' && (keyword === 'chara' || keyword === 'ccv3'))) parts.push(chunk);
            offset = end;
        }
        if (!iend) return null;
        parts.push(pngTextChunk('chara',textToBase64(JSON.stringify(card))));
        parts.push(pngTextChunk('ccv3',textToBase64(JSON.stringify({...card,spec:'chara_card_v3',spec_version:'3.0'}))));
        parts.push(iend);
        const out = new Uint8Array(parts.reduce((sum,part) => sum + part.length,0));
        let cursor = 0;
        for (const part of parts) { out.set(part,cursor); cursor += part.length; }
        return out;
    }

    // 没有立绘时画一张 400×600 的占位卡面（ST 的默认头像也是 2:3），再写入角色数据。
    async function cardPngBuffer(work) {
        const source = work.portrait || work.avatarData || '';
        if (typeof document.createElement !== 'function') return null;
        const canvas = document.createElement('canvas');
        if (!canvas.getContext || !canvas.toBlob) return null;
        canvas.width = 400;
        canvas.height = 600;
        const context = canvas.getContext('2d');
        context.fillStyle = 'hsl(' + (Number(work.hue) || 24) + ' 30% 86%)';
        context.fillRect(0,0,400,600);
        if (source) {
            try {
                const image = await new Promise((resolve,reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = source; });
                const scale = Math.max(400 / image.width,600 / image.height);
                context.drawImage(image,(400 - image.width * scale) / 2,(600 - image.height * scale) / 2,image.width * scale,image.height * scale);
            } catch {}
        } else {
            context.fillStyle = '#1b1b1d';
            context.font = '600 160px "Songti SC", serif';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(Array.from(work.name || '角')[0],200,300);
        }
        const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
        return blob ? blob.arrayBuffer() : null;
    }

    async function exportCharacterCard(work,format = 'json') {
        const card = workToCard(work);
        const base = (work.name || '角色').replace(/[\\/:*?"<>|]/g,'_');
        if (format === 'json') { downloadJson(base + '.json',card,'角色卡已导出为 SillyTavern V2 JSON'); return true; }
        const buffer = await cardPngBuffer(work);
        const png = buffer ? writeCardPng(buffer,card) : null;
        if (!png) { toast('PNG 卡面生成失败，可以先导出 JSON。','err'); return false; }
        const url = URL.createObjectURL(new Blob([png],{type:'image/png'}));
        const link = document.createElement('a');
        link.href = url;
        link.download = base + '.png';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url),500);
        toast('角色卡已导出为 PNG（卡内写入 chara 与 ccv3）');
        return true;
    }

    function cardFromChunks(chunks) {
        if (!chunks) return null;
        for (const key of ['ccv3','chara']) {
            if (!chunks[key]) continue;
            const decoded = base64ToJson(chunks[key]);
            if (plainRecord(decoded)) return decoded;
            try {
                const direct = JSON.parse(chunks[key]);
                if (plainRecord(direct)) return direct;
            } catch {}
        }
        return null;
    }

    function cardFromJsonText(text) {
        try {
            const value = JSON.parse(String(text || ''));
            return plainRecord(value) ? value : null;
        } catch { return null; }
    }

    function normalizeBookEntries(list) {
        return (Array.isArray(list) ? list : []).filter(plainRecord).map((entry,index) => normalizeLoreEntry(entry,index)).filter(entry => entry.text);
    }

    // 世界书条目：字段与 SillyTavern 1.19.0 的 newWorldInfoEntryDefinition 对齐。
    // 同时接受三种来源：本原型自己的归一化结果、ST 世界书文件（key/keysecondary/order/disable…）、
    // 角色卡内嵌的 character_book（keys/secondary_keys/insertion_order/enabled + extensions.*）。
    // 必须幂等：已归一化的条目再跑一遍不能丢字段。
    function optionalNumber(value,min,max) {
        if (value === null || value === undefined || value === '') return null;
        const number = Number(value);
        if (!Number.isFinite(number)) return null;
        return Math.round(Math.min(Math.max(number,min),max));
    }

    function optionalBoolean(value) {
        return typeof value === 'boolean' ? value : null;
    }

    function loreKeyList(value) {
        const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，]/) : [];
        return [...new Set(list.filter(key => typeof key === 'string').map(key => key.trim()).filter(Boolean))].slice(0,24);
    }

    function normalizeLoreEntry(entry,index = 0) {
        const ext = plainRecord(entry.extensions) ? entry.extensions : {};
        const pick = (...values) => values.find(value => value !== undefined && value !== null);
        // 角色卡条目（keys / insertion_order）按 ST 的 convertCharacterBook：extensions.position 优先，
        // 否则 before_char 记为角色前、其余一律角色后；世界书文件与本原型的条目直接读 position。
        const isCardEntry = Array.isArray(entry.keys) || entry.insertion_order !== undefined;
        const positionKey = typeof ext.position === 'number' ? lorePositions[ext.position]?.[0]
            : typeof entry.position === 'number' ? lorePositions[entry.position]?.[0]
            : lorePositions.some(([key]) => key === entry.position) ? entry.position
            : isCardEntry ? (entry.position === 'before_char' ? 'before' : 'after') : 'before';
        const rawLogic = pick(entry.logic,entry.selectiveLogic,ext.selectiveLogic);
        const logic = typeof rawLogic === 'number' ? loreLogics[rawLogic]?.[0] : rawLogic;
        const rawRole = pick(entry.role,ext.role);
        const role = typeof rawRole === 'number' ? loreRoles[rawRole] : rawRole;
        const disabled = entry.disable === true || entry.enabled === false;
        const probability = optionalNumber(pick(entry.probability,ext.probability),0,100);
        const delayRecursion = pick(entry.delayUntilRecursion,ext.delay_until_recursion);
        const triggers = (Array.isArray(entry.triggers) ? entry.triggers : Array.isArray(ext.triggers) ? ext.triggers : []).filter(value => loreTriggerTypes.some(([key]) => key === value));
        return {
            id: stableId(entry.id,typeof entry.uid === 'number' || typeof entry.id === 'number' ? `book-lore-${pick(entry.uid,entry.id)}` : `book-lore-${index}`),
            title: textValue(entry.comment,textValue(entry.name,textValue(entry.title,`条目 ${index + 1}`))),
            keywords: loreKeyList(pick(entry.keywords,entry.keys,entry.key)),
            secondaryKeywords: loreKeyList(pick(entry.secondaryKeywords,entry.secondary_keys,entry.keysecondary)),
            logic: loreLogics.some(([key]) => key === logic) ? logic : 'andAny',
            // ST 只在 selective 为真时检查次要关键词；角色卡里 selective:false 的条目会忽略它们。
            selective: isCardEntry ? entry.selective === true : entry.selective !== false,
            text: textValue(entry.content,textValue(entry.text)),
            enabled: !disabled,
            constant: entry.constant === true,
            // 插入顺序：角色卡 insertion_order → ST 世界书 order → 本原型 priority（卡规范里另有一个 priority 字段，ST 不用它排序）。
            priority: Number(pick(entry.insertion_order,entry.order,entry.priority)) || 0,
            position: positionKey || 'before',
            depth: optionalNumber(pick(entry.depth,ext.depth),0,loreMaxScanDepth) ?? loreDefaultDepth,
            role: loreRoles.includes(role) ? role : 'system',
            outletName: textValue(pick(entry.outletName,ext.outlet_name)).trim().slice(0,40),
            scanDepth: optionalNumber(pick(entry.scanDepth,ext.scan_depth),0,loreMaxScanDepth),
            caseSensitive: optionalBoolean(pick(entry.caseSensitive,ext.case_sensitive,entry.case_sensitive)),
            matchWholeWords: optionalBoolean(pick(entry.matchWholeWords,ext.match_whole_words)),
            probability: probability ?? 100,
            useProbability: pick(entry.useProbability,ext.useProbability) !== false,
            group: textValue(pick(entry.group,ext.group)).trim().slice(0,80),
            groupOverride: pick(entry.groupOverride,ext.group_override) === true,
            groupWeight: optionalNumber(pick(entry.groupWeight,ext.group_weight),1,10000) ?? loreDefaultWeight,
            useGroupScoring: optionalBoolean(pick(entry.useGroupScoring,ext.use_group_scoring)),
            sticky: optionalNumber(pick(entry.sticky,ext.sticky),0,999) || null,
            cooldown: optionalNumber(pick(entry.cooldown,ext.cooldown),0,999) || null,
            delay: optionalNumber(pick(entry.delay,ext.delay),0,999) || null,
            excludeRecursion: pick(entry.excludeRecursion,ext.exclude_recursion) === true,
            preventRecursion: pick(entry.preventRecursion,ext.prevent_recursion) === true,
            delayUntilRecursion: delayRecursion === true ? 1 : optionalNumber(delayRecursion,0,99) || 0,
            ignoreBudget: pick(entry.ignoreBudget,ext.ignore_budget) === true,
            matchPersona: pick(entry.matchPersona,entry.matchPersonaDescription,ext.match_persona_description) === true,
            matchCharacter: pick(entry.matchCharacter,entry.matchCharacterDescription,ext.match_character_description) === true,
            matchPersonality: pick(entry.matchPersonality,entry.matchCharacterPersonality,ext.match_character_personality) === true,
            matchScenario: pick(entry.matchScenario,ext.match_scenario) === true,
            matchCreatorNotes: pick(entry.matchCreatorNotes,ext.match_creator_notes) === true,
            triggers: [...new Set(triggers)],
            // 本原型不支持、但导出回 ST 时需要原样带回的字段。
            automationId: textValue(pick(entry.automationId,ext.automation_id)).slice(0,80),
            vectorized: pick(entry.vectorized,ext.vectorized) === true,
            characterFilter: plainRecord(entry.characterFilter) ? cloneChatValue(entry.characterFilter) : null,
        };
    }

    function normalizeLoreTimed(value) {
        const source = plainRecord(value) ? value : {};
        const timed = {sticky:{},cooldown:{}};
        ['sticky','cooldown'].forEach(type => {
            if (!plainRecord(source[type])) return;
            Object.entries(source[type]).forEach(([key,item]) => {
                if (plainRecord(item) && Number.isFinite(Number(item.start)) && Number.isFinite(Number(item.end))) timed[type][key] = {start:Number(item.start),end:Number(item.end),protected:item.protected === true};
            });
        });
        return timed;
    }

    function normalizeLoreSettings(value) {
        const source = plainRecord(value) ? value : {};
        const flag = (key) => typeof source[key] === 'boolean' ? source[key] : loreSettingsDefault[key];
        return {
            scanDepth: optionalNumber(source.scanDepth,0,loreMaxScanDepth) ?? loreSettingsDefault.scanDepth,
            budget: optionalNumber(source.budget,100,50000) ?? loreSettingsDefault.budget,
            recursive: flag('recursive'),
            maxRecursionSteps: optionalNumber(source.maxRecursionSteps,0,50) ?? loreSettingsDefault.maxRecursionSteps,
            caseSensitive: flag('caseSensitive'),
            matchWholeWords: flag('matchWholeWords'),
            includeNames: flag('includeNames'),
            useGroupScoring: flag('useGroupScoring'),
            minActivations: optionalNumber(source.minActivations,0,100) ?? 0,
            minActivationsDepthMax: optionalNumber(source.minActivationsDepthMax,0,loreMaxScanDepth) ?? 0,
        };
    }

    // 导出为 SillyTavern 世界书文件：ST 的 /api/worldinfo/import 只要求顶层有 entries。
    function loreBookToSillyTavern(book) {
        const entries = {};
        (book?.entries || []).forEach((entry,uid) => {
            entries[uid] = {
                uid,key:[...entry.keywords],keysecondary:[...entry.secondaryKeywords],comment:entry.title,content:entry.text,
                constant:entry.constant,vectorized:entry.vectorized,selective:entry.selective,selectiveLogic:Math.max(loreLogics.findIndex(([key]) => key === entry.logic),0),
                addMemo:true,order:entry.priority,position:Math.max(lorePositions.findIndex(([key]) => key === entry.position),0),disable:!entry.enabled,
                ignoreBudget:entry.ignoreBudget,excludeRecursion:entry.excludeRecursion,preventRecursion:entry.preventRecursion,delayUntilRecursion:entry.delayUntilRecursion,
                probability:entry.probability,useProbability:entry.useProbability,depth:entry.depth,outletName:entry.outletName,
                group:entry.group,groupOverride:entry.groupOverride,groupWeight:entry.groupWeight,
                scanDepth:entry.scanDepth,caseSensitive:entry.caseSensitive,matchWholeWords:entry.matchWholeWords,useGroupScoring:entry.useGroupScoring,
                automationId:entry.automationId,role:Math.max(loreRoles.indexOf(entry.role),0),sticky:entry.sticky,cooldown:entry.cooldown,delay:entry.delay,
                matchPersonaDescription:entry.matchPersona,matchCharacterDescription:entry.matchCharacter,matchCharacterPersonality:entry.matchPersonality,
                matchCharacterDepthPrompt:false,matchScenario:entry.matchScenario,matchCreatorNotes:entry.matchCreatorNotes,
                triggers:[...entry.triggers],displayIndex:uid,characterFilter:entry.characterFilter || {isExclude:false,names:[],tags:[]},
            };
        });
        return {name:textValue(book?.name,'世界书'),entries};
    }

    function normalizeCardBook(book) {
        return {
            name: textValue(book?.name,'导入的世界书'),
            entries: normalizeBookEntries(Array.isArray(book?.entries) ? book.entries : []),
        };
    }

    // 多本世界书：库存在 localStorage 之外的 stateExtras，会话只保存 bookIds。
    function normalizeLoreBook(value,index = 0) {
        return {
            id: stableId(value?.id,`book-${index}`),
            name: textValue(value?.name,`世界书 ${index + 1}`),
            source: textValue(value?.source,'manual'),
            entries: normalizeBookEntries(value?.entries),
        };
    }

    function bookById(id) {
        return loreBooks.find(book => book.id === id) || null;
    }

    function boundBookIds(chat) {
        const context = plainRecord(chat?.context) ? chat.context : {};
        return Array.isArray(context.bookIds) ? context.bookIds.filter(id => typeof id === 'string' && bookById(id)) : [];
    }

    function activeLoreEntries(chat) {
        const session = chatContext(chat).lore.filter(entry => entry.enabled).map(entry => ({...entry,source:'session',bookName:'本会话'}));
        const bound = boundBookIds(chat).flatMap(id => {
            const book = bookById(id);
            return book ? book.entries.filter(entry => entry.enabled).map(entry => ({...entry,source:id,bookName:book.name})) : [];
        });
        return [...session,...bound];
    }

    // ── 世界书扫描：对照 SillyTavern 1.19.0 world-info.js 的 checkWorldInfo ──────────────
    // 扫描文本＝最近 N 条消息（N＝条目扫描深度或全局深度，最新在前）＋可选的角色/身份资料＋递归缓冲。
    // 流程：逐条判定（停用、生成类型、粘滞/冷却/延迟、递归限制、常驻、主关键词、次要关键词逻辑）
    // → 按优先级排序 → 包含组（粘滞优先、评分、置顶、权重随机）→ 概率 → 预算 → 递归下一轮。
    // 所有随机都走 random 参数，预览与测试可固定结果；预览不写粘滞/冷却。
    function loreScanTexts(chat,settings) {
        const messages = chat.messages.filter(message => message.role !== 'system' && !message.hidden).slice().reverse();
        const character = chatCharacter(chat);
        const speaker = message => message.role === 'user'
            ? (plainRecord(message.personaSnapshot) ? message.personaSnapshot.name : getPersona(chat.personaId)?.name || '玩家')
            : character.name;
        return messages.map(message => ({id:message.id,role:message.role,text:(settings.includeNames ? `${speaker(message)}: ` : '') + textValue(message.text).trim()}));
    }

    function loreKeyRegex(key) {
        const match = key.match(/^\/([\w\W]+?)\/([gimsuy]*)$/);
        if (!match || /(^|[^\\])\//.test(match[1])) return null;
        try { return new RegExp(match[1].replace('\\/','/'),match[2]); } catch { return null; }
    }

    function loreKeyMatches(haystack,key,entry,settings) {
        const regex = loreKeyRegex(key);
        if (regex) { regex.lastIndex = 0; return regex.test(haystack); }
        const caseSensitive = entry.caseSensitive ?? settings.caseSensitive;
        const text = caseSensitive ? haystack : haystack.toLowerCase();
        const needle = caseSensitive ? key : key.toLowerCase();
        if (!(entry.matchWholeWords ?? settings.matchWholeWords)) return text.includes(needle);
        if (needle.split(/\s+/).length > 1) return text.includes(needle);
        // ST 用 \W 做词边界；中文字符同样属于 \W，所以整词匹配对中文关键词照常生效。
        return new RegExp(`(?:^|\\W)(${needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})(?:$|\\W)`).test(text);
    }

    function loreGroupScore(entry,haystack,settings) {
        const primary = entry.keywords.filter(key => loreKeyMatches(haystack,key,entry,settings)).length;
        if (!entry.keywords.length) return 0;
        const secondary = entry.secondaryKeywords.filter(key => loreKeyMatches(haystack,key,entry,settings)).length;
        if (entry.secondaryKeywords.length) {
            if (entry.logic === 'andAny') return primary + secondary;
            if (entry.logic === 'andAll') return secondary === entry.secondaryKeywords.length ? primary + secondary : primary;
        }
        return primary;
    }

    // 概率与包含组的随机按「会话 + 当前消息数」播种：同一轮里右栏、上下文预览与真正发送看到的是同一次抽取。
    function seededRandom(seed) {
        let state = 2166136261;
        for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0),16777619) >>> 0;
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let value = state;
            value = Math.imul(value ^ (value >>> 15),value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7),value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    }

    function scanLore(chat,{trigger = 'normal',random = null,dryRun = true,settings = loreSettings} = {}) {
        const all = activeLoreEntries(chat).sort((a,b) => (b.priority || 0) - (a.priority || 0));
        const scanTexts = loreScanTexts(chat,settings);
        const timedSource = chatContext(chat).loreTimed;
        // ST 的计数基于进入上下文的消息（不含系统记录与隐藏消息）。
        const turn = scanTexts.length;
        random = random || seededRandom(`${chat.id}:${turn}:${trigger}`);
        const keyOf = entry => `${entry.source}.${entry.id}`;
        // 粘滞/冷却记录在会话里；只要聊天没有前进（重新生成、预览）就保持原样。
        const effect = (type,entry) => {
            const value = timedSource[type][keyOf(entry)];
            return Boolean(value && turn < value.end && (turn > value.start || value.protected) && entry[type]);
        };
        const sticky = new Set(all.filter(entry => effect('sticky',entry)).map(keyOf));
        const cooldown = new Set(all.filter(entry => effect('cooldown',entry)).map(keyOf));
        // 粘滞到期、且条目设置了冷却：立刻进入冷却（ST 的 onEnded.sticky）。
        all.forEach(entry => {
            const value = timedSource.sticky[keyOf(entry)];
            if (value && entry.cooldown && turn >= value.end && !cooldown.has(keyOf(entry))) cooldown.add(keyOf(entry));
        });
        const delayed = new Set(all.filter(entry => entry.delay && turn < entry.delay).map(keyOf));
        const extraText = entry => [
            entry.matchPersona ? textValue(getPersona(chat.personaId)?.description) : '',
            entry.matchCharacter ? textValue(chatCharacter(chat).description) : '',
            entry.matchPersonality ? textValue(chatCharacter(chat).personality) : '',
            entry.matchScenario ? textValue(chatCharacter(chat).scenario) : '',
            entry.matchCreatorNotes ? textValue(chatCharacter(chat).hook) : '',
        ].filter(Boolean);
        let skew = 0;
        const recurse = [];
        const bufferFor = (entry,state) => {
            const depth = Math.min(entry.scanDepth ?? (settings.scanDepth + skew),loreMaxScanDepth);
            const window = scanTexts.slice(0,depth);
            const parts = [...window.map(item => item.text),...extraText(entry),...(state === 'minActivations' ? [] : recurse)];
            return {text:parts.join('\n'),window};
        };
        const resolveKey = key => resolveMacros(key,chat).text.trim();
        const activated = new Map();
        const failedProbability = new Set();
        const log = [];
        const delayLevels = [...new Set(all.filter(entry => entry.delayUntilRecursion).map(entry => entry.delayUntilRecursion))].sort((a,b) => a - b);
        let delayLevel = delayLevels.shift() ?? 0;
        let state = 'initial';
        let loops = 0;
        let used = 0;
        let overflowed = false;
        while (state) {
            if (settings.maxRecursionSteps && settings.maxRecursionSteps <= loops) break;
            loops += 1;
            let next = '';
            const now = [];
            for (const entry of all) {
                const key = keyOf(entry);
                if (failedProbability.has(key) || activated.has(key)) continue;
                const isSticky = sticky.has(key);
                const skip = reason => { if (state === 'initial') log.push({id:entry.id,title:entry.title,reason}); };
                if (entry.triggers.length && !entry.triggers.includes(trigger)) { skip(`生成类型不符（仅 ${entry.triggers.join('、')}）`); continue; }
                if (delayed.has(key)) { skip(`延迟：第 ${entry.delay} 条消息之后才可触发`); continue; }
                if (cooldown.has(key) && !isSticky) { skip('冷却中'); continue; }
                if (state !== 'recursion' && entry.delayUntilRecursion && !isSticky) { skip('仅在递归扫描中触发'); continue; }
                if (state === 'recursion' && entry.delayUntilRecursion > delayLevel && !isSticky) continue;
                if (state === 'recursion' && settings.recursive && entry.excludeRecursion && !isSticky) continue;
                const directive = entry.text.startsWith('@@activate') ? 'activate' : entry.text.startsWith('@@dont_activate') ? 'dont' : '';
                if (directive === 'activate') { now.push({entry,hits:[{keyword:'@@activate',messageId:'',role:'system'}]}); continue; }
                if (directive === 'dont') { skip('@@dont_activate 标记'); continue; }
                if (entry.constant) { now.push({entry,hits:[{keyword:'常驻',messageId:'',role:'system'}]}); continue; }
                if (isSticky) { now.push({entry,hits:[{keyword:'粘滞',messageId:'',role:'system'}]}); continue; }
                if (!entry.keywords.length) { skip('没有关键词'); continue; }
                const {text,window} = bufferFor(entry,state);
                const primary = entry.keywords.find(keyword => { const value = resolveKey(keyword); return value && loreKeyMatches(text,value,entry,settings); });
                if (!primary) continue;
                if (entry.selective && entry.secondaryKeywords.length) {
                    const results = entry.secondaryKeywords.map(keyword => { const value = resolveKey(keyword); return Boolean(value) && loreKeyMatches(text,value,entry,settings); });
                    const passed = entry.logic === 'andAny' ? results.some(Boolean)
                        : entry.logic === 'notAll' ? results.some(result => !result)
                        : entry.logic === 'notAny' ? !results.some(Boolean)
                        : results.every(Boolean);
                    if (!passed) { skip(`主关键词「${primary}」命中，但次要关键词不满足「${loreLogics.find(([value]) => value === entry.logic)?.[1]}」`); continue; }
                }
                const value = resolveKey(primary);
                const sources = window.filter(item => loreKeyMatches(item.text,value,entry,settings));
                now.push({entry,hits:sources.length ? sources.map(item => ({keyword:primary,messageId:item.id,role:item.role})) : [{keyword:primary,messageId:'',role:state === 'recursion' ? 'recursion' : 'profile'}]});
            }
            // 排序：粘滞优先，其余保持优先级顺序。
            now.sort((a,b) => Number(sticky.has(keyOf(b.entry))) - Number(sticky.has(keyOf(a.entry))) || all.indexOf(a.entry) - all.indexOf(b.entry));
            // 包含组：同组只留一个。粘滞成员优先；可选按关键词得分淘汰；有「组内优先」的取优先级最高者；否则按权重随机。
            const groups = {};
            now.forEach(item => item.entry.group.split(/,\s*/).filter(Boolean).forEach(name => (groups[name] ||= []).push(item)));
            const removed = new Set();
            for (const [name,members] of Object.entries(groups)) {
                let pool = members.filter(item => !removed.has(item));
                const stickyMembers = pool.filter(item => sticky.has(keyOf(item.entry)));
                if (stickyMembers.length) { pool.filter(item => !stickyMembers.includes(item)).forEach(item => removed.add(item)); continue; }
                if ([...activated.values()].some(item => item.entry.group === name)) { pool.forEach(item => removed.add(item)); continue; }
                if (settings.useGroupScoring || pool.some(item => item.entry.useGroupScoring)) {
                    const scores = pool.map(item => loreGroupScore(item.entry,bufferFor(item.entry,state).text,settings));
                    const best = Math.max(...scores);
                    pool = pool.filter((item,index) => { const scored = item.entry.useGroupScoring ?? settings.useGroupScoring; if (scored && scores[index] < best) { removed.add(item); return false; } return true; });
                }
                if (pool.length <= 1) continue;
                const preferred = pool.filter(item => item.entry.groupOverride).sort((a,b) => (b.entry.priority || 0) - (a.entry.priority || 0))[0];
                let winner = preferred;
                if (!winner) {
                    const total = pool.reduce((sum,item) => sum + item.entry.groupWeight,0);
                    const roll = random() * total;
                    let acc = 0;
                    winner = pool.find(item => { acc += item.entry.groupWeight; return roll <= acc; }) || pool.at(-1);
                }
                pool.filter(item => item !== winner).forEach(item => { removed.add(item); if (state === 'initial') log.push({id:item.entry.id,title:item.entry.title,reason:`包含组「${name}」只保留一个，本次选中「${winner.entry.title}」`}); });
            }
            const candidates = now.filter(item => !removed.has(item));
            const succeeded = [];
            let ignoreLeft = candidates.filter(item => item.entry.ignoreBudget).length;
            for (const item of candidates) {
                const {entry} = item;
                ignoreLeft -= entry.ignoreBudget ? 1 : 0;
                // ST 在预算溢出后直接 break（除非后面还有忽略预算的条目）；这里改为逐条记录，结果相同，但能告诉用户哪些条目被挤掉。
                if (overflowed && !entry.ignoreBudget) { log.push({id:entry.id,title:entry.title,reason:'超出世界书预算'}); continue; }
                if (entry.useProbability && entry.probability < 100 && !sticky.has(keyOf(entry)) && random() * 100 > entry.probability) {
                    failedProbability.add(keyOf(entry));
                    log.push({id:entry.id,title:entry.title,reason:`概率 ${entry.probability}% 未抽中`});
                    continue;
                }
                const content = entry.text.replace(/^@@(?:activate|dont_activate)[^\n]*\n?/,'');
                const size = content.length;
                if (!entry.ignoreBudget && used + size > settings.budget) {
                    overflowed = true;
                    log.push({id:entry.id,title:entry.title,reason:'超出世界书预算'});
                    continue;
                }
                used += entry.ignoreBudget ? 0 : size;
                activated.set(keyOf(entry),{...item,content});
                succeeded.push(item);
            }
            const forRecursion = succeeded.filter(item => !item.entry.preventRecursion);
            if (settings.recursive && !overflowed && forRecursion.length) next = 'recursion';
            if (settings.recursive && !overflowed && state === 'minActivations' && recurse.length) next = 'recursion';
            if (!next && !overflowed && settings.minActivations > 0 && activated.size < settings.minActivations) {
                const depth = settings.scanDepth + skew;
                const overMax = (settings.minActivationsDepthMax > 0 && depth > settings.minActivationsDepthMax) || depth > scanTexts.length;
                if (!overMax) { next = 'minActivations'; skew += 1; }
            }
            if (!next && delayLevels.length) { next = 'recursion'; delayLevel = delayLevels.shift(); }
            state = next;
            if (state) {
                const text = forRecursion.map(item => activated.get(keyOf(item.entry))?.content || '').filter(Boolean).join('\n');
                if (text) recurse.push(text);
            }
        }
        const entries = [...activated.values()].sort((a,b) => (b.entry.priority || 0) - (a.entry.priority || 0)).map(item => ({...item.entry,text:item.content,hits:item.hits}));
        // 只有真正发送时才登记粘滞/冷却（ST 的 setTimedEffects 在 dry run 时跳过）。
        const timed = dryRun ? null : (() => {
            const next = normalizeLoreTimed(timedSource);
            ['sticky','cooldown'].forEach(type => {
                Object.entries(next[type]).forEach(([key,value]) => { if (turn >= value.end || (turn <= value.start && !value.protected)) delete next[type][key]; });
            });
            all.forEach(entry => {
                const value = timedSource.sticky[keyOf(entry)];
                if (value && entry.cooldown && turn >= value.end) next.cooldown[keyOf(entry)] = {start:turn,end:turn + entry.cooldown,protected:true};
            });
            entries.forEach(entry => ['sticky','cooldown'].forEach(type => {
                if (entry[type] && !next[type][keyOf(entry)]) next[type][keyOf(entry)] = {start:turn,end:turn + entry[type],protected:false};
            }));
            return next;
        })();
        return {entries,chars:used,budget:settings.budget,overflowed,loops,log,timed,sticky:[...sticky],cooldown:[...cooldown]};
    }

    function loreBudget(chat) {
        const scan = scanLore(chat);
        return {entries:scan.entries,chars:scan.chars,budget:scan.budget,truncated:scan.log.filter(item => item.reason === '超出世界书预算').length};
    }

    function parseWorldInfo(text) {
        let raw = null;
        try { raw = JSON.parse(String(text || '')); } catch { return null; }
        if (!plainRecord(raw) && !Array.isArray(raw)) return null;
        // 也接受直接拖进来的角色卡 JSON：取卡内嵌的 character_book。
        const book = plainRecord(raw.data?.character_book) ? raw.data.character_book : plainRecord(raw.character_book) ? raw.character_book : raw;
        const source = Array.isArray(book) ? book : (Array.isArray(book.entries) ? book.entries : plainRecord(book.entries) ? Object.values(book.entries) : []);
        const entries = normalizeBookEntries(source);
        if (!entries.length) return null;
        return {name:textValue(book.name,textValue(raw.name,textValue(raw.originalData?.name,'导入的世界书'))),source:'import',entries};
    }

    // ── 正则规则：本地文本清洗 ──────────────────────────────────────────────
    // 显示作用域作用于页面渲染，发送作用域作用于上下文组装。替换结果一律按纯文本
    // 渲染（不注入 HTML）——规则能改文字，不能变成脚本入口。
    function normalizeRegexRule(value,index = 0) {
        return {
            id:stableId(value?.id,`regex-${index}`),
            name:textValue(value?.name,`规则 ${index + 1}`),
            find:textValue(value?.find),
            replace:String(value?.replace ?? ''),
            scope:['display','send','both'].includes(value?.scope) ? value.scope : 'both',
            target:['assistant','user','all'].includes(value?.target) ? value.target : 'all',
            enabled:value?.enabled !== false,
            order:Number.isFinite(Number(value?.order)) ? Number(value.order) : index,
            note:textValue(value?.note),
            // ST 字段：替换前从捕获内容里删掉的字符串，以及只作用于第几条到第几条（0 = 最新一条）的深度范围。
            trimStrings:(Array.isArray(value?.trimStrings) ? value.trimStrings : []).filter(item => typeof item === 'string' && item).slice(0,20),
            minDepth:optionalNumber(value?.minDepth,-1,9999),
            maxDepth:optionalNumber(value?.maxDepth,0,9999),
        };
    }

    function parseFindExpression(find) {
        const raw = String(find ?? '');
        if (!raw) return {error:'请填写查找内容。'};
        if (raw.length > regexSourceLimit) return {error:`查找表达式过长（上限 ${regexSourceLimit} 字符）。`};
        // `/表达式/flags` 按正则解释，其余按纯文本处理（全部替换）；与 SillyTavern 的写法一致。
        const literal = raw.match(/^\/([^]*)\/([a-z]*)$/);
        if (!literal) return {source:raw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),flags:'g',plain:true};
        if (!literal[1]) return {error:'正则表达式不能为空。'};
        const flags = [...new Set(literal[2].split('').filter(char => 'gimsuy'.includes(char)))].join('');
        return {source:literal[1],flags};
    }

    function compileRegexRule(rule) {
        const parsed = parseFindExpression(rule?.find);
        if (parsed.error) return {error:parsed.error};
        try { return {regex:new RegExp(parsed.source,parsed.flags)}; }
        catch { return {error:'表达式无法解析，请检查括号、量词与转义。'}; }
    }

    function regexRuleApplies(rule,target,purpose) {
        if (!plainRecord(rule) || rule.enabled === false) return false;
        const scope = ['display','send','both'].includes(rule.scope) ? rule.scope : 'both';
        if (scope !== 'both' && scope !== purpose) return false;
        const only = ['assistant','user','all'].includes(rule.target) ? rule.target : 'all';
        return only === 'all' || only === target;
    }

    function orderedRules(rules) {
        return rules.map((rule,index) => ({rule,index}))
            .sort((a,b) => (Number(a.rule.order) || 0) - (Number(b.rule.order) || 0) || a.index - b.index)
            .map(item => item.rule);
    }

    // 规则集与文本解耦：通用入口给页面用，规则编辑器则用「草稿 + 已有规则」试跑未保存的改动。
    function applyRuleset(rules,text,{target = 'assistant',purpose = 'display',depth = null} = {}) {
        const truncated = String(text ?? '').length > regexTextLimit;
        let value = truncated ? String(text).slice(0,regexTextLimit) : String(text ?? '');
        const applied = [],errors = [];
        for (const rule of orderedRules(rules)) {
            if (!regexRuleApplies(rule,target,purpose)) continue;
            // ST：深度范围只在知道消息深度时检查（minDepth ≥ -1、maxDepth ≥ 0 才算设置过）。
            if (typeof depth === 'number' && ((rule.minDepth ?? null) !== null && rule.minDepth >= -1 && depth < rule.minDepth)) continue;
            if (typeof depth === 'number' && ((rule.maxDepth ?? null) !== null && rule.maxDepth >= 0 && depth > rule.maxDepth)) continue;
            const compiled = compileRegexRule(rule);
            if (compiled.error) { errors.push({id:rule.id,name:rule.name,message:compiled.error}); continue; }
            const before = value;
            let next = before;
            try { next = before.replace(compiled.regex,(...args) => regexReplacement(rule,args)); }
            catch { errors.push({id:rule.id,name:rule.name,message:'替换时出错，已跳过这条规则。'}); continue; }
            if (next === before) continue;
            const hits = before.match(compiled.regex);
            const count = compiled.regex.global ? (hits ? hits.length : 0) : (hits ? 1 : 0);
            if (!count) continue;
            applied.push({id:rule.id,name:rule.name,count});
            value = next;
        }
        return {text:value,applied,errors,truncated};
    }

    // 替换串语义与 ST runRegexScript 一致：{{match}} = $0，$1 / $<名> 取捕获组，捕获内容先删掉 trimStrings。
    function regexReplacement(rule,args) {
        const groups = plainRecord(args.at(-1)) ? args.at(-1) : null;
        const values = args.slice(0,groups ? -3 : -2);
        const trim = value => (rule.trimStrings || []).reduce((text,item) => text.split(item).join(''),String(value ?? ''));
        return String(rule.replace ?? '').replace(/\{\{match\}\}/gi,'$0').replace(/\$(\d+)|\$<([^>]+)>|\$&/g,(token,number,name) => {
            if (token === '$&') return trim(values[0]);
            const value = number !== undefined ? values[Number(number)] : groups?.[name];
            return value ? trim(value) : '';
        });
    }

    function cardRegexAllowed(character) {
        return Boolean(character?.id) && allowedCardRegex.includes(character.id);
    }

    function setCardRegexAllowed(characterId,allowed) {
        const before = allowedCardRegex.slice();
        allowedCardRegex = allowed ? [...new Set([...allowedCardRegex,characterId])] : allowedCardRegex.filter(id => id !== characterId);
        if (saveState()) return true;
        allowedCardRegex = before;
        return false;
    }

    // 规则来源与 ST 的三类脚本一致：全局 → 角色卡（需要逐卡授权）。预设脚本本原型没有。
    function activeRegexRules(chat) {
        const character = chat ? chatCharacter(chat) : null;
        const scoped = cardRegexAllowed(character) && Array.isArray(character.regexScripts) ? character.regexScripts.map(rule => ({...rule,scopedTo:character.id})) : [];
        return [...regexRules,...scoped];
    }

    function applyRegexRules(text,options = {}) {
        return applyRuleset(activeRegexRules(options.chat === undefined ? currentChat : options.chat),text,options);
    }

    function messageTarget(message) {
        const role = message?.role;
        return role === 'user' ? 'user' : role === 'system' ? 'system' : 'assistant';
    }

    function displayMessageText(message,depth = null) {
        const applied = applyRegexRules(message?.text,{target:messageTarget(message),purpose:'display',depth}).text;
        // 状态块由变量面板呈现，默认不在正文里重复显示；关掉这个开关就能看到模型原始输出。
        return hideStatusBlock ? stripStatusBlock(applied) : applied;
    }

    // 规则改动后立刻重绘已渲染的消息，否则显示作用域要等下一次重绘才生效。
    function refreshRenderedMessages() {
        if (currentChat && $('#messages')) drawMessages();
    }

    // 兼容 SillyTavern 的正则导出：name / findRegex / replaceString / disabled / placement。
    function parseRegexImport(text) {
        let raw = null;
        try { raw = JSON.parse(String(text || '')); } catch { return null; }
        const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.regex) ? raw.regex : Array.isArray(raw?.rules) ? raw.rules : []);
        const rules = list.filter(plainRecord).map((item,index) => {
            // ST placement：1 = 玩家输入，2 = 角色输出；markdownOnly = 只改显示，promptOnly = 只改发送内容。
            const placement = Array.isArray(item.placement) ? item.placement.map(Number) : [];
            const target = placement.length
                ? (placement.includes(1) && placement.includes(2) ? 'all' : placement.includes(2) ? 'assistant' : placement.includes(1) ? 'user' : 'all')
                : 'all';
            const scope = item.scope ?? (item.markdownOnly === true && item.promptOnly !== true ? 'display' : item.promptOnly === true && item.markdownOnly !== true ? 'send' : 'both');
            return normalizeRegexRule({
                id:item.id,
                name:textValue(item.name,textValue(item.scriptName)),
                find:textValue(item.findRegex,textValue(item.find,textValue(item.regex))),
                replace:item.replaceString ?? item.replace ?? '',
                scope,
                target:item.target ?? target,
                enabled:item.disabled === true ? false : item.enabled,
                note:textValue(item.note),
                trimStrings:item.trimStrings,
                minDepth:item.minDepth,
                maxDepth:item.maxDepth,
            },index);
        }).filter(rule => rule.find);
        return rules.length ? rules : null;
    }

    // ── 预设与提示词组装 ────────────────────────────────────────────────────
    function promptDefaultPreset() {
        return {
            id:'preset-local-default',
            name:'默认 · 本地模拟',
            system:'你是这个故事里的角色。保持角色口吻与已建立的设定，不替玩家决定行动，不复述玩家的设定。',
            jailbreak:'',
            params:{temperature:0.9,topP:0.95,maxTokens:400},
            order:promptBlockDefs.map(([key]) => ({key,enabled:true})),
        };
    }

    function clampNumber(value,min,max,fallback) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(Math.max(number,min),max);
    }

    function normalizePresetOrder(list,custom = []) {
        const valid = new Set([...promptBlockDefs.map(([key]) => key),...custom.map(block => block.id)]);
        const seen = new Set();
        const order = [];
        (Array.isArray(list) ? list : []).filter(plainRecord).forEach(item => {
            const key = valid.has(item.key) ? item.key : '';
            if (!key || seen.has(key)) return;
            seen.add(key);
            order.push({key,enabled:item.enabled !== false});
        });
        promptBlockDefs.forEach(([key]) => { if (!seen.has(key)) order.push({key,enabled:true}); });
        // 新加的自定义块默认排在「最近消息」之前（ST 新建的 prompt 也加在 chatHistory 前）。
        custom.forEach(block => {
            if (seen.has(block.id)) return;
            const at = order.findIndex(item => item.key === 'history');
            order.splice(at < 0 ? order.length : at,0,{key:block.id,enabled:true});
        });
        return order;
    }

    // 自定义提示块：ST PromptManager 的 prompt（identifier / name / role / content / injection_position / injection_depth / injection_order / injection_trigger）。
    // 相对位置的块按预设顺序进入；绝对位置（聊天内）的块按深度插进历史，与世界书 @D、角色深度提示同一套规则。
    function normalizeCustomBlock(value,index = 0) {
        const id = typeof value?.id === 'string' && /^custom-[a-zA-Z0-9_-]+$/.test(value.id) ? value.id : `custom-${index + 1}`;
        return {
            id,
            name:textValue(value?.name,`自定义块 ${index + 1}`).slice(0,40),
            content:textValue(value?.content),
            role:loreRoles.includes(value?.role) ? value.role : 'system',
            injection:value?.injection === 'depth' ? 'depth' : 'relative',
            depth:optionalNumber(value?.depth,0,999) ?? 4,
            order:optionalNumber(value?.order,0,9999) ?? 100,
            triggers:(Array.isArray(value?.triggers) ? value.triggers : []).filter(key => loreTriggerTypes.some(([value]) => value === key)),
        };
    }

    function normalizePreset(value,index = 0) {
        const params = plainRecord(value?.params) ? value.params : {};
        const seen = new Set();
        const customBlocks = (Array.isArray(value?.custom) ? value.custom : []).filter(plainRecord).map(normalizeCustomBlock).filter(block => !seen.has(block.id) && seen.add(block.id)).slice(0,30);
        return {
            id:stableId(value?.id,`preset-${index}`),
            name:textValue(value?.name,`预设 ${index + 1}`),
            system:textValue(value?.system),
            jailbreak:textValue(value?.jailbreak),
            params:{
                temperature:clampNumber(params.temperature,0,2,0.9),
                topP:clampNumber(params.topP,0.05,1,0.95),
                topK:Math.round(clampNumber(params.topK,0,200,0)),
                minP:clampNumber(params.minP,0,1,0),
                typicalP:clampNumber(params.typicalP,0,1,1),
                repetitionPenalty:clampNumber(params.repetitionPenalty,1,2,1.1),
                repetitionPenaltyRange:Math.round(clampNumber(params.repetitionPenaltyRange,0,8192,1024)),
                repetitionPenaltySlope:clampNumber(params.repetitionPenaltySlope,0,10,0.7),
                presencePenalty:clampNumber(params.presencePenalty,-2,2,0),
                frequencyPenalty:clampNumber(params.frequencyPenalty,-2,2,0),
                maxTokens:Math.round(clampNumber(params.maxTokens,16,8192,400)),
                seed:Math.round(clampNumber(params.seed,-1,2147483647,-1)),
            },
            contextTemplate:textValue(value?.contextTemplate, DEFAULT_CONTEXT_TEMPLATE),
            instruct:{
                enabled:plainRecord(value?.instruct) && value.instruct.enabled === true,
                input:textValue(value?.instruct?.input),
                output:textValue(value?.instruct?.output),
                system:textValue(value?.instruct?.system),
                stop:textValue(value?.instruct?.stop),
            },
            custom:customBlocks,
            order:normalizePresetOrder(value?.order,customBlocks),
            forbidOverrides:value?.forbidOverrides === true,
        };
    }

    function presetById(id) {
        return presets.find(preset => preset.id === id) || null;
    }

    function ensureDefaultPreset() {
        if (!presets.length) presets = [normalizePreset(promptDefaultPreset())];
        if (!presetById(activePresetId)) activePresetId = presets[0].id;
    }

    function activePreset(chat) {
        const chatPreset = presetById(typeof chat?.presetId === 'string' ? chat.presetId : '');
        return chatPreset || presetById(activePresetId) || presets[0] || promptDefaultPreset();
    }

    // 角色卡字段：会话里冻结的快照优先（开始故事那一刻的版本），否则取当前角色。
    function cardField(chat,field) {
        const snapshot = plainRecord(chat?.characterSnapshot) ? chat.characterSnapshot : chatCharacter(chat);
        return snapshot?.[field];
    }

    // ST：角色卡的 system_prompt 覆盖预设主提示词，post_history_instructions 覆盖后置提示；
    // 卡内可写 {{original}} 引用被覆盖的原文。预设可以「禁止覆盖」（ST 的 forbid_overrides）。
    function overridePrompt(base,override,allowed) {
        const value = textValue(override).trim();
        if (!allowed || !value) return textValue(base);
        return value.replace(/\{\{original\}\}/gi,() => textValue(base));
    }

    function exampleBlocks(text) {
        const source = textValue(text).trim();
        if (!source || source === '<START>') return [];
        const normalized = /^<START>/i.test(source) ? source : `<START>\n${source}`;
        return normalized.split(/<START>/gi).slice(1).map(block => block.trim()).filter(Boolean);
    }

    function noteSettings(chat) {
        const source = plainRecord(chatContext(chat).noteSettings) ? chatContext(chat).noteSettings : {};
        return {
            interval:optionalNumber(source.interval,0,999) ?? noteDefaults.interval,
            position:notePositions.some(([key]) => key === source.position) ? source.position : noteDefaults.position,
            depth:optionalNumber(source.depth,0,999) ?? noteDefaults.depth,
            role:loreRoles.includes(source.role) ? source.role : noteDefaults.role,
        };
    }

    // ST 的 setFloatingPrompt：按玩家消息数计算这一轮是否插入作者注释。频率 1 每轮都插，0 表示关闭。
    function noteActive(chat) {
        const {interval} = noteSettings(chat);
        if (interval <= 0) return {active:false,remaining:null};
        const count = interval === 1 ? 1 : chat.messages.filter(message => message.role === 'user').length;
        if (count <= 0) return {active:false,remaining:interval};
        const remaining = count >= interval ? count % interval : interval - count;
        return {active:remaining === 0,remaining};
    }

    // 作者注释的完整文本：世界书「作者注释前/后」与身份描述（若放在作者注释前后）一起贴在注释两侧。
    // ST 里这些只在作者注释本轮生效时才加入（shouldWIAddPrompt）。
    function authorNoteText(chat,scan) {
        const loreAt = position => scan.entries.filter(entry => entry.position === position).map(entry => `【${entry.title}】${entry.text}`).join('\n');
        const persona = getPersona(chat.personaId);
        const personaText = textValue(persona.description).trim();
        const placement = normalizePersonaFields(persona).descriptionPosition;
        return [loreAt('anTop'),placement === 'anTop' ? personaText : '',textValue(chatContext(chat).note),placement === 'anBottom' ? personaText : '',loreAt('anBottom')].filter(Boolean).join('\n');
    }

    function promptBlockText(chat,key,lore = null) {
        const preset = activePreset(chat);
        if (key === 'system') return overridePrompt(preset.system,cardField(chat,'systemPrompt'),preset.forbidOverrides !== true);
        if (key === 'jailbreak') return overridePrompt(preset.jailbreak,cardField(chat,'postHistory'),preset.forbidOverrides !== true);
        const character = chatCharacter(chat);
        const scan = lore || scanLore(chat);
        const loreAt = position => scan.entries.filter(entry => entry.position === position).map(entry => `【${entry.title}】${entry.text}`).join('\n');
        if (key === 'character') {
            const snapshot = plainRecord(chat?.characterSnapshot) ? chat.characterSnapshot : character;
            // 角色块按预设的上下文模板组装（占位符为空的行自动省略）；世界书「角色设定之后」的条目紧跟在后面。
            const body = renderContextTemplate(preset.contextTemplate, {
                char: textValue(snapshot.name,character.name),
                hook: textValue(snapshot.hook),
                description: textValue(snapshot.cardDescription),
                personality: textValue(snapshot.personality),
                scenario: textValue(snapshot.scenario),
                // 内置角色没有拆分字段，只有拼好的 description；自创/导入角色已有上面三项，不重复。
                legacy: !snapshot.local && snapshot.description ? textValue(snapshot.description) : '',
                instructions: textValue(snapshot.instructions),
            });
            return [body, loreAt('after')].filter(Boolean).join('\n');
        }
        if (key === 'persona') {
            const persona = getPersona(chat.personaId);
            const inBlock = normalizePersonaFields(persona).descriptionPosition === 'prompt';
            return [`【身份】${persona.name}`,inBlock && persona.description ? `【说明】${persona.description}` : ''].filter(Boolean).join('\n');
        }
        // 「世界书命中」块放「角色设定之前」的条目（ST 的 worldInfoBefore）。插入深度与出口条目不在固定块里。
        if (key === 'lore') return loreAt('before');
        if (key === 'examples') {
            const blocks = exampleBlocks(cardField(chat,'mesExample')).map(block => `<START>\n${block}`);
            return [loreAt('emTop'),...blocks,loreAt('emBottom')].filter(Boolean).join('\n');
        }
        if (key === 'autosummary') return textValue(plainRecord(chat.summary) ? chat.summary.text : '');
        if (key === 'rag') {
            const prefs = ragPrefs(chat);
            if (!prefs.enabled) return '';
            const query = [...chat.messages].reverse().find(message => message.role === 'user' && !message.hidden)?.text || '';
            const chunks = ragChunks(chat, query, prefs.topK);
            if (!chunks.length) return '';
            const speaker = chatCharacter(chat).name;
            return chunks.map(item => `［更早的对话 · 第 ${item.index + 1} 条］${item.role === 'user' ? '你' : speaker}：${item.text}`).join('\n');
        }
        if (key === 'memory') return textValue(chatContext(chat).memory);
        if (key === 'note') {
            const settings = noteSettings(chat);
            if (settings.position === 'depth' || !noteActive(chat).active) return '';
            return authorNoteText(chat,scan);
        }
        return '';
    }

    function historyLines(chat,limit,budget,lore = null) {
        // ST 的 Instruct 模式：按消息角色给历史行加序列前缀，历史块末尾可追加停止序列。
        const instruct = activePreset(chat).instruct || {};
        const prefixFor = role => instruct.enabled ? textValue(instruct[role === 'user' ? 'input' : role === 'system' ? 'system' : 'output']) : '';
        const all = chat.messages.filter(message => !message.hidden).slice(-limit);
        const lines = [];
        let chars = 0;
        for (let index = all.length - 1; index >= 0; index -= 1) {
            const message = all[index];
            const depth = all.length - 1 - index;
            const speaker = message.role === 'user'
                ? (plainRecord(message.personaSnapshot) ? message.personaSnapshot.name : '玩家（旧记录未标注身份）')
                : message.role === 'system' ? '系统记录' : chatCharacter(chat).name;
            const text = applyRegexRules(message.text,{target:messageTarget(message),purpose:'send',chat,depth}).text;
            const line = `${prefixFor(message.role)}${speaker}：${text}`;
            // 最新一条无论多长都保留，避免出现"没有历史"的假象；更早的按剩余预算丢弃。
            if (lines.length && chars + line.length > budget) break;
            lines.unshift(line);
            chars += line.length;
        }
        const dropped = all.length - lines.length;
        // 「插入历史深度」的世界书条目：深度 0 放在最新一条之后，深度 N 放在倒数第 N 条之前（ST 的 @D）。
        // 角色卡的深度提示（ST 的 depth_prompt，常被叫作「角色备注」）走同一条路。
        const depthPrompt = plainRecord(cardField(chat,'depthPrompt')) ? cardField(chat,'depthPrompt') : null;
        const cardInjection = depthPrompt && textValue(depthPrompt.text).trim() ? [{title:'角色深度提示',text:textValue(depthPrompt.text).trim(),depth:optionalNumber(depthPrompt.depth,0,999) ?? 4,role:loreRoles.includes(depthPrompt.role) ? depthPrompt.role : 'system',card:true}] : [];
        const note = noteSettings(chat);
        const noteText = lore && note.position === 'depth' && noteActive(chat).active ? authorNoteText(chat,lore) : '';
        const noteInjection = noteText ? [{title:'作者注释',text:noteText,depth:note.depth,role:note.role,kind:'note'}] : [];
        const persona = getPersona(chat.personaId);
        const personaFields = normalizePersonaFields(persona);
        const personaInjection = personaFields.descriptionPosition === 'depth' && textValue(persona.description).trim() ? [{title:'玩家身份',text:textValue(persona.description).trim(),depth:personaFields.descriptionDepth,role:personaFields.descriptionRole,kind:'persona'}] : [];
        const customInjection = (lore?.customDepth || []).map(block => ({title:block.name,text:block.content,depth:block.depth,role:block.role,kind:'custom',order:block.order}));
        const injected = [...cardInjection,...noteInjection,...personaInjection,...customInjection,...(lore?.entries || []).filter(entry => entry.position === 'depth')];
        if (injected.length) {
            const roleLabel = {system:'系统',user:'玩家',assistant:'角色'};
            [...new Set(injected.map(entry => entry.depth))].sort((a,b) => b - a).forEach(depth => {
                const group = injected.filter(entry => entry.depth === depth);
                const at = Math.max(lines.length - depth,0);
                // 同一深度按 ST 的顺序：系统 → 玩家 → 角色；同角色内自定义块按 injection_order 由大到小。
                const ordered = ['system','user','assistant'].flatMap(role => group.filter(entry => (entry.role || 'system') === role).sort((a,b) => (b.order ?? 100) - (a.order ?? 100)));
                const kindLabel = {note:'作者注释',persona:'玩家身份',custom:'自定义'};
                const block = ordered.map(entry => entry.card ? `［角色深度提示 · ${roleLabel[entry.role] || '系统'} · 深度 ${depth}］${entry.text}` : entry.kind ? `［${kindLabel[entry.kind]} · ${roleLabel[entry.role] || '系统'} · 深度 ${depth}］${entry.kind === 'custom' ? `${entry.title}：` : ''}${entry.text}` : `［世界书 · ${roleLabel[entry.role] || '系统'} · 深度 ${depth}］${entry.title}：${entry.text}`);
                lines.splice(at,0,...block);
                chars += block.reduce((sum,line) => sum + line.length,0);
            });
        }
        const stop = instruct.enabled ? textValue(instruct.stop) : '';
        if (stop) { lines.push(stop); chars += stop.length; }
        return {text:lines.join('\n'),chars,dropped,injected:injected.length};
    }

    // ST tokenizers.js 的 guesstimate：UTF-8 字节数 ÷ 3.35，向上取整。只是估算，真实模型的分词会不同。
    function estimateTokens(text) {
        const value = String(text ?? '');
        let bytes = 0;
        for (const char of value) { const code = char.codePointAt(0); bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4; }
        return Math.ceil(bytes / 3.35);
    }

    function assemblePrompt(chat,{historyLimit = 8,trigger = 'normal',commit = false} = {}) {
        const preset = activePreset(chat);
        const custom = Array.isArray(preset.custom) ? preset.custom : [];
        const order = normalizePresetOrder(preset.order,custom);
        const lore = scanLore(chat,{trigger,dryRun:!commit});
        const triggered = block => !block.triggers.length || block.triggers.includes(trigger);
        // 聊天内（绝对位置）的自定义块交给历史插入；只算启用的。
        lore.customDepth = custom.filter(block => block.injection === 'depth' && block.content.trim() && triggered(block) && order.find(item => item.key === block.id)?.enabled !== false);
        const blocks = [];
        let reserved = 0;
        for (const item of order) {
            const customBlock = custom.find(block => block.id === item.key);
            if (customBlock) {
                if (customBlock.injection === 'depth') continue;
                const label = customBlock.name, note = '自定义块';
                if (!item.enabled || !triggered(customBlock)) { blocks.push({key:customBlock.id,label,note,text:'',chars:0,enabled:false,custom:true}); continue; }
                const text = customBlock.content;
                reserved += text.length;
                blocks.push({key:customBlock.id,label,note,text,chars:text.length,enabled:true,custom:true});
                continue;
            }
            const def = promptBlockDefs.find(([key]) => key === item.key);
            if (!def) continue;
            const [key,label,note] = def;
            if (!item.enabled) { blocks.push({key,label,note,text:'',chars:0,enabled:false}); continue; }
            if (key === 'history') { blocks.push({key,label,note,text:'',chars:0,enabled:true,deferred:true,dropped:0}); continue; }
            const text = promptBlockText(chat,key,lore);
            reserved += text.length;
            blocks.push({key,label,note,text,chars:text.length,enabled:true});
        }
        const historyBlock = blocks.find(block => block.deferred);
        if (historyBlock) {
            const history = historyLines(chat,historyLimit,Math.max(promptCharBudget - reserved,0),lore);
            historyBlock.text = history.text;
            historyBlock.chars = history.chars;
            historyBlock.dropped = history.dropped;
            historyBlock.injected = history.injected;
            historyBlock.deferred = false;
        }
        // 出口条目：只在 {{outlet::名称}} 宏处展开（ST 的 Outlet 位置）。
        const outlets = {};
        lore.entries.filter(entry => entry.position === 'outlet' && entry.outletName).forEach(entry => { (outlets[entry.outletName] ||= []).push(entry.text); });
        // 宏在组装时解析；预览只读不写，真正执行 setvar 的是发送那一刻。
        // 历史块不再解析宏：ST 在玩家发送时就把消息里的宏替换掉了，存进历史的已经是结果。
        const macroActions = [], macroUnknown = new Set();
        blocks.forEach(block => {
            if (!block.enabled || !block.text || block.key === 'history') return;
            const resolved = resolveMacros(block.text,chat,{commit,outlets});
            block.text = resolved.text;
            block.chars = block.text.length;
            resolved.actions.forEach(action => macroActions.push(action));
            resolved.unknown.forEach(name => macroUnknown.add(name));
        });
        // 作者注释「主提示词之前」：ST 的 BEFORE_PROMPT 插在主提示词（系统提示）前面；「之后」是 IN_PROMPT，紧跟主提示词。
        const noteBlock = blocks.find(block => block.key === 'note');
        const notePosition = noteSettings(chat).position;
        if (noteBlock && noteBlock.text && (notePosition === 'before' || notePosition === 'after')) {
            const systemIndex = blocks.findIndex(block => block.key === 'system');
            if (systemIndex >= 0) {
                blocks.splice(blocks.indexOf(noteBlock),1);
                blocks.splice(notePosition === 'before' ? systemIndex : blocks.findIndex(block => block.key === 'system') + 1,0,noteBlock);
            }
        }
        const sections = blocks.filter(block => block.enabled && block.text).map(block => `### ${block.label}\n${block.text}`);
        const chars = blocks.reduce((sum,block) => sum + (block.enabled ? block.chars : 0),0);
        blocks.forEach(block => { block.tokens = block.enabled ? estimateTokens(block.text) : 0; });
        const text = sections.join('\n\n');
        return {preset,blocks,text,chars,tokens:estimateTokens(text),budget:promptCharBudget,overBudget:chars > promptCharBudget,macroActions,macroUnknown:[...macroUnknown],lore};
    }

    // 兼容 SillyTavern 的预设导出：temperature / top_p / openai_max_tokens / prompts[]。
    function parsePresetImport(text) {
        let raw = null;
        try { raw = JSON.parse(String(text || '')); } catch { return null; }
        if (!plainRecord(raw)) return null;
        const prompts = Array.isArray(raw.prompts) ? raw.prompts.filter(plainRecord) : [];
        const systemPrompt = prompts.find(item => item.system_prompt === true || item.identifier === 'main');
        const jailbreak = prompts.find(item => /jailbreak/i.test(String(item.identifier || item.name || '')));
        // ST 内置的标记块（marker）与系统块映射到本原型的固定块；其余带内容的 prompt 成为自定义块。
        const builtin = {main:'system',jailbreak:'jailbreak',chatHistory:'history',dialogueExamples:'examples',worldInfoBefore:'lore',charDescription:'character',charPersonality:'character',scenario:'character',personaDescription:'persona'};
        const skip = new Set(['main','jailbreak','chatHistory','dialogueExamples','worldInfoBefore','worldInfoAfter','charDescription','charPersonality','scenario','personaDescription','enhanceDefinitions','nsfw']);
        const custom = prompts.filter(item => !skip.has(item.identifier) && !item.marker && textValue(item.content).trim()).map((item,index) => normalizeCustomBlock({
            id:'custom-' + String(item.identifier || index).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40),name:textValue(item.name,'自定义块'),content:item.content,role:item.role,
            injection:Number(item.injection_position) === 1 ? 'depth' : 'relative',depth:item.injection_depth,order:item.injection_order,triggers:item.injection_trigger,
        },index));
        // ST 的 prompt_order：取第一个角色（或全局 100001）的顺序与开关；enhanceDefinitions / nsfw 这类有内容的系统块并入系统提示。
        const orderList = (Array.isArray(raw.prompt_order) ? (raw.prompt_order.find(item => String(item.character_id) === '100001') || raw.prompt_order[0]) : null)?.order || [];
        const extras = ['nsfw','enhanceDefinitions'].map(id => prompts.find(item => item.identifier === id)).filter(item => item && textValue(item.content).trim() && orderList.find(entry => entry.identifier === item.identifier)?.enabled !== false);
        const seen = new Set();
        const order = orderList.map(entry => {
            const key = builtin[entry.identifier] || custom.find(block => block.id === 'custom-' + String(entry.identifier).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40))?.id;
            if (!key || seen.has(key)) return null;
            seen.add(key);
            return {key,enabled:entry.enabled !== false};
        }).filter(Boolean);
        const preset = normalizePreset({
            name:textValue(raw.name,textValue(raw.preset_name,'导入的预设')),
            system:[textValue(systemPrompt?.content,textValue(raw.system_prompt)),...extras.map(item => item.content)].filter(Boolean).join('\n\n'),
            jailbreak:textValue(jailbreak?.content),
            params:{
                temperature:raw.temperature,topP:raw.top_p,topK:raw.top_k,minP:raw.min_p,typicalP:raw.typical_p,
                repetitionPenalty:raw.repetition_penalty ?? raw.rep_pen,
                repetitionPenaltyRange:raw.repetition_penalty_range ?? raw.rep_pen_range,
                repetitionPenaltySlope:raw.repetition_penalty_slope ?? raw.rep_pen_slope,
                presencePenalty:raw.presence_penalty ?? raw.presence_pen,
                frequencyPenalty:raw.frequency_penalty ?? raw.freq_pen,
                maxTokens:raw.openai_max_tokens ?? raw.max_tokens ?? raw.n_predict,
                seed:raw.seed,
            },
            custom,
            order:order.length ? order : promptBlockDefs.map(([key]) => ({key,enabled:key !== 'jailbreak'})),
            contextTemplate:convertStoryString(raw.story_string) || undefined,
            instruct:{
                enabled:Boolean(raw.input_sequence || raw.output_sequence || raw.system_sequence),
                input:raw.input_sequence, output:raw.output_sequence, system:raw.system_sequence, stop:raw.stop_sequence,
            },
            forbidOverrides:systemPrompt?.forbid_overrides === true,
        },presets.length);
        return preset;
    }

    // ── 变量、宏与状态栏 ────────────────────────────────────────────────────
    // 变量分两层：会话变量存在 chat.context.vars，全局变量跨会话共享。宏在组装或发送时解析；
    // 预览走 dry run（只读不写），副作用只发生在真正发送的那一刻。
    function normalizeVars(value) {
        if (!plainRecord(value)) return {};
        const vars = {};
        Object.entries(value).slice(0,varCountLimit).forEach(([key,item]) => {
            const name = textValue(key).trim().slice(0,varKeyLimit);
            if (!name) return;
            vars[name] = String(item ?? '').slice(0,varValueLimit);
        });
        return vars;
    }

    function chatVars(chat) {
        if (!plainRecord(chat.context)) chat.context = {};
        if (!plainRecord(chat.context.vars)) chat.context.vars = {};
        return chat.context.vars;
    }

    function readVar(chat,scope,key) {
        const name = String(key ?? '').trim();
        if (!name) return '';
        const store = scope === 'global' ? globalVars : chatVars(chat);
        return textValue(store[name]);
    }

    function writeVar(chat,scope,key,value) {
        const name = String(key ?? '').trim().slice(0,varKeyLimit);
        if (!name) return '';
        const store = scope === 'global' ? globalVars : chatVars(chat);
        store[name] = String(value ?? '').slice(0,varValueLimit);
        return name;
    }

    function removeVar(chat,scope,key) {
        const store = scope === 'global' ? globalVars : chatVars(chat);
        delete store[String(key ?? '').trim()];
    }

    function stepVar(chat,scope,key,step,commit,actions) {
        const base = Number(readVar(chat,scope,key));
        const next = String((Number.isFinite(base) ? base : 0) + step);
        actions.push({kind:step > 0 ? 'incvar' : 'decvar',scope,key,value:next});
        if (commit) writeVar(chat,scope,key,next);
        return next;
    }

    // 宏：名字与语义对照 SillyTavern 1.19.0 的 macros/definitions（core / env / chat / time / variable）。
    // 未支持的宏原样保留（ST 也这样）；预览只读不写，写操作只在真正生成时执行。
    const macroGroups = [
        ['变量',['getvar::键','setvar::键::值','addvar::键::值','incvar::键','decvar::键','hasvar::键','deletevar::键','getglobalvar::键','setglobalvar::键::值','addglobalvar::键::值','incglobalvar::键','decglobalvar::键','hasglobalvar::键','deleteglobalvar::键']],
        ['角色与身份',['char','user','persona','charDescription','charPersonality','charScenario','charPrompt','charInstruction','charDepthPrompt','charCreatorNotes','charFirstMessage','mesExamplesRaw','charVersion']],
        ['聊天',['lastMessage','lastUserMessage','lastCharMessage','lastMessageId','input']],
        ['随机',['random::甲::乙::丙','pick::甲::乙::丙','roll::1d20']],
        ['时间',['time','date','weekday','isotime','isodate','datetimeformat::YYYY-MM-DD HH:mm']],
        ['文本',['newline','space::2','trim','noop','reverse::文字','// 注释','outlet::出口名称']],
    ];
    const macroNames = macroGroups.flatMap(([,items]) => items.map(item => item.split('::')[0].split(' ')[0]));

    // ST 的 droll 语法子集：NdM、NdM+K、NdM-K；最多 100 个骰子、每个最多 1000 面。
    function rollDice(formula,random = Math.random) {
        const match = String(formula ?? '').trim().replace(/\s+/g,'').match(/^(\d*)d(\d+)([+-]\d+)?$/i);
        if (!match) return null;
        const count = Number(match[1] || 1), sides = Number(match[2]), bonus = Number(match[3] || 0);
        if (count < 1 || count > 100 || sides < 1 || sides > 1000) return null;
        let total = bonus;
        for (let index = 0; index < count; index += 1) total += 1 + Math.floor(random() * sides);
        return total;
    }

    // ST 的 readSingleArgsRandomList：只有一个参数时按逗号分（\, 转义成逗号）。
    function macroList(args) {
        if (args.length !== 1) return args.map(item => item.trim());
        return args[0].replace(/\\,/g,'\u0000').split(',').map(item => item.trim().replace(/\u0000/g,','));
    }

    // 时间宏用 moment 的少量格式记号；本原型不引入 moment，只实现常用的 YYYY MM DD HH mm ss 与 dddd。
    function formatDate(format,date = new Date()) {
        const pad = value => String(value).padStart(2,'0');
        const weekday = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][date.getDay()];
        return String(format).replace(/YYYY|MM|DD|HH|mm|ss|dddd/g,token => ({YYYY:date.getFullYear(),MM:pad(date.getMonth() + 1),DD:pad(date.getDate()),HH:pad(date.getHours()),mm:pad(date.getMinutes()),ss:pad(date.getSeconds()),dddd:weekday})[token]);
    }

    function addVar(chat,scope,key,value,commit,actions) {
        const current = readVar(chat,scope,key);
        const next = current !== '' && Number.isFinite(Number(current)) && value !== '' && Number.isFinite(Number(value)) ? String(Number(current) + Number(value)) : current + value;
        actions.push({kind:scope === 'global' ? 'addglobalvar' : 'addvar',scope,key,value:next});
        if (commit) writeVar(chat,scope,key,next);
    }

    function resolveMacros(text,chat,{commit = false,outlets = null,random = null,now = null} = {}) {
        const source = String(text ?? '');
        const actions = [],unknown = [];
        if (!source.includes('{{')) return {text:source,actions,unknown};
        const character = chatCharacter(chat);
        const persona = getPersona(chat?.personaId);
        const snapshot = plainRecord(chat?.characterSnapshot) ? chat.characterSnapshot : character;
        const visible = (chat?.messages || []).filter(message => !message.hidden);
        const date = now || new Date();
        // {{random}} 每次都重抽（预览也是）；{{pick}} 按会话与宏在文本中的位置固定，同一会话多次组装结果一样（ST 的 pick）。
        const roll = random || Math.random;
        // ST 的 {{// 注释}} 与 {{trim}}：注释直接删掉；trim 去掉宏两侧的换行。
        let value = source.replace(/\{\{\/\/[^}]*\}\}/g,'');
        value = value.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)((?:::[^{}\n]*)*)\}\}/g,(match,name,rest,offset) => {
            const args = rest ? rest.slice(2).split('::') : [];
            const key = textValue(args[0]).trim();
            const nextValue = args.slice(1).join('::');
            switch (name.toLowerCase()) {
                case 'getvar': return readVar(chat,'local',key);
                case 'getglobalvar': return readVar(chat,'global',key);
                case 'setvar':
                    actions.push({kind:'setvar',scope:'local',key,value:textValue(nextValue)});
                    if (commit) writeVar(chat,'local',key,nextValue);
                    return '';
                case 'setglobalvar':
                    actions.push({kind:'setglobalvar',scope:'global',key,value:textValue(nextValue)});
                    if (commit) writeVar(chat,'global',key,nextValue);
                    return '';
                case 'addvar': addVar(chat,'local',key,nextValue,commit,actions); return '';
                case 'addglobalvar': addVar(chat,'global',key,nextValue,commit,actions); return '';
                case 'incvar': return stepVar(chat,'local',key,1,commit,actions);
                case 'decvar': return stepVar(chat,'local',key,-1,commit,actions);
                case 'incglobalvar': return stepVar(chat,'global',key,1,commit,actions);
                case 'decglobalvar': return stepVar(chat,'global',key,-1,commit,actions);
                case 'hasvar': return String(Object.hasOwn(chatVars(chat),key));
                case 'hasglobalvar': return String(Object.hasOwn(globalVars,key));
                case 'deletevar':
                    actions.push({kind:'deletevar',scope:'local',key,value:''});
                    if (commit) removeVar(chat,'local',key);
                    return '';
                case 'deleteglobalvar':
                    actions.push({kind:'deleteglobalvar',scope:'global',key,value:''});
                    if (commit) removeVar(chat,'global',key);
                    return '';
                case 'char': return character.name;
                case 'user': return persona.name;
                case 'persona': return textValue(persona.description);
                case 'chardescription': case 'description': return textValue(snapshot.cardDescription,textValue(snapshot.description));
                case 'charpersonality': case 'personality': return textValue(snapshot.personality);
                case 'charscenario': case 'scenario': return textValue(snapshot.scenario);
                case 'charprompt': return textValue(snapshot.systemPrompt);
                case 'charinstruction': return textValue(snapshot.postHistory);
                case 'chardepthprompt': return textValue(snapshot.depthPrompt?.text);
                case 'charcreatornotes': case 'creatornotes': return textValue(snapshot.creatorNotes);
                case 'charfirstmessage': case 'greeting': return textValue(chat?.openingText,textValue(snapshot.greeting));
                case 'mesexamplesraw': return textValue(snapshot.mesExample);
                case 'charversion': return textValue(snapshot.cardSource?.version,snapshot.revision ? String(snapshot.revision) : '');
                case 'lastmessage': return textValue(visible.at(-1)?.text);
                case 'lastusermessage': return textValue(visible.filter(message => message.role === 'user').at(-1)?.text);
                case 'lastcharmessage': return textValue(visible.filter(message => message.role === 'assistant').at(-1)?.text);
                case 'lastmessageid': return chat?.messages?.length ? String(chat.messages.length - 1) : '';
                case 'input': return textValue(typeof document !== 'undefined' ? document.querySelector?.('#message-input')?.value : '');
                case 'random': { const list = macroList(args); return list.length ? list[Math.floor(roll() * list.length)] : ''; }
                case 'pick': { const list = macroList(args); return list.length ? list[Math.floor(seededRandom(`${chat?.id || ''}:${offset}:${match}`)() * list.length)] : ''; }
                case 'roll': { const total = rollDice(args.length ? args.join('::') : '',roll); return total === null ? '' : String(total); }
                case 'time': case 'isotime': return formatDate('HH:mm',date);
                case 'date': return formatDate('YYYY年MM月DD日',date);
                case 'isodate': return formatDate('YYYY-MM-DD',date);
                case 'weekday': return formatDate('dddd',date);
                case 'datetimeformat': return formatDate(args.join('::') || 'YYYY-MM-DD HH:mm',date);
                case 'newline': return '\n'.repeat(Math.min(Math.max(Number(key) || 1,1),20));
                case 'space': return ' '.repeat(Math.min(Math.max(Number(key) || 1,1),40));
                case 'noop': return '';
                case 'trim': return '\u0001TRIM\u0001';
                case 'reverse': return Array.from(args.join('::')).reverse().join('');
                // ST：{{outlet::名称}} 展开为位置是「出口」、出口名相同的世界书条目；没有时为空。
                case 'outlet': return (outlets?.[key] || []).join('\n');
                default: unknown.push(name); return match;
            }
        });
        value = value.replace(/\s*\u0001TRIM\u0001\s*/g,'');
        return {text:value,actions,unknown};
    }

    // 状态块约定：单独一行的「【状态】」，随后是「键：值」行，空行结束。
    // 类脑那边通常由世界书要求模型这样输出，再用正则美化成状态栏；这里用本原型自己的解析 + 显示开关。
    const statusBlockPattern = /^\s*[【\[]状态[】\]]\s*$/;

    function parseStatusBlock(text) {
        const lines = String(text ?? '').split('\n');
        const start = lines.findIndex(line => statusBlockPattern.test(line));
        if (start < 0) return {found:false,entries:[],start:-1,end:-1};
        const entries = [];
        let end = start + 1;
        for (; end < lines.length; end += 1) {
            const line = lines[end].trim();
            if (!line) break;
            const match = line.match(/^([^：:]{1,40})\s*[：:]\s*(.*)$/);
            if (!match) break;
            const key = match[1].trim();
            if (key) entries.push({key,value:match[2].trim()});
        }
        return {found:entries.length > 0,entries,start,end};
    }

    function stripStatusBlock(text) {
        const block = parseStatusBlock(text);
        if (!block.found) return String(text ?? '');
        const lines = String(text).split('\n');
        return [...lines.slice(0,block.start),...lines.slice(block.end)].join('\n').replace(/\n{3,}/g,'\n\n').trim();
    }

    function statusBlockText(chat, turn) {
        const vars = chatVars(chat);
        const lines = ['【状态】',`轮次：${Number.isFinite(turn) ? turn : (Number(vars['轮次']) || 0) + 1}`];
        ['时间','地点','关系'].forEach(key => { if (key in vars) lines.push(`${key}：${vars[key]}`); });
        return lines.join('\n');
    }

    function readStatusIntoVars(chat,text) {
        const block = parseStatusBlock(text);
        if (!block.found) return {found:false,count:0};
        block.entries.forEach(entry => writeVar(chat,'local',entry.key,entry.value));
        return {found:true,count:block.entries.length};
    }

    function statusKeys(messages) {
        return new Set((messages || []).filter(message => message?.role === 'assistant').flatMap(message => parseStatusBlock(message.text).entries.map(entry => entry.key)));
    }

    // 状态栏跟随「当前选中」的消息链：重试、切换候选、编辑或分支之后，先撤掉旧链上状态块写过的键，
    // 再按新链顺序重放。手动添加、从未出现在状态块里的变量不受影响。
    function syncStatusVars(chat, previousMessages = chat.messages) {
        const vars = chatVars(chat);
        new Set([...statusKeys(previousMessages),...statusKeys(chat.messages)]).forEach(key => { delete vars[key]; });
        chat.messages.filter(message => message.role === 'assistant' && !message.hidden).forEach(message => readStatusIntoVars(chat,message.text));
    }

    // 重试得到的是同一轮的另一个版本：轮次沿用被替换的版本，没有状态块时按此前消息链推算。
    function candidateTurn(chat, index) {
        const own = parseStatusBlock(chat.messages[index]?.text).entries.find(entry => entry.key === '轮次');
        if (own && Number.isFinite(Number(own.value))) return Number(own.value);
        const earlier = chat.messages.slice(0,index).filter(message => message.role === 'assistant').reverse()
            .map(message => parseStatusBlock(message.text).entries.find(entry => entry.key === '轮次')).find(Boolean);
        return (Number(earlier?.value) || 0) + 1;
    }

    function cardToWork(card, portrait = '') {
        const data = plainRecord(card?.data) ? card.data : card;
        const ext = plainRecord(data.extensions) ? data.extensions : {};
        const description = textValue(data.description);
        const tags = (Array.isArray(data.tags) ? data.tags : []).filter(tag => typeof tag === 'string' && tag.trim()).slice(0,8);
        const book = normalizeCardBook(data.character_book);
        const depth = plainRecord(ext.depth_prompt) ? ext.depth_prompt : {};
        const creatorNotes = textValue(data.creator_notes,textValue(data.creatorcomment));
        const regexScripts = Array.isArray(ext.regex_scripts) ? parseRegexImport(JSON.stringify(ext.regex_scripts)) || [] : [];
        return {
            name: textValue(data.name,'导入角色'),
            greeting: textValue(data.first_mes,textValue(data.greeting)),
            personality: textValue(data.personality),
            scenario: textValue(data.scenario),
            cardDescription: description,
            hook: creatorNotes.split('\n')[0].slice(0,90) || description.slice(0,80) || '从角色卡导入，尚未填写简介。',
            tags,
            // system_prompt / post_history_instructions 在 ST 里是两个不同的位置：前者替换主提示词，后者放在历史之后。分开存。
            systemPrompt: textValue(data.system_prompt),
            postHistory: textValue(data.post_history_instructions),
            mesExample: textValue(data.mes_example),
            creatorNotes,
            depthPrompt: {text:textValue(depth.prompt),depth:depth.depth,role:depth.role},
            alternateGreetings: (Array.isArray(data.alternate_greetings) ? data.alternate_greetings : typeof data.alternate_greetings === 'string' ? [data.alternate_greetings] : []).filter(text => typeof text === 'string' && text.trim()),
            // 卡内正则默认不运行：ST 要求用户对每张卡单独授权（character_allowed_regex）。
            regexScripts,
            category: '现代',
            pace: '导入角色 · 未标注节奏',
            nsfw: data.nsfw === true || tags.some(tag => /nsfw|18\+/i.test(tag)),
            portrait,
            cardSource: {spec:textValue(card?.spec,'chara_card_v1'),creator:textValue(data.creator),version:textValue(data.character_version)},
            // 导出时原样带回本原型不认识的扩展字段（ST 的 charaFormatData 也是这样保留外来键）。
            cardExtensions: Object.fromEntries(Object.entries(ext).filter(([key]) => !['depth_prompt','regex_scripts','world','fav','talkativeness'].includes(key))),
            loreBook: book.entries.length ? book : null,
            added: true,
        };
    }

    async function portraitFromBlob(blob) {
        if (typeof document.createElement !== 'function' || typeof Image !== 'function') return '';
        const canvas = document.createElement('canvas');
        if (!canvas.getContext) return '';
        const url = URL.createObjectURL(blob);
        try {
            const image = await new Promise((resolve,reject) => {
                const element = new Image();
                element.onload = () => resolve(element);
                element.onerror = reject;
                element.src = url;
            });
            const size = 256;
            const scale = Math.max(size / image.width,size / image.height);
            canvas.width = size;
            canvas.height = size;
            canvas.getContext('2d').drawImage(image,(size - image.width * scale) / 2,(size - image.height * scale) / 2,image.width * scale,image.height * scale);
            return canvas.toDataURL('image/jpeg',.82);
        } catch { return ''; } finally { URL.revokeObjectURL(url); }
    }

    function importCardWork(work) {
        const before = creatorWorks.length;
        const normalized = normalizeWork({...work,id:resourceId('work-card')});
        if (!normalized.name.trim() || !normalized.greeting.trim()) {
            toast('角色卡缺少名称或开场白，未导入。','err');
            return null;
        }
        creatorWorks.push(normalized);
        if (!saveState(true)) {
            creatorWorks.length = before;
            toast('保存失败，导入已撤销。','err');
            return null;
        }
        return normalized;
    }

    async function importFromModal(overlay,close) {
        const status = $('#card-status',overlay);
        const setStatus = (text,isError = false) => {
            if (!status) return;
            status.textContent = text;
            status.className = isError ? 'p-hint p-hint--err' : 'p-hint';
        };
        const file = $('#card-file',overlay)?.files?.[0];
        const pasted = $('#card-json',overlay)?.value.trim();
        if (!file && !pasted) { setStatus('请选择 PNG / JSON 文件，或粘贴角色卡 JSON。',true); return; }
        let card = null;
        let portrait = '';
        try {
            if (pasted) {
                card = cardFromJsonText(pasted);
                if (!card) { setStatus('粘贴的内容不是有效的 JSON 角色卡。',true); return; }
            } else {
                if (file.size > CARD_MAX_BYTES) { setStatus('文件超过 8MB，请换一张更小的角色卡。',true); return; }
                const buffer = await file.arrayBuffer();
                if (/\.png$/i.test(file.name || '') || /image\/png/i.test(file.type || '')) {
                    card = cardFromChunks(pngTextChunks(buffer));
                    if (!card) { setStatus('这张 PNG 里没有角色卡数据（缺少 chara 字段）。',true); return; }
                    portrait = await portraitFromBlob(file);
                } else {
                    card = cardFromJsonText(bytesToText(new Uint8Array(buffer)));
                    if (!card) { setStatus('JSON 解析失败，请确认文件是角色卡。',true); return; }
                }
            }
            const saved = importCardWork(cardToWork(card,portrait));
            if (!saved) { setStatus('保存失败，导入已撤销。',true); return; }
            close();
            toast(`已导入「${saved.name}」${saved.loreBook ? `，含 ${saved.loreBook.entries.length} 条世界书` : ''}`);
            location.href = `character.html?id=${saved.id}`;
        } catch {
            setStatus('读取失败，请重试或换一张角色卡。',true);
        }
    }

    function openCardExport(work) {
        const dialog = openModal({
            title:`导出角色卡 · ${work.name || '未命名角色'}`,
            body:`<p class="p-rp-context-note">导出为 SillyTavern 角色卡（chara_card_v2）。包含角色描述、性格、场景、开场与备用开场、对话示例、角色系统提示、历史后指令、深度提示、标签、卡内世界书与卡内正则；可以直接导入 SillyTavern 或其他兼容前端。</p><div class="p-choice-list"><button class="p-choice" id="card-export-png">${icon('download')}<span class="p-choice-main"><span class="p-choice-title">PNG 角色卡</span><span class="p-choice-sub">立绘 + 卡内数据（chara 与 ccv3 两个文本块）</span></span></button><button class="p-choice" id="card-export-json">${icon('download')}<span class="p-choice-main"><span class="p-choice-title">JSON</span><span class="p-choice-sub">只有文字数据，方便查看与版本管理</span></span></button></div>${work.instructions ? '<p class="p-hint">「私有生成设定」属于本平台字段，不写入角色卡。</p>' : ''}`,
            confirmText:'完成',
            cancelText:'关闭',
            onConfirm:(_,close) => close(),
        });
        $('#card-export-png',dialog.overlay)?.addEventListener('click',() => exportCharacterCard(work,'png'));
        $('#card-export-json',dialog.overlay)?.addEventListener('click',() => exportCharacterCard(work,'json'));
        return dialog;
    }

    function openImport() {
        const modal = openModal({
            title:'导入角色卡',
            body:`<p class="p-hint">支持 SillyTavern / Character.AI 导出的 PNG 或 JSON 角色卡。文件只在当前标签页解析，不会上传。</p>
                <div class="p-field"><label class="p-label" for="card-file">选择文件</label><input class="p-input" id="card-file" type="file" accept=".png,.json,image/png,application/json"></div>
                <div class="p-field"><label class="p-label" for="card-json">或粘贴 JSON</label><textarea class="p-textarea" id="card-json" placeholder='{"name":"角色名","first_mes":"开场白"}'></textarea></div>
                <p class="p-hint" id="card-status">PNG 会读取卡内的 chara 字段，并保留图片作为立绘。</p>`,
            confirmText:'导入',
            cancelText:'关闭',
            onConfirm:(overlay,close) => { importFromModal(overlay,close); return false; },
        });
        return modal;
    }

    function personaPlacementFields(persona) {
        const value = normalizePersonaFields(persona || {});
        const roles = [...Object.values(characters),...creatorWorks].filter(item => item && !item.missing);
        return `<details class="p-lore-advanced" ${value.descriptionPosition !== 'prompt' || value.boundCharacters.length ? 'open' : ''}><summary>进入上下文的位置与绑定角色</summary>
            <div class="p-lore-grid"><div><label class="p-label" for="persona-position">描述放在哪里</label><select class="p-select" id="persona-position">${personaPositions.map(([key,label]) => `<option value="${key}" ${key === value.descriptionPosition ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div><div><label class="p-label" for="persona-depth">深度（聊天内时）</label><input class="p-input" id="persona-depth" type="number" min="0" max="999" value="${value.descriptionDepth}"></div></div>
            <label class="p-label" for="persona-role">以谁的身份插入（聊天内时）</label><select class="p-select" id="persona-role">${[['system','系统'],['user','玩家'],['assistant','角色']].map(([key,label]) => `<option value="${key}" ${key === value.descriptionRole ? 'selected' : ''}>${label}</option>`).join('')}</select>
            <p class="p-label">绑定到角色（和这些角色开新故事时默认用这个身份）</p><div class="p-lore-toggles">${roles.map(item => `<label><input type="checkbox" data-persona-bind="${esc(item.id)}" ${value.boundCharacters.includes(item.id) ? 'checked' : ''}>${esc(item.name || '未命名角色')}</label>`).join('')}</div>
            <p class="p-hint">对应 SillyTavern 的身份描述位置与「绑定到角色」。</p></details>`;
    }

    function openPersonaEditor(persona) {
        openModal({title:persona?'编辑身份':'新建身份',body:`<div class="p-field"><label class="p-label" for="persona-name">身份名称</label><input class="p-input" id="persona-name" maxlength="40" value="${esc(persona?.name||'')}" placeholder="例如：古风女侠"></div><div class="p-field"><label class="p-label" for="persona-description">自我设定</label><textarea class="p-textarea" id="persona-description" placeholder="你的身份、习惯、与角色的关系……">${esc(persona?.description||'')}</textarea><span class="p-hint">仅保存在当前浏览器标签页；可在详情与会话中选择。回复仍为本地模拟，未接入模型。</span></div>${personaPlacementFields(persona)}`,confirmText:'保存身份',onConfirm:(overlay,close)=>{
            const name = $('#persona-name',overlay).value.trim();
            if (!name) { $('#persona-name',overlay).focus(); return false; }
            const saved = savePersona(persona?.id,{name,description:$('#persona-description',overlay).value,descriptionPosition:$('#persona-position',overlay).value,descriptionDepth:$('#persona-depth',overlay).value,descriptionRole:$('#persona-role',overlay).value,boundCharacters:$$('[data-persona-bind]',overlay).filter(input => input.checked).map(input => input.dataset.personaBind)});
            if (!saved) return false;
            close();
            if ($('#identities')) renderSettings();
            toast('身份已保存到本标签页，可在详情或会话中选用');
        }});
    }

    function bindGlobal() {
        applyChatFontScale();
        window.addEventListener('beforeunload',event => {
            if (!creatorDirty) return;
            event.preventDefault();
            event.returnValue = '';
        });
        window.addEventListener('pageshow', () => {
            $('.p-cinema-transition')?.remove();
            $$('#discover-gallery canvas, #disc-gallery canvas').forEach(canvas => canvas.getAnimations().forEach(animation => animation.cancel()));
        });
        document.addEventListener('keydown', event => {
            if (event.target.matches('[data-global-search]') && event.key === 'Enter' && !event.isComposing && event.target.value.trim()) {
                event.preventDefault();
                sessionStorage.setItem('rp-search',event.target.value.trim());
                location.href = `plaza.html?q=${encodeURIComponent(event.target.value.trim())}`;
            }
        });
        document.addEventListener('click',event=>{
            const cinemaLink=event.target.closest('[data-cinema-open]');
            if(cinemaLink && isCinema() && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0){
                if(cinemaTransition(cinemaLink)){event.preventDefault();return;}
            }
            const fav=event.target.closest('[data-favorite]');if(fav){event.preventDefault();event.stopPropagation();const c=getCharacter(fav.dataset.favorite);if(!setLibraryFlag(c.id,'favorite',!c.favorite))return;fav.setAttribute('aria-pressed',String(c.favorite));fav.setAttribute('aria-label',`${c.favorite?'取消收藏':'收藏'}${c.name}`);toast(c.favorite?`已收藏${c.name}`:`已取消收藏${c.name}`);return;}
            if(event.target.closest('[data-new-room]')){openRoomCreator();return;}
            if(event.target.closest('[data-chat-menu]')){chatMenu(event.target.closest('[data-chat-menu]').dataset.chatMenu);return;}
            if(event.target.closest('[data-room-settings]')){openRoomSettings(rooms.find(r=>r.id===event.target.closest('[data-room-settings]').dataset.roomSettings));return;}
            if(event.target.closest('[data-room-del]')){const id=event.target.closest('[data-room-del]').dataset.roomDel;const room=rooms.find(item=>item.id===id);if(!room)return;confirmAction('删除这个房间？',`「${room.name}」的房间会话会从对话列表一起移除，不可恢复。`,'删除',()=>{const index=rooms.indexOf(room);if(index<0)return;const chatIndex=chats.findIndex(chat=>chat.id===room.chatId);const removedChat=chatIndex>=0?chats.splice(chatIndex,1)[0]:null;rooms.splice(index,1);if(!saveState()){rooms.splice(index,0,room);if(removedChat)chats.splice(chatIndex,0,removedChat);return;}toast('房间已删除');if(page==='rooms')renderRooms();else renderChats();});return;}
            if(event.target.closest('[data-import]')||event.target.closest('#import-card')){openImport();return;}
            if(event.target.closest('#save-account')){
                const nickname=$('#nickname').value.trim();
                if(!nickname || nickname.length>40){toast('请输入 1–40 字的本地昵称','err');return;}
                if(!saveLocalPreference('profile','nickname',nickname)){$('#nickname').value=textValue(stateExtras.profile?.nickname,'林见白');return;}
                $('#local-profile-name').textContent=nickname;
                toast('本地昵称已保存；未修改真实账号');return;
            }
            if(event.target.closest('#change-password')){openModal({title:'修改密码 · 未实现',body:'<p>仅演示入口，未连接账号服务，不能验证或修改密码。请勿在原型中输入真实密码。</p>',confirmText:'知道了',cancelText:'关闭'});return;}
            if(event.target.closest('#font-range'))return;
            const amount=event.target.closest('[data-amount]');if(amount){$('#pay-status').textContent=`已选择 ¥${amount.dataset.amount}（演示金额；未配置支付，不会到账）。`;return;}
            if(event.target.closest('#pay-start')){openModal({title:'支付 · 未实现',body:'<p>未连接支付服务，不会扣款或到账。页面余额与账单为静态演示数据，卡密兑换同样未实现。</p>',confirmText:'知道了',cancelText:'返回'});return;}
            if(event.target.closest('#redeem')){openModal({title:'卡密兑换 · 未实现',body:'<p>未连接支付或卡密服务，不会兑换或到账。请勿输入真实卡密。</p>',confirmText:'知道了',cancelText:'关闭'});return;}
            if(event.target.closest('#billing-history')){openBillingHistory();return;}
            if(event.target.closest('#active-sessions')){openActiveSessions();return;}
            if(event.target.closest('#blocked-creators')){openBlockedCreators();return;}
            if(event.target.closest('#report-history')){openReportHistory();return;}
            if(event.target.closest('#export-data')||event.target.closest('#download-backup')){exportAccountData();return;}
            if(event.target.closest('#restore-backup')){openModal({title:'恢复备份 · 尚未接入',body:'<p>完整 JSON 导出已可用；自动恢复尚未接入，当前不会读取或覆盖任何文件。请保留下载的备份，不要清除现有标签页存档。</p>',confirmText:'知道了',cancelText:'关闭'});return;}
            if(event.target.closest('#delete-account')){openDeleteAccount();return;}
            if(event.target.closest('[data-del-persona]')){const id=event.target.closest('[data-del-persona]').dataset.delPersona;const persona=personas.find(item=>item.id===id);if(!persona)return;confirmAction('删除这个身份？',`「${persona.name}」将从身份列表移除，使用它的会话会回到默认身份。`,'删除',()=>{const index=personas.findIndex(item=>item.id===id);if(index<0)return;const removed=personas[index];const previousSelection=selectedPersona;const touched=chats.filter(chat=>chat.personaId===id);personas.splice(index,1);touched.forEach(chat=>{chat.personaId='default';});if(selectedPersona===id)selectedPersona='default';if(!saveState()){personas.splice(index,0,removed);touched.forEach(chat=>{chat.personaId=id;});selectedPersona=previousSelection;renderSettings();return;}toast(touched.length?`已删除身份，${touched.length} 个会话回到默认身份`:'已删除身份');renderSettings();});return;}
            if(event.target.closest('[data-edit-persona]')){openPersonaEditor(getPersona(event.target.closest('[data-edit-persona]').dataset.editPersona));return;}
            if(event.target.closest('#new-persona')){openPersonaEditor(null);return;}
            if(event.target.closest('#data-backup')){openDataBackupModal();return;}
            if(event.target.closest('#logout')){confirmAction('退出当前账号？','当前设备上的登录状态将被清除，已保存的角色和会话仍保留在账号中。','退出登录',()=>location.href='login.html?mode=login');return;}
        });
        document.addEventListener('input',event=>{
            if(event.target.id!=='font-range')return;
            const scale=Number(event.target.value)/100;
            if(!Number.isFinite(scale)||scale<.85||scale>1.2)return;
            if(!saveLocalPreference('preferences','chatFontScale',scale))event.target.value=String(Math.round(chatFontScale()*100));
            applyChatFontScale();
            $('#font-value').textContent=`${Math.round(chatFontScale()*100)}%`;
        });
    }

    const renderers={home:renderHome,plaza:renderPlaza,author:renderAuthor,character:renderCharacter,chats:renderChats,chat:renderChat,library:renderLibrary,rooms:renderRooms,create:renderCreate,settings:renderSettings,notifications:renderNotifications};
    const activePages={home:'home',plaza:'plaza',author:'plaza',character:'plaza',chats:'chats',chat:'chats',library:'settings',rooms:'chats',create:'create',settings:'settings',notifications:''};
    if(renderers[page]){
        mount(activePages[page]);
        bindGlobal();
        renderers[page]();
        syncVisibleViewport();
        // The resize event can fire before visualViewport settles, so re-read once
        // on the next frame; the immediate call keeps the first paint correct.
        let viewportFrame = 0;
        const scheduleViewportSync = () => {
            syncVisibleViewport();
            if (viewportFrame) return;
            viewportFrame = requestAnimationFrame(() => { viewportFrame = 0; syncVisibleViewport(); });
        };
        window.addEventListener('resize',scheduleViewportSync);
        window.visualViewport?.addEventListener('resize',scheduleViewportSync);
        window.visualViewport?.addEventListener('scroll',scheduleViewportSync);
    }
})();

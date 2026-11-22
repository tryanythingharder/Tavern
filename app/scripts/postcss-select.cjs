// PostCSS 插件：站内下拉框（components/ui-select.tsx，.ui-select）替代了原生 <select>。
// 主题里写给 select 标签的样式（圆角、边框、聚焦、深色底…）自动也套到 .ui-select 上，
// 把选择器里的类型选择器 select 改写成 :is(select, .ui-select)。只处理本项目 app/ 与 styles/。
'use strict';
const path = require('node:path');
const RE = /(^|[\s,>+~(])select(?=$|[\s,:.[)>+~#])/g;
module.exports = () => ({
  postcssPlugin: 'tavern-select',
  Rule(rule) {
    const file = rule.source?.input?.file || '';
    const rel = path.relative(process.cwd(), file);
    if (!/^(app|styles)[\\/]/.test(rel)) return;
    if (!rule.selector || !rule.selector.includes('select') || rule.__selDone) return;
    rule.__selDone = true;
    const next = rule.selector.replace(RE, '$1:is(select, .ui-select)');
    if (next !== rule.selector) rule.selector = next;
  },
});
module.exports.postcss = true;

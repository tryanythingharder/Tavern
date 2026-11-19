// 角色卡 HTML 的配色适配（在沙盒 iframe 里跑，由 frame.html 注入）。
// 深色模式：卡里写死的浅底（白、米黄、浅渐变）换成同色相的深底，深色字换成同色相的浅字，浅边框压暗；
//   作者自己写了 prefers-color-scheme 或标了 data-tavern-no-adapt 的卡不动（iframe 的 color-scheme 跟随外层，作者的深色样式照常生效）。
// 两种模式都兜底：字色和所在底色同为浅/同为深时改成可读的字色。
// 只写行内样式，记下自己写过的值；脚本后来渲染的内容（状态栏）靠 MutationObserver 再跑一遍。
(function () {
  var dark = window.__tavernScheme === 'dark';
  var applied = new WeakMap();
  var PROPS = ['backgroundColor', 'color', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'backgroundImage'];
  var CSS = { backgroundColor: 'background-color', color: 'color', borderTopColor: 'border-top-color', borderRightColor: 'border-right-color', borderBottomColor: 'border-bottom-color', borderLeftColor: 'border-left-color', backgroundImage: 'background-image' };

  function parse(c) {
    var m = /^rgba?\(([^)]*)\)$/.exec(String(c).trim());
    if (!m) return null;
    var p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    if (p.length < 3 || p.some(isNaN)) return null;
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
  function hsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function rgbOf(h, s, l) {
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    if (!s) return [l, l, l].map(function (v) { return Math.round(v * 255); });
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(function (v) { return Math.round(v * 255); });
  }
  function fmt(h, s, l, a) {
    var c = rgbOf(h, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l)));
    return a < 1 ? 'rgba(' + c.join(', ') + ', ' + +a.toFixed(3) + ')' : 'rgb(' + c.join(', ') + ')';
  }
  // 浅底 → 深底：白/米黄落到暖墨色附近，越浅的底越深，饱和度收一收
  function darkBg(c) { var x = hsl(c); return fmt(x[0], x[1] * 0.32, Math.min(0.3, 0.11 + (1 - x[2]) * 0.5), c[3]); }
  // 深字 → 浅字：黑落到米白，带色的字保留色相
  function lightText(c) { var x = hsl(c); return fmt(x[0], Math.min(x[1], 0.65), Math.max(0.72, 0.93 - x[2] * 0.45), c[3]); }
  function darkBorder(c) { var x = hsl(c); return fmt(x[0], x[1] * 0.5, Math.min(0.4, 0.22 + (1 - x[2]) * 0.5), c[3]); }

  function optedOut() {
    if (document.querySelector('[data-tavern-no-adapt]')) return true;
    var styles = document.getElementsByTagName('style');
    for (var i = 0; i < styles.length; i++) if (/prefers-color-scheme/i.test(styles[i].textContent || '')) return true;
    return false;
  }

  function set(el, prop, value) {
    el.style.setProperty(CSS[prop], value);
    var rec = applied.get(el) || {};
    rec[prop] = getComputedStyle(el)[prop];
    applied.set(el, rec);
  }
  function fresh(el, prop, value) { var rec = applied.get(el); return !rec || rec[prop] !== value; }

  // 元素实际所在的底色：往上找第一个不透明底，找不到就是外层页面的底
  function backdrop(el) {
    for (var node = el; node && node.nodeType === 1; node = node.parentElement) {
      var c = parse(getComputedStyle(node).backgroundColor);
      if (c && c[3] >= 0.5) return c;
    }
    return dark ? [30, 26, 23, 1] : [255, 255, 255, 1];
  }

  var skipDark = false;
  function run() {
    if (!document.body) return;
    skipDark = !dark || optedOut();
    var all = document.body.getElementsByTagName('*');
    var list = [document.body];
    for (var i = 0; i < all.length && i < 4000; i++) list.push(all[i]);
    for (var j = 0; j < list.length; j++) {
      var el = list[j], tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'svg' || el.closest('svg')) continue;
      var cs = getComputedStyle(el);
      if (!skipDark) {
        var bg = parse(cs.backgroundColor);
        if (bg && bg[3] > 0.05 && lum(bg) > 0.55 && fresh(el, 'backgroundColor', cs.backgroundColor)) set(el, 'backgroundColor', darkBg(bg));
        var img = cs.backgroundImage;
        if (img && img !== 'none' && /gradient/.test(img) && !/url\(/.test(img) && fresh(el, 'backgroundImage', img)) {
          var changed = false;
          var next = img.replace(/rgba?\([^)]*\)/g, function (token) {
            var c = parse(token);
            if (!c || lum(c) <= 0.55) return token;
            changed = true;
            return darkBg(c);
          });
          if (changed) set(el, 'backgroundImage', next);
        }
        ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'].forEach(function (prop) {
          var width = parseFloat(cs[prop.replace('Color', 'Width')]);
          var c = parse(cs[prop]);
          if (width > 0 && c && c[3] > 0.05 && lum(c) > 0.6 && fresh(el, prop, cs[prop])) set(el, prop, darkBorder(c));
        });
      }
      // 字色：看实际所在的底，同深同浅就换
      var fg = parse(getComputedStyle(el).color);
      if (!fg || fg[3] < 0.3 || !fresh(el, 'color', getComputedStyle(el).color)) continue;
      var under = lum(backdrop(el)), lf = lum(fg);
      if (under < 0.4 && lf < 0.45) set(el, 'color', skipDark ? '#f1ebe4' : lightText(fg));
      else if (under > 0.62 && lf > 0.55) set(el, 'color', '#2b2420');
    }
  }

  var timer = 0;
  function later() { clearTimeout(timer); timer = setTimeout(run, 80); }
  addEventListener('DOMContentLoaded', run);
  addEventListener('load', run);
  setTimeout(run, 60);
  setTimeout(run, 600);
  try {
    new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  } catch (e) { /* 老浏览器没有就只跑定时那几次 */ }
})();

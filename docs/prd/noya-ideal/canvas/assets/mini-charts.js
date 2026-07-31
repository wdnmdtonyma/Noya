/* =============================================================================
 * mini-charts.js — 原型里画"真图表"的极小助手（无依赖、纯 SVG、吃 design token）
 *
 * 为什么有它：原型里最招人觉得"假"的就是图表——柱状图是写死高度的 div、环形图
 * 凑不满一圈、没有坐标轴/数值/图例。一个带标签和刻度的真图表，哪怕样式朴素，也
 * 远胜一个漂亮的占位形状。每个数据类原型都要画图，与其每次手搓（还容易搓错），
 * 不如直接用这个。
 *
 * 它只做前端渲染：你喂真实格式的模拟数据，它画出带轴、带数值、带图例、带 hover
 * 的图。颜色默认取 tokens.css 里的 --color-primary 等变量，所以跟产品配色一致。
 *
 * 用法（页面里）:
 *   <div id="dau"></div>
 *   <script src="/assets/mini-charts.js"></script>   // 静态构建会自动内联
 *   <script>
 *     MiniChart.bar('#dau', {
 *       data: [{label:'6-01', value:118}, {label:'6-02', value:124}, ...],
 *       unit: 'k', valueFormat: v => v.toLocaleString()
 *     });
 *     MiniChart.line('#trend', { data:[...], unit:'%', color:'#059669' }); // color 可选，默认主色；图例按系列上色时必传，否则线与图例脱色
 *     MiniChart.donut('#channels', {
 *       data:[{label:'自然', value:42}, {label:'付费', value:33}, {label:'转介', value:25}],
 *       centerLabel:'渠道', unit:'%'
 *     });
 *   </script>
 *
 * 不要把它当通用图表库——它故意只覆盖原型里最常见的三种图。产品有独特图表风格
 * 时照样可以手画，但默认用它，能稳定地把"假图"换成"真图"。
 * ========================================================================== */
(function (global) {
  'use strict';

  // 取 CSS 变量当前计算值；取不到用 fallback。让图表自动随产品 token 走。
  function tok(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (_) {
      return fallback;
    }
  }

  // 分类色板：优先用产品主色，其余用与主色协调的中性偏冷色阶。够区分即可。
  function palette(n) {
    const primary = tok('--color-primary', '#4f46e5');
    const base = [primary, '#22a3b5', '#f5a623', '#7c83f0', '#e5689a', '#3fb27f', '#8a8f98'];
    const out = [];
    for (let i = 0; i < n; i++) out.push(base[i % base.length]);
    return out;
  }

  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function mount(target) {
    const node = typeof target === 'string' ? document.querySelector(target) : target;
    if (!node) throw new Error('MiniChart: 找不到挂载点 ' + target);
    node.innerHTML = '';
    return node;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * pow;
  }
  function fmt(v, opts) {
    if (opts && typeof opts.valueFormat === 'function') return opts.valueFormat(v);
    const s = Math.abs(v) >= 1000 ? v.toLocaleString() : String(v);
    return s + (opts && opts.unit ? opts.unit : '');
  }
  function inject() {
    if (document.getElementById('mini-chart-style')) return;
    const s = document.createElement('style');
    s.id = 'mini-chart-style';
    s.textContent =
      '.mini-chart{font-family:var(--font-family-base,system-ui,-apple-system,sans-serif);width:100%}' +
      '.mini-chart text{fill:var(--color-text-secondary,#6b7280)}' +
      '.mini-chart .mc-axis{stroke:var(--color-border,#e5e7eb);stroke-width:1}' +
      '.mini-chart .mc-grid{stroke:var(--color-border,#eceef1);stroke-width:1;stroke-dasharray:3 3;opacity:.7}' +
      '.mini-chart .mc-bar{transition:opacity .15s}.mini-chart .mc-bar:hover{opacity:.78;cursor:default}' +
      '.mini-chart .mc-dot{transition:r .15s}.mini-chart .mc-dot:hover{r:5}' +
      '.mini-chart .mc-seg{transition:opacity .15s}.mini-chart .mc-seg:hover{opacity:.8}' +
      '.mc-legend{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:10px;font-size:var(--font-size-sm,13px)}' +
      '.mc-legend .mc-li{display:inline-flex;align-items:center;gap:6px;color:var(--color-text,#1a1a1a)}' +
      '.mc-legend .mc-sw{width:10px;height:10px;border-radius:3px;flex:none}' +
      '.mc-legend .mc-val{color:var(--color-text-secondary,#6b7280)}';
    document.head.appendChild(s);
  }

  function svgRoot(node, w, h) {
    const svg = el('svg', {
      class: 'mini-chart',
      viewBox: '0 0 ' + w + ' ' + h,
      role: 'img',
      preserveAspectRatio: 'xMidYMid meet',
    });
    node.appendChild(svg);
    return svg;
  }

  // 公共坐标系（柱 / 线 共用）：左留 y 轴标签，下留 x 轴标签，画 4 条网格线
  function axes(svg, opts, W, H, max) {
    const padL = 44, padR = 14, padT = 18, padB = 28;
    const pw = W - padL - padR, ph = H - padT - padB;
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const val = (max / ticks) * i;
      const y = padT + ph - (ph * i) / ticks;
      svg.appendChild(el('line', { class: i === 0 ? 'mc-axis' : 'mc-grid', x1: padL, y1: y, x2: padL + pw, y2: y }));
      svg.appendChild(el('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 11 }, fmt(Math.round(val), opts)));
    }
    return { padL, padR, padT, padB, pw, ph };
  }

  const MiniChart = {
    bar: function (target, opts) {
      inject();
      const node = mount(target);
      const data = opts.data || [];
      const W = opts.width || node.clientWidth || 640, H = opts.height || 240;
      const svg = svgRoot(node, W, H);
      const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
      const g = axes(svg, opts, W, H, max);
      const slot = g.pw / data.length;
      const bw = Math.min(slot * 0.62, 48);
      const color = opts.color || tok('--color-primary', '#4f46e5');
      // 按"最长标签估算宽度 vs 槽位宽"抽稀 x 轴标签：短标签（5-21）全显示，只有
      // 真的放不下的长标签（2026-06-03 / 中文）才隔一个标一个，免得糊成一团。
      // 每条 title 里都有完整 label+值，hover 还是看得到。
      const maxLabelLen = data.reduce((n, d) => Math.max(n, String(d.label).length), 0);
      const labelStep = Math.max(1, Math.ceil((maxLabelLen * 8 + 8) / slot));
      data.forEach((d, i) => {
        const x = g.padL + slot * i + (slot - bw) / 2;
        const bh = (g.ph * d.value) / max;
        const y = g.padT + g.ph - bh;
        const r = el('rect', { class: 'mc-bar', x, y, width: bw, height: Math.max(bh, 1), rx: 3, fill: color });
        r.appendChild(el('title', {}, d.label + '：' + fmt(d.value, opts)));
        svg.appendChild(r);
        // 柱顶数值（柱够高、且没被抽稀时才标，免得挤）
        if (bw >= 22 && i % labelStep === 0) svg.appendChild(el('text', { x: x + bw / 2, y: y - 5, 'text-anchor': 'middle', 'font-size': 11 }, fmt(d.value, opts)));
        if (i % labelStep === 0) svg.appendChild(el('text', { x: x + bw / 2, y: H - 9, 'text-anchor': 'middle', 'font-size': 11 }, d.label));
      });
      return svg;
    },

    line: function (target, opts) {
      inject();
      const node = mount(target);
      const data = opts.data || [];
      const W = opts.width || node.clientWidth || 640, H = opts.height || 240;
      const svg = svgRoot(node, W, H);
      const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
      const g = axes(svg, opts, W, H, max);
      const color = opts.color || tok('--color-primary', '#4f46e5');
      const xAt = (i) => g.padL + (g.pw / Math.max(1, data.length - 1)) * i;
      const yAt = (v) => g.padT + g.ph - (g.ph * v) / max;
      // x 轴标签按密度抽稀（跟 bar 一致）：点多了不再"全有或全无"，按点间距 vs 标签宽
      // 隔几个标一个，保证任何点数都有可读的轴。每个点的 title 仍带完整 label+值。
      const xspace = g.pw / Math.max(1, data.length - 1);
      const maxLabelLen = data.reduce((n, d) => Math.max(n, String(d.label).length), 0);
      const labelStep = Math.max(1, Math.ceil((maxLabelLen * 8 + 8) / xspace));
      // 面积渐变填充
      const area = data.map((d, i) => xAt(i) + ',' + yAt(d.value)).join(' ');
      svg.appendChild(el('polygon', {
        points: g.padL + ',' + (g.padT + g.ph) + ' ' + area + ' ' + (g.padL + g.pw) + ',' + (g.padT + g.ph),
        fill: color, opacity: 0.08,
      }));
      svg.appendChild(el('polyline', { points: area, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      data.forEach((d, i) => {
        const dot = el('circle', { class: 'mc-dot', cx: xAt(i), cy: yAt(d.value), r: 3, fill: '#fff', stroke: color, 'stroke-width': 2 });
        dot.appendChild(el('title', {}, d.label + '：' + fmt(d.value, opts)));
        svg.appendChild(dot);
        if (i % labelStep === 0) svg.appendChild(el('text', { x: xAt(i), y: H - 9, 'text-anchor': 'middle', 'font-size': 11 }, d.label));
      });
      return svg;
    },

    // 环形图：每段从数据算占比，必然凑满一整圈（不会再出现"空轨"）。带图例和中心数。
    donut: function (target, opts) {
      inject();
      const node = mount(target);
      const data = (opts.data || []).filter((d) => d.value > 0);
      const total = data.reduce((s, d) => s + d.value, 0) || 1;
      const size = opts.size || 200, sw = opts.thickness || 26;
      const r = (size - sw) / 2, c = size / 2, C = 2 * Math.PI * r;
      const cols = palette(data.length);
      const wrap = document.createElement('div');
      const svg = el('svg', { class: 'mini-chart', viewBox: '0 0 ' + size + ' ' + size, width: size, height: size, style: 'max-width:' + size + 'px' });
      svg.appendChild(el('circle', { cx: c, cy: c, r, fill: 'none', stroke: tok('--color-bg', '#f1f3f5'), 'stroke-width': sw }));
      let acc = 0;
      data.forEach((d, i) => {
        const frac = d.value / total;
        const seg = el('circle', {
          class: 'mc-seg', cx: c, cy: c, r, fill: 'none', stroke: d.color || cols[i], 'stroke-width': sw,
          'stroke-dasharray': frac * C + ' ' + (C - frac * C),
          'stroke-dashoffset': -acc * C,
          transform: 'rotate(-90 ' + c + ' ' + c + ')',
        });
        seg.appendChild(el('title', {}, d.label + '：' + fmt(d.value, opts) + '（' + Math.round(frac * 100) + '%）'));
        svg.appendChild(seg);
        acc += frac;
      });
      if (opts.centerLabel != null) {
        svg.appendChild(el('text', { x: c, y: c - 2, 'text-anchor': 'middle', 'font-size': 13, fill: tok('--color-text-secondary', '#6b7280') }, opts.centerLabel));
        svg.appendChild(el('text', { x: c, y: c + 18, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 600, fill: tok('--color-text', '#1a1a1a') }, opts.centerValue != null ? opts.centerValue : fmt(total, opts)));
      }
      wrap.appendChild(svg);
      // 图例：颜色块 + 名称 + 数值(占比) —— 没有图例的环形图等于没说哪段是哪个
      const legend = document.createElement('div');
      legend.className = 'mc-legend';
      data.forEach((d, i) => {
        const li = document.createElement('span');
        li.className = 'mc-li';
        const sw2 = document.createElement('span');
        sw2.className = 'mc-sw';
        sw2.style.background = d.color || cols[i];
        li.appendChild(sw2);
        li.appendChild(document.createTextNode(d.label));
        const val = document.createElement('span');
        val.className = 'mc-val';
        val.textContent = fmt(d.value, opts) + ' · ' + Math.round((d.value / total) * 100) + '%';
        li.appendChild(val);
        legend.appendChild(li);
      });
      wrap.appendChild(legend);
      const host = mount(node);
      host.appendChild(wrap);
      return wrap;
    },
  };

  global.MiniChart = MiniChart;
})(typeof window !== 'undefined' ? window : this);

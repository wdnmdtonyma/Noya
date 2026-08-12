/* =============================================================================
 * popover.js — 把"浮层面板"锚到触发点的极小助手（无依赖，纯定位）
 *
 * 为什么有它：原型里最容易出的低级错就是浮层（下拉菜单 / @ 提及 / 气泡）手搓定位——
 * 写死 `top/bottom: calc(100%±N)`，结果往错方向弹、盖住上方内容、长内容或矮窗口时
 * 顶部裁出视口够不到。定位逻辑很 fiddly，跟"别手搓图表、用 mini-charts"一个道理：
 * 别手搓定位，用它。它做四件手搓最容易漏的事：
 *   1) 锚到触发元素（getBoundingClientRect），不是飘在容器某个角
 *   2) 按上下剩余空间自动翻面（默认朝下；下方放不下且上方更宽就朝上）
 *   3) 限高 + 滚动，绝不把自己裁出视口
 *   4) 水平夹进视口，不溢出屏幕边
 *
 * 用法：
 *   <button id="trigger">…</button>
 *   <div id="menu" class="popover" hidden> … </div>   // 面板，初始 hidden
 *   <script src="/assets/popover.js"></script>          // 静态构建会自动内联
 *   <script>
 *     trigger.onclick = () => menu.hidden
 *       ? Popover.open(menu, { anchor: trigger })
 *       : Popover.close(menu);
 *     // 点外部关闭：自己加一个 document click 监听即可（这里不替你管开关策略）
 *   </script>
 *
 *   opts：{ anchor（必填，触发元素）,
 *           placement:'auto'|'top'|'bottom'（默认 auto）,
 *           align:'start'|'end'（默认 start，水平对齐触发点左/右边）,
 *           gap（默认 6） }
 *
 * 面板用 position:fixed（脚本设），所以塞进 overflow:hidden 的祖先里也不会被裁。
 * 开着时跟随 scroll/resize 自动重定位；Popover.close 收尾解绑。
 * 注意：它只管"锚定的浮层"（下拉/菜单/@提及/气泡）。居中模态不归它管——模态用遮罩居中。
 * @ 提及这种 textarea 里的，anchor 传输入框本身即可（caret 像素级锚定不值得，贴输入框边
 * 已经够用、且不会飘）。
 * ========================================================================== */
(function (global) {
  'use strict';
  function vp() { return { w: window.innerWidth, h: window.innerHeight }; }

  function place(panel, opts) {
    const anchor = opts && opts.anchor;
    if (!anchor) throw new Error('Popover: 缺 anchor 触发元素');
    const gap = opts.gap != null ? opts.gap : 6;
    const v = vp();
    const a = anchor.getBoundingClientRect();
    // 先量自然尺寸（移到屏外、清掉限高，避免撑乱布局或闪一下）
    panel.style.position = 'fixed';
    // border-box：让 max-height 把 padding+border 也算进去，否则 content-box 的面板会多撑出
    // padding+border 那点高度、溢出视口底部（这条是渲染验证抓出来的，纯读代码看不出来）。
    panel.style.boxSizing = 'border-box';
    panel.style.left = '-9999px';
    panel.style.top = '0px';
    panel.style.maxHeight = 'none';
    panel.style.maxWidth = (v.w - 16) + 'px';
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    // 垂直：默认朝下；auto 时下方放不下且上方更宽 → 翻上
    const below = v.h - a.bottom - gap, above = a.top - gap;
    const goTop = opts.placement === 'top' ||
      (opts.placement !== 'bottom' && below < ph && above > below);
    let top, maxH;
    if (goTop) { maxH = above; top = a.top - gap - Math.min(ph, maxH); }
    else { maxH = below; top = a.bottom + gap; }
    // 限高 + 滚动：再挤也不裁出视口
    panel.style.maxHeight = Math.max(80, Math.floor(maxH)) + 'px';
    panel.style.overflowY = 'auto';
    // 水平：按 align 贴触发点左/右边，再夹进视口
    let left = opts.align === 'end' ? a.right - pw : a.left;
    left = Math.min(Math.max(8, left), v.w - pw - 8);
    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(Math.max(8, top)) + 'px';
  }

  const bound = new WeakMap();
  function open(panel, opts) {
    panel.hidden = false;
    place(panel, opts);
    const onMove = function () { if (!panel.hidden) place(panel, opts); };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    bound.set(panel, onMove);
  }
  function close(panel) {
    panel.hidden = true;
    const onMove = bound.get(panel);
    if (onMove) {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      bound.delete(panel);
    }
  }

  global.Popover = { open: open, close: close, place: place };
})(typeof window !== 'undefined' ? window : this);

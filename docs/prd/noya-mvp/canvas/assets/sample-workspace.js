(function () {
  'use strict';

  var SECTIONS = [
    ['outline', '大纲'],
    ['world', '世界志'],
    ['tasks', '伏线'],
    ['people', '人物志'],
    ['library', '资料库'],
    ['style', '笔法']
  ];

  var BOOKS = {
    zhongkui: {
      title: '未命名 · 钟馗弟子',
      meta: '第 1 章 · 初稿',
      chapter: {
        number: 1,
        name: '纸船入城',
        status: '初稿',
        html: '<p>纸船冲进巷口的那一刻，青年先一刀砍断了自己的影子。</p><p>刀锋落地，没有血。青石板上的黑影却猛地一缩，恰好避开船头扫来的白幡。幡上密密麻麻写满人名，最下面那个墨迹还湿，正是客栈掌柜。</p><p>满街灯火同时暗了一瞬。</p><p>青年没有回头。他两指并起，在眉心一点，右眼深处亮起一线暗红。</p>',
        agent: '我从已经确认的第二版继续写。正文可以直接改，也可以告诉我具体改哪一处。'
      },
      next: {
        number: 2,
        plan: ['青年循着白幡上的名字找到客栈。', '客栈里的人开始忘记彼此。', '青年第一次尝试拘住纸船留下的执念。'],
        draft: '<p>青年循着白幡上的名字找到客栈时，掌柜正把自己的妻子往门外赶。</p><p>他们成亲二十年。此刻，他看她像看一个从未见过的生人。</p><p>青年抬起右手，纸船留下的黑线在他指间绷紧，只撑住了三息。</p>'
      },
      docs: {
        outline: { title: '大纲', sub: '从已确认的开端与终局向中间生长', badge: '', html: '<p><strong>开端</strong>　钟馗弟子在人间度化执念，在第一桩异事里发现死者的执念被人为放大。</p><p><strong>中段留白</strong>　沿途会遇见怎样的人、哪些执念会反过来刺中他，尚未决定。</p><p><strong>终局</strong>　他捣毁魔界的阴谋，也终于回到自己不敢面对的那场大火。</p>' },
        world: { title: '世界志', sub: '只保留已经进入故事的法则', badge: '', html: '<p><strong>阴阳之间</strong>　执念让亡者滞留，也会反过来侵蚀生者对现实的判断。</p><p><strong>钟馗门下</strong>　门人能看见不该看见之物，也能短暂拘住它们；代价会直接落在自身。</p>' },
        tasks: { title: '伏线', sub: '2 条仍在生长', badge: '2 条', html: '<p><strong>那场大火</strong>　他记得自己点燃了宅院，却不敢确认当夜究竟是谁先疯。</p><p><strong>明日出生者的灵牌</strong>　纸船收走的也许并不只是死者。</p>' },
        people: { title: '人物志', sub: '以人物自己的语言持续补写', badge: '2 人', html: '<p><strong>钟馗弟子</strong></p><p>迷惘，赤诚，替众生解执，也在逃避自己的执。右眼能看见异物，第二道法只能拘住三息。</p><p><strong>钟馗</strong></p><p>在奈何桥边发现了他，收徒不是救他离苦，而是给他一条自己走出去的路。</p>' },
        library: { title: '资料库', sub: '被正文引用的事物', badge: '2 条', html: '<p><strong>无名白幡</strong>　幡上会出现仍活着的人的姓名，被纸船带走后，人会逐渐忘记自己与亲近之人。</p><p><strong>朱砂</strong>　开启右眼时所用，并非力量来源。</p>' },
        style: { title: '笔法', sub: '当前写法 · 可继续用正文校准', badge: '', html: '<p>恐怖来自秩序悄然出错，而不是堆叠阴森形容词。</p><p>场面先铺开，再骤然落到一个具体动作；真正动手时，句子收短。</p><p>身世只露刺，不急着解释伤口。</p>' }
      }
    },
    fogharbor: {
      title: '雾港没有月亮',
      meta: '第 29 章正在写',
      chapter: {
        number: 29,
        name: '潮声背后',
        status: '初稿',
        html: '<p>第三遍潮声响起时，港口所有系船的绳结同时松了半寸。</p><p>沈砚站在废灯塔下，没有去看那些向外漂的船。他盯着礁石之间那扇本不该存在的门，等门缝里的灯再亮一次。</p><p>这一次，门里有人叫出了他的真名。</p>',
        agent: '我们上次停在门后传出真名这里。正文可以直接续写，也可以先改掉这次揭示。'
      },
      next: {
        number: 30,
        plan: ['沈砚推开潮门。', '门后的人说出二十年前海难的另一个版本。', '沈砚发现第二份航海日志缺少一页。'],
        draft: '<p>沈砚推开潮门，门后没有海，只有一间干燥得过分的船舱。</p><p>舱里的人抬起头，说那场海难从未发生，因为该死的人至今还活着。</p><p>第二份航海日志摊在桌上，正中间被整齐地撕去了一页。</p>'
      },
      docs: {
        outline: { title: '大纲', sub: '第二卷 · 雾港沉潮', badge: '第二卷', html: '<p><strong>已写</strong>　沈砚追查失踪渔船，确认潮汐正在重复一场二十年前没有发生过的海难。</p><p><strong>下一处锚点</strong>　进入废灯塔后的门，见到第一个记得真实海难的人。</p>' },
        world: { title: '世界志', sub: '雾港与外海', badge: '雾港', html: '<p><strong>雾港</strong>　每月有三夜看不见月亮，居民会把这三夜称作“退潮”。</p><p><strong>潮门</strong>　只会在错误的潮声之后出现，门后保存的是没有发生过的记忆。</p>' },
        tasks: { title: '伏线', sub: '3 条未收束', badge: '3 条', html: '<p>二十年前的空白海难；灯塔守人的第二份航海日志；沈砚从未告诉任何人的真名。</p>' },
        people: { title: '人物志', sub: '7 人', badge: '7 人', html: '<p><strong>沈砚</strong></p><p>曾是领航员，能从潮声里听出船只的位置，却唯独听不见自己乘过的那艘船。</p>' },
        library: { title: '资料库', sub: '12 个条目', badge: '12 条', html: '<p><strong>铜制潮尺</strong>　刻度会在无月夜多出第十三格。</p><p><strong>第二份航海日志</strong>　记录着一场官方档案中不存在的海难。</p>' },
        style: { title: '笔法', sub: '当前写法', badge: '', html: '<p>海面越广，人物动作越小；异常先落在日常器物上，再让读者意识到整个空间已经错位。</p>' }
      }
    }
  };

  function esc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function cleanHtml(html) {
    var holder = document.createElement('div');
    holder.innerHTML = html;
    holder.querySelectorAll('[contenteditable]').forEach(function (node) { node.removeAttribute('contenteditable'); });
    return holder.innerHTML;
  }

  function renderMarkdown(markdown) {
    var html = '';
    var inList = false;
    function closeList() {
      if (!inList) return;
      html += '</ul>';
      inList = false;
    }
    String(markdown || '').split('\n').forEach(function (line) {
      if (!line.trim()) { closeList(); return; }
      if (line.indexOf('## ') === 0) {
        closeList();
        html += '<h2>' + esc(line.slice(3)) + '</h2>';
      } else if (line.indexOf('# ') === 0) {
        closeList();
        html += '<h1>' + esc(line.slice(2)) + '</h1>';
      } else if (line.indexOf('- ') === 0) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + esc(line.slice(2)) + '</li>';
      } else {
        closeList();
        html += '<p>' + esc(line) + '</p>';
      }
    });
    closeList();
    return html;
  }

  function init(bookKey) {
    var book = BOOKS[bookKey];
    var detail = window.NOYA_SAMPLE_DETAILS && window.NOYA_SAMPLE_DETAILS[bookKey];
    if (!book || !detail) return false;

    var nav = document.getElementById('nav');
    var mid = document.getElementById('mid');
    var body = document.getElementById('body');
    var log = document.getElementById('log');
    var crumb = document.getElementById('crumb');
    var agentCtx = document.getElementById('agentCtx');
    var say = document.getElementById('say');
    var storageKey = 'noya:sample-workspace:' + bookKey + ':v1';
    var onboardingContext = null;
    if (bookKey === 'zhongkui') {
      try { onboardingContext = JSON.parse(localStorage.getItem('noya:book:zhongkui:onboarding-history:v1')); } catch (error) {}
    }
    var writingTimer = null;
    var personClickTimer = null;
    var params = new URLSearchParams(window.location.search);
    var requested = params.get('section') || 'chapter';
    if (requested === 'threads') requested = 'tasks';
    var requestedItem = params.get('item');
    var requestedRoot = params.get('root');
    var requestedPart = params.get('part');
    var requestedTrail = (params.get('trail') || '').split(',').filter(function (id) {
      return !!detail.people.items[id];
    });
    var validSections = SECTIONS.map(function (row) { return row[0]; }).concat(['chapter', 'new']);
    if (validSections.indexOf(requested) < 0) requested = 'chapter';

    var state = {
      version: 3,
      activeSection: requested,
      nextMessageId: 1,
      edits: {},
      threads: {},
      views: {
        world: detail.world.initial,
        task: detail.tasks.items[0].id,
        taskPart: null,
        personRoot: detail.people.home,
        personSelected: detail.people.home,
        personTrail: [],
        library: detail.library[0].id
      },
      newChapter: { phase: 'empty', plan: [], draftHtml: '', runningMessage: null }
    };
    try {
      var saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && (saved.version === 1 || saved.version === 2 || saved.version === 3)) {
        state = Object.assign(state, saved);
        state.version = 3;
        state.nextMessageId = saved.nextMessageId || 1;
        state.edits = saved.edits || {};
        state.threads = saved.threads || {};
        state.views = Object.assign({
          world: detail.world.initial,
          task: detail.tasks.items[0].id,
          taskPart: null,
          personRoot: detail.people.home,
          personSelected: detail.people.home,
          personTrail: [],
          library: detail.library[0].id
        }, saved.views || {});
        state.views.personTrail = state.views.personTrail || [];
        state.newChapter = Object.assign({ phase: 'empty', plan: [], draftHtml: '', runningMessage: null }, saved.newChapter || {});
        if (state.newChapter.phase === 'writing') {
          state.newChapter.phase = 'plan_ready';
          var newThread = state.threads.new || [];
          var interrupted = newThread.filter(function (message) { return message.id === state.newChapter.runningMessage; })[0];
          if (!interrupted) {
            interrupted = newThread.slice().reverse().filter(function (message) {
              return message.who === 'a' && /msg__doing|正在按确认过的安排写/.test(message.html || '');
            })[0];
          }
          if (interrupted) interrupted.html = '上次写作中断了。安排还在，可以继续写。';
          state.newChapter.runningMessage = null;
        }
      }
    } catch (error) {}
    state.activeSection = requested;
    if (requested === 'world' && requestedItem && detail.world.nodes[requestedItem]) {
      state.views.world = requestedItem;
    } else if (requested === 'tasks' && requestedItem) {
      var requestedTask = detail.tasks.items.filter(function (item) { return item.id === requestedItem; })[0];
      if (requestedTask) {
        state.views.task = requestedItem;
        var pointMatch = requestedPart && requestedPart.match(/^point:(\d+)$/);
        var hasPoint = pointMatch && requestedTask.points.some(function (point) { return point.chapter === Number(pointMatch[1]); });
        state.views.taskPart = requestedPart === 'future' || hasPoint ? requestedPart : null;
      }
    } else if (requested === 'people') {
      if (requestedRoot && detail.people.items[requestedRoot]) {
        state.views.personRoot = requestedRoot;
        state.views.personTrail = requestedTrail.filter(function (id) { return id !== requestedRoot; });
      }
      if (requestedItem && detail.people.items[requestedItem]) state.views.personSelected = requestedItem;
    } else if (requested === 'library' && requestedItem && detail.library.some(function (entry) { return entry.id === requestedItem; })) {
      state.views.library = requestedItem;
    }

    document.title = 'Noya · ' + book.title;
    document.querySelector('.noya-book-switcher__title').textContent = book.title;
    document.querySelector('.noya-book-switcher__meta').textContent = book.meta;
    document.querySelectorAll('[data-book]').forEach(function (link) {
      var current = link.dataset.book === bookKey;
      link.classList.toggle('is-current', current);
      if (current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
      var note = link.querySelector('.noya-book-switcher__item-note');
      if (note) note.textContent = current ? '当前' : '';
    });

    function save() {
      try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (error) {}
    }

    function sectionLabel(key) {
      if (key === 'chapter') return '第 ' + book.chapter.number + ' 章';
      if (key === 'new') return '第 ' + book.next.number + ' 章';
      var row = SECTIONS.filter(function (item) { return item[0] === key; })[0];
      return row ? row[1] : '资料';
    }

    function threadFor(key) {
      return state.threads[key] || (state.threads[key] = []);
    }

    function seed(key, message) {
      var thread = threadFor(key);
      if (!thread.length) thread.push({ who: 'a', html: message, land: '' });
    }

    function pushTo(key, who, html, land) {
      var id = 'm' + state.nextMessageId;
      state.nextMessageId += 1;
      threadFor(key).push({ id: id, who: who, html: html, land: land || '' });
      save();
      if (state.activeSection === key) renderThread();
      return id;
    }

    function push(who, html, land) {
      return pushTo(state.activeSection, who, html, land);
    }

    function finishMessage(key, id, html, land) {
      var message = threadFor(key).filter(function (item) { return item.id === id; })[0];
      if (!message) {
        pushTo(key, 'a', html, land);
        return;
      }
      message.html = html;
      message.land = land || '';
      save();
      if (state.activeSection === key) renderThread();
    }

    function renderThread() {
      var thread = threadFor(state.activeSection);
      log.innerHTML = thread.map(function (message) {
        return '<div class="msg msg--' + message.who + '">' +
          '<span class="msg__mark">' + (message.who === 'a' ? '✦' : '●') + '</span>' +
          '<div class="msg__content"><div class="msg__who">' + (message.who === 'a' ? 'Agent' : '你') + '</div>' +
          '<div class="msg__b">' + message.html +
          (message.land ? '<div class="land"><span class="land__check">✓</span><span>已更新 <b>' + message.land + '</b></span></div>' : '') +
          '</div></div></div>';
      }).join('');
      log.scrollTop = log.scrollHeight;
    }

    function updateUrl() {
      var section = state.activeSection === 'tasks' ? 'threads' : state.activeSection;
      var query = new URLSearchParams();
      query.set('book', bookKey);
      query.set('section', section);
      if (state.activeSection === 'world' && state.views.world) query.set('item', state.views.world);
      if (state.activeSection === 'tasks' && state.views.task) {
        query.set('item', state.views.task);
        if (state.views.taskPart) query.set('part', state.views.taskPart);
      }
      if (state.activeSection === 'people') {
        if (state.views.personRoot) query.set('root', state.views.personRoot);
        if (state.views.personSelected) query.set('item', state.views.personSelected);
        if (state.views.personTrail.length) query.set('trail', state.views.personTrail.join(','));
      }
      if (state.activeSection === 'library' && state.views.library) query.set('item', state.views.library);
      var path = '/p/04-d-three-column?' + query.toString();
      history.replaceState(null, '', path);
      try { localStorage.setItem('noya:last-workspace', path); } catch (error) {}
    }

    function drawNav() {
      var html = '<div class="d-nav__fixed">';
      html += '<button class="d-new" data-sample-new><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6 2.5v7M2.5 6h7"/></svg>新建章节</button>';
      html += '<div class="d-grp">资料<span class="line"></span></div>';
      html += SECTIONS.map(function (row) {
        var doc = book.docs[row[0]];
        var badges = {
          tasks: detail.tasks.items.length + ' 条',
          people: Object.keys(detail.people.items).length + ' 人',
          library: detail.library.length + ' 条'
        };
        var badge = badges[row[0]] || doc.badge;
        return '<button class="d-item" data-sample-section="' + row[0] + '">' + NOYA.icon(row[0]) +
          '<span class="d-item__t">' + row[1] + '</span>' +
          (badge ? '<span class="d-item__b">' + badge + '</span>' : '') + '</button>';
      }).join('');
      html += '</div><div class="d-nav__chapters"><div class="d-grp">正文<span class="line"></span></div><div class="d-nav__chapter-scroll">';
      html += '<button class="d-item d-ch" data-sample-chapter="current"><span class="d-item__t">第 ' + book.chapter.number + ' 章 · ' + book.chapter.name + '</span><span class="d-item__b warn">' + book.chapter.status + '</span></button>';
      if (state.newChapter.phase !== 'empty') {
        var nextStatus = state.newChapter.phase === 'plan_ready' ? '待写' : state.newChapter.phase === 'writing' ? '写作中' : '初稿';
        html += '<button class="d-item d-ch" data-sample-chapter="new"><span class="d-item__t">第 ' + book.next.number + ' 章</span><span class="d-item__b warn">' + nextStatus + '</span></button>';
      }
      html += '</div></div>';
      nav.innerHTML = html;
      markNav();
    }

    function markNav() {
      nav.querySelectorAll('[data-sample-section]').forEach(function (button) {
        button.classList.toggle('is-on', button.dataset.sampleSection === state.activeSection);
      });
      nav.querySelectorAll('[data-sample-chapter]').forEach(function (button) {
        var current = state.activeSection === 'chapter' ? 'current' : state.activeSection === 'new' ? 'new' : '';
        button.classList.toggle('is-on', button.dataset.sampleChapter === current);
      });
      var newButton = nav.querySelector('[data-sample-new]');
      if (newButton) newButton.classList.toggle('is-on', state.activeSection === 'new' && state.newChapter.phase === 'empty');
    }

    function wireEditable(node, key, afterSave) {
      if (!node) return;
      node.dataset.sampleEditKey = key;
      node.contentEditable = 'true';
      function persistEdit() {
        state.edits[key] = cleanHtml(node.innerHTML);
        if (afterSave) afterSave(state.edits[key]);
        save();
      }
      node.addEventListener('input', function () {
        clearTimeout(node._sampleSaveTimer);
        node._sampleSaveTimer = setTimeout(function () {
          persistEdit();
        }, 260);
      });
      node.addEventListener('blur', function () {
        clearTimeout(node._sampleSaveTimer);
        persistEdit();
      });
    }

    function renderOutline() {
      var html = state.edits.outline || detail.outline.sections.map(function (section) {
        if (section.gap) return '<div class="outline-document__space">···</div>';
        return '<section' + (section.current ? ' class="is-now"' : section.ending ? ' class="is-ending"' : '') + '>' +
          '<small>' + section.meta + '</small><h3>' + section.title + '</h3><p>' + section.body + '</p></section>';
      }).join('');
      mid.innerHTML = '<div class="panel outline-panel outline-panel--document"><div class="panel__head"><h2>大纲</h2><span class="sub">' + detail.outline.sub + '</span></div>' +
        '<article class="outline-document sample-document">' + html + '</article></div>';
      wireEditable(mid.querySelector('.outline-document'), 'outline');
    }

    function worldPath(id) {
      var path = [];
      var cursor = detail.world.nodes[id];
      while (cursor) {
        path.unshift(cursor.name);
        cursor = cursor.parent ? detail.world.nodes[cursor.parent] : null;
      }
      return path;
    }

    function renderWorldTreeNode(id, depth) {
      var node = detail.world.nodes[id];
      var children = node.children || [];
      var path = worldPath(state.views.world);
      var open = id === detail.world.root || path.indexOf(node.name) >= 0;
      var html = '<li class="world-tree__node"><div class="world-tree__row' + (id === state.views.world ? ' is-on' : '') + '" style="--depth:' + depth + '">';
      if (children.length) {
        html += '<button class="world-tree__toggle' + (open ? ' is-open' : '') + '" data-sample-world-branch aria-expanded="' + (open ? 'true' : 'false') + '" aria-label="' + (open ? '收起' : '展开') + node.name + '">' +
          '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 2.2 6.5 5 3 7.8"/></svg></button>';
      } else {
        html += '<span class="world-tree__spacer"></span>';
      }
      html += '<button class="world-tree__label" data-sample-world-node="' + id + '"><span>' + node.name + '</span><small>' + node.tag + '</small></button></div>';
      if (children.length) {
        html += '<ul class="world-tree__children"' + (open ? '' : ' hidden') + '>' + children.map(function (child) {
          return renderWorldTreeNode(child, depth + 1);
        }).join('') + '</ul>';
      }
      return html + '</li>';
    }

    function renderWorld() {
      var id = detail.world.nodes[state.views.world] ? state.views.world : detail.world.initial;
      state.views.world = id;
      var node = detail.world.nodes[id];
      var intro = state.edits['world:' + id] || node.intro;
      var sections = (node.sections || []).map(function (section) {
        return '<section class="world-section"><h4>' + section.title + '</h4>' + section.html + '</section>';
      }).join('');
      var root = detail.world.nodes[detail.world.root];
      mid.innerHTML = '<div class="panel world-panel"><div class="panel__head"><h2>世界志</h2><span class="sub">' + root.name + ' · ' + Object.keys(detail.world.nodes).length + ' 个节点</span></div>' +
        '<div class="world-layout"><aside class="world-tree"><div class="world-tree__head"><b>' + root.name + '</b></div><ul class="world-tree__list">' + renderWorldTreeNode(detail.world.root, 0) + '</ul></aside>' +
        '<article class="world-detail" data-sample-world-detail="' + id + '"><div class="world-detail__path">' + worldPath(id).join('<span>›</span>') + '</div>' +
        '<div class="world-detail__head"><div><h3>' + node.name + '</h3><p>' + node.tag + '</p></div><div class="world-detail__actions"><span class="world-status">' + node.status + '</span>' +
        '<button class="world-edit-btn" data-sample-world-edit aria-pressed="false">编辑</button></div></div>' +
        '<p class="world-detail__intro" data-sample-edit-key="world:' + id + '">' + intro + '</p>' + sections + '</article></div></div>';
    }

    function taskById(id) {
      return detail.tasks.items.filter(function (item) { return item.id === id; })[0] || detail.tasks.items[0];
    }

    function renderTasks() {
      var selected = taskById(state.views.task);
      state.views.task = selected.id;
      var part = state.views.taskPart || '';
      var chapters = [];
      for (var i = 0; i < 12; i += 1) chapters.push(detail.tasks.start + i);
      var head = '<div class="lane-row lane-row--rule"><span class="lane-name"></span><span class="lane-seg lane-seg--past">' + chapters.map(function (chapter) {
        return '<span class="cell cell--num">' + (chapter <= detail.tasks.current && (chapter === detail.tasks.start || chapter === detail.tasks.current || chapter % 3 === 0) ? chapter : '') + '</span>';
      }).join('') + '</span><span class="lane-seg lane-seg--edge"></span><span class="lane-seg lane-seg--plan">' + detail.tasks.arcs.map(function (arc) {
        return '<span class="arc arc--num">' + arc + '</span>';
      }).join('') + '</span></div>';
      var band = '<div class="lane-band"><span class="lane-name"></span><span class="lane-seg lane-seg--past"><i>已写事实</i></span><span class="lane-seg lane-seg--edge"><i>今</i></span><span class="lane-seg lane-seg--plan"><i>往后去向</i></span></div>';
      var rows = detail.tasks.items.map(function (item) {
        var points = {};
        item.points.forEach(function (point) { points[point.chapter] = point; });
        return '<div class="lane-row lane-row--pick' + (item.id === selected.id ? ' is-sel' : '') + '" data-sample-task="' + item.id + '">' +
          '<span class="lane-name"><span class="lane-nm">' + item.name + '</span><em class="lane-urge">' + item.status + '</em></span>' +
          '<span class="lane-seg lane-seg--past has-line">' + chapters.map(function (chapter) {
            var point = points[chapter];
            return '<span class="cell">' + (point ? '<i class="d d--' + point.type + (item.id === selected.id && part === 'point:' + chapter ? ' is-pick' : '') + '" ' +
              'data-sample-task-point="' + item.id + ':' + chapter + '" data-tip="第 ' + chapter + ' 章 · ' + point.summary + '"></i>' : '') + '</span>';
          }).join('') + '</span><span class="lane-seg lane-seg--edge has-line"></span><span class="lane-seg lane-seg--plan has-line">' + detail.tasks.arcs.map(function (_, index) {
            return '<span class="arc">' + (item.future === index ? '<i class="d d--planrev' + (item.id === selected.id && part === 'future' ? ' is-pick' : '') + '" ' +
              'data-sample-task-future="' + item.id + '" data-tip="点开查看未来去向"></i>' : '') + '</span>';
          }).join('') + '</span></div>';
      }).join('');
      var pointList = selected.points.length ? selected.points.map(function (point) {
        return '<div><button class="linkish" data-sample-task-point="' + selected.id + ':' + point.chapter + '">第 ' + point.chapter + ' 章</button> · ' + point.summary + '</div>';
      }).join('<br>') : '<span class="muted">还没有直接写进正文</span>';
      var point = null;
      if (part.indexOf('point:') === 0) {
        var pointChapter = Number(part.split(':')[1]);
        point = selected.points.filter(function (entry) { return entry.chapter === pointChapter; })[0] || null;
        if (!point) state.views.taskPart = null;
      }
      var back = '<button class="linkish" data-sample-task-back>← 回到「' + selected.name + '」整条线</button>';
      var detailHtml;
      if (point) {
        detailHtml = '<div class="lane-detail">' + back + '<div class="panel__head" style="margin-top:10px"><h2 style="font-size:15px">第 ' + point.chapter + ' 章 · 正文痕迹</h2>' +
          '<span class="sub">已经写进故事</span></div><div class="field"><div class="field__k">一句话</div><div class="field__v">' + point.summary + '</div></div>' +
          '<div class="field"><div class="field__k">正文</div><div class="field__v"><div class="prose-sample" style="margin:0">' + (point.text || point.summary) + '</div></div></div></div>';
      } else if (part === 'future') {
        var future = state.edits['task-future:' + selected.id] || selected.futureText;
        detailHtml = '<div class="lane-detail">' + back + '<div class="panel__head" style="margin-top:10px"><h2 style="font-size:15px">往后去向</h2>' +
          '<span class="sub">打算，不是已经发生的事实</span></div><div class="field"><div class="field__k">大致在</div><div class="field__v">' + detail.tasks.arcs[selected.future] + '</div></div>' +
          '<div class="field"><div class="field__k">怎么走</div><div class="field__v sample-task-future">' + future + '</div></div></div>';
      } else {
        detailHtml = '<div class="lane-detail"><div class="panel__head"><h2 style="font-size:15px">' + selected.name + '</h2><span class="sub">' + selected.status + '</span></div>' +
          '<div class="field"><div class="field__k">已知</div><div class="field__v">' + selected.truth + '</div></div>' +
          '<div class="field"><div class="field__k">已写</div><div class="field__v">' + pointList + '</div></div>' +
          '<div class="field"><div class="field__k">眼下</div><div class="field__v">' + selected.now + '</div></div>' +
          '<div class="field"><div class="field__k">往后</div><div class="field__v"><button class="linkish" data-sample-task-future="' + selected.id + '">' +
          (state.edits['task-future:' + selected.id] || selected.futureText) + '</button></div></div></div>';
      }
      mid.innerHTML = '<div class="panel"><div class="panel__head"><h2>伏线</h2><span class="sub">' + detail.tasks.items.length + ' 条</span></div>' +
        '<div class="lane-wrap"><div class="lane-grid">' + head + band + rows + '</div></div>' +
        '<div class="lane-key"><span><i class="d d--kou"></i><b>正文痕迹</b></span><span><i class="d d--planrev"></i><b>未来去向</b></span><span class="lane-key__hint">点任意点位看内容</span></div>' +
        detailHtml + '</div>';
      if (part === 'future') wireEditable(mid.querySelector('.sample-task-future'), 'task-future:' + selected.id);
    }

    function personTree(rootId) {
      var root = detail.people.items[rootId] || detail.people.items[detail.people.home];
      var groups = (root.relations || []).map(function (group) {
        var children = group.children || [];
        var people = children.map(function (child) {
          var person = detail.people.items[child.id];
          if (!person) return '';
          return '<li><button type="button" class="person-tree__person' + (child.id === state.views.personSelected ? ' is-selected' : '') + '" ' +
            'data-sample-person="' + child.id + '" aria-label="查看' + person.name + '；双击切换人物视图">' +
            '<b>' + person.name + '</b><small>' + (child.note || person.note || '') + '</small></button></li>';
        }).join('');
        if (!people) {
          return '<li><span class="person-tree__group is-empty"><span>' + group.label + '</span><em>0</em></span></li>';
        }
        return '<li><button type="button" class="person-tree__group is-open" data-sample-person-group aria-expanded="true">' +
          '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 4.5 6 7l2.5-2.5"/></svg>' +
          '<span>' + group.label + '</span><em>' + children.length + '</em></button><ul>' + people + '</ul></li>';
      }).join('');
      return '<div class="person-tree" aria-label="' + root.name + '的人物关系"><ul><li class="person-tree__root">' +
        '<button type="button" class="person-tree__person is-current' + (rootId === state.views.personSelected ? ' is-selected' : '') + '" data-sample-person="' + rootId + '">' +
        '<b>' + root.name + '</b><small>当前人物</small></button>' +
        '<ul>' + groups + '</ul></li></ul></div>';
    }

    function renderPeople() {
      var items = detail.people.items;
      var home = items[detail.people.home] ? detail.people.home : Object.keys(items)[0];
      state.views.personTrail = (state.views.personTrail || []).filter(function (id) { return !!items[id]; });
      var rootId = items[state.views.personRoot] ? state.views.personRoot : home;
      var selectedId = items[state.views.personSelected] ? state.views.personSelected : rootId;
      state.views.personRoot = rootId;
      state.views.personSelected = selectedId;
      var root = items[rootId];
      var selected = items[selectedId];
      var path = state.views.personTrail.concat([rootId]);
      var crumbs = '<span>人物志</span><i>/</i>' + path.map(function (id, index) {
        var person = items[id];
        if (index === path.length - 1) return '<b>' + person.name + '</b>';
        return '<button type="button" data-sample-person-crumb="' + index + '">' + person.name + '</button><i>/</i>';
      }).join('');
      var atHome = rootId === home && !state.views.personTrail.length;
      var markdown = state.edits['people:' + selectedId] || renderMarkdown(selected.markdown);
      mid.innerHTML = '<div class="panel people-panel"><div class="panel__head"><h2>人物志</h2><span class="sub">' + Object.keys(items).length + ' 人</span></div>' +
        '<div class="person-viewbar"><nav class="person-breadcrumb" aria-label="人物视图路径">' + crumbs + '</nav>' +
        '<div class="person-viewbar__actions"><button type="button" data-sample-person-back' + (!state.views.personTrail.length ? ' disabled' : '') + '>返回上一个视图</button>' +
        '<button type="button" data-sample-person-home' + (atHome ? ' disabled' : '') + '>主角视图</button></div></div>' +
        '<div class="people-panel__layout"><section class="person-relations"><div class="person-relations__head"><h3>关系</h3><span>以 ' + root.name + ' 为中心</span></div>' +
        personTree(rootId) + '</section><div class="person-detail-stack"><article class="person-sheet">' +
        '<div class="markdown-document person-markdown sample-document">' + markdown + '</div></article></div></div></div>';
      wireEditable(mid.querySelector('.sample-document'), 'people:' + selectedId);
    }

    function renderLibrary() {
      var item = detail.library.filter(function (entry) { return entry.id === state.views.library; })[0] || detail.library[0];
      state.views.library = item.id;
      var list = detail.library.map(function (entry) {
        return '<button type="button" class="library-entry' + (entry.id === item.id ? ' is-on' : '') + '" data-sample-library="' + entry.id + '">' +
          '<span><b>' + entry.name + '</b><small>' + entry.kind + '</small></span><p>' + entry.summary + '</p></button>';
      }).join('');
      var backlinks = item.backrefs.map(function (backref) {
        return '<button type="button" class="linkish" data-sample-ref="' + backref.target + '">' + backref.label + '</button>';
      }).join('<i>·</i>');
      var markdown = state.edits['library:' + item.id] || renderMarkdown(item.markdown);
      mid.innerHTML = '<div class="panel library-panel"><div class="panel__head"><h2>资料库</h2><span class="sub">' + detail.library.length + ' 条</span></div>' +
        '<div class="library-layout"><nav class="library-list" aria-label="资料条目">' + list + '</nav><article class="library-document">' +
        '<div class="markdown-document sample-document">' + markdown + '</div>' +
        '<footer class="library-backrefs"><span>提到它</span><div>' + backlinks + '</div></footer></article></div></div>';
      wireEditable(mid.querySelector('.sample-document'), 'library:' + item.id);
    }

    function renderStyle() {
      var guide = state.edits.style || renderMarkdown(detail.style.guide);
      var examples = detail.style.examples.map(function (example) {
        return '<article class="style-example"><header><b>' + example.label + '</b><small>' + example.source + '</small></header>' +
          '<blockquote>' + example.html + '</blockquote></article>';
      }).join('');
      mid.innerHTML = '<div class="panel style-panel"><div class="panel__head"><h2>笔法</h2><span class="sub">' + detail.style.examples.length + ' 段范例</span></div>' +
        '<article class="style-document"><div class="markdown-document style-guide sample-document">' + guide + '</div>' +
        '<section class="style-examples"><h2>写成这样</h2>' + examples + '</section></article></div>';
      wireEditable(mid.querySelector('.sample-document'), 'style');
    }

    function openSection(key) {
      var doc = book.docs[key];
      if (!doc) return;
      state.activeSection = key;
      crumb.innerHTML = '资料 <span>/</span> <b>' + doc.title + '</b>';
      agentCtx.textContent = doc.title;
      mid.classList.toggle('is-world', key === 'world');
      mid.classList.toggle('is-people', key === 'people');
      if (key === 'outline') renderOutline();
      else if (key === 'world') renderWorld();
      else if (key === 'tasks') renderTasks();
      else if (key === 'people') renderPeople();
      else if (key === 'library') renderLibrary();
      else if (key === 'style') renderStyle();
      seed(key, '这是这本书当前的' + doc.title + '。内容可以直接改，也可以把具体修改告诉我。');
      finishOpen();
    }

    function openSampleRef(target) {
      var parts = String(target || '').split(':');
      if (parts[0] === 'chapter') {
        openChapter();
      } else if (parts[0] === 'world' && detail.world.nodes[parts[1]]) {
        state.views.world = parts[1];
        openSection('world');
      } else if (parts[0] === 'tasks' && taskById(parts[1]).id === parts[1]) {
        state.views.task = parts[1];
        state.views.taskPart = null;
        openSection('tasks');
      } else if (parts[0] === 'people' && detail.people.items[parts[1]]) {
        state.views.personSelected = parts[1];
        openSection('people');
      } else if (parts[0] === 'library' && detail.library.some(function (entry) { return entry.id === parts[1]; })) {
        state.views.library = parts[1];
        openSection('library');
      }
    }

    function openChapter() {
      state.activeSection = 'chapter';
      crumb.innerHTML = '正文 <span>/</span> <b>第 ' + book.chapter.number + ' 章 · ' + book.chapter.name + '</b>';
      agentCtx.textContent = '第 ' + book.chapter.number + ' 章';
      mid.classList.remove('is-world', 'is-people');
      mid.innerHTML = '<div class="draft-head"><h1>第 ' + book.chapter.number + ' 章 · ' + book.chapter.name + '</h1><span class="draft-status">' + book.chapter.status + '</span><span class="draft-save">点击正文即可编辑</span></div>' +
        '<article class="draft-copy sample-chapter">' + (state.edits.chapter || book.chapter.html) + '</article>';
      wireEditable(mid.querySelector('.sample-chapter'), 'chapter');
      seed('chapter', onboardingContext && onboardingContext.thread
        ? '我已经接上开书时确认的第二版。你先看正文，哪里不对直接指出来。'
        : book.chapter.agent);
      finishOpen();
    }

    function renderNewChapter() {
      var next = state.newChapter;
      crumb.innerHTML = '正文 <span>/</span> <b>第 ' + book.next.number + ' 章</b>';
      agentCtx.textContent = '第 ' + book.next.number + ' 章';
      mid.classList.remove('is-world', 'is-people');
      if (next.phase === 'empty') {
        mid.innerHTML = '<div class="ask"><b>第 ' + book.next.number + ' 章</b>还什么都没有。<br>说一个你现在最想看的画面，或者先让 Agent 只排这一章。' +
          '<div class="chapter-actions" style="justify-content:center"><button class="btn btn--primary" data-sample-plan>让 Agent 排这一章</button></div></div>';
      } else if (next.phase === 'plan_ready') {
        mid.innerHTML = '<div class="desk__lead"><h1>第 ' + book.next.number + ' 章</h1><span class="tag-pending">等你过目</span></div>' +
          '<p class="sample-plan-note">这一章会发生这些事。哪里不对，逐条改。</p>' +
          '<ol class="beats">' + next.plan.map(function (item, index) {
            return '<li class="beat"><span class="beat__n">' + (index + 1) + '</span><p class="beat__t">' + esc(item) + '</p><button class="beat__edit" data-sample-edit-beat="' + index + '">改</button></li>';
          }).join('') + '</ol><div class="chapter-actions"><span class="chapter-actions__note">只安排这一章</span><button class="btn btn--primary" data-sample-write>按这个写</button></div>';
      } else if (next.phase === 'writing') {
        mid.innerHTML = '<div class="work-state"><div class="work-state__inner"><div class="work-state__pulse"></div><h2>正在写第 ' + book.next.number + ' 章</h2><p>只使用刚刚确认的安排。</p></div></div>';
      } else {
        mid.innerHTML = '<div class="draft-head"><h1>第 ' + book.next.number + ' 章</h1><span class="draft-status">初稿</span><span class="draft-save">点击正文即可编辑</span></div>' +
          '<article class="draft-copy sample-chapter">' + next.draftHtml + '</article>';
        wireEditable(mid.querySelector('.sample-chapter'), 'new-draft', function (html) { state.newChapter.draftHtml = html; });
      }
    }

    function openNewChapter() {
      state.activeSection = 'new';
      seed('new', '第 ' + book.next.number + ' 章还没有内容。你给一个画面，我就从那里开始；也可以只排眼前这一章。');
      renderNewChapter();
      finishOpen();
    }

    function finishOpen() {
      drawNav();
      renderThread();
      updateUrl();
      save();
      body.scrollTop = 0;
    }

    function planNewChapter(customPlan) {
      state.newChapter.phase = 'plan_ready';
      state.newChapter.plan = customPlan && customPlan.length ? customPlan : book.next.plan.slice();
      push('u', customPlan ? customPlan[0] : '只排这一章');
      push('a', customPlan ? '我先把你说的画面放进这一章，不替你补后面的路线。' : '我只接着眼前的故事往下排，没有替你决定后面的路线。', '第 ' + book.next.number + ' 章安排');
      renderNewChapter();
      drawNav();
      save();
    }

    function startWriting(userText) {
      if (state.newChapter.phase !== 'plan_ready') return;
      state.newChapter.phase = 'writing';
      push('u', userText ? esc(userText) : '按这个写');
      state.newChapter.runningMessage = push('a', '<span class="msg__doing"><i></i>正在按确认过的安排写第 ' + book.next.number + ' 章</span>');
      renderNewChapter();
      drawNav();
      save();
      clearTimeout(writingTimer);
      var runningMessage = state.newChapter.runningMessage;
      writingTimer = setTimeout(function () {
        if (state.newChapter.phase !== 'writing') return;
        state.newChapter.phase = 'draft_ready';
        state.newChapter.draftHtml = state.newChapter.draftHtml || book.next.draft;
        finishMessage('new', runningMessage, '初稿写完了。正文可以直接改，再继续告诉我哪里不对。', '第 ' + book.next.number + ' 章初稿');
        state.newChapter.runningMessage = null;
        if (state.activeSection === 'new') renderNewChapter();
        drawNav();
        save();
      }, 850);
    }

    function paragraphTarget(instruction, nodes) {
      if (!nodes.length) return null;
      if (/最后一段|末段/.test(instruction)) return nodes[nodes.length - 1];
      if (/第一段|开头一段|开头这段/.test(instruction)) return nodes[0];
      var digits = instruction.match(/第\s*(\d+)\s*段/);
      if (digits) return nodes[Number(digits[1]) - 1] || null;
      var chinese = instruction.match(/第\s*([一二三四五六七八九十])\s*段/);
      if (chinese) {
        var values = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
        return nodes[values[chinese[1]] - 1] || null;
      }
      var quoted = instruction.match(/把[“\"](.+?)[”\"](?:改成|换成|写成)/);
      if (quoted) {
        return Array.prototype.filter.call(nodes, function (node) { return node.textContent.indexOf(quoted[1]) >= 0; })[0] || null;
      }
      return null;
    }

    function editBeat(button) {
      var index = Number(button.dataset.sampleEditBeat);
      var row = button.closest('.beat');
      var text = row && row.querySelector('.beat__t');
      if (!text) return;
      text.contentEditable = 'true';
      text.focus();
      var range = document.createRange();
      range.selectNodeContents(text);
      range.collapse(false);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      text.addEventListener('blur', function onBlur() {
        text.removeEventListener('blur', onBlur);
        text.contentEditable = 'false';
        state.newChapter.plan[index] = text.textContent.trim();
        save();
        push('a', '第 ' + (index + 1) + ' 件事已经改好。', '第 ' + book.next.number + ' 章安排');
      });
    }

    function sendMessage() {
      var text = say.value.trim();
      if (!text) return;
      say.value = '';
      if (state.activeSection === 'new' && state.newChapter.phase === 'empty') {
        planNewChapter([text]);
        return;
      }
      if (state.activeSection === 'new' && state.newChapter.phase === 'plan_ready' && /直接写|开始写|按这个写|就这么写/.test(text)) {
        startWriting(text);
        return;
      }
      push('u', esc(text));
      var paragraphs = mid.querySelectorAll('[data-sample-edit-key] p, p[data-sample-edit-key]');
      var target = paragraphTarget(text, paragraphs);
      var replacement = text.match(/(?:改成|换成|写成)[：:]?\s*[“\"]?(.+?)[”\"]?$/);
      if (target && replacement && replacement[1]) {
        target.textContent = replacement[1];
        var editable = target.closest('[data-sample-edit-key]') || target;
        var editKey = editable.dataset.sampleEditKey;
        state.edits[editKey] = editable === target ? cleanHtml(target.innerHTML) : cleanHtml(editable.innerHTML);
        if (editKey === 'new-draft') state.newChapter.draftHtml = state.edits[editKey];
        push('a', '已经改了你指定的这一段，其他内容没有动。', sectionLabel(state.activeSection));
        save();
      } else if (replacement && replacement[1]) {
        push('a', '我还不能可靠判断你指的是哪一段，所以这次没有改。请写清“第几段”或“最后一段”，也可以把原句放进引号里。');
      } else {
        push('a', '我正在看' + sectionLabel(state.activeSection) + '。要修改时，把“哪一句改成什么”说完整；这次没有改动内容。');
      }
    }

    nav.addEventListener('click', function (event) {
      var section = event.target.closest('[data-sample-section]');
      var chapter = event.target.closest('[data-sample-chapter]');
      if (event.target.closest('[data-sample-new]')) openNewChapter();
      else if (section) openSection(section.dataset.sampleSection);
      else if (chapter && chapter.dataset.sampleChapter === 'current') openChapter();
      else if (chapter) openNewChapter();
    });
    mid.addEventListener('click', function (event) {
      var worldNode = event.target.closest('[data-sample-world-node]');
      var worldBranch = event.target.closest('[data-sample-world-branch]');
      var worldEdit = event.target.closest('[data-sample-world-edit]');
      var task = event.target.closest('[data-sample-task]');
      var taskPoint = event.target.closest('[data-sample-task-point]');
      var taskFuture = event.target.closest('[data-sample-task-future]');
      var personGroup = event.target.closest('[data-sample-person-group]');
      var person = event.target.closest('[data-sample-person]');
      var library = event.target.closest('[data-sample-library]');
      var sampleRef = event.target.closest('[data-sample-ref]');
      if (event.target.closest('[data-sample-plan]')) planNewChapter();
      else if (event.target.closest('[data-sample-write]')) startWriting();
      else if (event.target.closest('[data-sample-edit-beat]')) editBeat(event.target.closest('[data-sample-edit-beat]'));
      else if (worldBranch) {
        var children = worldBranch.closest('li').querySelector(':scope > ul');
        var open = children.hasAttribute('hidden');
        children.toggleAttribute('hidden', !open);
        worldBranch.classList.toggle('is-open', open);
        worldBranch.setAttribute('aria-expanded', open ? 'true' : 'false');
      } else if (worldNode) {
        state.views.world = worldNode.dataset.sampleWorldNode;
        renderWorld();
        updateUrl();
        save();
      } else if (worldEdit) {
        var article = worldEdit.closest('.world-detail');
        var intro = article.querySelector('.world-detail__intro');
        var editing = !article.classList.contains('is-editing');
        article.classList.toggle('is-editing', editing);
        worldEdit.setAttribute('aria-pressed', editing ? 'true' : 'false');
        worldEdit.textContent = editing ? '完成' : '编辑';
        intro.contentEditable = editing ? 'true' : 'false';
        if (editing) intro.focus();
        else {
          state.edits[intro.dataset.sampleEditKey] = cleanHtml(intro.innerHTML);
          save();
        }
      } else if (taskPoint) {
        var taskPointParts = taskPoint.dataset.sampleTaskPoint.split(':');
        state.views.task = taskPointParts[0];
        state.views.taskPart = 'point:' + taskPointParts[1];
        renderTasks();
        updateUrl();
        save();
      } else if (taskFuture) {
        state.views.task = taskFuture.dataset.sampleTaskFuture;
        state.views.taskPart = 'future';
        renderTasks();
        updateUrl();
        save();
      } else if (event.target.closest('[data-sample-task-back]')) {
        state.views.taskPart = null;
        renderTasks();
        updateUrl();
        save();
      } else if (task) {
        state.views.task = task.dataset.sampleTask;
        state.views.taskPart = null;
        renderTasks();
        updateUrl();
        save();
      } else if (personGroup) {
        var groupChildren = personGroup.closest('li').querySelector(':scope > ul');
        var groupOpen = groupChildren.hasAttribute('hidden');
        groupChildren.toggleAttribute('hidden', !groupOpen);
        personGroup.classList.toggle('is-open', groupOpen);
        personGroup.setAttribute('aria-expanded', groupOpen ? 'true' : 'false');
      } else if (event.target.closest('[data-sample-person-back]')) {
        if (!state.views.personTrail.length) return;
        state.views.personRoot = state.views.personTrail.pop();
        state.views.personSelected = state.views.personRoot;
        renderPeople();
        updateUrl();
        save();
      } else if (event.target.closest('[data-sample-person-home]')) {
        state.views.personRoot = detail.people.home;
        state.views.personSelected = detail.people.home;
        state.views.personTrail = [];
        renderPeople();
        updateUrl();
        save();
      } else if (event.target.closest('[data-sample-person-crumb]')) {
        var crumbButton = event.target.closest('[data-sample-person-crumb]');
        var personPath = state.views.personTrail.concat([state.views.personRoot]);
        var crumbIndex = Number(crumbButton.dataset.samplePersonCrumb);
        if (crumbIndex < 0 || crumbIndex >= personPath.length - 1) return;
        state.views.personRoot = personPath[crumbIndex];
        state.views.personSelected = state.views.personRoot;
        state.views.personTrail = personPath.slice(0, crumbIndex);
        renderPeople();
        updateUrl();
        save();
      } else if (person) {
        clearTimeout(personClickTimer);
        personClickTimer = setTimeout(function () {
          state.views.personSelected = person.dataset.samplePerson;
          renderPeople();
          updateUrl();
          save();
        }, 220);
      } else if (library) {
        state.views.library = library.dataset.sampleLibrary;
        renderLibrary();
        updateUrl();
        save();
      } else if (sampleRef) {
        openSampleRef(sampleRef.dataset.sampleRef);
      }
    });
    mid.addEventListener('dblclick', function (event) {
      var person = event.target.closest('[data-sample-person]');
      if (!person) return;
      clearTimeout(personClickTimer);
      var id = person.dataset.samplePerson;
      if (id === state.views.personRoot || !detail.people.items[id]) return;
      state.views.personTrail.push(state.views.personRoot);
      state.views.personRoot = id;
      state.views.personSelected = id;
      renderPeople();
      updateUrl();
      save();
    });
    document.getElementById('fold').addEventListener('click', function () {
      document.getElementById('shell').classList.toggle('is-folded');
    });
    document.getElementById('send').addEventListener('click', sendMessage);
    say.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    if (state.activeSection === 'chapter') openChapter();
    else if (state.activeSection === 'new') openNewChapter();
    else openSection(state.activeSection);
    return true;
  }

  window.NOYA_SAMPLE_WORKSPACE = {
    supports: function (bookKey) { return !!BOOKS[bookKey]; },
    init: init
  };
})();

/* Noya MVP · 三种骨架共用的面板内容与写作台交互
   同一份内容，甲装进抽屉、乙装进主区、丙装进右栏——保证对比的是"怎么摆"。
   数据全部来自《我在青云宗打卡修仙》这本样书，不是占位文案。 */

window.NOYA = (function () {

  var chapter13Finalized = false;

  /* 引用：两处内容相关就虚线下划，hover 出对方那条，点进去跳过去。
     省掉"这东西该住哪"的纠结——住哪都行，连得上就行。 */
  var REFS = {
    jing:     ['世界志 · 修行与自然 · 境界', '炼气一至九层，之后依次是筑基、金丹、元婴。', 'set:world:realms'],
    daoyuan:  ['世界志 · 修行与自然 · 道源', '道源决定修炼速度和常规上限，受损后通常不能恢复。', 'set:world:daoyuan'],
    zayi:     ['世界志 · 疆域与势力', '玄苍界 › 天南大陆 › 东境 › 青云宗 › 外门 › 杂役院', 'set:world:zayi'],
    cangjing: ['世界志 · 疆域与势力', '藏经阁隶属青云宗外门；三层权限和入场费用各不相同。', 'set:world:cangjing'],
    qiandao:  ['世界志 · 林凡的签到面板', '人在现场完成地点或行为条件，换取能修补道源的奖励。', 'set:world:goldfinger'],
    tongban:  ['世界志 · 经济与资源', '铜钱、银两、灵石和宗门功绩各有使用范围与购买力锚点。', 'set:world:prices'],
    xiuxing:  ['世界志 · 修行与自然 · 修炼资源', '灵气是原料，功法是方法，丹药是短期补充，灵石既能修炼也能交换。', 'set:world:resources'],
    linfan:   ['人物志', '林凡 · 杂役弟子，十六。先活下去，再活得比这里所有人都好。', 'set:people:linfan'],
    hanshiyi: ['人物志', '韩拾遗 · 藏经阁扫地的老头。他是林凡他爹当年的部下。', 'set:people:hanshiyi'],
    shenqingshuang: ['人物志', '沈青霜 · 尚未正式出场。她认得林凡身上那块玉。', 'set:people:shenqingshuang'],
    jadeclue: ['伏线 · 沈青霜认得那块玉', '第 9 章，她在坊市多看了林凡腰间一眼。', 'set:tasks:shen'],
    yinqijue: ['资料库 · 功法', '青云宗外门通用的入门功法，教人引灵气入体并沿经脉运转。', 'set:library:yinqijue'],
    fatherjade: ['资料库 · 物品', '林凡父亲留下的旧玉。韩拾遗有成对残玉，沈青霜也认得它。', 'set:library:fatherjade'],
  };
  function R(id, text) {
    var r = REFS[id];
    if (!r) return text;
    return '<span class="ref" data-ref="' + id + '" data-tip="' + r[0] + '｜' + r[1] + '">' + text + '</span>';
  }
  function refTarget(id) { return REFS[id] ? REFS[id][2] : null; }

  var PEOPLE = {
    linfan: {
      name: '林凡',
      markdown: [
        '# 林凡',
        '',
        '青云宗外门杂役弟子，十六岁。原是社畜，穿越而来，现在炼气三层。',
        '',
        '他眼下刚被孙彪当众踢翻水桶，正第一次走进' + R('cangjing', '藏经阁') + '。他想先活下去，再活得比这里所有人都好。',
        '',
        '他藏着一块只有自己能看见的签到面板。人在现场完成首次到访或行为条件，可以换到道源碎片、功法或资源；同一个条件不能反复触发。他以为没人知道这件事。',
        '',
        '他修炼外门通用的' + R('yinqijue', '《引气诀》') + '，功法慢，也修不好受损的道源。身上有' + R('fatherjade', '父亲留下的一块玉') + '和一件杂役袍。手里只剩 11 文铜钱，刚好够进藏经阁一层十一次，也够买十一个馒头。',
        '',
        '## 写他时',
        '',
        '- 瘦，眼窝深，不爱抬头；被欺负时会先低头收拾东西。',
        '- 嘴上不还嘴，心里话密。',
        '- 遇事先忍、先观察；确认退无可退之后才会突然出手。',
        '',
        '第 1—13 章持续出场。',
      ].join('\n'),
      relations: [
        { label: '亲缘', children: [
          { label: '林家', children: [{ name: '父亲', note: '已故' }] },
        ] },
        { label: '亲近', children: [
          { label: '青云宗', children: [
            { id: 'wangergou', note: '同屋' },
            { id: 'hanshiyi', note: '暗中照看' },
          ] },
        ] },
        { label: '敌对', collapsed: true, children: [
          { label: '青云宗 · 外门', children: [
            { id: 'sunbiao', note: '三次冲突' },
            { id: 'zhaotianxiong', note: '孙彪的靠山' },
          ] },
        ] },
        { label: '未定', collapsed: true, children: [
          { label: '身份未明', children: [{ id: 'shenqingshuang', note: '认得那块玉' }] },
        ] },
        { label: '后辈', children: [] },
      ],
    },
    hanshiyi: {
      name: '韩拾遗',
      markdown: [
        '# 韩拾遗',
        '',
        '青云宗' + R('cangjing', '藏经阁') + '看守。外门老人，没有职级，在阁里待了三十多年。第 13 章第一次露面。',
        '',
        '他是林凡父亲当年的部下，现在只想看着林凡平安长大，别再死在半路上。他知道林凡在签到，林凡却不知道他知道。两个人至今还没说过一句话。',
        '',
        '他实际已经筑基后期，并且很会敛息，外门一直把他当成普通老人。他不能轻易在人前动手。手里有藏经阁各层的钥匙，还有半块与' + R('fatherjade', '林凡父亲遗物') + '成对的残玉。',
        '',
        '## 写他时',
        '',
        '- 干瘦，背微驼，常年穿一身洗到发白的灰袍。',
        '- 说话只用短句，爱反问，从不把话说完整。',
        '- 说话慢，不看人眼睛；越在意，表面越像没看见。',
      ].join('\n'),
      relations: [
        { label: '牵挂', children: [
          { label: '林家', children: [{ id: 'linfan', note: '暗中照看' }] },
        ] },
        { label: '旧识', children: [
          { label: '二十年前', children: [{ id: 'shenqingshuang', note: '旧识' }] },
        ] },
      ],
    },
    sunbiao: {
      name: '孙彪',
      markdown: [
        '# 孙彪',
        '',
        '外门杂役队的小头目，炼气五层，靠拳头管着二十来个人。他想在杂役院当老大，让所有人见了都绕道。第 13 章踢翻林凡的水桶之后，这条线基本走完了。',
        '',
        '他只会粗浅拳法，近身能压住比自己弱的杂役；真遇到术法就没什么优势。平时带一根包铁短棍，用来吓人和打架。',
        '',
        '粗壮，左眉有一道旧疤，笑起来先咧嘴。嗓门大，脏话多。有人围观时下手更狠；真遇到靠山之外的人，会先看对方脸色。',
        '',
        '第 6、9、13 章出现过。',
      ].join('\n'),
      relations: [
        { label: '敌对', children: [{ label: '杂役院', children: [{ id: 'linfan', note: '三次压迫' }] }] },
        { label: '听命', children: [{ label: '青云宗 · 外门', children: [{ id: 'zhaotianxiong', note: '靠山' }] }] },
      ],
    },
    wangergou: {
      name: '王二狗',
      markdown: [
        '# 王二狗',
        '',
        '青云宗杂役院弟子，和林凡同屋。当前只确定他识字，能看宗门告示和简单账目；这是一条人物事实，不是伏线。',
        '',
        '此前章节出现过，具体章号还没整理。',
      ].join('\n'),
      relations: [{ label: '同住', children: [{ label: '杂役院', children: [{ id: 'linfan', note: '同屋' }] }] }],
    },
    zhaotianxiong: {
      name: '赵天雄',
      markdown: [
        '# 赵天雄',
        '',
        '青云宗外门执事，孙彪听命于他。他仍在外门活动，和林凡还没有正面交手。',
        '',
        '内门长老给过他一只装着“补气药”的小瓷瓶，但里面其实是禁药。这件事还没有揭开。',
        '',
        '目前只确定一点：面对境界比自己高的人，他也不会退。',
      ].join('\n'),
      relations: [
        { label: '手下', children: [{ label: '杂役院', children: [{ id: 'sunbiao', note: '听命于他' }] }] },
        { label: '潜在敌对', collapsed: true, children: [{ label: '青云宗', children: [{ id: 'linfan', note: '尚未正面交手' }] }] },
        { label: '利用', collapsed: true, children: [{ label: '内门', children: [{ name: '内门长老', note: '未命名' }] }] },
      ],
    },
    shenqingshuang: {
      name: '沈青霜',
      markdown: [
        '# 沈青霜',
        '',
        '尚未正式出场。她认得' + R('fatherjade', '林凡身上那块玉') + '。至于她在哪里见过、和林凡父亲是什么关系，现在都还没定。',
      ].join('\n'),
      relations: [
        { label: '旧识', children: [{ label: '二十年前', children: [{ id: 'hanshiyi', note: '旧识' }] }] },
        { label: '未定', children: [{ label: '林家', children: [{ id: 'linfan', note: '认得他的玉' }] }] },
      ],
    },
  };

  var LIBRARY = {
    yinqijue: {
      name: '引气诀', kind: '功法',
      summary: '青云宗外门通用的入门功法。',
      markdown: [
        '# 引气诀',
        '',
        '青云宗外门通用的入门功法。它教人把周围灵气引入体内，再沿固定经脉运转，最后沉入丹田。外门弟子和杂役都能接触到。',
        '',
        '它解决的是“怎么吸收灵气”，不是直接拿来打人的术法。练得更熟，吐纳会更稳，但修炼速度仍然受灵气浓度和个人道源限制。',
        '',
        '## 已经确定',
        '',
        '- 功法平稳、门槛低，也因此很慢。',
        '- 它不能修补受损道源，也不会直接提升境界。',
        '- 林凡目前只是入门，靠它维持炼气三层的修行。',
      ].join('\n'),
      backlinks: [
        ['linfan', '林凡人物志'],
        ['xiuxing', '世界志 · 修炼资源'],
      ],
    },
    fatherjade: {
      name: '父亲留下的玉', kind: '物品',
      summary: '林凡随身带着的父亲遗物，真正用途尚未揭开。',
      markdown: [
        '# 父亲留下的玉',
        '',
        '林凡父亲留下的一块旧玉。他一直贴身带着，目前不能主动使用，也没有表现出任何力量。',
        '',
        '韩拾遗手里有半块与它成对的残玉。沈青霜还没有正式出场，但她认得林凡身上这块玉。它的来历、两块玉能不能合在一起，以及沈青霜为什么认得，现在都还没定。',
        '',
        '这件东西目前首先是父辈旧事的线索，不是可以随时救场的法宝。',
      ].join('\n'),
      backlinks: [
        ['linfan', '林凡人物志'],
        ['hanshiyi', '韩拾遗人物志'],
        ['shenqingshuang', '沈青霜人物志'],
        ['jadeclue', '第 9 章伏笔 · 沈青霜认得那块玉'],
      ],
    },
  };

  /* 人物志有两个独立状态：关系树以谁为中心，以及下方正在看谁。
     只有切换中心才写进 trail；单击看详情不会让用户在树里迷路。 */
  var PERSON_VIEW = { root: 'linfan', trail: [] };

  function relationCount(node) {
    if (!node.children) return 1;
    return node.children.reduce(function (sum, child) { return sum + relationCount(child); }, 0);
  }

  function relationNode(node) {
    var children = node.children || [];
    if (node.label) {
      if (!children.length) {
        return '<li><span class="person-tree__group is-empty"><span>' + node.label + '</span><em>0</em></span></li>';
      }
      var open = !node.collapsed;
      return '<li><button type="button" class="person-tree__group' + (open ? ' is-open' : '') + '" ' +
        'data-person-branch aria-expanded="' + (open ? 'true' : 'false') + '">' +
        '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 4.5 6 7l2.5-2.5"/></svg>' +
        '<span>' + node.label + '</span><em>' + relationCount(node) + '</em></button>' +
        '<ul data-person-children' + (open ? '' : ' hidden') + '>' + children.map(relationNode).join('') + '</ul></li>';
    }
    var person = node.id && PEOPLE[node.id];
    if (person) {
      return '<li><button type="button" class="person-tree__person" data-person-node="' + node.id + '" aria-label="查看' + person.name + '；双击切换人物视图">' +
        '<b>' + person.name + '</b>' + (node.note ? '<small>' + node.note + '</small>' : '') + '</button></li>';
    }
    return '<li><span class="person-tree__person is-static"><b>' + node.name + '</b>' +
      (node.note ? '<small>' + node.note + '</small>' : '') + '</span></li>';
  }

  function relationTree(key, p) {
    return '<div class="person-tree" aria-label="' + p.name + '的人物关系"><ul><li class="person-tree__root">' +
      '<div class="person-tree__person is-current"><b>' + p.name + '</b><small>当前人物</small></div>' +
      '<ul data-person-children>' + p.relations.map(relationNode).join('') + '</ul>' +
      '</li></ul></div>';
  }

  function personViewBar() {
    var path = PERSON_VIEW.trail.concat([PERSON_VIEW.root]);
    var crumbs = '<span>人物志</span><i>/</i>' + path.map(function (id, index) {
      var name = PEOPLE[id] ? PEOPLE[id].name : id;
      if (index === path.length - 1) return '<b>' + name + '</b>';
      return '<button type="button" data-person-crumb="' + index + '">' + name + '</button><i>/</i>';
    }).join('');
    var atHome = PERSON_VIEW.root === 'linfan' && !PERSON_VIEW.trail.length;
    return '<div class="person-viewbar">' +
      '<nav class="person-breadcrumb" aria-label="人物视图路径">' + crumbs + '</nav>' +
      '<div class="person-viewbar__actions">' +
        '<button type="button" data-person-back' + (!PERSON_VIEW.trail.length ? ' disabled' : '') + '>返回上一个视图</button>' +
        '<button type="button" data-person-home' + (atHome ? ' disabled' : '') + '>主角视图</button>' +
      '</div></div>';
  }

  function markdownInline(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  }

  function renderMarkdown(markdown) {
    var html = '';
    var inList = false;
    function closeList() {
      if (!inList) return;
      html += '</ul>';
      inList = false;
    }
    markdown.split('\n').forEach(function (line) {
      if (!line.trim()) { closeList(); return; }
      if (line.indexOf('## ') === 0) {
        closeList();
        html += '<h2>' + markdownInline(line.slice(3)) + '</h2>';
        return;
      }
      if (line.indexOf('# ') === 0) {
        closeList();
        html += '<h1>' + markdownInline(line.slice(2)) + '</h1>';
        return;
      }
      if (line.indexOf('- ') === 0) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + markdownInline(line.slice(2)) + '</li>';
        return;
      }
      closeList();
      html += '<p>' + markdownInline(line) + '</p>';
    });
    closeList();
    return html;
  }

  function personMarkdown(key) {
    var markdown = PEOPLE[key].markdown;
    if (chapter13Finalized) return markdown;
    if (key === 'linfan') {
      return markdown
        .replace('他眼下刚被孙彪当众踢翻水桶，正第一次走进', '他眼下仍在躲着孙彪，下一章会第一次走进')
        .replace('第 1—13 章持续出场。', '第 1—12 章持续出场。');
    }
    if (key === 'hanshiyi') {
      return markdown
        .replace('第 13 章第一次露面。', '尚未正式露面；安排在第 13 章进入正文。')
        .replace('两个人至今还没说过一句话。', '两个人还没有在正文里见面。');
    }
    if (key === 'sunbiao') {
      return markdown
        .replace('第 13 章踢翻林凡的水桶之后，这条线基本走完了。', '第 13 章计划再次围堵林凡，这条线是否结束仍跟着正文变化。')
        .replace('第 6、9、13 章出现过。', '第 6、9 章出现过。');
    }
    return markdown;
  }

  function personSheet(key, hidden) {
    var p = PEOPLE[key];
    return '<article class="person-sheet" data-person-sheet="' + key + '"' + (hidden ? ' hidden' : '') + '>' +
      '<div class="markdown-document person-markdown">' + renderMarkdown(personMarkdown(key)) + '</div>' +
    '</article>';
  }

  function libraryPanel(key) {
    key = LIBRARY[key] ? key : 'yinqijue';
    var item = LIBRARY[key];
    var list = Object.keys(LIBRARY).map(function (id) {
      var entry = LIBRARY[id];
      return '<button type="button" class="library-entry' + (id === key ? ' is-on' : '') + '" data-library-entry="' + id + '">' +
        '<span><b>' + entry.name + '</b><small>' + entry.kind + '</small></span>' +
        '<p>' + entry.summary + '</p></button>';
    }).join('');
    var backlinks = item.backlinks.map(function (back) {
      return R(back[0], back[1]);
    }).join('<i>·</i>');
    return {
      title: '资料库',
      html: '<div class="panel library-panel">' +
        '<div class="panel__head"><h2>资料库</h2><span class="sub">' + Object.keys(LIBRARY).length + ' 条</span></div>' +
        '<div class="library-layout">' +
          '<nav class="library-list" aria-label="资料条目">' + list + '</nav>' +
          '<article class="library-document">' +
            '<div class="markdown-document">' + renderMarkdown(item.markdown) + '</div>' +
            '<footer class="library-backrefs"><span>提到它</span><div>' + backlinks + '</div></footer>' +
          '</article>' +
        '</div></div>',
    };
  }

  function personPanelView() {
    var key = PERSON_VIEW.root;
    var p = PEOPLE[key];
    var sheets = Object.keys(PEOPLE).map(function (id) {
      return personSheet(id, id !== key);
    }).join('');
    return {
      title: '人物志',
      html: '<div class="panel people-panel">' +
        '<div class="panel__head"><h2>人物志</h2><span class="sub">' + Object.keys(PEOPLE).length + ' 人</span></div>' +
        personViewBar() +
        '<div class="people-panel__layout">' +
          '<section class="person-relations"><div class="person-relations__head"><h3>关系</h3><span>以 ' + p.name + ' 为中心</span></div>' +
            relationTree(key, p) + '</section>' +
          '<div class="person-detail-stack" data-person-detail-stack>' + sheets + '</div>' +
        '</div></div>',
    };
  }

  function personPanel(key, trail) {
    key = PEOPLE[key] ? key : 'linfan';
    PERSON_VIEW.root = key;
    PERSON_VIEW.trail = Array.isArray(trail) ? trail.filter(function (id) {
      return !!PEOPLE[id] && id !== key;
    }) : [];
    return personPanelView();
  }

  function showPersonDetail(scope, id) {
    if (!PEOPLE[id]) return;
    scope.querySelectorAll('[data-person-sheet]').forEach(function (sheet) {
      sheet.hidden = sheet.dataset.personSheet !== id;
    });
    scope.querySelectorAll('[data-person-node]').forEach(function (node) {
      node.classList.toggle('is-selected', node.dataset.personNode === id);
    });
  }

  function rerenderPersonView(scope, on) {
    scope.innerHTML = personPanelView().html;
    wirePanel(scope, on);
    if (on.ref) wireRefs(scope, on.ref);
    if (on.personRoot) on.personRoot(PERSON_VIEW.root, PERSON_VIEW.trail.slice());
  }

  /* 大纲按普通文稿呈现。结构化数据只服务 agent，不替作者规定阅读形态。 */
  var OUTLINE_MOMENTS = {
    start: {
      when: '第 1 章', title: '落进杂役院',
      text: '林凡道源受损，穿成青云宗最底层的杂役。第一次签到让他知道，自己还有一条只有自己看得见的生路。',
    },
    repair: {
      when: '第 11 章', title: '道源第一次补上',
      text: '第七次真正挑完水，面板给了十点道源。它不多，却证明受损的道源真的可以一点点补回来。',
    },
    now: {
      when: '现在 · 第 13 章', title: '第一次反击',
      text: '林凡已经能修炼，却为了藏住面板继续忍着孙彪。第 13 章，他会走进藏经阁，第一次不再只想着忍过去。',
      note: '韩拾遗会注意到他。孙彪这条线怎么结束，还可以跟着正文变。',
    },
    ending: {
      when: '卷一结尾 · 章数未定', title: '进入内门，秘密开始暴露',
      text: '林凡通过外门大比进入内门。谁先看出异常、他还能瞒住多少，暂时都没定。',
    },
  };

  function outlinePanel() {
    return {
      title: '大纲',
      html: '<div class="panel outline-panel outline-panel--document">' +
        '<div class="panel__head"><h2>大纲</h2><span class="sub">卷一 · 青云宗外门</span></div>' +
        outlineDocument() +
        '</div>',
    };
  }

  function outlineDocument() {
    var nowWhen = chapter13Finalized ? '第 13 章 · 已写' : OUTLINE_MOMENTS.now.when;
    var nowText = chapter13Finalized
      ? '林凡忍下孙彪的围堵，第一次走进藏经阁，并完成了藏经阁的首次签到。韩拾遗已经注意到他。'
      : OUTLINE_MOMENTS.now.text;
    var nowNote = chapter13Finalized
      ? '孙彪这条线尚未彻底结束；韩拾遗没有当场叫住林凡。'
      : OUTLINE_MOMENTS.now.note;
    return '<article class="outline-document">' +
      '<section><small>第 1–12 章 · 已写</small><h3>从等死，到道源第一次被补上</h3>' +
      '<p>' + OUTLINE_MOMENTS.start.text + ' ' + OUTLINE_MOMENTS.repair.text + '</p></section>' +
      '<section class="is-now"><small>' + nowWhen + '</small><h3>外门风波</h3>' +
      '<p>' + nowText + '</p><p>' + nowNote + '</p></section>' +
      '<div class="outline-document__space">···</div>' +
      '<section class="is-ending"><small>' + OUTLINE_MOMENTS.ending.when + '</small>' +
      '<h3>' + OUTLINE_MOMENTS.ending.title + '</h3><p>' + OUTLINE_MOMENTS.ending.text + '</p></section>' +
      '</article>';
  }

  /* 伏线 = 读者暂时看不见、埋下去等着爆的线。
     两段坐标：已写的按章（事实，能点开看正文）／往后的按剧情段（打算，会变）。
     一条线上的"打算"三取值：定了去向 / 还没想好 / 不打算发展。 */
  var WRITTEN = 12;                 // 会随第 13 章是否定稿变化
  var CUR = 13;
  var ARCS = [
    { id: 'dabi', name: '外门大比' },
    { id: 'miji', name: '后山秘境' },
    { id: 'far', name: '更远' },
  ];

  /* 全书就三五条。撑不起一个转折的不叫伏线——
     该进人物志的进人物志，该进世界志的进世界志，什么都不是的什么都不记。 */
  var LANES = [
    { id: 'han', name: '韩拾遗是谁', state: 'open',
      truth: '他是林凡他爹当年的部下。认得林凡腰上那块玉，从林凡进外门第一天起就在暗中看着。',
      why: '揭开这一下，读者对前面所有"这老头有点怪"的地方全部重新理解一遍，林凡在外门的处境也整个变了。',
      cells: {},
      hint: '还一处没埋。第 13 章 agent 正在问你要不要留第一处——埋下去了这儿才会多一个点。',
      plan: { kind: '定', at: 'dabi',
        how: '大比上林凡命悬一线，扫地的老头当众出手——外门那个扫地的，是筑基后期。' } },

    { id: 'zhao', name: '赵天雄的禁药', state: 'open',
      truth: '内门一位长老给的。长老在拿外门弟子养蛊，赵天雄只是其中一味。',
      why: '揭开之后，赵天雄从"挡路的强敌"变成"跟林凡一样被人当材料的人"，而且把矛头引到内门去了。',
      cells: {
        6: { t: '伏', s: '他打赢了一个明显高他两层的人',
          text: '赵天雄一步没退。对面境界比他高两层，第三招就被他压住了肩。<br>围观的人都没说话。',
          mean: '那天他刚服过药。' },
        8: { t: '幕', s: '长老第一次把药给他，说是补气的',
          text: '内门那位长老把一个小瓷瓶推过来："补气的，你底子薄。"<br>赵天雄接了，没多问。',
          mean: '这一段没写进正文，读者不知道。但从这里起，赵天雄身上的每一场胜负都不干净了。' },
        11: { t: '伏', s: '近身时林凡闻到他身上一股说不上来的怪味',
          text: '擦身而过时，林凡闻到一股味道。<br>有点像药，又有点像别的什么，他说不上来。',
          mean: '蛊虫在体内代谢的味道。' },
      },
      plan: { kind: '定', at: 'dabi',
        how: '大比上他失控，当场废掉一个同门。这是林凡被逼到暴露签到的直接原因——他不失控，就没有那一下。' } },

    { id: 'shen', name: '沈青霜认得' + R('fatherjade', '那块玉'), state: 'open',
      truth: '',
      truthNote: '只知道她认得' + R('fatherjade', '这块玉') + '。在哪见的、跟林凡他爹什么关系，我还没想好——先埋着。',
      why: '玉是林凡身世的唯一线头。谁认得它，谁就能把身世那条线拉开。',
      cells: {
        9: { t: '伏', s: '她在坊市多看了林凡腰间一眼',
          text: '那个白衣女修从摊子前走过，脚步没停，眼睛却在他腰间停了半息。<br>等林凡抬头，人已经走远了。',
          mean: '她认出了' + R('fatherjade', '玉的样式') + '。至于然后呢——还没想好。' },
      },
      plan: { kind: '待',
        how: '还没想好。她认出玉之后要主动找上来，还是一直不说破、等林凡自己撞上去——两种走法后面的戏完全不一样。' } },
  ];

  var laneView = { showMore: false };
  var TYPE = {
    '伏': ['伏笔', '写进正文了，读者看得见，但还不知道什么意思', 'd--kou'],
    '幕': ['幕后', '没写进正文，读者看不见，但世界里真发生了', 'd--an'],
    '揭': ['揭开', '前面埋的一起对上', 'd--rev'],
  };
  var PLAN = { '定': '定了去向', '待': '还没想好', '氛': '不发展' };
  var WEIGHT = {
    '重': ['重', '揭开时读者对整本书的理解会变'],
    '轻': ['轻', '揭开时爽一下，收掉就完'],
    '氛': ['氛围', '压根不打算发展，就是个障眼法'],
  };

  function chOf(l, t) { return Object.keys(l.cells).filter(function (n) { return l.cells[n].t === t; }).map(Number); }
  function firstCh(l) {
    var a = Object.keys(l.cells).map(Number).sort(function (x, y) { return x - y; });
    return a[0] || CUR;
  }
  function arcName(id) { var a = ARCS.filter(function (x) { return x.id === id; })[0]; return a ? a.name : '?'; }

  function urge(l) {
    if (l.state === 'closed') return { v: -1, tag: '第 ' + l.at + ' 章已揭开', hot: false };
    var p = l.plan;
    if (p.kind === '待') {
      var n = WRITTEN - firstCh(l);
      return { v: 100 + n, tag: '埋了 ' + n + ' 章，还没想好去向', hot: true };
    }
    return { v: 50 - ARCS.map(function (a) { return a.id; }).indexOf(p.at), tag: '打算在「' + arcName(p.at) + '」揭开', hot: false };
  }

  function fuxianPanel(arg) {
    var byUrge = function (a, b) { return urge(b).v - urge(a).v; };
    var open = LANES.filter(function (l) { return l.state === 'open'; }).sort(byUrge);
    var more = LANES.filter(function (l) { return l.state === 'closed'; }).sort(byUrge);
    var sel = open[0].id, pt = null;
    if (arg && arg.indexOf(':') > -1) { sel = arg.split(':')[0]; pt = arg.split(':')[1]; }
    else if (arg) sel = arg;
    var L = LANES.filter(function (l) { return l.id === sel; })[0] || open[0];
    var shown = open.concat(laneView.showMore ? more : []);

    /* 三段表头：已写（按章）｜在写｜往后（按剧情段） */
    var head = '<div class="lane-row lane-row--rule"><span class="lane-name"></span>' +
      '<span class="lane-seg lane-seg--past">';
    for (var i = 1; i <= WRITTEN; i++) {
      head += '<span class="cell cell--num">' + (i % 3 === 0 || i === 1 ? i : '') + '</span>';
    }
    head += '</span><span class="lane-seg lane-seg--edge"></span>' +
      '<span class="lane-seg lane-seg--plan">' +
      ARCS.map(function (a) { return '<span class="arc arc--num">' + a.name + '</span>'; }).join('') +
      '</span></div>';

    var band = '<div class="lane-band"><span class="lane-name"></span>' +
      '<span class="lane-seg lane-seg--past"><i>已写完 1–' + WRITTEN + ' 章 · 埋进去的事实</i></span>' +
      '<span class="lane-seg lane-seg--edge"><i>今</i></span>' +
      '<span class="lane-seg lane-seg--plan"><i>打算在哪段收 · 粗到剧情段为止，不钉到章</i></span></div>';

    function laneRow(l) {
      var u = urge(l), isSel = l.id === sel, p = l.plan;
      var r = '<div class="lane-row lane-row--pick' + (isSel ? ' is-sel' : '') +
        (l.state === 'closed' ? ' is-closed' : '') + '" data-lane="' + l.id + '">' +
        '<span class="lane-name"><span class="lane-nm">' + l.name + '</span>' +
        '<em class="lane-urge' + (u.hot ? ' is-hot' : '') + '">' + u.tag + '</em></span>';
      // 已写段
      r += '<span class="lane-seg lane-seg--past has-line">';
      for (var k = 1; k <= WRITTEN; k++) {
        var c = l.cells[k];
        r += '<span class="cell">' + (c ? '<i class="d ' + TYPE[c.t][2] + (isSel && pt == k ? ' is-pick' : '') +
          '" data-pt="' + l.id + ':' + k + '" data-tip="第 ' + k + ' 章 · ' + TYPE[c.t][0] + '｜' + c.s + '　（点开看正文）"></i>' : '') + '</span>';
      }
      r += '</span><span class="lane-seg lane-seg--edge has-line"></span>';
      // 往后段
      r += '<span class="lane-seg lane-seg--plan has-line">';
      if (l.state === 'closed') {
        r += '<span class="arc arc--none">已收</span>';
      } else if (p.kind === '定') {
        ARCS.forEach(function (a) {
          r += '<span class="arc">' + (a.id === p.at
            ? '<i class="d d--planrev' + (isSel && pt == 'plan' ? ' is-pick' : '') + '" data-pt="' + l.id +
              ':plan" data-tip="打算在「' + a.name + '」揭开｜' + p.how + '　（打算，会变）"></i>' : '') + '</span>';
        });
      } else {
        r += '<span class="arc arc--wait is-hot" data-pt="' + l.id + ':plan">还没想好去向</span>';
      }
      return r + '</span></div>';
    }

    var detail = laneDetail(L, pt);
    var waits = open.filter(function (l) { return l.plan.kind === '待'; }).length;
    var nMore = more.length;

    return {
      title: '伏线',
      html: '<div class="panel">' +
        '<div class="panel__head"><h2>伏线</h2><span class="sub">' + open.length + ' 条</span></div>' +
        '<p class="hint">只有<b>揭开时能撑起一个转折</b>的才进这儿——改变主角的处境，或者改变读者对某个人的判断。' +
        '撑不起来的该进人物志进人物志、该进世界志进世界志。全书三五条正常，十几条就是记多了。</p>' +
        (waits ? '<div class="lane-warn"><b>' + waits + '</b> 条还没想好去向。悬着不要紧，但我不知道往哪收，' +
          '写到相关的章只能绕开走。<span class="pend">多久提醒一次待定</span></div>' : '') +
        '<div class="lane-wrap"><div class="lane-grid">' + head + band +
        shown.map(laneRow).join('') + '</div></div>' +
        '<div class="lane-key">' +
        '<span><i class="d d--kou"></i><b>伏笔</b>写进正文了</span>' +
        '<span><i class="d d--an"></i><b>幕后</b>没写进正文，读者看不见</span>' +
        '<span><i class="d d--planrev"></i><b>打算揭开</b>还没发生</span>' +
        '<span class="lane-key__hint">点任意一格看内容</span></div>' +
        (nMore ? '<button class="lane-more" data-act="toggle-closed">' +
          (laneView.showMore ? '收起' : '展开') + '已揭开的 ' + nMore + ' 条</button>'
          : '<div class="lane-none">还没有揭开过的——才写到第 13 章，正常。</div>') +
        detail + '</div>',
    };
  }

  function laneDetail(L, pt) {
    var back = '<button class="linkish" data-back="' + L.id + '">← 回到「' + L.name + '」整条线</button>';
    if (pt === 'plan') {
      var p = L.plan, pk = PLAN[p.kind];
      return '<div class="lane-detail">' + back +
        '<div class="panel__head" style="margin-top:10px"><h2 style="font-size:15px">往后打算怎么走</h2>' +
        '<span class="sub">这一栏是打算，不是事实——随时改，改了后面就按新的走</span></div>' +
        '<div class="field"><div class="field__k">去向</div><div class="field__v">' +
        ['定', '待'].map(function (k) {
          return '<button class="btn btn--sm' + (k === p.kind ? ' btn--primary' : '') +
            '" data-plan="' + L.id + ':' + k + '">' + PLAN[k] + '</button>';
        }).join(' ') + '</div></div>' +
        (p.kind === '定' ? '<div class="field"><div class="field__k">在哪揭</div><div class="field__v">剧情段「' +
          arcName(p.at) + '」<span class="muted"> · 只到这一段。哪一章埋、哪一章收，写到那儿现判断</span></div></div>' : '') +
        '<div class="field"><div class="field__k">怎么爆</div><div class="field__v">' + p.how + '</div></div>' +
        '<div class="field"><div class="field__k">agent 会</div><div class="field__v">' +
        (p.kind === '定' ? '写到「' + arcName(p.at) + '」这一段的时候，找个合适的地方收——具体哪一章、怎么收，我到那儿再判断，拿不准问你。在那之前不主动还它。'
          : '每隔一阵问你一次要不要定个去向；不会自作主张替你安排。') + '</div></div></div>';
    }
    var c = pt ? L.cells[pt] : null;
    if (c) {
      var ty = TYPE[c.t];
      return '<div class="lane-detail">' + back +
        '<div class="panel__head" style="margin-top:10px"><h2 style="font-size:15px">第 ' + pt + ' 章 · ' + ty[0] + '</h2>' +
        '<span class="sub">' + ty[1] + '</span></div>' +
        '<div class="field"><div class="field__k">一句话</div><div class="field__v">' + c.s + '</div></div>' +
        '<div class="field"><div class="field__k">' + (c.t === '幕' ? '发生了' : '正文') + '</div>' +
        '<div class="field__v">' + (c.t === '幕'
          ? '<div class="lane-off">' + c.text + '</div>'
          : '<div class="prose-sample" style="margin:0">' + c.text + '</div>') + '</div></div>' +
        (c.mean ? '<div class="field"><div class="field__k">' + (c.t === '幕' ? '它约束' : '它其实是') + '</div>' +
          '<div class="field__v">' + c.mean + '</div></div>' : '') + '</div>';
    }
    var fu = chOf(L, '伏'), mu = chOf(L, '幕');
    var list = function (ns) {
      return ns.length ? ns.map(function (n) {
        return '<div><button class="linkish" data-pt="' + L.id + ':' + n + '">第 ' + n + ' 章</button> · ' + L.cells[n].s + '</div>';
      }).join('') : '<span class="muted">还没有</span>';
    };
    var h = '<div class="lane-detail">' +
      '<div class="panel__head"><h2 style="font-size:15px">' + L.name + '</h2><span class="sub">' + urge(L).tag + '</span></div>' +
      '<div class="field"><div class="field__k">真相</div><div class="field__v">' +
      (L.truth ? L.truth + '<span class="chip chip--dark" style="margin-left:6px">只有你和 agent 知道</span>'
        : '<span class="muted">' + L.truthNote + '</span>') + '</div></div>' +
      '<div class="field"><div class="field__k">凭什么算伏线</div><div class="field__v">' + L.why + '</div></div>' +
      '<div class="field"><div class="field__k">已埋</div><div class="field__v">' + list(fu) + '</div></div>' +
      (mu.length ? '<div class="field"><div class="field__k">幕后</div><div class="field__v">' + list(mu) + '</div></div>' : '');
    if (L.hint) h += '<div class="field"><div class="field__k"></div><div class="field__v">' +
      '<div class="lane-check">' + L.hint + '</div></div></div>';
    if (L.state === 'open') {
      h += '<div class="field"><div class="field__k">往后</div><div class="field__v">' +
        '<button class="linkish" data-pt="' + L.id + ':plan">' + PLAN[L.plan.kind] + '</button> · ' + L.plan.how +
        (L.plan.kind === '定' ? '<div class="lane-check">已埋 <b>' + fu.length + '</b> 处。到「' + arcName(L.plan.at) +
          '」揭开时，这几处要能一起对上。' + (fu.length >= 2 ? '' : '现在只有一处，偏少。') + '</div>' : '') +
        '</div></div>';
    } else {
      h += '<div class="field"><div class="field__k">揭开</div><div class="field__v">' +
        '<button class="linkish" data-pt="' + L.id + ':' + chOf(L, '揭')[0] + '">第 ' + L.at + ' 章</button> · ' +
        L.cells[chOf(L, '揭')[0]].s + '</div></div>';
    }
    return h + '</div>';
  }

  function chaptersPanel() {
    var rows = [
      [10, '水桶与铜板', '2,410 字'], [11, '第七次签到', '2,880 字'],
      [12, '他不还嘴', '2,600 字'], [13, '藏经阁的老头', '还没写'],
    ];
    return {
      title: '正文',
      html:
        '<div class="panel">' +
        '<div class="panel__head"><h2>正文</h2><span class="sub">13 章 · 3.6 万字</span></div>' +
        '<ul class="chlist">' + rows.map(function (r) {
          var now = r[0] === 13 ? ' class="is-now"' : '';
          return '<li' + now + '><button data-ch="' + r[0] + '"><span class="n">第 ' + r[0] + ' 章</span>' +
            '<span class="t">' + r[1] + '</span><span class="w">' + r[2] + '</span></button></li>';
        }).join('') + '</ul>' +
        '<div class="slate__note" style="margin-top:16px">点某一章进去读正文，能就地改，也能看它被打回重写过几次。</div>' +
        '</div>',
    };
  }

  /* ---------- 世界志 ----------
     世界志先是一棵有父子关系的树，再从树上按章节取用。
     风土附着在地点节点上；势力附着在它实际统辖的地域上，不再拆成两堆平铺条目。
     树根还挂着修行、社会、经济与主角机制——写作范围内的世界必须先能运转，再谈背景色。 */
  function worldLink(id, name, meta) {
    return '<button class="world-node-link" data-world-node="' + id + '">' +
      '<span>' + name + '</span>' + (meta ? '<small>' + meta + '</small>' : '') +
      '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4.5 2.5 8 6 4.5 9.5"/></svg></button>';
  }
  function worldCards(items) {
    return '<div class="world-card-grid">' + items.map(function (it) {
      return worldLink(it[0], it[1], it[2]);
    }).join('') + '</div>';
  }
  function worldBullets(items) {
    return '<ul class="world-bullets">' + items.map(function (it) { return '<li>' + it + '</li>'; }).join('') + '</ul>';
  }

  var worldRealmLayers = 9;
  var worldRealmBad = false;
  var worldRealmSince = null;

  var WORLD_NODES = {
    xuan: {
      name: '玄苍界', tag: '界', status: '当前世界',
      intro: '故事当前发生在天南大陆东境。西境、南境和北境尚未展开。',
      guard: '任何地点、势力、制度和资源都必须能沿父级一路追到这里。找不到归属，就先别写进世界志。',
      sections: [
        { title: '概览', html:
          '<div class="world-answer-grid"><span>人住在哪</span><span>谁管谁</span><span>靠什么修炼</span><span>钱值多少</span><span>主角凭什么破局</span></div>' },
        { title: '世界边界', html:
          '<p>玄苍界之外是否还有别的界，尚未决定。正文碰到这里时先问作者，不准自行补出仙界、魔界或上界。</p>' },
      ],
    },
    territory: {
      name: '疆域与势力', tag: '空间骨架', status: '层级已定',
      intro: '玄苍界下是天南大陆，故事从东境的青云宗开始。地点、势力和当地风土都沿着这条路径往下展开。',
      guard: '写到一个地点时，沿「界 → 大陆 → 境域 → 势力或国家 → 机构 → 具体地点」往下读；不会把无关地域整本塞进章节。',
      sections: [
        { title: '固定层级', html:
          '<div class="world-levels"><b>界</b><i></i><b>大陆 / 海域</b><i></i><b>境域</b><i></i><b>势力 / 国家</b><i></i><b>机构</b><i></i><b>地点</b></div>' },
        { title: '风土放在哪', html:
          '<p>东境多雨，挂在「东境」；青云宗山路湿滑，挂在「青云宗」；井台的青石和麻绳，挂在「杂役院 › 井台」。它描述谁，就住在谁下面。</p>' },
      ],
    },
    tiannan: {
      name: '天南大陆', tag: '大陆', status: '东境可写',
      intro: '玄苍界目前唯一展开的大陆，分东、西、南、北四境。故事开篇只在东境活动，另外三境保留边界。',
      guard: '人物从一境去另一境要按距离、交通方式和身份算时间；不能一句“赶路数日”就跨过整片大陆。',
      sections: [
        { title: '四大境', html: worldCards([
          ['east', '东境', '三大宗、四大国；当前主舞台'],
          ['west', '西境', '留白，写到时先定'],
          ['south', '南境', '留白，写到时先定'],
          ['north', '北境', '留白，写到时先定'],
        ]) },
        { title: '共同常识', html:
          '<p>凡人知道四境存在，但多数人终身不离本国。只有商队、宗门使者和筑基以上修士会稳定跨境。</p>' },
      ],
    },
    east: {
      name: '东境', tag: '境域', status: '当前主舞台',
      intro: '天南大陆东部，山脉与河谷交错。三大宗占灵脉、收弟子，四大国管凡人、粮税和城镇。',
      guard: '宗门不能凭空长出人口和粮食；国家也不能越过宗门处理修士。两边互相需要，世界才转得起来。',
      sections: [
        { title: '东境势力', html: worldCards([
          ['sects', '三大宗', '青云宗、赤霄谷、洛水宫'],
          ['kingdoms', '四大国', '大梁、越国、北燕、南楚'],
        ]) },
        { title: '运行关系', html: worldBullets([
          '四国提供人口、粮食、税银和道路；三宗镇守灵脉、处理妖患，也从四国招收弟子。',
          '凡人的命案、田产和商税归国法；修士斗法、功法与灵脉归宗门规矩。',
          '三宗彼此竞争，但妖潮来时必须共同守住东境。'
        ]) },
        { title: '风土', html:
          '<p>雨多、河网密，村镇多贴着山口和渡口长。东境人说话快，见修士先让路；这类共同习惯只在写东境人物或城镇时带入。</p>' },
      ],
    },
    sects: {
      name: '三大宗', tag: '势力组', status: '关系已定',
      intro: '三宗共享东境修行资源，但各有一条最擅长的路。它们不是三个孤立名字，彼此抢弟子、任务和灵脉份额。',
      guard: '新增宗门之前先判断它在东境权力结构里占什么位置；不能为了某一章方便凭空再塞一个“大宗”。',
      sections: [
        { title: '三宗', html: worldCards([
          ['qingyun', '青云宗', '剑修与典籍；主角所在'],
          ['chixiao', '赤霄谷', '炼器与火法；控制矿脉'],
          ['luoshui', '洛水宫', '丹药与医修；控制水路'],
        ]) },
        { title: '谁压谁', html:
          '<p>青云宗弟子最多但财力一般；赤霄谷最富；洛水宫人数最少，却掌握东境大半高阶丹药。三家谁都压不住另外两家。</p>' },
      ],
    },
    qingyun: {
      name: '青云宗', tag: '宗门', status: '已展开',
      intro: '东境三大宗之一，坐落在大梁与越国交界的青云山脉。靠一条中品灵脉和藏经阁立足，弟子来源主要是两国。',
      guard: R('linfan', '林凡') + '的身份、活动范围和能接触到的资源，都必须经过宗门层级；杂役不能一步越到长老身边。',
      sections: [
        { title: '宗门层级', html: worldCards([
          ['outer', '外门', '约三千人；杂役和普通弟子都在这里'],
          ['backmount', '后山', '灵脉核心；外门禁入'],
        ]) },
        { title: '谁做决定', html: worldBullets([
          '宗主定大方向；长老院掌灵脉、功法和惩戒。',
          '内门按师承分峰；外门由执事堂管理；杂役院在外门最底层。',
          '宗门不养所有人的吃穿：外门靠四国供给与自己的药田、矿场维持。'
        ]) },
        { title: '宗门风土', html:
          '<p>山中潮湿，石阶终年有苔。内门穿青纹袍，外门穿灰白袍；身份差异不用解释，衣服和走哪条路就能看出来。</p>' },
      ],
    },
    outer: {
      name: '外门', tag: '机构', status: '当前活动范围',
      intro: '青云宗接纳普通弟子和杂役的地方。这里负责筛人、干活和维持宗门日常，也是主角开篇能自由活动的最大范围。',
      guard: '外门弟子能去哪里、每月拿什么、犯事谁罚，都由外门身份决定。超出权限必须先解决身份或门禁。',
      sections: [
        { title: '下辖地点', html: worldCards([
          ['zayi', '杂役院', '住处、井台、杂活'],
          ['cangjing', '藏经阁', '三层权限；一层按次收费'],
          ['backmount', '后山入口', '外门弟子禁入'],
        ]) },
        { title: '日常秩序', html:
          '<p>执事堂发任务、月钱和惩戒；杂役做挑水、劈柴、扫院等活。外门弟子完成月度任务后，剩余时间归自己。</p>' },
      ],
    },
    zayi: {
      name: '杂役院', tag: '地点', status: '已展开',
      intro: '青云宗外门最东侧，一排土房围着空地，井在西头。住的是最底层杂役，吃住由宗门包，月钱只是零用。',
      guard: '从井走到最东边的房间要歇两回；管事很少出现。林凡能避开差事去藏经阁，靠的是这个空间与管理事实。',
      history: '<b>第 8 章之前</b>：管事住在院里，天天点卯。第 8 章他调去内门后，改成三个月才来一次。<br><span class="muted">这是世界状态变化，不是等着兑现的伏线。</span>',
      sections: function () {
        var places = worldCards([
          ['well', '井台', '西头青石台；第 3、10 章出现'],
          ['cangjing', '去藏经阁', '穿过外门校场，步行一刻钟'],
        ]);
        return [
          { title: '里面有什么', html: places },
          { title: '谁管这里', html:
            '<p>名义上归外门执事堂；日常由杂役头目维持秩序。管事三个月来一次，只查人数和任务，不管私下欺压。</p>' },
          { title: '生活锚点', html:
            '<p>八人一间土房，饭堂两餐，领灰白杂役袍。月钱三十文不负责吃住，所以它不是一个普通家庭的全部生活费。</p>' },
        ];
      },
    },
    cangjing: {
      name: '藏经阁', tag: '地点', status: '第 13 章场景',
      intro: '青云宗外门西侧的三层木楼。典籍与权限逐层提高，韩拾遗常年守在一层入口。',
      guard: '外门身份只能到一层；想拿二层功法必须有执事令牌，三层只对内门开放。不能靠“趁没人”绕过身份。',
      sections: [
        { title: '三层权限', html:
          '<div class="world-stack"><div><b>一层</b><span>基础功法与杂记 · 外门可进 · 每次一文</span></div><div><b>二层</b><span>进阶功法 · 需要执事令牌</span></div><div><b>三层</b><span>宗门秘传 · 仅内门与长老</span></div></div>' },
        { title: '和别处怎么连', html:
          '<p>归外门执事堂管账，典籍来源归长老院；费用见' + R('tongban', '经济与资源') + '。林凡首次进入这里时，会触发' + R('qiandao', '签到面板') + '的“首次到访”。</p>' },
      ],
    },
    backmount: {
      name: '后山', tag: '地点', status: '封闭',
      intro: '青云宗灵脉核心与长老闭关处，入口在藏经阁后方山道。外门弟子擅入会被废去修为。',
      guard: '后山禁地要先解决钥匙、身份或秘密通道，不能让林凡大摇大摆走进去。',
      sections: [
        { title: '门禁', html:
          '<p>山门石锁由长老院保管，巡山弟子两班轮值。筑基以下不能御剑越过山脊，地形本身也是门。</p>' },
      ],
    },
    chixiao: {
      name: '赤霄谷', tag: '宗门', status: '轮廓',
      intro: '东境三大宗之一，靠火脉与矿山立足，擅长炼器和火法。商队与四国军队都买它的兵器。',
      guard: '赤霄谷出场时优先带矿脉、火法和价格关系；不需要读取青云宗内部的杂役规矩。',
      sections: [{ title: '与青云宗', html: '<p>争东境北部一座铁矿，表面按三宗旧约轮采，私下不断加码。</p>' }],
    },
    luoshui: {
      name: '洛水宫', tag: '宗门', status: '轮廓',
      intro: '东境三大宗之一，沿洛水建宫，擅长丹药、医修与水法。人数最少，但三宗都离不开它的丹药。',
      guard: '涉及疗伤、毒与高阶丹药时才展开；普通外门生活不用整份读取。',
      sections: [{ title: '与四国', html: '<p>控制洛水上的主要渡口，用医馆和丹坊维持影响力，不直接占领城池。</p>' }],
    },
    kingdoms: {
      name: '四大国', tag: '国家组', status: '关系已定',
      intro: '四国治理东境凡人世界，彼此打仗、通商和收税；修士相关事务则受三宗约束。',
      guard: '国家要提供人口、粮食、道路和税银；不能只当四个地图标签。',
      sections: [
        { title: '四国', html: worldCards([
          ['daliang', '大梁', '青云宗主要弟子来源；粮多'],
          ['yue', '越国', '山多药材多；与大梁共供青云宗'],
          ['beiyan', '北燕', '马匹与铁矿；更靠近赤霄谷'],
          ['nanchu', '南楚', '水路与商贸；受洛水宫影响最深'],
        ]) },
        { title: '宗门与国法的边界', html:
          '<p>凡人案件由官府审；登记修士造成的斗法与灵脉争端上报三宗。国君不能处死宗门弟子，宗门也不直接替县令收田税。</p>' },
      ],
    },
    daliang: { name: '大梁', tag: '国家', status: '轮廓', intro: '东境中部的农业大国，官道最密。青云宗每三年在大梁收徒一次。', guard: '大梁场景要能交代官府、粮价和通往青云山的道路。', sections: [] },
    yue: { name: '越国', tag: '国家', status: '轮廓', intro: '多山多药材，猎户和采药人多。青云山脉南麓在越国境内。', guard: '越国人物对山路与药材熟悉，但大规模粮食依赖大梁。', sections: [] },
    beiyan: { name: '北燕', tag: '国家', status: '轮廓', intro: '北部草原与铁矿国，马匹和兵器贸易发达，与赤霄谷走得最近。', guard: '北燕的财富锚点是马、矿和军械，不照搬大梁粮价。', sections: [] },
    nanchu: { name: '南楚', tag: '国家', status: '轮廓', intro: '河网密集的商贸国，货物沿洛水进入整个东境。', guard: '南楚场景按水路算距离，洛水宫对渡口和医药有实际影响。', sections: [] },
    west: { name: '西境', tag: '境域', status: '留白', blank: true, intro: '只知道它属于天南大陆。地形、势力和修行传统都未决定。', guard: '正文要去西境时先问作者；不能为了方便临时生成一个西境第一宗。', sections: [] },
    south: { name: '南境', tag: '境域', status: '留白', blank: true, intro: '只知道它属于天南大陆。其余尚未决定。', guard: '留白本身就是规则：没得到作者确认之前，agent 不能把它写成蛮荒或妖族地盘。', sections: [] },
    north: { name: '北境', tag: '境域', status: '留白', blank: true, intro: '只知道它属于天南大陆。其余尚未决定。', guard: '涉及北境来客时，只能写已确认的来客自身，不反推整片北境是什么样。', sections: [] },

    cultivation: {
      name: '修行与自然', tag: '运行体系', status: '可支撑开篇',
      intro: '灵气是原料，功法决定如何吸收，道源决定天赋与常规上限。境界同时影响力量、移动、寿命和身份。',
      guard: '每次写打斗、赶路、疗伤或突破，都必须同时对照境界、道源、资源和身体代价。',
      sections: [
        { title: '四个支点', html: worldCards([
          ['daoyuan', '道源', '天赋与常规上限'],
          ['realms', '境界', '炼气至元婴'],
          ['movement', '能力边界', '御剑、神识、寿命'],
          ['resources', '修炼资源', '灵气、功法、丹药、灵石'],
        ]) },
      ],
    },
    daoyuan: {
      name: '道源', tag: '修行规则', status: '核心矛盾',
      intro: '每个人出生时都有道源，决定吸收灵气的速度与常规上限。道源受损后，现有修行常识认为无法补回。',
      guard: R('linfan', '林凡') + '的道源只够炼气三层，所以常规路线已经堵死。' + R('qiandao', '签到面板') + '之所以重要，是它能一点点绕过这条铁律，而不是凭空送境界。',
      sections: [
        { title: '修炼因果', html: worldBullets([
          '功法决定怎么吸收；灵气决定有多少可吸；道源决定吸得多快、最多走到哪。',
          '丹药能补灵气和冲关，不能修补道源。',
          '签到奖励里的“道源碎片”是目前唯一已知例外。'
        ]) },
      ],
    },
    realms: {
      name: '境界', tag: '修行规则', status: '四境',
      intro: '炼气、筑基、金丹、元婴四境。每一境不仅代表强弱，也决定移动、感知、寿命和社会身份。',
      guard: '不许冒出第五境；炼气的层数改动会同时影响已经写过的称呼、人物强弱和升级节奏。',
      sections: function () {
        return [
          { title: '境界阶梯', html:
            '<div class="world-realm-row"><div class="' + (worldRealmBad ? 'is-conflict' : '') + '"><b>炼气</b><span>一至' + worldRealmLayers + '层 · 强身、用低阶术法</span></div><div><b>筑基</b><span>可御剑、神识离体 · 寿二百</span></div><div><b>金丹</b><span>可镇一城 · 寿五百</span></div><div><b>元婴</b><span>东境顶层 · 寿千年</span></div></div>' },
          worldRealmSince ? { title: '生效位置', html:
            '<p>从第 ' + worldRealmSince + ' 章起按炼气五层写；此前正文里的九层说法保留为当时版本，不倒改旧章。</p>' } : null,
          { title: '写作边界', html:
            '<p>筑基以下不能御剑；炼气神识不能离体；境界高不等于必胜，功法、伤势和准备仍然生效。</p>' },
        ].filter(Boolean);
      },
    },
    movement: {
      name: '能力边界', tag: '修行规则', status: '已定',
      intro: '力量体系最终要落到人能做什么。赶路、感知、负伤和寿命都在这里给出锚点。',
      guard: '外门炼气弟子主要靠走路；不能为了转场让林凡一夜跑三百里，也不能让他隔墙听见长老密谈。',
      sections: [
        { title: '能力锚点', html: worldBullets([
          '炼气：快于凡人、能用低阶术法；一天步行最多一百里。',
          '筑基：可御剑，一日约八百里；神识能覆盖一座院子。',
          '山里闭关一年，山外也过一年，不存在默认时间差。'
        ]) },
      ],
    },
    resources: {
      name: '修炼资源', tag: '修行规则', status: '开篇够用',
      intro: '灵气是原料，功法是方法，丹药是短期补充，灵石既能修炼也能交换。四者作用不能互相替代。',
      guard: '奖励必须说清属于哪一类、解决哪一步；“得到天材地宝”不是可执行设定。',
      sections: [
        { title: '当前品类', html:
          '<div class="world-stack"><div><b>灵气</b><span>青云宗中品灵脉提供；越靠后山越浓</span></div><div><b>功法</b><span>决定吸收与术法；外门以' + R('yinqijue', '《引气诀》') + '入门</span></div><div><b>丹药</b><span>补灵气、疗伤、助冲关；不能补道源</span></div><div><b>灵石</b><span>储存灵气，也用于修士间高价值交易</span></div></div>' },
      ],
    },

    society: {
      name: '社会秩序', tag: '运行体系', status: '东境已定',
      intro: '四国管凡人日常，三宗管修士与灵脉。身份决定人能去哪里、拿到什么，交通和传信决定人与消息需要多久才能抵达。',
      guard: '人物做任何超出身份的事，都要付出令牌、人情、钱、时间或风险，不能一句“打点好了”略过。',
      sections: [
        { title: '四个支点', html: worldCards([
          ['authority', '权力边界', '国法与宗规怎么分'],
          ['identity', '身份阶序', '凡人、杂役、外门、内门'],
          ['transport', '交通与传信', '走路、驿马、御剑、符信'],
          ['calendar', '时间常识', '历法与闭关时间'],
        ]) },
      ],
    },
    authority: {
      name: '权力边界', tag: '社会规则', status: '已定',
      intro: '四国管凡人日常，三宗管修士与灵脉。两套权力在城镇和宗门领地交界。',
      guard: '凡人官府不能随意审判正式宗门弟子；宗门也不替县衙处理普通田产纠纷。',
      sections: [{ title: '冲突怎么处理', html: '<p>登记修士伤人，由官府先封现场，再报对应宗门。宗门三日内不来，才由三宗共设的巡察使接手。</p>' }],
    },
    identity: {
      name: '身份阶序', tag: '社会规则', status: '已定',
      intro: '身份决定能走哪扇门、拿什么资源、犯错由谁罚。它是世界运行权限，不只是称号。',
      guard: '杂役不能调用外门弟子资源；外门不能进入内门与后山；突破或受师承后身份才会改变。',
      sections: [
        { title: '青云宗内', html:
          '<div class="world-levels"><b>杂役</b><i></i><b>外门弟子</b><i></i><b>内门弟子</b><i></i><b>亲传 / 执事</b><i></i><b>长老</b></div>' },
      ],
    },
    transport: {
      name: '交通与传信', tag: '社会规则', status: '基本锚点',
      intro: '凡人靠步行、驿马和船；筑基后才可稳定御剑。普通书信按驿路走，符信只有宗门执事以上常用。',
      guard: '距离要换成时间；消息也要有传播速度。某地刚发生的事，另一国不能当天人人都知道。',
      sections: [{ title: '时间锚点', html: '<p>杂役院到藏经阁步行一刻钟；青云宗到最近县城步行一天；大梁都城到青云宗驿马七天。</p>' }],
    },
    calendar: {
      name: '时间常识', tag: '社会规则', status: '够用',
      intro: '一年十二月，一日十二时辰，四季与现实相同。闭关不会让外界停下。',
      guard: '写“三年后”时，人物年龄、职位、物价和已经排定的宗门事件都要一起向前。',
      sections: [],
    },

    economy: {
      name: '经济与资源', tag: '运行体系', status: '有购买力锚点',
      intro: '四国日常使用铜钱和银两，修士的大额交易用灵石，宗门内部还有不可转让的功绩。收入和物价以东境的日常生活为准。',
      guard: '涉及买卖、悬赏、月钱、贫富和资源分配时，必须能落到同一套单位与购买力上。',
      sections: [
        { title: '四本账', html: worldCards([
          ['currency', '货币与兑换', '铜钱、银两、灵石、功绩'],
          ['income', '收入来源', '凡人、杂役、弟子怎么挣钱'],
          ['prices', '购买力锚点', '一顿饭、一晚店、一月生活'],
          ['trade', '资源怎么流动', '四国、三宗、坊市之间'],
        ]) },
      ],
    },
    currency: {
      name: '货币与兑换', tag: '经济', status: '单位已定',
      intro: '凡人日常用铜钱和银两；修士的大额交易用灵石；宗门内部还用不可转让的功绩。',
      guard: '不能把四种钱混成一个数字。先看交易发生在哪一层，再选单位。',
      sections: [
        { title: '单位', html:
          '<div class="world-money"><div><b>1,000 文铜钱</b><span>= 1 两银</span><small>饭钱、住宿、普通月钱</small></div><div><b>10 两银左右</b><span>≈ 1 枚下品灵石</span><small>坊市浮动价，不是官方固定兑换</small></div><div><b>宗门功绩</b><span>不能换现银</span><small>做任务所得，用于功法、丹药和资格</small></div></div>' },
        { title: '谁用什么', html:
          '<p>四国百姓主要用铜钱与银两；炼气弟子仍会用现银，到了筑基和高阶资源交易才以灵石为主；宗门任务奖励优先给功绩。</p>' },
      ],
    },
    income: {
      name: '收入来源', tag: '经济', status: '有锚点',
      intro: '收入要和包不包吃住、能不能换修炼资源一起看，不能只摆一个月钱数字。',
      guard: '林凡月钱三十文看着少，但宗门包吃住；这笔钱是零用和入阁次数，不是他全部生活费。',
      sections: [
        { title: '典型收入', html:
          '<table class="world-table"><thead><tr><th>身份</th><th>每月所得</th><th>另有</th></tr></thead><tbody><tr><td>县城短工</td><td>约 450 文</td><td>吃住自理</td></tr><tr><td>青云宗杂役</td><td>30 文</td><td>包住、饭堂两餐、衣袍</td></tr><tr><td>外门弟子</td><td>100 文 + 3 功绩</td><td>完成月度任务后发</td></tr><tr><td>一次低阶宗门任务</td><td>5–20 功绩</td><td>按危险程度</td></tr></tbody></table>' },
      ],
    },
    prices: {
      name: '购买力锚点', tag: '经济', status: '可判断贵贱',
      intro: '一文可以买一个馒头，三文可以吃一碗素面。杂役每月三十文，另外包吃住。',
      guard: R('tongban', '藏经阁一次一文') + '意味着杂役月钱最多进去三十次；第 10 章丢掉最后一文才会真的疼。',
      sections: [
        { title: '东境常见价格', html:
          '<table class="world-table"><thead><tr><th>东西</th><th>价格</th><th>相当于</th></tr></thead><tbody><tr><td>一个馒头</td><td>1 文</td><td>最小日常锚点</td></tr><tr><td>一碗素面</td><td>3 文</td><td>杂役月钱的十分之一</td></tr><tr><td>县城通铺一晚</td><td>10 文</td><td>杂役十次入阁费</td></tr><tr><td>普通三口之家一月开销</td><td>300–500 文</td><td>不含大病与租田</td></tr><tr><td>藏经阁一层一次</td><td>1 文</td><td>杂役能承受，但次数有限</td></tr><tr><td>最低阶疗伤丹</td><td>5 功绩</td><td>约一次普通宗门任务</td></tr></tbody></table>' },
      ],
    },
    trade: {
      name: '资源怎么流动', tag: '经济', status: '基本闭环',
      intro: '四国供给粮食、布匹和人口；宗门输出护卫、法器、丹药与处理妖患的能力；坊市连接两边。',
      guard: '宗门不能凭空自给自足。断粮、封路、矿脉变化都会传到弟子月钱和资源上。',
      sections: [
        { title: '东境循环', html:
          '<div class="world-flow"><span>四国粮税与商货</span><i></i><span>三宗与山下坊市</span><i></i><span>丹药、法器、护卫</span><i></i><span>回到四国</span></div>' },
      ],
    },

    goldfinger: {
      name: '林凡的签到面板', tag: '主角机制', status: '规则完整',
      intro: '它不是一句“签到”。林凡人在现场完成地点或行为条件，面板会从这个地方的历史与规则里提取奖励；核心用途是缓慢修补受损道源，让他能走一条常规修士走不了的路。',
      guard: '它只给机会，不替林凡解决冲突：不能远程签、不能自选奖励、不能直接送境界，也不能让别人看见面板。',
      sections: [
        { title: '完整机制', html: worldCards([
          ['gf-trigger', '怎么触发', '首次到访 + 行为里程碑'],
          ['gf-reward', '会给什么', '道源、功法、资源、感悟'],
          ['gf-limit', '不能做什么', '现场、唯一、不可自选'],
          ['gf-progress', '现在走到哪', '杂役院、挑水、藏经阁'],
        ]) },
        { title: '为什么能破局', html:
          '<p>世界规则说' + R('daoyuan', '道源受损不能恢复') + '；签到奖励中的道源碎片是唯一例外。它修得很慢，所以林凡仍要找地点、做事、冒风险，而不是等系统喂饭。</p>' },
      ],
    },
    'gf-trigger': {
      name: '签到触发', tag: '主角机制', status: '已定',
      intro: '两种触发：第一次亲身进入有明确历史或规则的地点；同一件有意义的行为累计到里程碑。',
      guard: '人必须在现场、清醒并真正完成条件。路过门口不算进入，重复刷无意义动作不会产生新里程碑。',
      sections: [
        { title: '例子', html:
          '<div class="world-stack"><div><b>地点</b><span>第一次进入藏经阁一层 → 可签到一次</span></div><div><b>行为</b><span>真实完成挑水第 7 次、第 30 次 → 各触发一次</span></div><div><b>不会触发</b><span>在门外喊“签到”、原地反复跨门槛</span></div></div>' },
      ],
    },
    'gf-reward': {
      name: '签到奖励', tag: '主角机制', status: '四类',
      intro: '奖励与地点或行为有关，不是随机奖池。地点越有历史、条件越难，奖励上限越高。',
      guard: '奖励必须能说清从哪里来、解决什么问题；不能为了救场临时吐出正好克敌的神器。',
      sections: [
        { title: '四类奖励', html:
          '<div class="world-stack"><div><b>道源碎片</b><span>缓慢修补常规无法恢复的道源</span></div><div><b>功法与术法</b><span>来自地点沉淀过的传承</span></div><div><b>资源</b><span>灵石、丹药、材料</span></div><div><b>感悟</b><span>一次性的理解或熟练度，不直接送境界</span></div></div>' },
      ],
    },
    'gf-limit': {
      name: '签到限制', tag: '主角机制', status: '硬边界',
      intro: '限制决定它不会把小说写崩。越过任意一条，都等于主角能力变了。',
      guard: '现场触发；同一条件只领一次；奖励不可自选；不能直接提升境界；面板只有林凡可见。',
      sections: [
        { title: '别人看到什么', html:
          '<p>别人只会看到林凡突然走运、悟性变好或拿出一件东西。' +
          '“签到成功”只出现在林凡自己看见的面板层，不能进入旁白全知视角或 NPC 台词。</p>' },
      ],
    },
    'gf-progress': {
      name: '当前进度', tag: '主角机制', status: '第 13 章前',
      intro: '面板的历史也要可追。这里记已经领过什么、下一档差多少，防止重复发奖。',
      guard: '只有已经写进正文的奖励算事实；未定稿的初稿不会提前改变这里。',
      sections: function () {
        return [{ title: '已发生 / 待发生', html:
          '<table class="world-table"><thead><tr><th>条件</th><th>状态</th><th>结果</th></tr></thead><tbody>' +
          '<tr><td>首次醒在杂役院</td><td><span class="chip chip--done">已领</span></td><td>开启签到面板</td></tr>' +
          '<tr><td>真实挑水 7 次</td><td><span class="chip chip--done">已领</span></td><td>10 点道源</td></tr>' +
          '<tr><td>首次进入藏经阁</td><td><span class="chip ' + (chapter13Finalized ? 'chip--done' : 'chip--main') + '">' + (chapter13Finalized ? '已领' : '待触发') + '</span></td><td>' + (chapter13Finalized ? '已获得一段气息流转感悟' : '尚未获得') + '</td></tr>' +
          '<tr><td>真实挑水 30 次</td><td><span class="chip chip--plain">12 / 30</span></td><td>未知，不提前编</td></tr></tbody></table>' }];
      },
    },
    well: {
      name: '井台', tag: '子地点', status: '已同步',
      intro: '位于杂役院西头，一圈青石，井绳是麻的，冬天会结冰。第 3 章和第 10 章都写到过。',
      guard: '以后再写挑水，方位、井沿材质和绳子要与前文一致。',
      sections: [
        { title: '出现过', html: '<p>第 3 章写了井绳和青石井沿；第 10 章再次在这里挑水。</p>' },
      ],
    },
  };

  var WORLD_TREE = {
    id: 'xuan', children: [
      { id: 'territory', children: [
        { id: 'tiannan', children: [
          { id: 'east', children: [
            { id: 'sects', children: [
              { id: 'qingyun', children: [
                { id: 'outer', children: [
                  { id: 'zayi', children: [
                    { id: 'well', children: [] },
                  ] },
                  { id: 'cangjing', children: [] },
                  { id: 'backmount', children: [] },
                ] },
              ] },
              { id: 'chixiao', children: [] },
              { id: 'luoshui', children: [] },
            ] },
            { id: 'kingdoms', children: [
              { id: 'daliang', children: [] },
              { id: 'yue', children: [] },
              { id: 'beiyan', children: [] },
              { id: 'nanchu', children: [] },
            ] },
          ] },
          { id: 'west', children: [] },
          { id: 'south', children: [] },
          { id: 'north', children: [] },
        ] },
      ] },
      { id: 'cultivation', children: [
        { id: 'daoyuan', children: [] },
        { id: 'realms', children: [] },
        { id: 'movement', children: [] },
        { id: 'resources', children: [] },
      ] },
      { id: 'society', children: [
        { id: 'authority', children: [] },
        { id: 'identity', children: [] },
        { id: 'transport', children: [] },
        { id: 'calendar', children: [] },
      ] },
      { id: 'economy', children: [
        { id: 'currency', children: [] },
        { id: 'income', children: [] },
        { id: 'prices', children: [] },
        { id: 'trade', children: [] },
      ] },
      { id: 'goldfinger', children: [
        { id: 'gf-trigger', children: [] },
        { id: 'gf-reward', children: [] },
        { id: 'gf-limit', children: [] },
        { id: 'gf-progress', children: [] },
      ] },
    ],
  };

  var WORLD_PARENT = {};
  function indexWorldTree(node, parent) {
    WORLD_PARENT[node.id] = parent || '';
    (node.children || []).forEach(function (c) { indexWorldTree(c, node.id); });
  }
  indexWorldTree(WORLD_TREE, '');

  function worldPath(id) {
    var out = [];
    while (id) {
      out.unshift(id);
      id = WORLD_PARENT[id];
    }
    return out;
  }
  function worldCount() {
    var n = 0;
    (function walk(node) {
      n += 1;
      (node.children || []).forEach(walk);
    })(WORLD_TREE);
    return n;
  }

  var worldView = { id: 'east' };

  function worldTreeHtml(node, depth) {
    var n = WORLD_NODES[node.id];
    var kids = node.children || [];
    var path = worldPath(worldView.id);
    var open = node.id === 'xuan' || path.indexOf(node.id) > -1;
    var h = '<li class="world-tree__node' + (n.blank ? ' is-blank' : '') + '">' +
      '<div class="world-tree__row' + (node.id === worldView.id ? ' is-on' : '') +
      '" style="--depth:' + depth + '">';
    if (kids.length) {
      h += '<button class="world-tree__toggle' + (open ? ' is-open' : '') + '" data-world-branch aria-expanded="' +
        (open ? 'true' : 'false') + '" aria-label="' + (open ? '收起' : '展开') + n.name +
        '"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 2.2 6.5 5 3 7.8"/></svg></button>';
    } else {
      h += '<span class="world-tree__spacer"></span>';
    }
    h += '<button class="world-tree__label" data-world-node="' + node.id + '"><span>' + n.name + '</span>' +
      '<small>' + n.tag + '</small></button></div>';
    if (kids.length) {
      h += '<ul class="world-tree__children"' + (open ? '' : ' hidden') + '>' +
        kids.map(function (c) { return worldTreeHtml(c, depth + 1); }).join('') + '</ul>';
    }
    return h + '</li>';
  }

  function worldDetail(id) {
    var n = WORLD_NODES[id] || WORLD_NODES.east;
    var sections = typeof n.sections === 'function' ? n.sections() : (n.sections || []);
    var h = '<article class="world-detail' + (n.blank ? ' is-blank' : '') + '" data-world-id="' + id + '">' +
      '<div class="world-detail__path">' + worldPath(id).map(function (k) { return WORLD_NODES[k].name; }).join('<span>›</span>') + '</div>' +
      '<div class="world-detail__head"><div><h3>' + n.name + '</h3><p>' + n.tag + '</p></div>' +
      '<div class="world-detail__actions"><span class="world-status' + (n.blank ? ' is-blank' : '') + '">' + n.status + '</span>' +
      '<button class="world-edit-btn" data-world-edit aria-pressed="false">编辑</button></div></div>' +
      '<p class="world-detail__intro" data-world-editable>' + n.intro + '</p>';

    if (id === 'realms' && worldRealmBad) {
      h += '<div class="world-conflict"><b>刚改成炼气五层，但第 7 章写过“炼气九层”</b>' +
        '<span>前文和当前规则冲突。去改第 7 章，或者把这里改回九层。</span></div>';
    }
    sections.forEach(function (s) {
      h += '<section class="world-section"><h4>' + s.title + '</h4>' + s.html + '</section>';
    });
    if (n.history) {
      h += '<button class="w-chg" data-wexp>改过 1 次 ▾</button><div class="w-was" hidden>' + n.history + '</div>';
    }
    return h + '</article>';
  }

  function worldPanel(node) {
    if (node && WORLD_NODES[node]) worldView.id = node;
    var h = '<div class="panel world-panel">' +
      '<div class="panel__head"><h2>世界志</h2><span class="sub">玄苍界 · ' + worldCount() + ' 个节点</span></div>' +
      '<div class="world-layout"><aside class="world-tree" data-component="world-tree">' +
      '<div class="world-tree__head"><b>玄苍界</b></div>' +
      '<ul class="world-tree__list">' + worldTreeHtml(WORLD_TREE, 0) + '</ul></aside>' +
      worldDetail(worldView.id) + '</div></div>';
    return { title: '世界志', html: h };
  }

  /* 改设定跟已写的章打架时先预检，作者选择之后才真正改变规则。 */
  function worldConflict() {
    worldView.id = 'realms';
    return 'realms';
  }
  function worldApplyFromChapter(chapter) {
    worldRealmLayers = 5;
    worldRealmBad = false;
    worldRealmSince = chapter || 13;
    worldView.id = 'realms';
    REFS.jing[1] = '第 ' + worldRealmSince + ' 章起炼气一至五层；此前正文保留九层版本。';
    return 'realms';
  }
  function worldApplyEverywhere() {
    worldRealmLayers = 5;
    worldRealmBad = false;
    worldRealmSince = null;
    worldView.id = 'realms';
    REFS.jing[1] = '炼气一至五层，之后依次是筑基、金丹、元婴。';
    return 'realms';
  }
  function worldRevert() {
    worldRealmLayers = 9;
    worldRealmBad = false;
    worldRealmSince = null;
    worldView.id = 'realms';
    REFS.jing[1] = '炼气一至九层，之后依次是筑基、金丹、元婴。';
    return 'realms';
  }

  function setChapter13Finalized(value) {
    chapter13Finalized = !!value;
    WRITTEN = chapter13Finalized ? 13 : 12;
    CUR = chapter13Finalized ? 14 : 13;
    if (WORLD_NODES['gf-progress']) WORLD_NODES['gf-progress'].status = chapter13Finalized ? '第 13 章后' : '第 13 章前';
    if (WORLD_NODES.cangjing) WORLD_NODES.cangjing.status = chapter13Finalized ? '已进入正文' : '第 13 章场景';
    var han = LANES.filter(function (lane) { return lane.id === 'han'; })[0];
    if (han) {
      if (chapter13Finalized) {
        han.cells[13] = {
          t: '伏',
          s: '韩拾遗没有抬头，却记住了林凡',
          text: '林凡进阁时，案后的老人没有抬头。等人走远，他在旧册上记下了林凡的名字。',
          mean: '他早就认得林凡，也知道那块玉。'
        };
        han.hint = '第 13 章已经留下第一处痕迹；后续只在真正需要时继续推进。';
      } else {
        delete han.cells[13];
        han.hint = '还一处没埋。第 13 章定稿后，这里才会出现第一处正文事实。';
      }
    }
  }

  function applyWorldEdits(edits) {
    Object.keys(edits || {}).forEach(function (id) {
      if (WORLD_NODES[id]) WORLD_NODES[id].intro = edits[id];
    });
  }

  function setWorldIntro(id, text) {
    if (!WORLD_NODES[id]) return false;
    WORLD_NODES[id].intro = String(text || '').trim();
    return true;
  }

  function getLaneState() {
    return LANES.map(function (lane) {
      return { id: lane.id, w: lane.w || null, plan: Object.assign({}, lane.plan) };
    });
  }

  function applyLaneState(records) {
    (records || []).forEach(function (record) {
      var lane = LANES.filter(function (item) { return item.id === record.id; })[0];
      if (!lane) return;
      if (record.w) lane.w = record.w;
      if (record.plan) lane.plan = Object.assign({}, lane.plan, record.plan);
    });
  }

  function stylePanel() {
    var guide = [
      '# 这本书相信什么',
      '',
      '一个被踩在最底层的人，一点点把自己的命从别人手里拿回来。天地越大，他越渺小；他越渺小，每一次不肯低头才越有分量。',
      '',
      '世界可以冷，宗门可以高得看不见顶，但故事不能嘲笑弱小。林凡每一次变强，都不只是境界和数字往上走，而是多拿回一点决定自己命运的权力。',
      '',
      '故事从杂役院开始。气息先压低，空间先收窄。水桶、铜钱、门槛、湿衣和一文钱，比一句“处境艰难”更有分量。',
      '',
      '青云宗真正的广大，只在必要时从日常里裂开，让读者忽然看见林凡正被怎样的庞然大物压在底下。眼下的胜利不是天下无敌，而是他终于从只能忍，走到有资格说“不”。',
      '',
      '他拿回的选择越多，文字就可以慢慢抬头、放远；但无论天地铺得多大，都不能忘记他最早站在哪里。',
      '',
      '## 景别会变，魂不能变',
      '',
      '日常贴近身体：湿透的袖口、掌心的铜钱、被踢翻后重新扶起的木桶。人物不说自己在忍，动作会让读者知道。',
      '',
      '冲突收紧距离和节奏，让每个动作都改变处境。宏大场面则先把天地、宗门和众人铺开，让尺度真正成立，再落回林凡身上那一点具体的反应。宏大不是多用几个夸张词，而是让读者同时看见世界有多高、他有多小，以及他仍然没有低头。',
      '',
      '## 落到文字上',
      '',
      '- 句子服从场面。近景可以短，宏大场面允许长句蓄势，再用短句落下；不能把“短句”当成整本书唯一的腔调。',
      '- 心理只跟主角，不提前替读者解释人物立场；能由动作、停顿和选择说出的，不急着下结论。',
      '- 日常过场不为写景停住超过两句；真正需要建立天地、宗门或战争的规模时，可以把景别充分展开。',
      '- 打斗往前走，不停下来解释。',
      '- 对话不要为了显得像修仙小说而故意写得文绉绉。',
      '- 系统只在林凡自己看见的那一层出现。「面板」「签到成功」不进入旁白，也不让其他人物说出口。',
    ].join('\n');
    var chapter13Source = chapter13Finalized ? '第 13 章 · 已定稿' : '第 13 章 · 初稿候选';
    var examples = [
      ['被压住的时候', chapter13Source,
        '林凡没有说话。他蹲下去，一点一点把桶扶正，又把散落的木片捡回来。围着看的人渐渐散了。他把桶提起来，转身往西边走。'],
      ['天地铺开', '笔法已确认 · 未进入正文',
        '主峰的钟响了。<br><br>云海静了一瞬，随后从三十六座山峰之间退开。护山大阵沿着山脊一节节亮起，剑光越过外门，越过山下四城，照得半个东境如同白昼。数万弟子同时抬头，衣袍被风压向身后。<br><br>林凡站在杂役院最后面。鞋上有泥，袖口还在滴水。<br><br>直到这一刻，他才知道青云宗究竟有多大。<br>他把湿透的袖口攥进掌心，没有低头。'],
      ['人物开口', '第 12 章 · 已定稿',
        '“数什么呢。”孙彪把门框拍得咚咚响，“数你还能活几天？”<br>林凡没说话。他知道说什么都是错的，索性一句不说。'],
      ['动手', '第 6 章 · 已定稿',
        '赵天雄一步没退。对面境界比他高两层，第三招就被他压住了肩。围观的人都没说话。'],
      ['系统露面', chapter13Source,
        '阁里很暗。他抽出最靠外的一本，翻开。<br>眼前亮了一下。<span class="sys">藏经阁 · 首次到访</span>'],
      ['过场', '第 10 章 · 已定稿',
        '林凡拎着两只桶，第七趟。日头已经偏了，他的影子被拖得很长，一晃一晃地压在青石板上。<br>“新来的。”有人在背后叫他。他没回头。'],
    ];
    return {
      title: '笔法',
      html:
        '<div class="panel style-panel">' +
        '<div class="panel__head"><h2>笔法</h2><span class="sub">' + examples.length + ' 段范例</span></div>' +
        '<article class="style-document">' +
          '<div class="markdown-document style-guide">' + renderMarkdown(guide) + '</div>' +
          '<section class="style-examples"><h2>写成这样</h2>' + examples.map(function (ex) {
            return '<article class="style-example"><header><b>' + ex[0] + '</b><small>' + ex[1] + '</small></header>' +
              '<blockquote>' + ex[2] + '</blockquote></article>';
          }).join('') + '</section>' +
        '</article>' +
        '</div>',
    };
  }

  var PANELS = {
    people: function () { return personPanel('linfan'); },
    library: function () { return libraryPanel('yinqijue'); },
    outline: outlinePanel,
    tasks: fuxianPanel,
    chapters: chaptersPanel,
    world: worldPanel,
    style: stylePanel,
  };

  function panel(key, arg, options) {
    if (key === 'people' && arg) return personPanel(arg, options && options.trail);
    if (key === 'library') return libraryPanel(arg);
    if (key === 'tasks') return fuxianPanel(arg);
    if (key === 'outline') return outlinePanel(arg);
    if (key === 'world') return worldPanel(arg);
    return (PANELS[key] || PANELS.people)();
  }

  var ICONS = {
    desk: '<path d="M3 3h9v9H3zM3 3l9 9" />',
    people: '<circle cx="7.5" cy="5" r="2.4"/><path d="M2.5 13c0-2.6 2.2-4.2 5-4.2s5 1.6 5 4.2"/>',
    library: '<path d="M3 2.5h6.5L12 5v7.5H3zM9.5 2.5V5H12M5.5 7.5h4M5.5 10h3"/>',
    outline: '<path d="M2 3.5h11M2 7.5h11M2 11.5h7"/>',
    tasks: '<path d="M2 4l2 2 3-3.4M2 10l2 2 3-3.4M9.5 4.5h4M9.5 10.5h4"/>',
    chapters: '<path d="M3 2.5h9v11H3zM5.5 5.5h4M5.5 8h4"/>',
    world: '<circle cx="7.5" cy="7.5" r="5.2"/><path d="M2.3 7.5h10.4M7.5 2.3c1.6 1.7 1.6 8.7 0 10.4M7.5 2.3c-1.6 1.7-1.6 8.7 0 10.4"/>',
    style: '<path d="M3 12.5l1-3 6.5-6.5 2 2L6 11.5z"/>',
  };

  function icon(k) {
    return '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" ' +
      'stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[k] || ICONS.people) + '</svg>';
  }

  var TOOLS = [
    ['chapters', '正文'], ['outline', '大纲'], ['people', '人物志'],
    ['library', '资料库'], ['world', '世界志'], ['tasks', '伏线'], ['style', '笔法'],
  ];

  /* 时间轴逐条改：这是核心动作，三种骨架里都必须是活的 */
  function wireBeats(root, onChange) {
    root.querySelectorAll('.beat').forEach(function (beat) {
      var btn = beat.querySelector('.beat__edit');
      if (!btn) return;
      btn.addEventListener('click', function () {
        if (beat.classList.contains('is-editing')) return;
        var p = beat.querySelector('.beat__t');
        var clean = p.cloneNode(true);
        var oldFlag = clean.querySelector('.beat__flag');
        if (oldFlag) oldFlag.remove();
        var old = clean.innerHTML;
        var text = clean.textContent.trim();
        beat.classList.add('is-editing');
        var box = document.createElement('div');
        box.className = 'beat__box';
        box.innerHTML = '<textarea>' + text + '</textarea>' +
          '<div class="beat__box-act"><button class="btn btn--sm btn--primary">改好了</button>' +
          '<button class="btn btn--sm">不改了</button></div>';
        p.replaceWith(box);
        var ta = box.querySelector('textarea');
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        function restore(html, changed) {
          var np = document.createElement('p');
          np.className = 'beat__t';
          np.innerHTML = html + '<span class="beat__flag">已改</span>';
          box.replaceWith(np);
          beat.classList.remove('is-editing');
          if (changed) beat.classList.add('is-changed');
        }
        box.querySelectorAll('button')[0].addEventListener('click', function () {
          var v = ta.value.trim();
          restore(v ? v.replace(/</g, '&lt;') : old, v !== text);
          if (v !== text && onChange) onChange(v, beat);
        });
        box.querySelectorAll('button')[1].addEventListener('click', function () {
          restore(old, beat.classList.contains('is-changed'));
        });
      });
    });
  }

  /* 线索面板的筛选按钮点了要真的有反应 */
  function wireFilters(scope) {
    scope.querySelectorAll('.noya-filter').forEach(function (b) {
      b.addEventListener('click', function () {
        scope.querySelectorAll('.noya-filter').forEach(function (o) { o.classList.remove('is-on'); });
        b.classList.add('is-on');
        var want = b.textContent.trim();
        scope.querySelectorAll('.tlist li').forEach(function (li) {
          var hit = want === '全部' ||
            (want === '欠着的' ? !!li.querySelector('.t-owed') : li.textContent.indexOf(want) > -1);
          li.style.display = hit ? '' : 'none';
        });
      });
    });
  }

  /* 已写章节的正文（骨架丁的中栏用） */
  var CHAPTERS = {
    1: ['山门之外', '2,180 字', [
      '林凡在雨里站到山门将关，才等来负责验身的外门弟子。',
      '测灵石没有亮。他被分去杂役院，领到一块木牌和两件洗得发白的短褂。',
      '当天夜里，他第一次看见只有自己能看见的签到面板。',
    ]],
    2: ['柴房签到', '2,260 字', [
      '杂役院没有人等他。林凡抱着铺盖，在最靠墙的柴房住下。',
      '子时刚过，眼前浮出一行极淡的字。他没有伸手，先盯着它看了整整一刻钟。',
    ]],
    3: ['一碗冷饭', '2,330 字', [
      '食堂只剩一碗冷饭。王二狗把自己的咸菜推过来半碟，什么也没问。',
      '林凡记住了这个人，也记住了杂役院里一碗热饭值多少钱。',
    ]],
    4: ['井台', '2,420 字', [
      '井绳磨得掌心发热，林凡仍按原来的速度提水。',
      '孙彪从石阶上走过，第一次停下来看了他一眼。',
    ]],
    5: ['雨夜', '2,510 字', [
      '夜雨把屋檐压得很低。林凡在漏水的床边坐了一夜，把签到所得的第一缕灵气引进经脉。',
      '天亮前，那缕灵气散了大半，却没有完全消失。',
    ]],
    6: ['外门规矩', '2,360 字', [
      '杂役不得私学外门功法，这是规矩。杂役替外门弟子抄书，却不算私学，也是规矩。',
      '林凡第一次知道，规矩不是一堵墙，而是一扇只给某些人开的门。',
    ]],
    7: ['炼气九层', '2,690 字', [
      '讲经台上的执事用木尺点了点石板：炼气一共九层，三层之前只算入门。',
      '林凡低头看着自己的手。他的道源最多只能撑到炼气三层。',
      '台下有人笑。他把那句话记住，没有抬头。',
    ]],
    8: ['父亲留下的玉', '2,540 字', [
      '玉片在掌心里没有温度。林凡试过灵气、血和火，它都没有反应。',
      '他仍把它贴身收好，因为这是父亲留下的最后一样东西。',
    ]],
    9: ['十一枚铜板', '2,470 字', [
      '林凡用了半个月，终于攒下十一枚铜板。',
      '藏经阁一次一文。那是他第一次觉得，一扇门也许真的可以靠自己推开。',
    ]],
    10: ['水桶与铜板', '2,410 字', [
      R('zayi', '杂役院') + '的井在西头，来回一趟要走过整片空地。',
      '林凡拎着两只桶，第七趟。日头已经偏了，他的影子被拖得很长，一晃一晃地压在青石板上。',
      '"新来的。"有人在背后叫他。他没回头。',
    ]],
    11: ['第七次签到', '2,880 字', [
      '眼前又亮了一下。',
      '他已经习惯了。第一次是在柴房，第二次在井边，第三次是他自己都没想到的茅房。这东西没有规矩，或者说，规矩他还没摸到。',
      '这一次是在杂役院的门槛上。他停了半步，等那行字散掉，才把脚迈过去。',
    ]],
    12: ['他不还嘴', '2,600 字', [
      '孙彪第三次找上门的时候，林凡正在数铜板。',
      '一共十一个。' + R('tongban', '藏经阁一次一个') + '，够进去十一回。他把它们裹进布里，塞到褥子最底下，然后站起来。',
      '"数什么呢。"孙彪把门框拍得咚咚响，"数你还能活几天？"',
      '林凡没说话。他知道说什么都是错的，索性一句不说。',
    ]],
  };

  function chapterText(n) {
    var c = CHAPTERS[n];
    if (!c) return '';
    return '<div class="written__text"><h1>第 ' + n + ' 章 · ' + c[0] + '</h1>' +
      c[2].map(function (p) { return '<p>' + p + '</p>'; }).join('') +
      '<p class="written__more">…… 全章 ' + c[1] + '</p></div>';
  }

  /* 第 13 章写完的正文 */
  function writtenText() {
    return '<div class="written__text">' +
      '<h1>第 13 章 · 藏经阁的老头</h1>' +
      '<p>孙彪带着三个人堵在杂役院门口的时候，林凡正提着水。</p>' +
      '<p>"哟，"孙彪咧开嘴，左眉那道疤跟着动了动，"这不是咱们外门第一勤快人吗。"</p>' +
      '<p>他一脚踢过去。木桶翻了，水顺着青石板的缝往下淌。</p>' +
      '<p>林凡没有说话。他蹲下去，一点一点把桶扶正，又把散落的木片捡回来。围着看的人渐渐散了。他把桶提起来，转身往西边走。</p>' +
      '<p>藏经阁的门槛很高。他把最后一个铜板放在案上，看守没有抬头，只把手往里摆了摆。</p>' +
      '<p>阁里很暗。他抽出最靠外的一本，翻开。</p>' +
      '<p class="sysline">眼前亮了一下。<span class="sys">藏经阁 · 首次到访</span></p>' +
      '<p class="written__more">…… 全章 2,740 字</p>' +
      '</div>';
  }

  /* 写完之后回到正文；设定变化已在后台同步。 */
  function writtenHtml() {
    return '<div class="written">' + writtenText() + '</div>';
  }

  function wireWritten() {}


  /* 引用：hover 走 data-tip 那套浮层，点一下跳到对方那条 */
  function wireRefs(scope, go) {
    scope.querySelectorAll('.ref[data-ref]').forEach(function (r) {
      r.addEventListener('click', function (e) {
        e.stopPropagation();
        if (go) go(r.dataset.ref);
      });
    });
  }

  /* 面板内的交互：伏线选中 / 泳道浮提示 */
  function wirePanel(scope, on) {
    on = on || {};
    scope.querySelectorAll('[data-library-entry]').forEach(function (entry) {
      entry.addEventListener('click', function () {
        scope.innerHTML = libraryPanel(entry.dataset.libraryEntry).html;
        wirePanel(scope, on);
        if (on.ref) wireRefs(scope, on.ref);
        if (on.library) on.library(entry.dataset.libraryEntry);
      });
    });
    scope.querySelectorAll('[data-person-node]').forEach(function (node) {
      node.addEventListener('click', function () {
        clearTimeout(node._personClickTimer);
        node._personClickTimer = setTimeout(function () {
          showPersonDetail(scope, node.dataset.personNode);
          if (on.personSelect) on.personSelect(node.dataset.personNode);
        }, 220);
      });
      node.addEventListener('dblclick', function (e) {
        e.preventDefault();
        clearTimeout(node._personClickTimer);
        var id = node.dataset.personNode;
        if (!PEOPLE[id] || id === PERSON_VIEW.root) return;
        PERSON_VIEW.trail.push(PERSON_VIEW.root);
        PERSON_VIEW.root = id;
        rerenderPersonView(scope, on);
      });
    });
    var personBack = scope.querySelector('[data-person-back]');
    if (personBack) {
      personBack.addEventListener('click', function () {
        if (!PERSON_VIEW.trail.length) return;
        PERSON_VIEW.root = PERSON_VIEW.trail.pop();
        rerenderPersonView(scope, on);
      });
    }
    var personHome = scope.querySelector('[data-person-home]');
    if (personHome) {
      personHome.addEventListener('click', function () {
        if (PERSON_VIEW.root === 'linfan' && !PERSON_VIEW.trail.length) return;
        PERSON_VIEW.root = 'linfan';
        PERSON_VIEW.trail = [];
        rerenderPersonView(scope, on);
      });
    }
    scope.querySelectorAll('[data-person-crumb]').forEach(function (crumb) {
      crumb.addEventListener('click', function () {
        var path = PERSON_VIEW.trail.concat([PERSON_VIEW.root]);
        var index = Number(crumb.dataset.personCrumb);
        if (index < 0 || index >= path.length - 1) return;
        PERSON_VIEW.root = path[index];
        PERSON_VIEW.trail = path.slice(0, index);
        rerenderPersonView(scope, on);
      });
    });
    scope.querySelectorAll('[data-person-branch]').forEach(function (branch) {
      branch.addEventListener('click', function () {
        var children = branch.nextElementSibling;
        if (!children || !children.hasAttribute('data-person-children')) return;
        children.hidden = !children.hidden;
        branch.classList.toggle('is-open', !children.hidden);
        branch.setAttribute('aria-expanded', children.hidden ? 'false' : 'true');
      });
    });
    scope.querySelectorAll('.lane-row--pick').forEach(function (r) {
      r.addEventListener('click', function () { if (on.lane) on.lane(r.dataset.lane); });
    });
    scope.querySelectorAll('[data-pt]').forEach(function (d) {
      d.addEventListener('click', function (e) {
        e.stopPropagation();
        if (on.lane) on.lane(d.dataset.pt);
      });
    });
    scope.querySelectorAll('[data-world-node]').forEach(function (b) {
      b.addEventListener('click', function () { if (on.world) on.world(b.dataset.worldNode); });
    });
    scope.querySelectorAll('[data-world-branch]').forEach(function (b) {
      b.addEventListener('click', function () {
        var box = b.closest('.world-tree__row').nextElementSibling;
        if (!box) return;
        box.hidden = !box.hidden;
        b.classList.toggle('is-open', !box.hidden);
        b.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
      });
    });
    scope.querySelectorAll('[data-world-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var article = b.closest('.world-detail');
        var field = article && article.querySelector('[data-world-editable]');
        if (!article || !field) return;
        var editing = !article.classList.contains('is-editing');
        article.classList.toggle('is-editing', editing);
        field.contentEditable = editing ? 'true' : 'false';
        b.setAttribute('aria-pressed', editing ? 'true' : 'false');
        b.textContent = editing ? '完成' : '编辑';
        if (editing) {
          field.focus();
        } else {
          var record = WORLD_NODES[article.dataset.worldId];
          if (record) record.intro = field.textContent.trim();
          if (on.worldEdit) on.worldEdit(article.dataset.worldId, field.textContent.trim());
        }
      });
    });
    scope.querySelectorAll('[data-wexp]').forEach(function (b) {
      b.addEventListener('click', function () {
        var box = b.nextElementSibling;
        box.hidden = !box.hidden;
        b.textContent = box.hidden ? b.textContent.replace('▴', '▾') : b.textContent.replace('▾', '▴');
      });
    });
    scope.querySelectorAll('[data-back]').forEach(function (b) {
      b.addEventListener('click', function () { if (on.lane) on.lane(b.dataset.back); });
    });
    scope.querySelectorAll('[data-wt]').forEach(function (b) {
      b.addEventListener('click', function () {
        var q = b.dataset.wt.split(':'), l = LANES.filter(function (x) { return x.id === q[0]; })[0];
        if (!l) return;
        l.w = q[1];
        if (q[1] === '氛') { l.plan.kind = '氛'; l.plan.how = '障眼法。永远不揭，也别自作主张去还它。'; }
        else if (l.plan.kind === '氛') { l.plan.kind = '待'; l.plan.how = '先埋着，还没想好去向。'; }
        if (l.w !== '重') laneView.showMore = true;
        if (on.lane) on.lane(l.id + ':plan');
      });
    });
    scope.querySelectorAll('[data-plan]').forEach(function (b) {
      b.addEventListener('click', function () {
        var q = b.dataset.plan.split(':'), l = LANES.filter(function (x) { return x.id === q[0]; })[0];
        if (!l) return;
        l.plan.kind = q[1];
        if (q[1] === '待') l.plan.how = '先埋着，还没想好去向。';
        if (q[1] === '定' && !l.plan.at) l.plan.at = 'dabi';
        if (on.lane) on.lane(l.id + ':plan');
      });
    });
    scope.querySelectorAll('[data-act="toggle-closed"]').forEach(function (b) {
      b.addEventListener('click', function () {
        laneView.showMore = !laneView.showMore;
        var cur = scope.querySelector('.lane-row--pick.is-sel');
        if (on.lane) on.lane(cur ? cur.dataset.lane : null);
      });
    });
    scope.querySelectorAll('[data-act="revive"]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (on.revive) on.revive();
        else { b.textContent = '已捡回来'; b.disabled = true; b.style.opacity = '.6'; }
      });
    });
    wireFilters(scope);
  }

  var tipEl;
  function initTips() {
    tipEl = document.createElement('div');
    tipEl.className = 'lane-tip';
    document.body.appendChild(tipEl);
    document.addEventListener('mouseover', function (e) {
      var t = e.target.closest && e.target.closest('[data-tip]');
      if (!t) return;
      var parts = t.dataset.tip.split('｜');
      tipEl.innerHTML = '<span class="k">' + parts[0] + '</span>' + (parts[1] || '');
      var r = t.getBoundingClientRect();
      tipEl.style.left = Math.max(8, Math.min(window.innerWidth - 320, r.left - 140)) + 'px';
      tipEl.style.top = (r.top - 8) + 'px';
      tipEl.style.transform = 'translateY(-100%)';
      tipEl.classList.add('is-on');
    });
    document.addEventListener('mouseout', function (e) {
      if (e.target.closest && e.target.closest('[data-tip]')) tipEl.classList.remove('is-on');
    });
  }
  if (document.body) initTips();
  else document.addEventListener('DOMContentLoaded', initTips);

  return {
    panel: panel, icon: icon, tools: TOOLS, wirePanel: wirePanel,
    wireBeats: wireBeats, wireFilters: wireFilters,
    writtenHtml: writtenHtml, wireWritten: wireWritten,
    chapterText: chapterText, writtenText: writtenText,
    wireRefs: wireRefs, refTarget: refTarget,
    worldCount: worldCount, worldConflict: worldConflict,
    worldApplyFromChapter: worldApplyFromChapter, worldApplyEverywhere: worldApplyEverywhere,
    worldRevert: worldRevert, setChapter13Finalized: setChapter13Finalized,
    applyWorldEdits: applyWorldEdits, setWorldIntro: setWorldIntro,
    getLaneState: getLaneState, applyLaneState: applyLaneState,
  };
})();

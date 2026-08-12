window.NOYA_SAMPLE_DETAILS = {
  zhongkui: {
    outline: {
      sub: '第一卷 · 纸船入城',
      sections: [
        { meta: '开端 · 已确定', title: '一个无法过桥的人，替众生解执', body: '他被钟馗收为弟子，在人间度化游离各处的执念。每度一个亡魂，他也被迫靠近自己不敢面对的那场火。' },
        { meta: '现在 · 第一章', title: '纸船入城', body: '一艘写满活人姓名的纸船闯进城中。主角第一次在读者面前动手，也第一次看见死者的执念正在被某种力量放大。', current: true },
        { gap: true },
        { meta: '终局 · 已确定', title: '捣毁魔界阴谋，也度化自己', body: '他最终找到让亡者更容易产生执念的源头，摧毁魔界的计划，也终于回到那场大火，确认自己究竟做过什么。', ending: true }
      ]
    },
    world: {
      root: 'realms', initial: 'human',
      nodes: {
        realms: { name: '阴阳两界', tag: '世界', status: '持续生长', intro: '生者、亡者与执念共同存在于同一套秩序中；执念越深，两个世界之间的边界越不可靠。', children: ['human', 'underworld', 'zhongkui', 'obsession', 'demon'], sections: [{ title: '当前故事范围', html: '<ul class="world-bullets"><li>人间是主要舞台</li><li>阴司解释主角的来处</li><li>魔界阴谋是远端主线</li></ul>' }] },
        human: { name: '人间', tag: '主要舞台', status: '正在写', intro: '主角随钟馗门下的规矩在人间行走，处理无法自行消散的执念。第一桩异事从一艘纸船进入城中开始。', parent: 'realms', sections: [{ title: '第一章已经出现', html: '<p>纸船、白幡、客栈与一条写着活人姓名的街巷。</p>' }] },
        underworld: { name: '阴司', tag: '来处', status: '已确定', intro: '主角死后喝下无数碗孟婆汤，仍然无法走过奈何桥。钟馗在那里看见了他的天赋与滔天执念。', parent: 'realms', sections: [{ title: '已经成立', html: '<p>孟婆汤不能消去他对那场大火的执念。</p>' }] },
        zhongkui: { name: '钟馗门下', tag: '师承', status: '已确定', intro: '门人能够看见不该看见之物，也能短暂拘住执念；力量有明确上限，不能在开篇便无所不能。', parent: 'realms', sections: [{ title: '当前能力边界', html: '<p>右眼负责看见，第二道法只能拘住三息。更高层次尚未确定。</p>' }] },
        obsession: { name: '执念与度化', tag: '运行法则', status: '可写', intro: '执念让亡者滞留，也会反过来侵蚀生者对现实的判断。度化不是消灭，而是找到它不肯离开的原因。', parent: 'realms', sections: [{ title: '叙事作用', html: '<p>每一桩异事既解决一个外部执念，也逼主角靠近自己的执念。</p>' }] },
        demon: { name: '魔界', tag: '远端主线', status: '只知轮廓', intro: '魔界正在利用某种尚未命名的物质，让逝去之人更容易产生执念。具体来源、形态与运作方式仍然留白。', parent: 'realms', sections: [{ title: '不要提前补全', html: '<p>当前只确认阴谋存在，不确认幕后人物与完整机制。</p>' }] }
      }
    },
    tasks: {
      start: 1, current: 1, arcs: ['第一桩异事', '阴谋浮现', '终局'],
      items: [
        { id: 'fire', name: '那场大火', status: '终局锚点', truth: '主角亲手把将门宅院、家人和自己付之一炬，却始终不敢确认那晚究竟是谁先疯。', now: '第一章只保留他面对火时不自然的反应，不急着解释身世。', future: 2, futureText: '终局回到大火，完成对自己的度化。', points: [] },
        { id: 'tablet', name: '未出生者的灵牌', status: '第一桩异事', truth: '纸船带走的也许不只是死者，活人的未来也可能已经被某种力量写定。', now: '作为第一桩异事的异常核心，仍可跟着正文调整。', future: 0, futureText: '在第一桩异事中揭开纸船真正要带走什么。', points: [{ chapter: 1, type: 'kou', summary: '纸船上出现不该存在的名字', text: '幡上密密麻麻写满人名，最下面那个墨迹还湿，正是客栈掌柜。' }] }
      ]
    },
    people: {
      home: 'disciple',
      items: {
        disciple: { name: '钟馗弟子', note: '主角', markdown: '# 钟馗弟子\n\n京城将门长子，死后无法越过奈何桥，被钟馗收为弟子。\n\n他迷惘，却仍有赤子之心。替众生解开执念时，也在逃避自己最深的执念——那场由他点燃的大火。\n\n## 眼下\n\n- 右眼能看见异物。\n- 第二道法只能拘住三息。\n- 第一章正在追查闯入城中的纸船。', relations: [{ label: '师门', children: [{ id: 'zhongkui', note: '师父' }] }] },
        zhongkui: { name: '钟馗', note: '师父', markdown: '# 钟馗\n\n在奈何桥边发现主角身上的天赋与滔天执念。\n\n收徒不是把他从苦海里直接捞出去，而是给他一条在度化众生时慢慢度化自己的路。', relations: [{ label: '门下', children: [{ id: 'disciple', note: '弟子' }] }] }
      }
    },
    library: [
      { id: 'banner', name: '无名白幡', kind: '异物', summary: '写下活人的姓名', markdown: '# 无名白幡\n\n纸船上的白幡会出现仍活着的人的姓名。姓名被带走后，这个人与亲近之人的关系会逐渐从记忆中松动。\n\n## 已知限制\n\n具体由谁书写、能否逆转，仍未确定。', backrefs: [{ label: '第一章 · 纸船入城', target: 'chapter' }, { label: '人物志 · 钟馗弟子', target: 'people:disciple' }] },
      { id: 'cinnabar', name: '朱砂', kind: '物品', summary: '开启右眼时所用', markdown: '# 朱砂\n\n主角开启右眼时使用的媒介，并不是力量本身的来源。\n\n当前只确认它会被消耗，来源与价格尚未进入故事。', backrefs: [{ label: '第一章 · 纸船入城', target: 'chapter' }] }
    ],
    style: {
      guide: '# 这本书相信什么\n\n度化不是替别人放下，而是陪一个人走到他终于愿意看见自己的地方。主角每解决一桩执念，也要被那桩执念反过来刺中一次。\n\n## 景别与节奏\n\n恐怖来自秩序悄然出错，不靠堆叠阴森形容词。场面可以先铺开，再骤然落到一个具体动作；真正动手时，句子收短。\n\n身世只露刺，不急着解释伤口。力量要尽早兑现，但每次使用都让读者看见边界。',
      examples: [
        { label: '邪异落地', source: '第一章 · 初稿', html: '纸船冲进巷口的那一刻，青年先一刀砍断了自己的影子。' },
        { label: '异常扩大', source: '第一章 · 初稿', html: '幡上密密麻麻写满人名，最下面那个墨迹还湿，正是客栈掌柜。<br><br>满街灯火同时暗了一瞬。' }
      ]
    }
  },
  fogharbor: {
    outline: {
      sub: '第二卷 · 雾港沉潮',
      sections: [
        { meta: '第 1–28 章 · 已写', title: '一场没有发生过的海难', body: '沈砚追查失踪渔船，确认潮汐正在重复二十年前的一场空白海难。雾港保存着两套互相冲突的记忆。' },
        { meta: '现在 · 第 29 章', title: '潮声背后', body: '第三遍错误的潮声让潮门出现。门后有人叫出沈砚从未告诉任何人的真名。', current: true },
        { gap: true },
        { meta: '前方最近的锚点', title: '进入潮门', body: '门后会出现第一个记得真实海难的人；他给出的版本不一定可信。更远处仍然留白。', ending: true }
      ]
    },
    world: {
      root: 'sea', initial: 'fogharbor',
      nodes: {
        sea: { name: '雾港与外海', tag: '海域', status: '持续生长', intro: '雾港、外海与没有发生过的记忆被潮汐连接。日常器物最先出现异常，随后整个空间才显出错位。', children: ['fogharbor', 'outersea', 'rules'], sections: [{ title: '当前故事范围', html: '<ul class="world-bullets"><li>雾港是主要舞台</li><li>外海保存失踪船只的线索</li><li>潮门连接没有发生过的记忆</li></ul>' }] },
        fogharbor: { name: '雾港', tag: '港城', status: '正在写', intro: '每月有三夜看不见月亮，居民把这三夜称作“退潮”。港口的绳结、潮尺和灯火会先于人察觉异常。', parent: 'sea', children: ['port', 'lighthouse'], sections: [{ title: '当地共识', html: '<p>居民承认无月夜存在，却拒绝谈论二十年前的海难。</p>' }] },
        port: { name: '港口', tag: '日常舞台', status: '已进入正文', intro: '渔船、绳结与潮声构成雾港最日常的秩序。第三遍错误潮声出现时，所有系船结会同时松开半寸。', parent: 'fogharbor', sections: [{ title: '第 29 章', html: '<p>沈砚没有追漂走的船，而是守在废灯塔外等待潮门。</p>' }] },
        lighthouse: { name: '废灯塔', tag: '当前场景', status: '第 29 章', intro: '灯塔已经废弃，但错误潮声之后，礁石间会出现一扇本不存在的门。', parent: 'fogharbor', sections: [{ title: '已出现', html: '<p>门缝里有灯，并有人从门后叫出沈砚的真名。</p>' }] },
        outersea: { name: '外海', tag: '远端空间', status: '已提及', intro: '失踪渔船驶向外海后没有留下残骸，只留下互相矛盾的航线与潮声记录。', parent: 'sea', sections: [{ title: '仍未确定', html: '<p>海难真实发生的位置与幸存者身份尚未揭开。</p>' }] },
        rules: { name: '潮汐法则', tag: '运行规则', status: '可写', intro: '潮声发生错误时，世界会短暂显露一段没有发生过的记忆。', parent: 'sea', children: ['moonless', 'tidegate'], sections: [{ title: '约束', html: '<p>异常不会凭空出现，先由潮尺、绳结、灯火等日常器物显现。</p>' }] },
        moonless: { name: '无月夜', tag: '周期', status: '每月三夜', intro: '三夜无月被当地人称作“退潮”。这不是普通天气，而是雾港记忆最不稳定的时刻。', parent: 'rules', sections: [{ title: '已知', html: '<p>无月夜会放大居民对空白海难的回避。</p>' }] },
        tidegate: { name: '潮门', tag: '异常地点', status: '第 29 章出现', intro: '潮门只在错误潮声之后出现，门后保存的是没有发生过的记忆。', parent: 'rules', sections: [{ title: '尚未确认', html: '<p>进入潮门是否会改变现实，仍然未知。</p>' }] }
      }
    },
    tasks: {
      start: 18, current: 29, arcs: ['进入潮门', '真相靠近', '卷末'],
      items: [
        { id: 'wreck', name: '空白海难', status: '持续生长', truth: '二十年前存在一场所有痕迹都指向它、官方档案却否认它发生过的海难。', now: '沈砚已经确认两套记忆同时存在。', future: 2, futureText: '卷末必须给出海难是否真实发生的第一层答案。', points: [] },
        { id: 'log', name: '第二份航海日志', status: '尚未收束', truth: '灯塔守人留下了第二份航海日志，它记录着官方档案中不存在的航线。', now: '日志仍缺少最关键的一页。', future: 0, futureText: '进入潮门后找到缺页的去向。', points: [] },
        { id: 'name', name: '沈砚的真名', status: '正在推进', truth: '沈砚从未把真名告诉雾港任何人，门后却有人准确叫了出来。', now: '第 29 章已经把问题推到读者面前。', future: 0, futureText: '潮门内第一次解释对方为什么认识他。', points: [{ chapter: 29, type: 'kou', summary: '门后有人叫出他的真名', text: '这一次，门里有人叫出了他的真名。' }] }
      ]
    },
    people: {
      home: 'shenyun',
      items: {
        shenyun: { name: '沈砚', note: '主角', markdown: '# 沈砚\n\n曾是领航员，能从潮声里听出船只的位置，却唯独听不见自己乘过的那艘船。\n\n他从未把真名告诉雾港任何人。第 29 章，潮门后第一次有人准确叫出这个名字。', relations: [{ label: '关联', children: [{ id: 'keeper', note: '留下两份日志' }] }] },
        keeper: { name: '灯塔守人', note: '失踪', markdown: '# 灯塔守人\n\n废灯塔最后一任守人，留下两份互相矛盾的航海日志。\n\n目前只确认他知道空白海难，是否仍然活着、是否在潮门之后，都没有答案。', relations: [{ label: '留下线索给', children: [{ id: 'shenyun', note: '追查日志' }] }] }
      }
    },
    library: [
      { id: 'tideruler', name: '铜制潮尺', kind: '工具', summary: '无月夜多出第十三格', markdown: '# 铜制潮尺\n\n雾港用来记录潮位的铜尺。无月夜时，刻度会多出本不该存在的第十三格。\n\n它只负责显示异常，不会主动改变潮水。', backrefs: [{ label: '世界志 · 无月夜', target: 'world:moonless' }, { label: '第 29 章 · 潮声背后', target: 'chapter' }] },
      { id: 'log', name: '第二份航海日志', kind: '文档', summary: '记录不存在的海难', markdown: '# 第二份航海日志\n\n灯塔守人留下的另一份记录，写着一场官方档案中不存在的海难。\n\n## 当前状态\n\n中间最关键的一页被整齐撕走，去向未知。', backrefs: [{ label: '伏线 · 第二份航海日志', target: 'tasks:log' }, { label: '人物志 · 灯塔守人', target: 'people:keeper' }] }
    ],
    style: {
      guide: '# 这本书相信什么\n\n记忆并不会因为所有人都否认就失去重量。沈砚追查海难，也是在追查自己究竟属于哪一套现实。\n\n## 景别与节奏\n\n海面越广，人物动作越小。异常先落在绳结、潮尺、灯火等日常器物上，再让读者意识到整个空间已经错位。\n\n答案不能一次讲完；每次揭示都要让旧事实产生新的解释。',
      examples: [
        { label: '异常先落在器物', source: '第 29 章 · 初稿', html: '第三遍潮声响起时，港口所有系船的绳结同时松了半寸。' },
        { label: '空间错位', source: '第 29 章 · 初稿', html: '他盯着礁石之间那扇本不该存在的门，等门缝里的灯再亮一次。<br><br>这一次，门里有人叫出了他的真名。' }
      ]
    }
  }
};

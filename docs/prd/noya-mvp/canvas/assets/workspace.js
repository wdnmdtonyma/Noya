(function () {
  'use strict';

  var workspaceParams = new URLSearchParams(window.location.search);
  var requestedBook = workspaceParams.get('book') || 'qingyun';
  if (requestedBook !== 'qingyun' && window.NOYA_SAMPLE_WORKSPACE && window.NOYA_SAMPLE_WORKSPACE.supports(requestedBook)) {
    window.NOYA_SAMPLE_WORKSPACE.init(requestedBook);
    return;
  }

  var STORAGE_KEY = 'noya:qingyun:workspace:v5';
  var LEGACY_STORAGE_KEY = 'noya:qingyun:workspace:v4';
  var nav = document.getElementById('nav');
  var shell = document.getElementById('shell');
  var mid = document.getElementById('mid');
  var body = document.getElementById('body');
  var log = document.getElementById('log');
  var crumb = document.getElementById('crumb');
  var agentCtx = document.getElementById('agentCtx');
  var say = document.getElementById('say');
  var selectionAction = document.getElementById('selectionAction');
  var tpl = document.getElementById('planTpl');
  var requestedSection = workspaceParams.get('section') || workspaceParams.get('open');
  if (requestedSection === 'threads') requestedSection = 'tasks';
  var requestedItem = workspaceParams.get('item');
  var requestedRoot = workspaceParams.get('root');
  var requestedTrail = (workspaceParams.get('trail') || '').split(',').filter(Boolean);
  var requestedChapter = Number(workspaceParams.get('chapter'));
  var writingTimer = null;
  var writingTimer14 = null;
  var finalizingTimer = null;
  var finalizingTimer14 = null;
  var saveTimer = null;
  var selectedDraft = null;
  var agentRailState = 'idle';
  var agentDetailState = 'collapsed';

  var SETS = [
    ['outline', '大纲', '外门风波'], ['world', '世界志', '东境 · 可写'],
    ['tasks', '伏线', '3 条'], ['people', '人物志', '6 人'],
    ['library', '资料库', '2 条'], ['style', '笔法', '']
  ];
  var CHS = [
    [1, '山门之外'], [2, '柴房签到'], [3, '一碗冷饭'], [4, '井台'],
    [5, '雨夜'], [6, '外门规矩'], [7, '炼气九层'], [8, '父亲留下的玉'],
    [9, '十一枚铜板'], [10, '水桶与铜板'], [11, '第七次签到'],
    [12, '他不还嘴'], [13, '藏经阁的老头']
  ];
  var PLAN_DEFAULT = [
    '清晨，林凡被孙彪带人围堵。',
    '林凡选择了隐忍。',
    '林凡散心时来到藏经阁。',
    '林凡在藏经阁遇见韩拾遗。',
    '林凡完成藏经阁的首次签到。'
  ];

  function freshWorkspace() {
    return {
      version: 5,
      nextMessageId: 1,
      agentRailFolded: false,
      lastBrowse: { kind: 'ch', key: 13, arg: null },
      lastWriting: { kind: 'ch', key: 13, arg: null },
      activeWork: { kind: 'ch', key: 13, arg: null },
      objectTasks: {},
      taskHistory: {},
      threads: {},
      pendingDecision: null,
      world: { mode: 'nine', chapter7Fixed: false, edits: {} },
      peopleView: { selected: 'linfan', trail: [] },
      lanes: [],
      context: { chapter13Synced: false },
      chapterEdits: {},
      panelEdits: {},
      chapter13: {
        phase: 'plan_ready',
        plan: PLAN_DEFAULT.slice(),
        changed: [false, false, false, false, false],
        draftHtml: '',
        undoHtml: '',
        savedAt: null,
        revision: 0,
        runningTask: null,
        runningMessage: null,
        pendingEdit: null
      },
      chapter14: {
        phase: 'empty',
        plan: [],
        changed: [],
        draftHtml: '',
        undoHtml: '',
        savedAt: null,
        revision: 0,
        runningTask: null,
        runningMessage: null
      }
    };
  }

  function loadWorkspace() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      var parsed = JSON.parse(raw);
      if (!parsed || (parsed.version !== 4 && parsed.version !== 5)) return freshWorkspace();
      var defaults = freshWorkspace();
      parsed.version = 5;
      parsed.nextMessageId = parsed.nextMessageId || 1;
      parsed.agentRailFolded = !!parsed.agentRailFolded;
      parsed.taskHistory = parsed.taskHistory || {};
      parsed.objectTasks = parsed.objectTasks || {};
      parsed.threads = parsed.threads || {};
      parsed.world = Object.assign({}, defaults.world, parsed.world || {});
      parsed.world.edits = parsed.world.edits || {};
      parsed.peopleView = Object.assign({}, defaults.peopleView, parsed.peopleView || {});
      parsed.peopleView.trail = Array.isArray(parsed.peopleView.trail) ? parsed.peopleView.trail : [];
      parsed.lanes = parsed.lanes || [];
      parsed.context = Object.assign({}, defaults.context, parsed.context || {});
      parsed.chapterEdits = parsed.chapterEdits || {};
      parsed.panelEdits = parsed.panelEdits || {};
      parsed.chapter13 = Object.assign({}, defaults.chapter13, parsed.chapter13 || {});
      parsed.chapter14 = Object.assign({}, defaults.chapter14, parsed.chapter14 || {});
      parsed.lastBrowse = parsed.lastBrowse || parsed.lastObject || { kind: 'ch', key: 13, arg: null };
      parsed.lastWriting = parsed.lastWriting || { kind: 'ch', key: 13, arg: null };
      if (!Object.prototype.hasOwnProperty.call(parsed, 'activeWork')) {
        parsed.activeWork = parsed.chapter13.phase === 'finalized' ? null : { kind: 'ch', key: 13, arg: null };
      }
      if (parsed.chapter13.phase === 'finalized') parsed.context.chapter13Synced = true;
      if (parsed.chapter13.phase === 'writing') {
        parsed.chapter13.phase = 'stopped';
        appendRecovery(parsed, parsed.chapter13.runningTask, '上次写作中断了。安排和已经保存的内容都还在，可以继续写。', parsed.chapter13.runningMessage);
      }
      if (parsed.chapter13.phase === 'modifying') {
        parsed.chapter13.phase = 'draft_ready';
        parsed.chapter13.pendingEdit = null;
        appendRecovery(parsed, parsed.chapter13.runningTask, '上次修改在保存前中断，正文仍是修改前的版本。可以重新发出这条要求。', parsed.chapter13.runningMessage);
      }
      if (parsed.chapter13.phase === 'finalizing') {
        parsed.chapter13.phase = 'draft_ready';
        appendRecovery(parsed, parsed.chapter13.runningTask, '上次定稿在完成前中断，没有任何资料生效。初稿已经保留，可以重新定稿。', parsed.chapter13.runningMessage);
      }
      if (parsed.chapter14.phase === 'writing') {
        parsed.chapter14.phase = 'stopped';
        appendRecovery(parsed, parsed.chapter14.runningTask || parsed.objectTasks['ch:14'], '上次写作中断了。第 14 章安排仍在，可以继续写。', parsed.chapter14.runningMessage);
      }
      if (parsed.chapter14.phase === 'finalizing') {
        parsed.chapter14.phase = 'draft_ready';
        appendRecovery(parsed, parsed.chapter14.runningTask || parsed.objectTasks['ch:14'], '上次定稿没有完成。第 14 章仍是初稿，没有资料被更新。', parsed.chapter14.runningMessage);
      }
      if (parsed.chapter14.phase !== 'empty' && parsed.chapter13.phase !== 'finalized') {
        parsed.chapter14 = defaults.chapter14;
        parsed.activeWork = { kind: 'ch', key: 13, arg: null };
        parsed.lastWriting = { kind: 'ch', key: 13, arg: null };
      } else if (parsed.chapter14.phase !== 'empty' && parsed.chapter14.phase !== 'finalized') {
        parsed.activeWork = { kind: 'ch', key: 14, arg: null };
        parsed.lastWriting = { kind: 'ch', key: 14, arg: null };
      } else if (parsed.chapter14.phase === 'finalized') {
        parsed.activeWork = null;
      } else if (parsed.chapter13.phase === 'finalized' && parsed.activeWork && parsed.activeWork.key === 13) {
        parsed.activeWork = null;
      }
      return parsed;
    } catch (e) {
      return freshWorkspace();
    }
  }

  function appendRecovery(data, key, message, runningMessage) {
    if (!key) return;
    var thread = data.threads[key] || (data.threads[key] = []);
    var pending = thread.filter(function (item) { return item.id === runningMessage; })[0];
    if (pending) {
      pending.html = message;
      pending.land = '';
      return;
    }
    thread.push({ id: 'recovery:' + Date.now().toString(36), who: 'a', html: message, land: '', actions: null, resolved: false });
  }

  var workspace = loadWorkspace();
  shell.classList.toggle('is-agent-folded', !!workspace.agentRailFolded);
  if (requestedSection === 'people') {
    if (requestedItem) workspace.peopleView.selected = requestedItem;
    workspace.peopleView.trail = requestedTrail;
  }
  var state = workspace.activeWork || workspace.lastWriting || workspace.lastBrowse || { kind: 'ch', key: 13, arg: null };

  function saveWorkspace() {
    workspace.lastBrowse = { kind: state.kind, key: state.key, arg: state.arg || null };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace)); } catch (e) {}
    updateBookMeta();
  }

  function syncWorkspaceUrl() {
    var params = new URLSearchParams();
    params.set('book', 'qingyun');
    if (state.kind === 'set') {
      params.set('section', state.key === 'tasks' ? 'threads' : state.key);
      if (state.key === 'people') {
        if (state.arg) params.set('root', state.arg);
        if (workspace.peopleView.selected) params.set('item', workspace.peopleView.selected);
        if (workspace.peopleView.trail.length) params.set('trail', workspace.peopleView.trail.join(','));
      } else if (state.arg) {
        params.set('item', state.arg);
      }
    } else if (Number(state.key) === 14) {
      params.set('section', 'new');
      params.set('chapter', '14');
    } else {
      params.set('section', 'chapter');
      params.set('chapter', String(Number(state.key) || 13));
    }
    var path = '/p/04-d-three-column?' + params.toString();
    history.replaceState(null, '', path);
    try { localStorage.setItem('noya:last-workspace', path); } catch (e) {}
  }

  function esc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function objectKey() {
    return state.kind + ':' + state.key + (state.arg ? ':' + state.arg : '');
  }

  function taskKey() {
    var object = objectKey();
    if (!workspace.objectTasks[object]) {
      workspace.objectTasks[object] = 'task:' + object + ':' + Date.now().toString(36);
      saveWorkspace();
    }
    return workspace.objectTasks[object];
  }

  function guardPendingDecision() {
    if (!workspace.pendingDecision) return false;
    workspace.agentRailFolded = false;
    shell.classList.remove('is-agent-folded');
    openSet('world', 'realms', true);
    var pendingCard = log.querySelector('.decision-card:not(.is-resolved)');
    if (pendingCard) pendingCard.scrollIntoView({ block: 'center', behavior: 'smooth' });
    saveWorkspace();
    return true;
  }

  function beginNewTask() {
    var object = objectKey();
    var old = workspace.objectTasks[object];
    if (old) (workspace.taskHistory[object] = workspace.taskHistory[object] || []).push(old);
    workspace.objectTasks[object] = 'task:' + object + ':' + Date.now().toString(36);
    saveWorkspace();
    return workspace.objectTasks[object];
  }

  function currentThread() {
    var key = taskKey();
    return workspace.threads[key] || (workspace.threads[key] = []);
  }

  function seed(html, land) {
    var thread = currentThread();
    if (!thread.length) {
      thread.push({ id: nextMessageId(), who: 'a', html: html, land: land || '' });
      saveWorkspace();
    }
  }

  function nextMessageId() {
    var id = 'm' + workspace.nextMessageId;
    workspace.nextMessageId += 1;
    return id;
  }

  function push(who, html, land, actions, steps, workTitle) {
    return pushTo(taskKey(), who, html, land, actions, steps, workTitle);
  }

  function pushTo(key, who, html, land, actions, steps, workTitle) {
    var thread = workspace.threads[key] || (workspace.threads[key] = []);
    var id = nextMessageId();
    thread.push({
      id: id,
      who: who,
      html: html,
      land: land || '',
      actions: actions || null,
      steps: steps || null,
      workTitle: workTitle || '',
      runState: steps && steps.length ? 'running' : '',
      resolved: false
    });
    if (steps && steps.length) {
      workspace.agentRailFolded = false;
      shell.classList.remove('is-agent-folded');
    }
    saveWorkspace();
    if (workspace.objectTasks[objectKey()] === key) renderThread();
    return id;
  }

  function finishMessage(key, id, html, land, actions, runState) {
    var thread = workspace.threads[key] || (workspace.threads[key] = []);
    var message = thread.filter(function (item) { return item.id === id; })[0];
    if (!message) {
      pushTo(key, 'a', html, land, actions);
      return;
    }
    message.html = html;
    message.land = land || '';
    message.actions = actions || null;
    message.runState = runState || 'complete';
    if (message.steps && message.steps.length) {
      message.steps.forEach(function (step) {
        if (message.runState === 'complete') step.status = 'done';
        else if (step.status === 'running') step.status = message.runState;
      });
    }
    message.resolved = false;
    saveWorkspace();
    if (workspace.objectTasks[objectKey()] === key) renderThread();
  }

  function updateWorkStep(key, id, index, status, desc, time) {
    var thread = workspace.threads[key] || [];
    var message = thread.filter(function (item) { return item.id === id; })[0];
    if (!message || !message.steps || !message.steps[index]) return;
    message.steps[index].status = status;
    if (desc) message.steps[index].desc = desc;
    if (time) message.steps[index].time = time;
    if (status === 'running') message.runState = 'running';
    if (status === 'waiting') message.runState = 'waiting';
    if (status === 'failed') message.runState = 'failed';
    saveWorkspace();
    if (workspace.objectTasks[objectKey()] === key) renderThread();
  }

  function stepIcon(step) {
    if (step.status === 'done') return '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="m3.5 8.2 3 3 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if (step.status === 'running') return '<span class="run-spinner"></span>';
    if (step.status === 'waiting') return '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 4v4M8 11.4v.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    if (step.status === 'failed') return '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="m5 5 6 6M11 5l-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    if (step.status === 'stopped') return '<svg width="10" height="10" viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor"/></svg>';
    return '';
  }

  function renderSteps(message) {
    if (!message.steps || !message.steps.length) return '';
    var done = message.steps.filter(function (step) { return step.status === 'done'; }).length;
    return '<section class="run-card" data-component="agent-event-stream">' +
      '<div class="run-card__head"><b>' + esc(message.workTitle || '执行过程') + '</b><span>' + done + ' / ' + message.steps.length + '</span></div>' +
      message.steps.map(function (step) {
        return '<article class="run-step" data-state="' + (step.status || 'queued') + '">' +
          '<span class="run-step__mark">' + stepIcon(step) + '</span>' +
          '<div class="run-step__copy"><div class="run-step__title"><b>' + esc(step.title) + '</b>' +
            (step.time ? '<time>' + esc(step.time) + '</time>' : '') + '</div>' +
          '<div class="run-step__desc">' + esc(step.desc || '') + '</div>' +
          (step.detail ? '<details class="run-step__detail"><summary>' + esc(step.detailLabel || '查看详情') + '</summary><div class="run-step__detail-box">' + esc(step.detail) + '</div></details>' : '') +
          '</div></article>';
      }).join('') + '</section>';
  }

  function syncAgentRailState(thread) {
    var stateName = 'idle';
    for (var i = thread.length - 1; i >= 0; i -= 1) {
      var item = thread[i];
      if (item.actions && item.actions.some(function (action) { return !action.optional; }) && !item.resolved) { stateName = 'waiting'; break; }
      if (item.runState === 'running' || item.runState === 'waiting' || item.runState === 'needs_input' || item.runState === 'failed' || item.runState === 'stopped') {
        stateName = item.runState;
        break;
      }
      if (item.land || item.runState === 'complete') { stateName = 'complete'; break; }
    }
    if (workspace.pendingDecision) stateName = 'waiting';
    agentRailState = stateName;
    var labels = { idle: '就绪', running: '运行中', waiting: '等待决定', needs_input: '需要补充', failed: '失败', stopped: '已停止', complete: '已完成' };
    var chip = document.getElementById('agentState');
    var label = document.getElementById('agentStateLabel');
    if (chip) chip.dataset.state = stateName;
    if (label) label.textContent = labels[stateName] || '就绪';
    var openButton = document.getElementById('agentRailOpen');
    var openLabel = document.getElementById('agentOpenLabel');
    var pendingButton = document.getElementById('agentPending');
    if (openButton) openButton.dataset.state = workspace.pendingDecision ? 'waiting' : stateName;
    if (openLabel) openLabel.textContent = workspace.pendingDecision ? '待决定' : 'Agent';
    if (pendingButton) pendingButton.hidden = !workspace.pendingDecision || taskKey() === workspace.pendingDecision.task;
    var waitingForChoice = !!workspace.pendingDecision || thread.some(function (item) {
      return item.actions && item.actions.some(function (action) { return !action.optional; }) && !item.resolved;
    });
    say.disabled = waitingForChoice;
    say.placeholder = waitingForChoice ? '请先处理上方等待决定的事项…' : '告诉 Agent 要看、查找或修改什么…';
    document.getElementById('send').disabled = waitingForChoice || !say.value.trim();
    shell.classList.toggle('is-agent-working', stateName === 'running' || stateName === 'waiting');
  }

  function resultTarget(label) {
    if (/第\s*14\s*章/.test(label)) return 'chapter:14';
    if (/第\s*13\s*章/.test(label)) return 'chapter:13';
    if (label === '大纲') return 'set:outline';
    if (label === '世界志') return 'set:world';
    if (label === '人物志') return 'set:people';
    if (label === '资料库') return 'set:library';
    if (label === '伏线') return 'set:tasks';
    if (label === '笔法') return 'set:style';
    return '';
  }

  function resultChangeSummary(label, message) {
    if (/第\s*13\s*章正文/.test(label)) return '将 2,740 字初稿转为正式正文，章节状态改为已定稿。';
    if (/第\s*13\s*章初稿/.test(label)) return '生成 2,740 字初稿，保留正文编辑与选段修改入口。';
    if (/第\s*14\s*章正文/.test(label)) return '将本章初稿转为正式正文，章节状态改为已定稿。';
    if (/第\s*14\s*章初稿/.test(label)) return '生成 2,530 字初稿，尚未改变长期资料。';
    if (label === '大纲') return '补记林凡进入藏经阁、遇见韩拾遗并完成首次签到。';
    if (label === '世界志') return '补充藏经阁所在位置与进入规则，没有改动既有境界体系。';
    if (label === '人物志') return '记录林凡与韩拾遗首次相遇，以及韩拾遗对林凡的注意。';
    if (label === '资料库') return '记录首次签到所得及当前已知用途，未知部分继续留白。';
    if (label === '伏线') return '新增“韩拾遗记住林凡”这一待兑现线索。';
    return message.html.replace(/<[^>]+>/g, '');
  }

  function renderResultChanges(message) {
    var labels = (message.land || '').split(/\s*[·；]\s*/).filter(Boolean);
    return '<details><summary>查看具体改动</summary><div class="result-change-list">' + labels.map(function (label) {
      var target = resultTarget(label);
      return '<div class="result-change-item"><div><b>' + esc(label) + '</b><span>' + esc(resultChangeSummary(label, message)) + '</span></div>' +
        (target ? '<button data-result-target="' + target + '">定位</button>' : '') + '</div>';
    }).join('') + '</div></details>';
  }

  function renderThread() {
    var thread = currentThread();
    log.innerHTML = thread.map(function (message, index) {
      var decisions = '';
      if (message.actions && message.actions.length) {
        var optionalActions = message.actions.every(function (action) { return !!action.optional; });
        decisions = message.resolved && message.resolvedChoice
          ? '<div class="decision-card is-resolved"><span class="decision-card__resolved">已选择：' + esc(message.resolvedChoice) + '</span></div>'
          : '<div class="decision-card' + (optionalActions ? ' is-optional' : '') + (message.resolved ? ' is-resolved' : '') + '">' +
            (message.decisionNote ? '<p>' + message.decisionNote + '</p>' : '') +
            '<div class="decision-card__actions">' + message.actions.map(function (action) {
              return '<button data-decision="' + action.id + '" data-message-index="' + index + '"' +
                (message.resolved ? ' disabled' : '') + '>' + action.label + '</button>';
            }).join('') + '</div></div>';
      }
      if (message.who === 'u') {
        return '<article class="thread-entry request-card" data-component="agent-run-summary">' +
          '<div class="request-card__label"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 3h10v10H3z" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>你的要求</div>' +
          '<div class="request-card__body">' + message.html + '</div></article>';
      }
      var showResult = message.land || (message.runState && message.runState !== 'running' && message.runState !== 'complete') || (message.steps && message.runState === 'complete');
      var resultClass = message.runState === 'failed' ? ' is-failed' : message.runState === 'stopped' ? ' is-stopped' : message.runState === 'waiting' ? ' is-waiting' : message.runState === 'needs_input' ? ' is-needs-input' : '';
      var resultLabel = message.runState === 'failed' ? '执行失败'
        : message.runState === 'stopped' ? '任务已停止'
        : message.runState === 'waiting' ? '需要你决定'
        : message.runState === 'needs_input' ? '需要补充'
        : '已完成';
      var resultTools = message.land
        ? '<div class="result-card__tools">' + renderResultChanges(message) + '</div>'
        : message.runState === 'failed'
          ? '<div class="result-card__tools"><button data-retry-message="' + index + '">重新发出要求</button></div>'
          : '';
      var result = showResult
        ? '<div class="result-card' + resultClass + '"><div class="result-card__head">' +
            resultLabel +
          '</div><p>' + message.html +
          (message.land ? '<br>已更新 <b>' + message.land + '</b>' : '') + '</p>' + resultTools + '</div>'
        : '';
      return '<article class="thread-entry">' + renderSteps(message) +
        (!message.steps && !showResult ? '<div class="agent-note"><div class="agent-note__label"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.3" stroke="currentColor" stroke-width="1.25"/><path d="M5.5 6.8h5M5.5 9.2h3.1" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>Agent</div>' + message.html + '</div>' : '') +
        result + decisions + '</article>';
    }).join('');
    syncAgentRailState(thread);
    if (log.parentElement) log.parentElement.scrollTop = log.parentElement.scrollHeight;
  }

  function phaseLabel(phase) {
    if (phase === 'writing') return '写作中';
    if (phase === 'stopped') return '已暂停';
    if (phase === 'empty') return '待安排';
    if (phase === 'plan_ready') return '待写';
    if (phase === 'draft_ready') return '初稿';
    if (phase === 'modifying') return '修改中';
    if (phase === 'finalizing') return '定稿中';
    if (phase === 'finalized') return '已定稿';
    return '待写';
  }

  function updateBookMeta() {
    var meta = document.querySelector('.noya-book-switcher__meta');
    if (!meta) return;
    if (workspace.activeWork && workspace.activeWork.key === 14) {
      meta.textContent = '第 14 章 · ' + phaseLabel(workspace.chapter14.phase);
    } else if (workspace.activeWork && workspace.activeWork.key === 13) {
      meta.textContent = '第 13 章 · ' + phaseLabel(workspace.chapter13.phase);
    } else if (workspace.chapter14.phase === 'finalized') {
      meta.textContent = '第 14 章 · 已定稿';
    } else {
      meta.textContent = '第 13 章 · 已定稿';
    }
  }

  function drawNav() {
    var html = '<div class="d-nav__fixed">';
    html += '<button class="d-new" id="newCh"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6 2.5v7M2.5 6h7"/></svg>新建章节</button>';
    html += '<div class="d-grp">资料<span class="line"></span></div>';
    html += SETS.map(function (set) {
      return '<button class="d-item" data-kind="set" data-k="' + set[0] + '">' + NOYA.icon(set[0]) +
        '<span class="d-item__t">' + set[1] + '</span>' +
        (set[2] ? '<span class="d-item__b">' + set[2] + '</span>' : '') + '</button>';
    }).join('');
    html += '</div><div class="d-nav__chapters"><div class="d-grp">正文<span class="line"></span></div><div class="d-nav__chapter-scroll">';
    var chapters = CHS.slice();
    if ((workspace.activeWork && workspace.activeWork.key === 14) || workspace.chapter14.phase !== 'empty') chapters.push([14, '']);
    html += chapters.map(function (chapter) {
      var title = chapter[1];
      if (chapter[0] === 7 && workspace.world.chapter7Fixed) title = title.replace('九层', '五层');
      var badge = '';
      if (chapter[0] === 13) {
        var done = workspace.chapter13.phase === 'finalized';
        badge = '<span class="d-item__b ' + (done ? 'done' : 'warn') + '">' + phaseLabel(workspace.chapter13.phase) + '</span>';
      } else if (chapter[0] === 14) {
        badge = '<span class="d-item__b ' + (workspace.chapter14.phase === 'finalized' ? 'done' : 'warn') + '">' + phaseLabel(workspace.chapter14.phase) + '</span>';
      }
      return '<button class="d-item d-ch" data-kind="ch" data-k="' + chapter[0] + '">' +
        '<span class="d-item__t">第 ' + chapter[0] + ' 章 · ' + title + '</span>' + badge + '</button>';
    }).join('');
    html += '</div></div>';
    nav.innerHTML = html;
  }

  function markNav() {
    nav.querySelectorAll('.d-item[data-kind]').forEach(function (button) {
      button.classList.toggle('is-on', button.dataset.kind === state.kind && button.dataset.k == state.key);
    });
    var newChapter = document.getElementById('newCh');
    if (newChapter) newChapter.classList.remove('is-on');
  }

  function refreshNav() {
    drawNav();
    markNav();
    updateBookMeta();
  }

  function chapterName(number) {
    var found = CHS.filter(function (chapter) { return chapter[0] === number; })[0];
    var name = found ? found[1] : '';
    if (number === 7 && workspace.world.chapter7Fixed) name = name.replace('九层', '五层');
    return name;
  }

  function setChapterCrumb(number) {
    var name = chapterName(number);
    crumb.innerHTML = '正文 <span>/</span> <b>第 ' + number + ' 章' + (name ? ' · ' + name : '') + '</b>';
    agentCtx.textContent = '第 ' + number + ' 章';
  }

  function renderPlan() {
    mid.innerHTML = '';
    mid.appendChild(tpl.content.cloneNode(true));
    var chapter = workspace.chapter13;
    mid.querySelectorAll('.beat').forEach(function (beat, index) {
      var text = beat.querySelector('.beat__t');
      text.textContent = chapter.plan[index];
      text.insertAdjacentHTML('beforeend', '<span class="beat__flag">已改</span>');
      beat.classList.toggle('is-changed', !!chapter.changed[index]);
    });
    var tag = mid.querySelector('.tag-pending');
    var note = mid.querySelector('.chapter-actions__note');
    var start = mid.querySelector('[data-start-writing]');
    if (chapter.phase === 'stopped') {
      tag.textContent = '已暂停';
      note.textContent = '安排和已写内容都还在';
      start.textContent = '继续写';
    }
    NOYA.wireBeats(mid, function (value, beat) {
      var index = Array.prototype.indexOf.call(mid.querySelectorAll('.beat'), beat);
      if (index < 0) return;
      chapter.plan[index] = value;
      chapter.changed[index] = true;
      saveWorkspace();
      push('a', '第 ' + (index + 1) + ' 件事已经改好。写作时会以这份安排为准。', '第 13 章安排');
    });
    wireCharacters(mid);
  }

  function renderWriting() {
    mid.innerHTML = '<div class="work-state"><div class="work-state__inner">' +
      '<div class="work-state__pulse"></div><h2>正在写第 13 章</h2>' +
      '<p>离开这个页面也没关系，回来会回到最近一次保存的位置。</p>' +
      '<button class="btn" data-stop-writing>停止</button></div></div>';
  }

  function defaultDraftHtml() {
    var holder = document.createElement('div');
    holder.innerHTML = NOYA.writtenText();
    var text = holder.querySelector('.written__text');
    var heading = text && text.querySelector('h1');
    if (heading) heading.remove();
    return text ? text.innerHTML : '';
  }

  function renderDraft() {
    var chapter = workspace.chapter13;
    var finalized = chapter.phase === 'finalized';
    var modifying = chapter.phase === 'modifying';
    var finalizing = chapter.phase === 'finalizing';
    var editable = chapter.phase === 'draft_ready';
    if (!chapter.draftHtml) chapter.draftHtml = defaultDraftHtml();
    mid.innerHTML = '<div class="draft-head"><h1>第 13 章 · 藏经阁的老头</h1>' +
      '<span class="draft-status' + (finalized ? ' is-done' : '') + '">' +
        (finalized ? '已定稿' : finalizing ? '定稿中' : modifying ? '修改中' : '初稿') + '</span>' +
      '<span class="draft-save" id="draftSave">' + (chapter.savedAt ? '已保存' : '') + '</span></div>' +
      '<div class="draft-copy" id="draftCopy">' + chapter.draftHtml + '</div>' +
      '<div class="chapter-actions">' +
        (!finalized ? '<button class="btn btn--quiet" data-undo-draft' + (chapter.undoHtml && editable ? '' : ' hidden') + '>撤销上次修改</button>' : '') +
        (finalizing ? '<button class="btn btn--quiet" data-cancel-finalize>取消定稿</button>' : '') +
        '<span class="chapter-actions__note">' + (finalized ? '正文与资料已保持一致' : modifying ? 'Agent 只处理刚才指定的位置' : finalizing ? '完成前不会更新任何资料' : '点击正文即可直接编辑') + '</span>' +
        (finalized ? '<button class="btn btn--primary" data-next-chapter>开始第 14 章</button>' :
          '<button class="btn btn--primary" data-finalize' + (editable ? '' : ' disabled') + '>' +
          (finalizing ? '正在定稿…' : modifying ? '正在修改…' : '定稿') + '</button>') +
      '</div>';

    var copy = document.getElementById('draftCopy');
    if (editable) {
      copy.querySelectorAll('p:not(.written__more)').forEach(function (paragraph) {
        paragraph.contentEditable = 'true';
      });
      var captured = false;
      copy.addEventListener('beforeinput', function () {
        if (!captured) {
          chapter.undoHtml = copy.innerHTML;
          captured = true;
        }
      });
      copy.addEventListener('input', function () {
        clearTimeout(saveTimer);
        chapter.draftHtml = cleanDraftHtml(copy.innerHTML);
        var undo = mid.querySelector('[data-undo-draft]');
        if (undo) undo.hidden = false;
        var status = document.getElementById('draftSave');
        if (status) status.textContent = '保存中…';
        saveTimer = setTimeout(function () {
          chapter.savedAt = Date.now();
          chapter.revision = (chapter.revision || 0) + 1;
          saveWorkspace();
          if (status) status.textContent = '已保存';
          captured = false;
        }, 260);
      });
    }
    wireCharacters(mid);
    NOYA.wireRefs(mid, goRef);
  }

  function cleanDraftHtml(html) {
    var holder = document.createElement('div');
    holder.innerHTML = html;
    holder.querySelectorAll('[contenteditable]').forEach(function (node) { node.removeAttribute('contenteditable'); });
    return holder.innerHTML;
  }

  function renderChapter13() {
    var phase = workspace.chapter13.phase;
    if (phase === 'writing') renderWriting();
    else if (phase === 'draft_ready' || phase === 'modifying' || phase === 'finalizing' || phase === 'finalized') renderDraft();
    else renderPlan();
  }

  function openChapter(number) {
    if (number === 14) {
      openNewChapter(true);
      return;
    }
    hideSelectionAction();
    mid.classList.remove('is-world', 'is-people');
    state = { kind: 'ch', key: number, arg: null };
    setChapterCrumb(number);
    if (number === 13) {
      seed('我把这一章收成了五件会发生的事。你可以逐条改，也可以直接按这份安排开始写。');
      renderChapter13();
    } else {
      var html = workspace.chapterEdits[number] || NOYA.chapterText(number);
      if (number === 7 && workspace.world.chapter7Fixed) html = html.replace(/九层/g, '五层');
      mid.innerHTML = html || '<div class="ask"><b>第 ' + number + ' 章</b>这一章还没有正文。</div>';
      seed('第 ' + number + ' 章已经定稿。文字可以直接改；改变已经成立的事实之前，我会先指出受影响的章节和资料。');
      wireLegacyChapter(number);
      wireCharacters(mid);
      NOYA.wireRefs(mid, goRef);
    }
    body.scrollTop = 0;
    refreshNav();
    renderThread();
    saveWorkspace();
    syncWorkspaceUrl();
  }

  function wireLegacyChapter(number) {
    var text = mid.querySelector('.written__text');
    if (!text) return;
    text.querySelectorAll('p:not(.written__more)').forEach(function (paragraph) { paragraph.contentEditable = 'true'; });
    text.addEventListener('input', function () {
      clearTimeout(saveTimer);
      var status = text.querySelector('.legacy-save');
      if (!status) {
        status = document.createElement('span');
        status.className = 'legacy-save';
        status.style.cssText = 'display:block;margin-top:10px;color:var(--color-text-muted);font:12px var(--font-ui);';
        text.appendChild(status);
      }
      status.textContent = '保存中…';
      saveTimer = setTimeout(function () {
        text.querySelectorAll('[contenteditable]').forEach(function (node) { node.removeAttribute('contenteditable'); });
        if (status) status.remove();
        workspace.chapterEdits[number] = text.outerHTML;
        saveWorkspace();
        text.querySelectorAll('p:not(.written__more)').forEach(function (paragraph) { paragraph.contentEditable = 'true'; });
      }, 260);
    });
  }

  function chapterWritingSteps(number) {
    return [
      { title: '确认本章安排', desc: number === 13 ? '五个故事事件已固定为本次写作依据。' : '三件事已固定为本次写作依据。', status: 'done', time: '00:01' },
      { title: '查找相关内容', desc: '正在查找人物、地点、伏线和笔法中与本章直接相关的内容。', detailLabel: '查看查找范围', detail: '近期正文、早期摘要、人物志、藏经阁地点、签到伏线和相关笔法范例。', status: 'running', time: '00:03' },
      { title: '阅读前文与资料', desc: '核对人物此时知道什么，以及本章可以推进到什么程度。', detailLabel: '查看阅读结论', detail: '林凡尚不知道奖励的完整用途；韩拾遗只留下观察者印象，不能提前暴露身份。', status: 'queued' },
      { title: '生成初稿', desc: '按确认过的安排写出完整章节。', status: 'queued' },
      { title: '检查前后连续性', desc: '核对人物认知、地点、能力与伏线。', status: 'queued' },
      { title: '保存初稿', desc: '正文进入可编辑状态；定稿前不更新长期资料。', status: 'queued' }
    ];
  }

  function finalizingSteps(number) {
    return [
      { title: '检查正文连续性', desc: '正在核对本章与前文的人物认知、时间和地点。', status: 'running', time: '00:01' },
      { title: '识别本章新增事实', desc: '找出需要进入大纲、世界志、人物志、资料库或伏线的变化。', status: 'queued' },
      { title: '准备整体更新', desc: '正文与相关资料会作为一次完整变化一起生效。', status: 'queued' },
      { title: '写入正文与资料', desc: '任何一步失败都会保持定稿前状态。', status: 'queued' },
      { title: '保存本次历史', desc: '完成后可以查看改动并整体回退。', status: 'queued' }
    ];
  }

  function editingSteps(fromSelection) {
    return [
      { title: fromSelection ? '定位选中段落' : '定位需要修改的位置', desc: fromSelection ? '已经锁定作者选中的正文范围。' : '正在根据要求定位正文中的目标段落。', status: 'running', time: '00:01' },
      { title: '阅读相邻上下文', desc: '只读取足以保证改写连贯的上下文。', status: 'queued' },
      { title: '执行局部重写', desc: '只改变指定位置，不改动其他正文。', status: 'queued' },
      { title: '检查改动范围', desc: '确认人物、事实和语气没有越过本次要求。', status: 'queued' },
      { title: '保存初稿', desc: '保存后仍可撤销最近一次修改。', status: 'queued' }
    ];
  }

  function advanceEditing(runningTask, messageId, chapter) {
    setTimeout(function () {
      if (chapter.phase !== 'modifying') return;
      updateWorkStep(runningTask, messageId, 0, 'done', '已经定位到需要处理的段落。', '00:02');
      updateWorkStep(runningTask, messageId, 1, 'running', '', '00:03');
    }, 420);
    setTimeout(function () {
      if (chapter.phase !== 'modifying') return;
      updateWorkStep(runningTask, messageId, 1, 'done', '相邻两段已核对。', '00:05');
      updateWorkStep(runningTask, messageId, 2, 'running', '', '00:06');
    }, 900);
    setTimeout(function () {
      if (chapter.phase !== 'modifying') return;
      updateWorkStep(runningTask, messageId, 2, 'done', '局部重写已经生成。', '00:09');
      updateWorkStep(runningTask, messageId, 3, 'running', '', '00:10');
    }, 1450);
    setTimeout(function () {
      if (chapter.phase !== 'modifying') return;
      updateWorkStep(runningTask, messageId, 3, 'done', '改动没有超出指定段落。', '00:12');
      updateWorkStep(runningTask, messageId, 4, 'running', '', '00:13');
    }, 1900);
  }

  function advanceChapter13Writing(runningTask, messageId) {
    setTimeout(function () {
      if (workspace.chapter13.phase !== 'writing') return;
      updateWorkStep(runningTask, messageId, 1, 'done', '找到 8 条与藏经阁、韩拾遗和首次签到相关的内容。', '00:04');
      updateWorkStep(runningTask, messageId, 2, 'running', '', '00:05');
    }, 720);
    setTimeout(function () {
      if (workspace.chapter13.phase !== 'writing') return;
      updateWorkStep(runningTask, messageId, 2, 'done', '已确认人物认知与伏线边界，没有提前泄露后文。', '00:08');
      updateWorkStep(runningTask, messageId, 3, 'running', '正在写藏经阁初见与首次签到。', '00:09');
    }, 1550);
    setTimeout(function () {
      if (workspace.chapter13.phase !== 'writing') return;
      updateWorkStep(runningTask, messageId, 3, 'done', '正文已经生成，共 2,740 字。', '00:17');
      updateWorkStep(runningTask, messageId, 4, 'running', '', '00:18');
    }, 2700);
    setTimeout(function () {
      if (workspace.chapter13.phase !== 'writing') return;
      updateWorkStep(runningTask, messageId, 4, 'done', '没有发现人物认知、地点或能力冲突。', '00:21');
      updateWorkStep(runningTask, messageId, 5, 'running', '', '00:22');
    }, 3600);
  }

  function advanceChapter14Writing(runningTask, messageId) {
    setTimeout(function () {
      if (workspace.chapter14.phase !== 'writing') return;
      updateWorkStep(runningTask, messageId, 1, 'done', '找到 6 条与签到所得、韩拾遗和杂役院相关的内容。', '00:04');
      updateWorkStep(runningTask, messageId, 2, 'running', '', '00:05');
    }, 650);
    setTimeout(function () {
      if (workspace.chapter14.phase !== 'writing') return;
      updateWorkStep(runningTask, messageId, 2, 'done', '确认奖励只表现为身体感受，不提前解释完整用途。', '00:08');
      updateWorkStep(runningTask, messageId, 3, 'running', '正在写藏经阁外到杂役院的转场。', '00:09');
    }, 1450);
    setTimeout(function () {
      if (workspace.chapter14.phase !== 'writing') return;
      updateWorkStep(runningTask, messageId, 3, 'done', '正文已经生成，共 2,530 字。', '00:16');
      updateWorkStep(runningTask, messageId, 4, 'running', '', '00:17');
    }, 2500);
    setTimeout(function () {
      if (workspace.chapter14.phase !== 'writing') return;
      updateWorkStep(runningTask, messageId, 4, 'done', '连续性检查通过。', '00:20');
      updateWorkStep(runningTask, messageId, 5, 'running', '', '00:21');
    }, 3300);
  }

  function advanceFinalizing(runningTask, messageId, chapter, done) {
    setTimeout(function () {
      if (chapter.phase !== 'finalizing') return;
      updateWorkStep(runningTask, messageId, 0, 'done', '连续性检查通过。', '00:03');
      updateWorkStep(runningTask, messageId, 1, 'running', '', '00:04');
    }, 650);
    setTimeout(function () {
      if (chapter.phase !== 'finalizing') return;
      updateWorkStep(runningTask, messageId, 1, 'done', '识别到正文、大纲、世界志、人物志、资料库和伏线需要同步。', '00:07');
      updateWorkStep(runningTask, messageId, 2, 'running', '', '00:08');
    }, 1350);
    setTimeout(function () {
      if (chapter.phase !== 'finalizing') return;
      updateWorkStep(runningTask, messageId, 2, 'done', '整体更新已经准备好，尚未对正式内容生效。', '00:11');
      updateWorkStep(runningTask, messageId, 3, 'running', '', '00:12');
    }, 2050);
    setTimeout(function () {
      if (chapter.phase !== 'finalizing') return;
      updateWorkStep(runningTask, messageId, 3, 'done', '正文与相关资料已经一起更新。', '00:15');
      updateWorkStep(runningTask, messageId, 4, 'running', '', '00:16');
    }, 2750);
    setTimeout(done, 3400);
  }

  function startWriting(fromComposer) {
    if (guardPendingDecision()) return;
    if (workspace.chapter13.phase !== 'plan_ready' && workspace.chapter13.phase !== 'stopped') return;
    var wasStopped = workspace.chapter13.phase === 'stopped';
    var runningTask = wasStopped ? taskKey() : beginNewTask();
    workspace.chapter13.runningTask = runningTask;
    workspace.activeWork = { kind: 'ch', key: 13, arg: null };
    workspace.lastWriting = { kind: 'ch', key: 13, arg: null };
    workspace.chapter13.phase = 'writing';
    push('u', wasStopped ? '继续写' : fromComposer ? '按刚才的要求直接写' : '按这个写');
    workspace.chapter13.runningMessage = push('a', '正在按确认过的安排写第 13 章。', '', null, chapterWritingSteps(13), '写作第 13 章');
    advanceChapter13Writing(runningTask, workspace.chapter13.runningMessage);
    refreshNav();
    renderWriting();
    saveWorkspace();
    clearTimeout(writingTimer);
    writingTimer = setTimeout(completeWriting, 4300);
  }

  function completeWriting() {
    if (workspace.chapter13.phase !== 'writing') return;
    var runningTask = workspace.chapter13.runningTask || workspace.objectTasks['ch:13'];
    workspace.chapter13.phase = 'draft_ready';
    if (!workspace.chapter13.draftHtml) workspace.chapter13.draftHtml = defaultDraftHtml();
    workspace.chapter13.savedAt = Date.now();
    finishMessage(runningTask, workspace.chapter13.runningMessage, '初稿写完了。正文可以直接改；也可以选中一段，让我只改那一段。', '第 13 章初稿');
    workspace.chapter13.runningMessage = null;
    refreshNav();
    if (state.kind === 'ch' && state.key === 13) renderDraft();
    saveWorkspace();
  }

  function stopWriting() {
    if (workspace.chapter13.phase !== 'writing') return;
    clearTimeout(writingTimer);
    var runningTask = workspace.chapter13.runningTask || taskKey();
    workspace.chapter13.phase = 'stopped';
    finishMessage(runningTask, workspace.chapter13.runningMessage, '已经停下。安排和当前内容都保留着，回来可以继续写。', '', null, 'stopped');
    workspace.chapter13.runningMessage = null;
    refreshNav();
    renderPlan();
    saveWorkspace();
  }

  function finalizeChapter() {
    if (guardPendingDecision()) return;
    var chapter = workspace.chapter13;
    if (chapter.phase !== 'draft_ready') return;
    var copy = document.getElementById('draftCopy');
    if (copy) chapter.draftHtml = cleanDraftHtml(copy.innerHTML);
    chapter.phase = 'finalizing';
    var runningTask = taskKey();
    chapter.runningTask = runningTask;
    push('u', '定稿');
    chapter.runningMessage = push('a', '正在检查前后连续性并整理这章新增的事实。', '', null, finalizingSteps(13), '定稿第 13 章');
    refreshNav();
    renderDraft();
    saveWorkspace();
    clearTimeout(finalizingTimer);
    advanceFinalizing(runningTask, chapter.runningMessage, chapter, function () {
      if (chapter.phase !== 'finalizing') return;
      chapter.phase = 'finalized';
      chapter.undoHtml = '';
      chapter.pendingEdit = null;
      workspace.context.chapter13Synced = true;
      workspace.activeWork = null;
      workspace.lastWriting = { kind: 'ch', key: 13, arg: null };
      if (NOYA.setChapter13Finalized) NOYA.setChapter13Finalized(true);
      finishMessage(runningTask, chapter.runningMessage, '第 13 章已经定稿。正文与这章带来的变化已经一起更新完成。', '第 13 章正文 · 大纲 · 世界志 · 人物志 · 资料库 · 伏线');
      chapter.runningMessage = null;
      refreshNav();
      if (state.kind === 'ch' && state.key === 13) renderDraft();
      saveWorkspace();
    });
  }

  function undoDraft() {
    var chapter = workspace.chapter13;
    if (!chapter.undoHtml) return;
    var now = chapter.draftHtml;
    chapter.draftHtml = chapter.undoHtml;
    chapter.undoHtml = now;
    chapter.savedAt = Date.now();
    push('u', '撤销上次修改');
    push('a', '已恢复到修改前的正文。');
    renderDraft();
    saveWorkspace();
  }

  function cancelFinalizeChapter() {
    var chapter = workspace.chapter13;
    if (chapter.phase !== 'finalizing') return;
    chapter.phase = 'draft_ready';
    finishMessage(chapter.runningTask || taskKey(), chapter.runningMessage, '已取消定稿。正文仍是初稿，正式正文和资料都没有改变。', '', null, 'stopped');
    chapter.runningMessage = null;
    refreshNav();
    renderDraft();
    saveWorkspace();
  }

  function openNewChapter(fromChapterList) {
    if (guardPendingDecision()) return;
    if (!fromChapterList && workspace.chapter13.phase !== 'finalized') {
      openChapter(13);
      var unfinished = phaseLabel(workspace.chapter13.phase);
      push('a', '第 13 章还处在“' + unfinished + '”。先把这一章定稿，再开始下一章。');
      return;
    }
    hideSelectionAction();
    state = { kind: 'ch', key: 14, arg: null };
    if (workspace.chapter14.phase !== 'finalized') workspace.activeWork = { kind: 'ch', key: 14, arg: null };
    workspace.lastWriting = { kind: 'ch', key: 14, arg: null };
    crumb.innerHTML = '正文 <span>/</span> <b>第 14 章</b>';
    agentCtx.textContent = '第 14 章';
    if (workspace.chapter14.phase !== 'empty') renderChapter14();
    else {
      mid.innerHTML = '<div class="ask"><b>第 14 章</b>还什么都没有。<br>你可以说一个想看的画面，或者让 Agent 只排这一章。' +
        '<div class="chapter-actions" style="justify-content:center"><button class="btn btn--primary" data-plan-next>让 Agent 排这一章</button></div></div>';
    }
    seed('第 14 章还没有安排。你给一个画面就从那里开始；如果暂时没有，我只排眼前这一章，不补整段大纲。');
    refreshNav();
    renderThread();
    body.scrollTop = 0;
    saveWorkspace();
    syncWorkspaceUrl();
  }

  function planChapter14() {
    if (guardPendingDecision()) return;
    workspace.activeWork = { kind: 'ch', key: 14, arg: null };
    workspace.lastWriting = { kind: 'ch', key: 14, arg: null };
    workspace.chapter14.phase = 'plan_ready';
    workspace.chapter14.plan = [
      '林凡在藏经阁外确认签到所得。',
      '韩拾遗没有叫住他，只记下了他的名字。',
      '林凡回到杂役院，发现孙彪正在等他。'
    ];
    workspace.chapter14.changed = [false, false, false];
    push('u', '只排第 14 章');
    push('a', '我只接着眼前这一晚往下排，没有替你补后面的路线。', '第 14 章安排');
    renderChapter14Plan();
    saveWorkspace();
  }

  function renderChapter14Plan() {
    mid.innerHTML = '<div class="desk__lead"><h1>第 14 章</h1><span class="tag-pending">等你过目</span></div>' +
      '<ol class="beats">' + workspace.chapter14.plan.map(function (item, index) {
        return '<li class="beat' + (workspace.chapter14.changed[index] ? ' is-changed' : '') + '"><span class="beat__n">' + (index + 1) + '</span><p class="beat__t">' + esc(item) +
          '<span class="beat__flag">已改</span></p><button class="beat__edit">改</button></li>';
      }).join('') + '</ol>' +
      '<div class="chapter-actions"><span class="chapter-actions__note">' + (workspace.chapter14.phase === 'stopped' ? '上次写作已中断，安排仍在' : '只安排这一章') + '</span><button class="btn btn--primary" data-start-next-writing>' + (workspace.chapter14.phase === 'stopped' ? '继续写' : '按这个写') + '</button></div>';
    NOYA.wireBeats(mid, function (value, beat) {
      var index = Array.prototype.indexOf.call(mid.querySelectorAll('.beat'), beat);
      if (index < 0) return;
      workspace.chapter14.plan[index] = value;
      workspace.chapter14.changed[index] = true;
      saveWorkspace();
      push('a', '第 ' + (index + 1) + ' 件事已经改好。第 14 章会按这份安排写。', '第 14 章安排');
    });
  }

  function defaultDraft14Html() {
    return '<p>林凡走出藏经阁，才摊开掌心。</p>' +
      '<p>那道只有他能看见的微光已经散了，留下的不是境界，而是一段关于气息流转的陌生领悟。他试着走了三步，脚下比来时轻了一点。</p>' +
      '<p>藏经阁里，韩拾遗仍坐在案后。他没有叫住林凡，只在旧册上写下了两个字。</p>' +
      '<p>林凡。</p>' +
      '<p>等林凡回到杂役院，孙彪正倚在门边等他。</p>' +
      '<p class="written__more">…… 全章 2,530 字</p>';
  }

  function renderChapter14Writing() {
    mid.innerHTML = '<div class="work-state"><div class="work-state__inner">' +
      '<div class="work-state__pulse"></div><h2>正在写第 14 章</h2>' +
      '<p>这一章只使用刚刚确认的安排。离开页面不会取消任务。</p>' +
      '<button class="btn" data-stop-next-writing>停止</button></div></div>';
  }

  function renderChapter14Draft() {
    var chapter = workspace.chapter14;
    var finalized = chapter.phase === 'finalized';
    var finalizing = chapter.phase === 'finalizing';
    var editable = chapter.phase === 'draft_ready';
    if (!chapter.draftHtml) chapter.draftHtml = defaultDraft14Html();
    mid.innerHTML = '<div class="draft-head"><h1>第 14 章</h1>' +
      '<span class="draft-status' + (finalized ? ' is-done' : '') + '">' + (finalized ? '已定稿' : finalizing ? '定稿中' : '初稿') + '</span>' +
      '<span class="draft-save" id="draftSave14">' + (chapter.savedAt ? '已保存' : '') + '</span></div>' +
      '<div class="draft-copy" id="draftCopy14">' + chapter.draftHtml + '</div>' +
      '<div class="chapter-actions">' +
        (!finalized ? '<button class="btn btn--quiet" data-undo-next-draft' + (chapter.undoHtml && editable ? '' : ' hidden') + '>撤销上次修改</button>' : '') +
        (finalizing ? '<button class="btn btn--quiet" data-cancel-next-finalize>取消定稿</button>' : '') +
        '<span class="chapter-actions__note">' + (finalized ? '正文和本章变化已经一起保存' : finalizing ? '完成前不会更新资料' : '点击正文即可直接编辑') + '</span>' +
        (finalized ? '' : '<button class="btn btn--primary" data-finalize-next' + (editable ? '' : ' disabled') + '>' + (finalizing ? '正在定稿…' : '定稿') + '</button>') +
      '</div>';
    var copy = document.getElementById('draftCopy14');
    if (!editable) return;
    copy.querySelectorAll('p:not(.written__more)').forEach(function (paragraph) { paragraph.contentEditable = 'true'; });
    var captured = false;
    copy.addEventListener('beforeinput', function () {
      if (!captured) {
        chapter.undoHtml = cleanDraftHtml(copy.innerHTML);
        captured = true;
      }
    });
    copy.addEventListener('input', function () {
      clearTimeout(saveTimer);
      chapter.draftHtml = cleanDraftHtml(copy.innerHTML);
      var undo = mid.querySelector('[data-undo-next-draft]');
      if (undo) undo.hidden = false;
      var status = document.getElementById('draftSave14');
      if (status) status.textContent = '保存中…';
      saveTimer = setTimeout(function () {
        chapter.savedAt = Date.now();
        chapter.revision = (chapter.revision || 0) + 1;
        captured = false;
        saveWorkspace();
        if (status) status.textContent = '已保存';
      }, 260);
    });
  }

  function renderChapter14() {
    var phase = workspace.chapter14.phase;
    if (phase === 'writing') renderChapter14Writing();
    else if (phase === 'draft_ready' || phase === 'finalizing' || phase === 'finalized') renderChapter14Draft();
    else renderChapter14Plan();
  }

  function startChapter14Writing(fromComposer) {
    if (guardPendingDecision()) return;
    var chapter = workspace.chapter14;
    if (chapter.phase !== 'plan_ready' && chapter.phase !== 'stopped') return;
    var wasStopped = chapter.phase === 'stopped';
    var runningTask = wasStopped ? taskKey() : beginNewTask();
    chapter.phase = 'writing';
    chapter.runningTask = runningTask;
    workspace.activeWork = { kind: 'ch', key: 14, arg: null };
    workspace.lastWriting = { kind: 'ch', key: 14, arg: null };
    push('u', wasStopped ? '继续写' : fromComposer ? '按刚才的要求直接写' : '按这个写');
    chapter.runningMessage = push('a', '正在按确认过的安排写第 14 章。', '', null, chapterWritingSteps(14), '写作第 14 章');
    advanceChapter14Writing(runningTask, chapter.runningMessage);
    renderChapter14Writing();
    refreshNav();
    saveWorkspace();
    clearTimeout(writingTimer14);
    writingTimer14 = setTimeout(completeChapter14Writing, 4000);
  }

  function completeChapter14Writing() {
    var chapter = workspace.chapter14;
    if (chapter.phase !== 'writing') return;
    chapter.phase = 'draft_ready';
    if (!chapter.draftHtml) chapter.draftHtml = defaultDraft14Html();
    chapter.savedAt = Date.now();
    finishMessage(chapter.runningTask, chapter.runningMessage, '第 14 章初稿写完了。先直接改正文，确认后再定稿。', '第 14 章初稿');
    chapter.runningMessage = null;
    refreshNav();
    if (state.kind === 'ch' && state.key === 14) renderChapter14Draft();
    saveWorkspace();
  }

  function stopChapter14Writing() {
    var chapter = workspace.chapter14;
    if (chapter.phase !== 'writing') return;
    clearTimeout(writingTimer14);
    chapter.phase = 'stopped';
    finishMessage(chapter.runningTask, chapter.runningMessage, '已经停下。第 14 章安排仍在，回来可以继续写。', '', null, 'stopped');
    chapter.runningMessage = null;
    refreshNav();
    renderChapter14Plan();
    saveWorkspace();
  }

  function cancelFinalizeChapter14() {
    var chapter = workspace.chapter14;
    if (chapter.phase !== 'finalizing') return;
    chapter.phase = 'draft_ready';
    finishMessage(chapter.runningTask || taskKey(), chapter.runningMessage, '已取消定稿。第 14 章仍是初稿，资料没有改变。', '', null, 'stopped');
    chapter.runningMessage = null;
    refreshNav();
    renderChapter14Draft();
    saveWorkspace();
  }

  function finalizeChapter14() {
    if (guardPendingDecision()) return;
    var chapter = workspace.chapter14;
    if (chapter.phase !== 'draft_ready') return;
    var copy = document.getElementById('draftCopy14');
    if (copy) chapter.draftHtml = cleanDraftHtml(copy.innerHTML);
    chapter.phase = 'finalizing';
    chapter.runningTask = taskKey();
    push('u', '定稿');
    chapter.runningMessage = push('a', '正在检查第 14 章并整理新增事实。', '', null, finalizingSteps(14), '定稿第 14 章');
    refreshNav();
    renderChapter14Draft();
    saveWorkspace();
    clearTimeout(finalizingTimer14);
    advanceFinalizing(chapter.runningTask, chapter.runningMessage, chapter, function () {
      if (chapter.phase !== 'finalizing') return;
      chapter.phase = 'finalized';
      chapter.undoHtml = '';
      workspace.activeWork = null;
      workspace.lastWriting = { kind: 'ch', key: 14, arg: null };
      finishMessage(chapter.runningTask, chapter.runningMessage, '第 14 章已经定稿，这一章新增的事实也已一起保存。', '第 14 章正文 · 大纲');
      chapter.runningMessage = null;
      refreshNav();
      if (state.kind === 'ch' && state.key === 14) renderChapter14Draft();
      saveWorkspace();
    });
  }

  function undoChapter14Draft() {
    var chapter = workspace.chapter14;
    if (!chapter.undoHtml) return;
    var now = chapter.draftHtml;
    chapter.draftHtml = chapter.undoHtml;
    chapter.undoHtml = now;
    chapter.savedAt = Date.now();
    push('u', '撤销上次修改');
    push('a', '第 14 章已经恢复到修改前。');
    renderChapter14Draft();
    saveWorkspace();
  }

  function goRef(id) {
    var target = NOYA.refTarget(id);
    if (!target) return;
    var parts = target.split(':');
    if (parts[0] === 'set') openSet(parts[1], parts[2] || null);
    else openChapter(Number(parts[1]));
  }

  function openSet(key, arg, quiet) {
    hideSelectionAction();
    mid.classList.toggle('is-world', key === 'world');
    mid.classList.toggle('is-people', key === 'people');
    var panelArg = key === 'people' ? (arg || 'linfan') : arg;
    state = { kind: 'set', key: key, arg: panelArg || null };
    var row = SETS.filter(function (set) { return set[0] === key; })[0];
    var label = row ? row[1] : '资料';
    crumb.innerHTML = '资料 <span>/</span> <b>' + label + '</b>';
    agentCtx.textContent = label;
    mid.innerHTML = NOYA.panel(key, panelArg, key === 'people' ? { trail: workspace.peopleView.trail } : null).html;
    NOYA.wirePanel(mid, {
      lane: function (id) {
        if (NOYA.getLaneState) workspace.lanes = NOYA.getLaneState();
        openSet('tasks', id);
      },
      world: function (node) { openSet('world', node, true); },
      worldEdit: function (id, text) {
        workspace.world.edits[id] = text;
        push('a', '这条世界资料已经保存。', '世界志 · ' + id);
        saveWorkspace();
      },
      ref: goRef,
      library: function (id) {
        state.arg = id;
        wirePanelDocuments('library', id);
        seed('这是当前资料条目。完整规则只在这里写一份。');
        renderThread();
        saveWorkspace();
        syncWorkspaceUrl();
      },
      personRoot: function (id, trail) {
        state.arg = id;
        workspace.peopleView.selected = id;
        workspace.peopleView.trail = Array.isArray(trail) ? trail : [];
        wirePanelDocuments('people', id);
        seed('这是当前人物的档案。哪里不对，直接改或告诉我。');
        renderThread();
        saveWorkspace();
        syncWorkspaceUrl();
      },
      personSelect: function (id) {
        workspace.peopleView.selected = id;
        saveWorkspace();
        syncWorkspaceUrl();
      }
    });
    wirePanelDocuments(key, panelArg);
    wireCharacters(mid);
    NOYA.wireRefs(mid, goRef);
    if (key === 'people') {
      var selectedPerson = workspace.peopleView.selected;
      var personSheets = Array.prototype.slice.call(mid.querySelectorAll('[data-person-sheet]'));
      workspace.peopleView.trail = workspace.peopleView.trail.filter(function (id) {
        return personSheets.some(function (sheet) { return sheet.dataset.personSheet === id; }) && id !== state.arg;
      });
      var selectedSheet = personSheets.filter(function (sheet) { return sheet.dataset.personSheet === selectedPerson; })[0];
      var rootSheet = personSheets.filter(function (sheet) { return sheet.dataset.personSheet === state.arg; })[0];
      if (!rootSheet) {
        state.arg = 'linfan';
        workspace.peopleView.trail = [];
      }
      if (!selectedSheet) {
        selectedPerson = rootSheet ? state.arg : 'linfan';
        workspace.peopleView.selected = selectedPerson;
      }
      personSheets.forEach(function (sheet) {
        sheet.hidden = sheet.dataset.personSheet !== selectedPerson;
      });
      mid.querySelectorAll('[data-person-node]').forEach(function (node) {
        node.classList.toggle('is-selected', node.dataset.personNode === selectedPerson);
      });
    }
    var personNames = {
      linfan: '林凡', hanshiyi: '韩拾遗', sunbiao: '孙彪',
      wangergou: '王二狗', zhaotianxiong: '赵天雄', shenqingshuang: '沈青霜'
    };
    var openings = {
      outline: '这是当前大纲。已经确定的部分直接约束后续写作，中间留白可以继续留着。',
      world: '这是当前世界志。你可以直接编辑，也可以告诉我想改哪条规则。',
      tasks: '这里保留三条仍会影响后文的伏线。你可以修改去向，也可以让某一条继续保持未知。',
      people: '这是' + (personNames[panelArg] || '林凡') + '的人物档案。哪里不对，直接改或告诉我。',
      library: '资料库目前收着《引气诀》和父亲留下的玉。完整规则只在这里写一份。',
      style: '这是当前笔法和已经确认的范例。修改会影响之后的章节，不会自动重写过去。'
    };
    seed(openings[key] || '哪里不对，直接改或告诉我。');
    refreshNav();
    renderThread();
    saveWorkspace();
    syncWorkspaceUrl();
    if (!quiet) body.scrollTop = 0;
  }

  function wirePanelDocuments(key, panelArg) {
    var docs = [];
    if (key === 'people') {
      mid.querySelectorAll('[data-person-sheet]').forEach(function (sheet) {
        var doc = sheet.querySelector('.person-markdown');
        if (doc) docs.push({ id: 'people:' + sheet.dataset.personSheet, node: doc });
      });
    } else if (key === 'library') {
      var libraryDoc = mid.querySelector('.library-document .markdown-document');
      var activeEntry = mid.querySelector('.library-entry.is-on');
      if (libraryDoc) docs.push({ id: 'library:' + (activeEntry ? activeEntry.dataset.libraryEntry : (panelArg || 'yinqijue')), node: libraryDoc });
    } else if (key === 'style') {
      var styleDoc = mid.querySelector('.style-guide');
      if (styleDoc) docs.push({ id: 'style', node: styleDoc });
    } else if (key === 'outline') {
      var outlineDoc = mid.querySelector('.outline-document');
      if (outlineDoc) docs.push({ id: 'outline', node: outlineDoc });
    }
    docs.forEach(function (record) {
      if (workspace.panelEdits[record.id]) record.node.innerHTML = workspace.panelEdits[record.id];
      record.node.contentEditable = 'true';
      record.node.addEventListener('input', function () {
        clearTimeout(record.node._saveTimer);
        record.node._saveTimer = setTimeout(function () {
          workspace.panelEdits[record.id] = record.node.innerHTML;
          saveWorkspace();
        }, 260);
      });
    });
  }

  function wireCharacters(scope) {
    scope.querySelectorAll('[data-char]').forEach(function (node) {
      node.addEventListener('click', function () { openSet('people', node.dataset.char); });
    });
  }

  function showWorldConflict() {
    var nextUnwritten = workspace.chapter13.phase === 'finalized' ? (workspace.chapter14.phase === 'finalized' ? 15 : 14) : 13;
    workspace.pendingDecision = { type: 'world_layers', task: taskKey(), fromChapter: nextUnwritten };
    push('a', '<b>这会改动已经写过的事实。</b>第 7 章明确写了“炼气一共九层”。我还没有修改任何内容。', '', [
      { id: 'world-keep', label: '保留九层，不修改' },
      { id: 'world-future', label: '从第 ' + nextUnwritten + ' 章起按五层写' },
      { id: 'world-all', label: '世界志和第 7 章一起改成五层' }
    ]);
    saveWorkspace();
  }

  function resolveDecision(kind, messageIndex) {
    var thread = currentThread();
    if (thread[messageIndex]) {
      var chosen = (thread[messageIndex].actions || []).filter(function (action) { return action.id === kind; })[0];
      thread[messageIndex].resolved = true;
      thread[messageIndex].resolvedChoice = chosen ? chosen.label : '';
    }
    var fromChapter = workspace.pendingDecision && workspace.pendingDecision.fromChapter
      ? workspace.pendingDecision.fromChapter : 13;
    workspace.pendingDecision = null;
    if (kind === 'world-keep') {
      openSet('world', 'realms', true);
      push('a', '保留原来的规则。本次没有改动正文或世界志。');
    } else if (kind === 'world-future') {
      workspace.world.undo = {
        mode: workspace.world.mode,
        fromChapter: workspace.world.fromChapter || null,
        chapter7Fixed: workspace.world.chapter7Fixed,
        chapter7Edit: workspace.chapterEdits[7] || null
      };
      NOYA.worldApplyFromChapter(fromChapter);
      workspace.world.mode = 'from13';
      workspace.world.fromChapter = fromChapter;
      workspace.world.chapter7Fixed = false;
      openSet('world', 'realms', true);
      push('a', '从第 ' + fromChapter + ' 章起按五层写；第 7 章保留当时的九层说法。', '世界志 · 境界（第 ' + fromChapter + ' 章起）', [
        { id: 'world-undo', label: '撤销这次修改', optional: true }
      ]);
    } else if (kind === 'world-all') {
      workspace.world.undo = {
        mode: workspace.world.mode,
        fromChapter: workspace.world.fromChapter || null,
        chapter7Fixed: workspace.world.chapter7Fixed,
        chapter7Edit: workspace.chapterEdits[7] || null
      };
      NOYA.worldApplyEverywhere();
      workspace.world.mode = 'five';
      workspace.world.fromChapter = null;
      workspace.world.chapter7Fixed = true;
      openSet('world', 'realms', true);
      push('a', '已经把规则和第 7 章一起改成五层，两处要么同时生效，要么同时撤销。', '世界志 · 境界；第 7 章正文', [
        { id: 'world-undo', label: '撤销这次修改', optional: true }
      ]);
    } else if (kind === 'world-undo') {
      var previous = workspace.world.undo || { mode: 'nine', fromChapter: null, chapter7Fixed: false, chapter7Edit: null };
      if (previous.mode === 'from13') NOYA.worldApplyFromChapter(previous.fromChapter || 13);
      else if (previous.mode === 'five') NOYA.worldApplyEverywhere();
      else NOYA.worldRevert();
      workspace.world.mode = previous.mode;
      workspace.world.fromChapter = previous.fromChapter;
      workspace.world.chapter7Fixed = !!previous.chapter7Fixed;
      if (previous.chapter7Edit) workspace.chapterEdits[7] = previous.chapter7Edit;
      else delete workspace.chapterEdits[7];
      workspace.world.undo = null;
      openSet('world', 'realms', true);
      push('a', '已经整体撤销。世界志和第 7 章都回到修改前的版本。', '世界志 · 境界；第 7 章正文');
    }
    saveWorkspace();
  }

  function hideSelectionAction() {
    selectionAction.classList.remove('is-on');
  }

  function captureSelection() {
    if (state.kind !== 'ch' || state.key !== 13 || workspace.chapter13.phase !== 'draft_ready') return hideSelectionAction();
    var selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return hideSelectionAction();
    var range = selection.getRangeAt(0);
    var paragraph = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    paragraph = paragraph && paragraph.closest('p[contenteditable="true"]');
    var copy = document.getElementById('draftCopy');
    if (!paragraph || !copy || !copy.contains(paragraph)) return hideSelectionAction();
    var paragraphs = Array.prototype.slice.call(copy.querySelectorAll('p[contenteditable="true"]'));
    var rect = range.getBoundingClientRect();
    selectedDraft = { text: selection.toString().trim(), paragraphIndex: paragraphs.indexOf(paragraph) };
    selectionAction.style.left = Math.max(10, Math.min(window.innerWidth - 112, rect.left + rect.width / 2 - 48)) + 'px';
    selectionAction.style.top = Math.max(10, rect.top - 38) + 'px';
    selectionAction.classList.add('is-on');
  }

  function applyDraftInstruction(instruction, target, runningTask, pendingId) {
    var chapter = workspace.chapter13;
    if (chapter.phase !== 'modifying' || !chapter.pendingEdit || chapter.pendingEdit.id !== pendingId) return;
    var copy = document.createElement('div');
    copy.innerHTML = chapter.draftHtml || defaultDraftHtml();
    var paragraphs = copy.querySelectorAll('p:not(.written__more)');
    var index = target && target.paragraphIndex >= 0 ? target.paragraphIndex : 0;
    var paragraph = paragraphs[index] || paragraphs[0];
    if (!paragraph) {
      chapter.phase = 'draft_ready';
      chapter.pendingEdit = null;
      finishMessage(runningTask, chapter.runningMessage, '没有找到刚才指定的段落，正文没有改动。请重新选中后再试。', '', null, 'failed');
      chapter.runningMessage = null;
      saveWorkspace();
      if (state.kind === 'ch' && state.key === 13) renderDraft();
      return;
    }
    chapter.undoHtml = cleanDraftHtml(copy.innerHTML);
    var original = paragraph.textContent.trim();
    var revised;
    if (/韩拾遗|抬头|老人/.test(instruction) || /看守没有抬头/.test(original)) {
      revised = '案后坐着个老人。林凡递出铜板，他没有抬头，只把摊开的书册往旁边推了半寸。';
    } else if (/孙彪带着/.test(original)) {
      revised = '清晨，孙彪带着三个人堵在杂役院门口。林凡手里还提着水。';
    } else if (/“哟/.test(original)) {
      revised = '“哟。”孙彪咧开嘴，左眉那道疤随之扭了一下，“外门第一勤快人。”';
    } else if (/一脚踢过去/.test(original)) {
      revised = '孙彪一脚踢翻木桶。水沿着青石板的缝隙流远。';
    } else if (/林凡没有说话/.test(original)) {
      revised = '林凡垂眼看着淌走的水，扶正木桶，连一句辩解都没有。人群散尽，他提起空桶，往西边走。';
    } else if (/阁里很暗/.test(original)) {
      revised = '阁里昏暗。林凡从最外侧抽出一本书，翻开。';
    } else if (/克制|收短|啰嗦/.test(instruction) || original.length > 48) {
      revised = original.replace('一点一点', '慢慢').replace('渐渐', '逐渐');
    } else {
      revised = original.replace('林凡没有说话', '林凡仍旧没有说话').replace('一点一点', '慢慢');
    }
    if (revised === original) revised = original.replace(/，/, '。');
    paragraph.textContent = revised;
    chapter.draftHtml = cleanDraftHtml(copy.innerHTML);
    chapter.savedAt = Date.now();
    chapter.revision = (chapter.revision || 0) + 1;
    chapter.phase = 'draft_ready';
    chapter.pendingEdit = null;
    finishMessage(runningTask, chapter.runningMessage, target && target.fromSelection ? '只改了选中的这一段，其他正文没有动。' : '按你的要求改了这一处，其他正文没有动。', '第 13 章初稿 · 指定段落');
    chapter.runningMessage = null;
    selectedDraft = null;
    hideSelectionAction();
    if (state.kind === 'ch' && state.key === 13) renderDraft();
    saveWorkspace();
  }

  function applyLegacyInstruction(number, instruction, runningTask, messageId) {
    var text = mid.querySelector('.written__text');
    if (!text || state.kind !== 'ch' || state.key !== number) {
      finishMessage(runningTask, messageId, '页面已经切走，这次没有改正文。回到第 ' + number + ' 章后可以重新发出要求。', '', null, 'failed');
      return;
    }
    var paragraph = text.querySelector('p:not(.written__more)');
    if (!paragraph) {
      finishMessage(runningTask, messageId, '没有找到可以修改的正文，这次没有改动。', '', null, 'failed');
      return;
    }
    var original = paragraph.textContent.trim();
    var revised = original;
    if (/收短|啰嗦|克制/.test(instruction)) revised = original.replace(/，([^，。]{1,18})，/, '，').replace('渐渐', '慢慢');
    else if (/改成|换成|写成/.test(instruction)) {
      var match = instruction.match(/(?:改成|换成|写成)[：:]?\s*[“"]?(.+?)[”"]?$/);
      if (match && match[1]) revised = match[1];
    }
    if (revised === original) {
      finishMessage(runningTask, messageId, '我还不能从这句话判断要替换哪一段。请先选中正文，或把“原句改成新句”说完整；这次没有改动。', '', null, 'needs_input');
      return;
    }
    paragraph.textContent = revised;
    text.querySelectorAll('[contenteditable]').forEach(function (node) { node.removeAttribute('contenteditable'); });
    workspace.chapterEdits[number] = text.outerHTML;
    text.querySelectorAll('p:not(.written__more)').forEach(function (node) { node.contentEditable = 'true'; });
    finishMessage(runningTask, messageId, '第 ' + number + ' 章这一处已经改好，其他段落没有动。', '第 ' + number + ' 章正文');
    saveWorkspace();
  }

  function applyPanelInstruction(instruction, runningTask, messageId) {
    var replacement = instruction.match(/(?:改成|换成|写成)[：:]?\s*[“"]?(.+?)[”"]?$/);
    var node = null;
    var editKey = null;
    if (state.key === 'world') {
      node = mid.querySelector('[data-world-editable]');
      var worldArticle = node && node.closest('[data-world-id]');
      editKey = 'world:' + (worldArticle ? worldArticle.dataset.worldId : (state.arg || 'east'));
    } else if (state.key === 'people') {
      var sheet = mid.querySelector('[data-person-sheet]:not([hidden])');
      node = sheet && sheet.querySelector('.person-markdown p');
      editKey = sheet ? 'people:' + sheet.dataset.personSheet : null;
    } else if (state.key === 'library') {
      var activeEntry = mid.querySelector('.library-entry.is-on');
      node = mid.querySelector('.library-document .markdown-document p');
      editKey = 'library:' + (activeEntry ? activeEntry.dataset.libraryEntry : (state.arg || 'yinqijue'));
    } else if (state.key === 'style') {
      node = mid.querySelector('.style-guide p');
      editKey = 'style';
    } else if (state.key === 'outline') {
      node = mid.querySelector('.outline-document p');
      editKey = 'outline';
    }
    if (!replacement || !replacement[1] || !node || !editKey) {
      finishMessage(runningTask, messageId, '我还不能判断要替换哪一段。请把“原句改成新句”说完整；这次没有改动。', '', null, 'needs_input');
      return;
    }
    node.textContent = replacement[1];
    if (state.key === 'world') {
      var worldId = editKey.replace(/^world:/, '');
      if (NOYA.setWorldIntro) NOYA.setWorldIntro(worldId, replacement[1]);
      workspace.world.edits[worldId] = replacement[1];
    } else {
      var documentNode = state.key === 'people'
        ? node.closest('.person-markdown')
        : state.key === 'library'
          ? node.closest('.markdown-document')
          : state.key === 'style'
            ? node.closest('.style-guide')
            : node.closest('.outline-document');
      if (documentNode) workspace.panelEdits[editKey] = documentNode.innerHTML;
    }
    finishMessage(runningTask, messageId, '这一处已经按你的新内容替换，其他资料没有动。', (state.key === 'world' ? '世界志' : ((SETS.filter(function (set) { return set[0] === state.key; })[0] || [null, '资料'])[1])));
    saveWorkspace();
  }

  function sendMessage() {
    var text = say.value.trim();
    if (!text) return;
    say.value = '';
    document.getElementById('send').disabled = true;
    var wantsEdit = /改|重写|删|润色|收短|啰嗦|抬头|不要|换成/.test(text);
    var directWrite = /直接写|开始写|继续写|就按.+写|照.+写/.test(text);
    if (state.kind === 'ch' && state.key === 13 && workspace.chapter13.phase === 'finalized' && wantsEdit) {
      beginNewTask();
      workspace.chapter13.phase = 'draft_ready';
      workspace.chapter13.undoHtml = '';
      workspace.activeWork = { kind: 'ch', key: 13, arg: null };
      workspace.lastWriting = { kind: 'ch', key: 13, arg: null };
      seed('第 13 章已经进入一次新的修改。你这次的要求只作用于当前版本。');
      renderDraft();
      refreshNav();
    }
    if (((state.kind === 'set' && state.key === 'world') || (state.kind === 'ch' && state.key === 7)) && /炼气/.test(text) && /五层|5层/.test(text)) {
      NOYA.worldConflict();
      openSet('world', 'realms', true);
      push('u', esc(text));
      showWorldConflict();
      return;
    }
    push('u', esc(text));
    if (state.kind === 'ch' && state.key === 13 && directWrite && (workspace.chapter13.phase === 'plan_ready' || workspace.chapter13.phase === 'stopped')) {
      push('a', '已经把当前安排冻结为这次写作的最小依据，直接开写。');
      startWriting(true);
      return;
    }
    if (state.kind === 'ch' && state.key === 13 && workspace.chapter13.phase === 'draft_ready' && wantsEdit) {
      var chapter = workspace.chapter13;
      var runningTask = taskKey();
      var target = selectedDraft && selectedDraft.paragraphIndex >= 0
        ? { paragraphIndex: selectedDraft.paragraphIndex, fromSelection: true }
        : { paragraphIndex: 0, fromSelection: false };
      var pendingId = 'edit:' + Date.now().toString(36);
      chapter.phase = 'modifying';
      chapter.runningTask = runningTask;
      chapter.pendingEdit = { id: pendingId, task: runningTask, target: target, instruction: text, revision: chapter.revision || 0 };
      chapter.runningMessage = push('a', '正在修改第 13 章初稿。', '', null, editingSteps(target.fromSelection), '修改第 13 章初稿');
      advanceEditing(runningTask, chapter.runningMessage, chapter);
      renderDraft();
      refreshNav();
      saveWorkspace();
      setTimeout(function () { applyDraftInstruction(text, target, runningTask, pendingId); }, 2350);
      return;
    }
    if (state.kind === 'ch' && state.key < 13 && wantsEdit) {
      var legacyTask = taskKey();
      var legacyMessage = push('a', '<span class="msg__doing"><i></i>正在修改第 ' + state.key + ' 章</span>');
      var legacyNumber = state.key;
      setTimeout(function () { applyLegacyInstruction(legacyNumber, text, legacyTask, legacyMessage); }, 320);
      return;
    }
    if (state.kind === 'set' && wantsEdit) {
      var panelTask = taskKey();
      var panelMessage = push('a', '<span class="msg__doing"><i></i>正在修改当前资料</span>');
      applyPanelInstruction(text, panelTask, panelMessage);
      return;
    }
    if (state.kind === 'ch' && state.key === 14 && workspace.chapter14.phase === 'empty') {
      workspace.chapter14.plan = directWrite
        ? ['林凡在藏经阁外确认签到所得。', '韩拾遗记下林凡的名字。', '林凡回到杂役院。']
        : [text, '这一章只围绕这个画面向前推进。'];
      workspace.chapter14.changed = workspace.chapter14.plan.map(function () { return false; });
      workspace.chapter14.phase = 'plan_ready';
      workspace.activeWork = { kind: 'ch', key: 14, arg: null };
      workspace.lastWriting = { kind: 'ch', key: 14, arg: null };
      if (directWrite) {
        push('a', '已经把你的要求收成最小安排，不补后面的路线，直接开写。', '第 14 章安排');
        startChapter14Writing(true);
      } else {
        push('a', '我先把你说的画面放进这一章，没有补后面的路线。', '第 14 章安排');
        renderChapter14Plan();
        saveWorkspace();
      }
      return;
    }
    if (state.kind === 'ch' && state.key === 14 && directWrite && (workspace.chapter14.phase === 'plan_ready' || workspace.chapter14.phase === 'stopped')) {
      push('a', '已经冻结当前安排，直接继续写第 14 章。');
      startChapter14Writing(true);
      return;
    }
    if (state.kind === 'ch' && state.key === 13 && workspace.chapter13.phase !== 'draft_ready') {
      push('a', '第 13 章现在是“' + phaseLabel(workspace.chapter13.phase) + '”。等当前步骤完成后再修改正文，避免两份结果互相覆盖。');
    } else {
      var currentName = state.kind === 'set' ? ((SETS.filter(function (set) { return set[0] === state.key; })[0] || [null, '当前资料'])[1]) : ('第 ' + state.key + ' 章');
      push('a', '我正在看' + currentName + '。如果要修改，请把要替换的位置和新内容说完整；如果只是提问，我会基于当前页面回答。');
    }
  }

  nav.addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'newCh') openNewChapter();
    else if (button.dataset.kind === 'set') openSet(button.dataset.k);
    else if (button.dataset.kind === 'ch') openChapter(Number(button.dataset.k));
  });

  mid.addEventListener('click', function (event) {
    if (event.target.closest('[data-start-writing]')) startWriting();
    else if (event.target.closest('[data-stop-writing]')) stopWriting();
    else if (event.target.closest('[data-finalize]')) finalizeChapter();
    else if (event.target.closest('[data-cancel-finalize]')) cancelFinalizeChapter();
    else if (event.target.closest('[data-undo-draft]')) undoDraft();
    else if (event.target.closest('[data-next-chapter]')) openNewChapter();
    else if (event.target.closest('[data-plan-next]')) planChapter14();
    else if (event.target.closest('[data-start-next-writing]')) startChapter14Writing();
    else if (event.target.closest('[data-stop-next-writing]')) stopChapter14Writing();
    else if (event.target.closest('[data-finalize-next]')) finalizeChapter14();
    else if (event.target.closest('[data-cancel-next-finalize]')) cancelFinalizeChapter14();
    else if (event.target.closest('[data-undo-next-draft]')) undoChapter14Draft();
  });

  mid.addEventListener('mouseup', function () { setTimeout(captureSelection, 0); });
  mid.addEventListener('keyup', function () { setTimeout(captureSelection, 0); });
  selectionAction.addEventListener('click', function () {
    say.value = selectedDraft && /韩拾遗|看守|老人/.test(selectedDraft.text) ? '韩拾遗不要抬头，把这段写得更克制' : '把选中这段收短一点';
    say.focus();
    hideSelectionAction();
  });
  document.addEventListener('mousedown', function (event) {
    if (!event.target.closest('#draftCopy') && !event.target.closest('#selectionAction')) hideSelectionAction();
  });

  log.addEventListener('click', function (event) {
    var retry = event.target.closest('[data-retry-message]');
    if (retry) {
      var thread = currentThread();
      var index = Number(retry.dataset.retryMessage);
      var prior = null;
      for (var i = index - 1; i >= 0; i -= 1) {
        if (thread[i].who === 'u') { prior = thread[i]; break; }
      }
      if (prior) {
        var holder = document.createElement('div');
        holder.innerHTML = prior.html;
        say.value = holder.textContent || '';
      }
      say.disabled = false;
      document.getElementById('send').disabled = !say.value.trim();
      say.focus();
      return;
    }
    var resultLink = event.target.closest('[data-result-target]');
    if (resultLink) {
      var parts = resultLink.dataset.resultTarget.split(':');
      if (parts[0] === 'chapter') openChapter(Number(parts[1]));
      else if (parts[0] === 'set') openSet(parts[1]);
      body.scrollTo({ top: 0, behavior: 'smooth' });
      mid.classList.remove('is-result-located');
      requestAnimationFrame(function () { mid.classList.add('is-result-located'); });
      setTimeout(function () { mid.classList.remove('is-result-located'); }, 950);
      return;
    }
    var button = event.target.closest('[data-decision]');
    if (!button || button.disabled) return;
    resolveDecision(button.dataset.decision, Number(button.dataset.messageIndex));
  });
  log.addEventListener('toggle', function (event) {
    if (event.target.matches && event.target.matches('.run-step__detail')) {
      agentDetailState = event.target.open ? 'expanded' : 'collapsed';
    }
  }, true);

  document.getElementById('fold').addEventListener('click', function () {
    document.getElementById('shell').classList.toggle('is-folded');
  });
  document.getElementById('agentRailToggle').addEventListener('click', function () {
    workspace.agentRailFolded = true;
    shell.classList.add('is-agent-folded');
    saveWorkspace();
  });
  document.getElementById('agentRailOpen').addEventListener('click', function () {
    workspace.agentRailFolded = false;
    shell.classList.remove('is-agent-folded');
    saveWorkspace();
  });
  document.getElementById('agentPending').addEventListener('click', function () {
    workspace.agentRailFolded = false;
    shell.classList.remove('is-agent-folded');
    openSet('world', 'realms', true);
    saveWorkspace();
  });
  document.getElementById('send').addEventListener('click', sendMessage);
  say.addEventListener('input', function () {
    document.getElementById('send').disabled = !say.value.trim();
  });
  say.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  document.getElementById('send').disabled = !say.value.trim();

  if (workspace.world.mode === 'from13') NOYA.worldApplyFromChapter(workspace.world.fromChapter || 13);
  else if (workspace.world.mode === 'five') NOYA.worldApplyEverywhere();
  else NOYA.worldRevert();
  if (NOYA.applyWorldEdits) NOYA.applyWorldEdits(workspace.world.edits);
  if (NOYA.applyLaneState) NOYA.applyLaneState(workspace.lanes);
  if (NOYA.setChapter13Finalized) NOYA.setChapter13Finalized(!!workspace.context.chapter13Synced);

  drawNav();
  if (requestedSection === 'new') openNewChapter();
  else if (requestedSection && SETS.some(function (set) { return set[0] === requestedSection; })) {
    openSet(requestedSection, requestedSection === 'people' ? (requestedRoot || requestedItem) : requestedItem);
  }
  else if (requestedSection === 'chapter' && requestedChapter >= 1 && requestedChapter <= 14) openChapter(requestedChapter);
  else if (state.kind === 'set') openSet(state.key, state.arg);
  else if (state.key === 14) openNewChapter();
  else openChapter(Number(state.key) || 13);
})();

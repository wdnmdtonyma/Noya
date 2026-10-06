/* Fixed examples of a unified Agent event stream. No real workspace or model access. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const raw = value => value===undefined?'':typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const clock = at => new Date(at).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  const icons = {
    down:'<path d="m7 10 5 5 5-5"/>',
    right:'<path d="m10 7 5 5-5 5"/>',
    arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
    doc:'<path d="M6 3h8l4 4v14H6zM14 3v5h5M9 12h6M9 16h6"/>',
    plan:'<path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3"/>',
    review:'<path d="M6 3h8l4 4v14H6zM14 3v5h5"/><path d="m9 14 2 2 4-4"/>',
    subagent:'<circle cx="6" cy="5" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10m0-5h10"/>',
    tool:'<path d="M14.5 6.5a4 4 0 0 0 5 5L13 18l-3 1 1-3 6.5-6.5M4 20l5-5"/>',
    read:'<path d="M3 6.5C5 5 8 5 12 7c4-2 7-2 9-.5V19c-2-1.5-5-1.5-9 .5-4-2-7-2-9-.5zM12 7v12.5"/>',
    edit:'<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
    write:'<path d="M12 20h8M4 20h4L19 9l-4-4L4 16z"/>',
    search:'<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
    command:'<path d="M4 5h16v14H4zM8 10l2.5 2L8 14m5 0h3"/>',
    thinking:'<path d="M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2"/>',
    layers:'<path d="m12 4 8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4"/>',
    check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alert:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5m0 3.2v.3"/>',
    stop:'<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
    pause:'<path d="M9 6v12m6-12v12"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    close:'<path d="m7 7 10 10M17 7 7 17"/>',
    eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.5"/>'
  };
  const svg = (name, cls='') => `<svg viewBox="0 0 24 24" aria-hidden="true"${cls?` class="${cls}"`:''}>${icons[name] || ''}</svg>`;
  const storageKey = 'noya-unified-agent-events-v4';
  const query = new URLSearchParams(location.search);
  const scenario = query.get('scenario') || 'running';
  const frozen = query.get('freeze') === '1';
  const taskShort = {running:'执行中',idle:'本轮结束',stopping:'正在停止',stopped:'已停止',failed:'执行失败',interrupted:'已中断'};
  const taskStates = {running:'正在执行',idle:'本轮结束 · 可继续对话',stopping:'正在停止，等待执行结束',stopped:'已停止 · 记录保留',failed:'执行失败 · 已保存产物保留',interrupted:'执行中断 · 记录保留'};
  const toolStates = {running:'执行中',completed:'调用结束',error:'调用报错',stopped:'已停止',interrupted:'执行中断'};
  const agentStates = {running:'执行中',idle:'本轮结束',stopped:'已停止',failed:'失败',interrupted:'中断',retired:'已结束使用'};
  const prose = '万舟在雨声中醒来。冰冷的绳结勒着脚踝，井口在头顶缩成一圈灰白。他先听见有人搬动木板，才看见垂到面前的那盏灯。\n\n他没有呼救。绳子轻轻一晃，后背就碰到湿滑的井壁。上面的人正在争论该不该把灯收走，其中一个声音说，留着光，他才知道有人在等。\n\n万舟握住灯架。就在这时，井壁上一道早已熄灭的刻痕随着灯火缓缓亮了起来。他不认识那些形状，只看出光每晃一下，它们就往井底延伸一点。';
  const oldProse = prose + '\n\n他忽然认出，那是母亲旧信里提到的归潮印。';
  function blankTask(id, name='新任务') {
    return {id,name,status:'idle',agents:[{id:'main',parentId:null,round:1,status:'idle'}],events:[],nextSeq:0,results:{},agentFilter:'main',subtaskHistoryExpanded:false,subtaskView:null,subtaskPositions:{},subtaskGroupExpanded:{},subtaskEventExpanded:{},subtaskFullText:{},groupExpanded:{},eventExpanded:{},fullText:{},input:'',reference:null,feedPositions:{},readerPositions:{},unseen:0};
  }
  function appendEvent(t, content, at=Date.now()) {
    const seq=++t.nextSeq;
    const e={id:`${t.id}-event-${seq}`,seq,at,round:content.round??t.agents.find(a=>a.id===content.agentId)?.round??1,...content};
    t.events.push(e);
    if(['tool','thinking','system'].includes(e.type)&&t.eventExpanded[e.id]===undefined)t.eventExpanded[e.id]=false;
    return e;
  }
  function addAgent(t, id, parentId='main', originCallId=null, round=1, status='running') {
    const a={id,parentId,originCallId,round,status}; t.agents.push(a); return a;
  }
  function toolEvent(t, agentId, name, args, output, extra={}) {
    const seq=t.nextSeq+1;
    return appendEvent(t,{type:'tool',agentId,callId:`call-${t.id}-${seq}`,name,arguments:args,status:'completed',updates:[],output,...extra});
  }
  function savedResult(t,id,title,kind,text,agentId,round,extra={}) {
    const r={id,title,kind,text,agentId,round,binding:'第一章 · 倒吊客',...extra};t.results[id]=r;
    appendEvent(t,{type:'artifact',agentId,round,resultId:id});return r;
  }
  function initial(mode) {
    const t=blankTask('task-main','重写第一章，保留核心设定');t.status='running';t.agents[0].status='running';
    const message=(agentId,text,extra={})=>appendEvent(t,{type:'message',agentId,text,...extra});
    const system=(agentId,text,extra={})=>appendEvent(t,{type:'system',agentId,text,...extra});
    message('main','保留万舟及已定核心设定，重写开篇。让我看到所有 Agent 的执行过程。',{role:'user'});
    system('main','agent_start · session=main · round=1');
    message('main','我会先读取作品资料，再安排这次写作。执行消息与工具调用都会留在这里。');
    appendEvent(t,{type:'thinking',agentId:'main',text:'先确认已保存资料的范围，再委派写作任务。',visibility:'readable'});
    toolEvent(t,'main','query_canon',{work_id:'work-night',chapter:'chapter-1',entities:['万舟']},{matches:[{entity:'万舟',fact:'尚不知道井壁刻痕的来源'}],revision:12});
    const spawn1=toolEvent(t,'main','spawn_subagent',{agent_id:'writer-1',task:'完成第一章初稿',context_revision:12},{agent_id:'writer-1',session:'writer-1'},{childId:'writer-1'});
    addAgent(t,'writer-1','main',spawn1.callId,1,'idle');
    system('writer-1','agent_start · session=writer-1 · round=1');
    message('writer-1','收到。我先读取本章资料和现有正文。');
    toolEvent(t,'writer-1','read',{path:'drafts/chapter-1.md',offset:1,limit:120},'1: # 倒吊客\n2: 万舟在雨声中醒来。\n3: 井口有人举着灯。');
    toolEvent(t,'writer-1','save_plan',{chapter_id:'chapter-1',content:'以井口争论推动开篇，不提前揭示刻痕来源。'},{saved:true,artifact_id:'plan1'});
    savedResult(t,'plan1','第一章 · 章节方案','plan','以井口人的争论推动开篇，万舟先观察，再试探。保留人物处境和身世伏线。','writer-1',1);
    toolEvent(t,'writer-1','edit',{path:'drafts/chapter-1.md',old_text:'井口有人举着灯。',new_text:'井口的人正在争论是否收走那盏灯。'},'Updated drafts/chapter-1.md\n1 replacement applied.\n');
    toolEvent(t,'writer-1','submit_draft',{chapter_id:'chapter-1',title:'倒吊客',content:oldProse},{saved:true,draft_id:'draft1',version:1});
    savedResult(t,'draft1','倒吊客 · 第 1 版','draft',oldProse,'writer-1',1,{version:1,canFinalize:true,review:'已有后续版本'});
    system('writer-1','agent_end · round=1 · stopReason=stop');
    message('main','去掉对刻痕来源的解释，只让万舟观察变化。',{role:'user'});
    toolEvent(t,'main','send_subagent',{agent_id:'writer-1',message:'去掉对刻痕来源的解释，只让万舟观察变化。'},{accepted:true,round:2},{childId:'writer-1'});
    t.agents.find(a=>a.id==='writer-1').round=2;
    system('writer-1','agent_start · session=writer-1 · round=2',{round:2});
    appendEvent(t,{type:'thinking',agentId:'writer-1',round:2,visibility:'redacted'});
    toolEvent(t,'writer-1','edit',{path:'drafts/chapter-1.md',old_text:'他忽然认出，那是母亲旧信里提到的归潮印。',new_text:''},'Updated drafts/chapter-1.md\nRemoved 1 paragraph.\n',{round:2});
    toolEvent(t,'writer-1','submit_draft',{chapter_id:'chapter-1',title:'倒吊客',content:prose},{saved:true,draft_id:'draft2',version:4},{round:2});
    savedResult(t,'draft2','倒吊客 · 第 2 版','draft',prose,'writer-1',2,{version:4,canFinalize:true,review:'检查报告已保存 · 尚未定稿'});
    system('writer-1','agent_end · round=2 · stopReason=stop',{round:2});
    const spawnReview=toolEvent(t,'main','spawn_subagent',{agent_id:'reviewer-1',task:'检查第 2 版正文',draft_id:'draft2'},{agent_id:'reviewer-1'},{childId:'reviewer-1'});
    addAgent(t,'reviewer-1','main',spawnReview.callId,1,'idle');
    toolEvent(t,'reviewer-1','read',{draft_id:'draft2'},prose);
    const review={draft_id:'draft2',checks:[{name:'人物认知',status:'passed',evidence:'万舟只观察变化，没有解释刻痕来源。'}],conclusion:'本次检查通过，是否定稿由作者决定。'};
    toolEvent(t,'reviewer-1','save_review',review,{saved:true,artifact_id:'review1'});
    savedResult(t,'review1','第 2 版 · 检查报告','review',raw(review),'reviewer-1',1);
    system('reviewer-1','agent_end · round=1 · stopReason=stop');
    const spawnResearch=toolEvent(t,'main','spawn_subagent',{agent_id:'research-1',task:'验证自定义工具返回',tools:['custom_probe']},{agent_id:'research-1'},{childId:'research-1'});
    addAgent(t,'research-1','main',spawnResearch.callId,1,'idle');
    toolEvent(t,'research-1','custom_probe',{target:'scene/old-well',flags:['echo','inspect'],limit:3},'probe: scene/old-well\n[stdout] found: lantern, rope, carved wall\n[stdout] custom payload retained verbatim\nexit_code=0');
    message('research-1','custom_probe 的原始输出已返回。');system('research-1','agent_end · round=1 · stopReason=stop');
    const notes=blankTask('task-notes','讨论第二章的相遇');appendEvent(notes,{type:'message',agentId:'main',role:'user',text:'先讨论第二章的相遇，不开始写。'});appendEvent(notes,{type:'message',agentId:'main',text:'这条任务独立保留。可以从相遇的目的开始。'});
    const other=blankTask('task-other','想一想故事里的雨城');appendEvent(other,{type:'message',agentId:'main',text:'这部作品的消息和执行记录单独保存。'});
    const data={version:4,recordView:'per-agent',scenario:mode,floatingOpen:false,workId:'work-night',taskId:t.id,reader:null,readerOrigin:null,connected:true,works:[{id:'work-night',name:'夜航记',tasks:[t,notes]},{id:'work-rain',name:'雨停之前',tasks:[other]}],activeRef:{workId:'work-night',taskId:t.id},job:null,sequence:5};
    if(mode==='empty') {t.name='新任务';t.events=[];t.nextSeq=0;t.eventExpanded={};t.results={};t.agents=[{id:'main',parentId:null,round:1,status:'idle'}];t.status='idle';data.activeRef=null;}
    else if(mode==='legacy') {t.events=[];t.nextSeq=0;t.agents.forEach(a=>a.status='idle');t.status='idle';system('main','历史记录只保存了消息与产物，工具调用及 thinking 明细不可用。');message('main','已找回第 2 版正文。');appendEvent(t,{type:'artifact',agentId:'writer-1',round:2,resultId:'draft2'});data.activeRef=null;}
    else if(mode==='sync') {
      t.results.draft2.finalized=true;
      system('main','artifact_finalized · draft_id=draft2 · version=2 · confirmed_by=author');
      const call=toolEvent(t,'main','spawn_subagent',{agent_id:'sync-1',task:'核对资料变化',draft_id:'draft2',change_set:'changes-01'},{agent_id:'sync-1'},{childId:'sync-1'});
      addAgent(t,'sync-1','main',call.callId);
      const check=toolEvent(t,'sync-1','read',{draft_id:'draft2',change_set:'changes-01'},'',{status:'running',updates:[{at:Date.now(),text:'[stdout] loaded draft2\n[stdout] comparing 3 changes…'}]});
      data.job={...data.activeRef,stage:0,nextAt:Date.now()+8000,steps:syncSteps(t,check.id,'sync-1')};
    } else if(mode==='preparing') {
      t.events=t.events.slice(0,4);t.nextSeq=4;t.results={};t.agents=t.agents.slice(0,1);
      const call=toolEvent(t,'main','query_canon',{work_id:'work-night',chapter:'chapter-1'},'',{status:'running',updates:[{at:Date.now(),text:'[stdout] opening canon revision 12…'}]});
      data.job={...data.activeRef,stage:0,nextAt:Date.now()+8000,steps:[[{op:'updateTool',eventId:call.id,status:'completed',output:{revision:12,matches:1}},{op:'event',event:{type:'message',agentId:'main',text:'资料已返回。可以继续提出写作要求。'}},{op:'finish',status:'idle'}]]};
    } else {
      const call=toolEvent(t,'main','spawn_subagent',{agent_id:'writer-2',task:'按修改要求重新组织开篇',source_draft:'draft2'},{agent_id:'writer-2'},{childId:'writer-2'});
      addAgent(t,'writer-2','main',call.callId);t.lastExecutionAgentId='writer-2';
      system('writer-2','agent_start · session=writer-2 · round=1');
      toolEvent(t,'writer-2','read',{path:'drafts/chapter-1.md'},prose);
      appendEvent(t,{type:'thinking',agentId:'writer-2',visibility:'readable',text:'保留既定人物信息，调整开篇动作的顺序。'});
      toolEvent(t,'main','get_subagents',{include_finished:true},{agents:t.agents.filter(a=>a.parentId).map(a=>({agent_id:a.id,status:a.status,round:a.round}))});
      if(mode==='history') for(let i=0;i<65;i++)toolEvent(t,i%2?'research-1':'main','custom_probe',{page:i+1,query:'scene/old-well'},Array.from({length:18},(_,n)=>`[stdout] record ${i+1}.${n+1}: retained source line; call details are available in full.`).join('\n'));
      const edit=toolEvent(t,'writer-2','edit',{path:'drafts/chapter-1.md',old_text:'万舟在雨声中醒来。',new_text:'井口的争执传进来时，万舟还闭着眼。'},'',{status:'running',updates:[{at:Date.now(),text:'[stdout] reading drafts/chapter-1.md\n[stdout] matching replacement target…'}]});
      data.job={...data.activeRef,stage:0,nextAt:Date.now()+8000,steps:writingSteps(t,edit.id,'writer-2',1)};
      if(mode==='failed') {edit.status='error';edit.error='ToolExecutionError: edit failed\nEIO: input/output error while writing drafts/chapter-1.md';edit.ended=Date.now();t.status='failed';t.agents.find(a=>a.id==='writer-2').status='failed';t.agents[0].status='failed';system('main','agent_end · stopReason=error · ToolExecutionError');data.activeRef=null;data.job=null;}
      if(mode==='interrupted') {edit.status='interrupted';t.status='interrupted';t.agents.filter(a=>a.status==='running').forEach(a=>a.status='interrupted');system('main','session_interrupted · application_exit · no final tool result received');data.activeRef=null;data.job=null;}
      if(mode==='no-result') {edit.status='completed';edit.output='No changes applied.';edit.ended=Date.now();t.status='idle';t.agents.filter(a=>a.status==='running').forEach(a=>a.status='idle');system('writer-2','agent_end · round=1 · stopReason=stop');message('main','本轮结束，没有保存新的产物。旧版本仍可读取。');data.activeRef=null;data.job=null;}
    }
    if(mode==='offline'){data.connected=false;data.reconnectAt=Date.now()+20000;}
    if(mode==='unavailable')t.results.draft2.broken=true;
    const start=Date.now()-t.events.length*1800;
    t.events.forEach((e,i)=>{e.at=start+i*1800;if(e.type==='tool'){e.started=e.at;if(e.status!=='running')e.ended=e.at+1200;e.updates.forEach((u,n)=>u.at=e.at+300+n*400);}});
    return data;
  }
  function writingSteps(t,editId,agentId,round) {
    const draftId=`draft-${t.id}-${round}-${t.nextSeq}`,callId=`submit-${draftId}`;
    return [
      [{op:'updateTool',eventId:editId,update:'[stdout] target matched\n[stdout] writing replacement…'}],
      [{op:'updateTool',eventId:editId,status:'completed',output:'Updated drafts/chapter-1.md\n1 replacement applied.\nexit_code=0'},{op:'event',event:{type:'tool',agentId,round,callId,name:'submit_draft',arguments:{chapter_id:'chapter-1',title:'倒吊客',content:prose},status:'running',updates:[],output:''}}],
      [{op:'updateTool',callId,status:'completed',output:{saved:true,draft_id:draftId,version:4}},{op:'result',result:{id:draftId,title:'倒吊客 · 第 3 版',kind:'draft',text:prose,agentId,round,binding:'第一章 · 倒吊客',version:4,canFinalize:true,review:'已保存 · 尚未定稿'}},{op:'event',event:{type:'message',agentId,round,text:'正文已通过 submit_draft 保存。'}},{op:'event',event:{type:'system',agentId,round,text:`agent_end · round=${round} · stopReason=stop`}},{op:'agentStatus',agentId,status:'idle'}],
      [{op:'event',event:{type:'tool',agentId:'main',round:t.agents[0].round,callId:`get-${draftId}`,name:'get_subagents',arguments:{agent_ids:[agentId]},status:'completed',updates:[],output:{agent_id:agentId,status:'idle',artifact_id:draftId}}},{op:'event',event:{type:'message',agentId:'main',text:'本轮执行已经结束。你可以打开保存的正文，继续提意见或明确选择定稿。'}},{op:'event',event:{type:'system',agentId:'main',text:'agent_end · stopReason=stop'}},{op:'finish',status:'idle'}]
    ];
  }
  function syncSteps(t,eventId,agentId) {
    const resultId=`check-${t.id}-${t.nextSeq}`,callId=`save-${resultId}`;
    return [
      [{op:'updateTool',eventId,status:'completed',output:{draft_id:'draft2',change_set:'changes-01',changes:['人物状态','人物认知','章节进展']}},{op:'event',event:{type:'tool',agentId,round:1,callId,name:'save_review',arguments:{change_set:'changes-01',checks:[{item:'人物认知',status:'passed'}]},status:'running',updates:[{at:Date.now(),text:'[stdout] validating change references…'}],output:''}}],
      [{op:'updateTool',callId,status:'completed',output:{saved:true,review_id:resultId}},{op:'result',result:{id:resultId,title:'资料变化核对记录',kind:'review',agentId,round:1,binding:'定稿第 2 版 · changes-01',text:'3 项核对通过。\n\n人物状态：万舟被困在井中。\n人物认知：看见刻痕变化，尚不知道来源。\n章节进展：开篇从万舟醒来开始。\n\n此报告是核对产物，资料应用由 Main 后续处理。'}},{op:'event',event:{type:'system',agentId,text:'agent_end · stopReason=stop'}},{op:'agentStatus',agentId,status:'idle'}],
      [{op:'event',event:{type:'tool',agentId:'main',callId:`apply-${resultId}`,name:'apply_canon_changes',arguments:{change_set:'changes-01',review_id:resultId},status:'completed',updates:[],output:{applied:3,revision:13}}},{op:'event',event:{type:'message',agentId:'main',text:'核对报告已保存，资料变化也已应用。所有工具返回都保留在本次执行中。'}},{op:'finish',status:'idle'}]
    ];
  }
  let state;
  try {const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');state=saved?.version===4&&saved.scenario===scenario&&query.get('fresh')!=='1'?saved:initial(scenario);} catch {state=initial(scenario);}
  if(state.recordView!=='per-agent') {
    for(const w of state.works)for(const t of w.tasks){t.agentFilter='main';t.unseen=0;}
    state.recordView='per-agent';
  }
  state.floatingOpen=false;
  const modKey=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘':'Ctrl ';
  let toastTimer,opener=null,readerOpenerKey=null,lastScope=null,lastFloatingScope=null,drawerOpen=false,worksOpen=false,tasksOpen=false;
  const compact=()=>matchMedia('(max-width:780px)').matches;
  const work=()=>state.works.find(w=>w.id===state.workId);
  const task=()=>work().tasks.find(t=>t.id===state.taskId);
  const taskAt=ref=>ref&&state.works.find(w=>w.id===ref.workId)?.tasks.find(t=>t.id===ref.taskId);
  const elsewhere=()=>!!state.activeRef&&(state.activeRef.workId!==state.workId||state.activeRef.taskId!==state.taskId);
  const scope=()=>`${state.workId}/${state.taskId}/${task().agentFilter}`;
  const save=()=>{try{sessionStorage.setItem(storageKey,JSON.stringify(state));}catch{}};
  const html=(id,value)=>{if($(id).innerHTML!==value)$(id).innerHTML=value;};
  const agentName=id=>id==='main'?'Main / main':`Sub / ${id}`;
  function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
  function textBlock(t,key,value,cls='raw-content') {
    const text=raw(value===undefined?'':value),long=text.length>680,expanded=!!t.fullText[key];
    return `<pre class="${cls} ${long&&!expanded?'content-preview':''}">${esc(long&&!expanded?text.slice(0,680)+'\n…':text)}</pre>${long?`<button class="quiet full-text" data-action="full-text" data-content-key="${esc(key)}" data-focus="text-${esc(key)}" aria-expanded="${expanded}">${expanded?'收起长文本':`展开全文 · ${text.length.toLocaleString()} 字符`}</button>`:''}`;
  }
  const isDispatch=e=>e.type==='tool'&&!!e.childId;
  function processGroups(t,agentId='main') {
    const items=[];
    // Each Agent has its own stream; other Agents' events are never inserted here.
    for(const e of t.events.filter(e=>e.agentId===agentId)) {
      if(['thinking','tool'].includes(e.type)&&!isDispatch(e)) {
        const previous=items.at(-1),execution=e.executionId??e.runId??null;
        if(previous?.type==='process-group'&&previous.agentId===e.agentId&&previous.round===(e.round||1)&&previous.execution===execution)previous.events.push(e);
        else items.push({type:'process-group',id:`process-${e.id}`,agentId:e.agentId,round:e.round||1,execution,events:[e]});
      } else items.push(e);
    }
    return items;
  }
  function recordIdentity(e,t) {
    const a=t.agents.find(a=>a.id===e.agentId),isUser=e.role==='user';
    const parent=a?.parentId?` · 由 ${agentName(a.parentId)} 派生`:'';
    return `${work().name} / ${t.name} / ${isUser?'你 → Main':agentName(e.agentId)} / 第 ${e.round||1} 轮 / ${new Date(e.at).toLocaleDateString('zh-CN')} ${clock(e.at)}${parent}`;
  }
  function renderFlow(items,t,options={}) {
    // In the Main stream, the first Agent reply after an author message carries a small identity mark.
    let needsMark=true;
    return items.map(item=>{
      if(item.type==='process-group')return renderGroup(item,t);
      const mark=options.marks&&needsMark&&item.type==='message'&&item.role!=='user';
      if(item.type==='message')needsMark=item.role==='user'||(needsMark&&!mark);
      return renderEvent(item,t,false,{mark});
    }).join('');
  }
  function toolStatus(e) {
    const status=e.error?'error':e.status;
    return `<span class="tool-state status-${esc(status)}">${status==='running'?'<i class="streaming-dot"></i>':''}${esc(toolStates[status]||status||'状态未知')}${!state.connected&&status==='running'?' · 最后已知':''}</span>`;
  }
  function thinkingLabel(e) {
    const explicit=e.durationMs??e.duration_ms;
    const measured=Number.isFinite(e.started)&&Number.isFinite(e.ended)&&e.ended>=e.started?e.ended-e.started:null;
    const ms=Number.isFinite(explicit)&&explicit>=0?explicit:measured;
    return ms===null?'思考':`思考 ${Number((ms/1000).toFixed(1))} 秒`;
  }
  function toolActivity(e) {
    const name=String(e.name||'unknown_tool'),kind=name.toLowerCase(),completed=e.status==='completed'&&!e.error,a=e.arguments&&typeof e.arguments==='object'?e.arguments:{};
    const scalar=keys=>keys.map(key=>a[key]).find(value=>typeof value==='string'&&value.trim());
    const path=scalar(['path','file_path','filePath']);
    const paths=path?[path]:Array.isArray(a.paths)?a.paths.filter(p=>typeof p==='string'&&p.trim()):[];
    const unique=[...new Set(paths)];
    const make=(kind,verb,target,extra={})=>({kind,verb,target,label:`${verb} ${target}`,...extra});
    if(['read','read_file','readfile','read_files'].includes(kind)&&unique.length)return make('read','Read',unique.join(', '),{paths:unique});
    if(['edit','edit_file','editfile'].includes(kind)&&unique.length)return make('edit',completed?'Edited':'Edit',unique.join(', '),{paths:unique});
    if(['write','write_file','writefile','write_files'].includes(kind)&&unique.length)return make('write',completed?'Wrote':'Write',unique.join(', '),{paths:unique});
    const pattern=scalar(['pattern','query','glob']);
    if(['grep','glob','search','search_files','find_files','ripgrep'].includes(kind)&&pattern)return make('search',completed?'Searched':'Search',`${pattern}${path?' in '+path:''}`);
    const command=scalar(['command','cmd']);
    if(['bash','shell','exec_command','run_command','terminal','exec'].includes(kind)&&command)return make('command',completed?'Ran':'Run',command);
    return {kind:'generic',name,verb:'',target:name,label:name};
  }
  function activitySummary(events) {
    const tools=events.filter(e=>e.type==='tool'),thoughts=events.filter(e=>e.type==='thinking');
    if(!tools.length)return thoughts.length===1?thinkingLabel(thoughts[0]):'思考';
    const buckets=new Map();
    for(const e of tools){const activity=toolActivity(e),key=activity.kind==='generic'?`tool:${activity.name}`:activity.kind;
      if(!buckets.has(key))buckets.set(key,{kind:activity.kind,name:activity.name,paths:new Set(),count:0,complete:true});
      const bucket=buckets.get(key);bucket.count++;bucket.complete=bucket.complete&&e.status==='completed'&&!e.error;(activity.paths||[]).forEach(path=>bucket.paths.add(path));
    }
    const parts=[...buckets.values()].map(b=>{
      const past=b.complete?'了':'';
      if(['read','edit','write'].includes(b.kind))return `${{read:'读取',edit:'修改',write:'写入'}[b.kind]}${past} ${b.paths.size} 个文件`;
      if(b.kind==='search')return `搜索${past} ${b.count} 次`;
      if(b.kind==='command')return `运行${past} ${b.count} 条命令`;
      return `调用${past} ${b.name}${b.count>1?' '+b.count+' 次':''}`;
    });
    return parts.join('，');
  }
  function renderTool(e,t) {
    const open=!!t.eventExpanded[e.id],activity=toolActivity(e),dispatch=isDispatch(e);
    const label=dispatch?`<code>${esc(e.name)}</code>`:activity.verb?`<span class="activity-verb">${esc(activity.verb)}</span> <code>${esc(activity.target)}</code>`:`<code>${esc(activity.target)}</code>`;
    const glyph=dispatch?'tool':activity.kind==='generic'?'tool':activity.kind;
    const meta=[`<code>${esc(e.name||'unknown_tool')}</code>`,`<span>${esc(e.callId)}</span>`,`<span>${esc(agentName(e.agentId))}</span>`,`<span>第 ${e.round||1} 轮</span>`,e.ended?`<span>${clock(e.started||e.at)} → ${clock(e.ended)}</span>`:''].filter(Boolean).join('');
    return `<div class="tool-call ${dispatch?'dispatch-tool':'activity-tool'} kind-${esc(activity.kind)}"><button class="tool-head" data-action="toggle-event" data-event-id="${esc(e.id)}" data-focus="tool-${esc(e.id)}" aria-expanded="${open}" title="${esc(e.name||'unknown_tool')}">${svg(glyph,'row-icon')}<span class="activity-label">${label}</span>${svg('down','chevron')}${dispatch||e.status!=='completed'||e.error?toolStatus(e):''}</button>${open?`<div class="tool-details"><div class="call-meta">${meta}${toolStatus(e)}</div><div class="payload-label">参数</div>${textBlock(t,e.id+':args',e.arguments)}${e.updates?.length?`<div class="tool-output-title">执行中输出 · ${e.updates.length} 次更新</div>${textBlock(t,e.id+':updates',e.updates.map(u=>`[${clock(u.at)}]\n${u.text}`).join('\n'))}`:''}${e.status!=='running'&&e.output!==undefined&&e.output!==''?`<div class="tool-output-title">最终输出</div>${textBlock(t,e.id+':output',e.output)}`:e.status==='completed'?`<div class="tool-output-title">最终输出</div><div class="call-meta">${e.output===''?'最终输出为空':'最终输出未保存在记录中'}</div>`:''}${e.error?`<div class="tool-output-title tool-error">错误原文</div>${textBlock(t,e.id+':error',e.error,'raw-content tool-error')}`:''}${['stopped','interrupted'].includes(e.status)?'<div class="call-meta">未收到最终返回 · 参数与已有执行中输出保留</div>':''}${e.status==='running'&&!e.updates?.length?'<div class="call-meta">等待工具返回输出</div>':''}</div>`:''}</div>`;
  }
  function dispatchTarget(e) {
    const args=e?.arguments;
    if(!args||typeof args!=='object')return null;
    for(const key of ['task','message','instruction','prompt','goal'])if(typeof args[key]==='string'&&args[key].trim())return args[key];
    return null;
  }
  function subagents(t) {
    const ids=new Set([...t.agents.filter(a=>a.parentId).map(a=>a.id),...t.events.filter(isDispatch).map(e=>e.childId),...t.events.filter(e=>e.agentId&&e.agentId!=='main').map(e=>e.agentId)]);
    return [...ids].map(id=>{
      const agent=t.agents.find(a=>a.id===id),dispatches=t.events.filter(e=>isDispatch(e)&&e.childId===id),latest=dispatches.at(-1);
      return {id,agent,latest,target:dispatchTarget(latest),count:Object.values(t.results).filter(r=>r.agentId===id).length,lastSeq:latest?.seq??t.events.find(e=>e.agentId===id)?.seq??0};
    }).sort((a,b)=>Number(b.agent?.status==='running')-Number(a.agent?.status==='running')||b.lastSeq-a.lastSeq);
  }
  function subStatus(sub) {
    const status=sub.agent?.status||'unknown',label=agentStates[status]||'状态未知';
    return `<span class="sub-status status-${esc(status)}">${status==='running'?'<i class="streaming-dot"></i>':''}${esc(label)}${!state.connected?' · 最后已知':''}</span>`;
  }
  function renderDispatch(e,t) {
    const sub=subagents(t).find(a=>a.id===e.childId),name=e.arguments?.agent_name||e.arguments?.name||e.childId,open=!!t.eventExpanded[e.id];
    const status=sub?.agent?.status||'unknown';
    return `<section class="dispatch-card status-${esc(status)}" data-child-id="${esc(e.childId)}"><div class="dispatch-row"><button class="dispatch-link" data-action="open-subtask" data-agent-id="${esc(e.childId)}" data-focus="child-${esc(e.id)}" title="打开 ${esc(name)} 的子任务详情"><span class="agent-tile">${svg('subagent')}</span><span class="dispatch-kind">${e.name==='send_subagent'?'继续子任务':'派发子任务'}</span><span class="dispatch-name">${esc(name)}</span>${subStatus(sub)}<span class="dispatch-open">查看${svg('right')}</span></button><button class="dispatch-raw" data-action="toggle-event" data-event-id="${esc(e.id)}" data-focus="dispatch-${esc(e.id)}" aria-label="查看派发调用" title="查看派发调用" aria-expanded="${open}">${svg('down')}</button></div>${open?renderTool(e,t):''}</section>`;
  }
  function systemLabel(e) {
    const text=String(e.text||'system'),type=text.split(' · ')[0],round=text.match(/round=(\d+)/)?.[1],reason=text.match(/stopReason=([^ ·]+)/)?.[1];
    const r=round?` · 第 ${round} 轮`:'';
    if(type==='agent_start')return {label:`开始执行${r}`,tone:'neutral'};
    if(type==='agent_end'){
      if(reason==='stop')return {label:`本轮结束${r}`,tone:'neutral'};
      if(reason==='aborted')return {label:`已停止${r}`,tone:'warn'};
      if(reason==='error')return {label:`出错结束${r}${text.includes('ToolExecutionError')?' · ToolExecutionError':''}`,tone:'danger'};
      return {label:`结束${r}${reason?' · '+reason:''}`,tone:'neutral'};
    }
    if(type==='stop_requested')return {label:'已请求停止 · 等待进行中的调用结束',tone:'warn'};
    if(type==='session_interrupted')return {label:'执行中断 · 未收到最终返回',tone:'warn'};
    if(type==='artifact_finalized')return {label:'作者已定稿',tone:'done'};
    return {label:type,tone:'neutral'};
  }
  function renderEvent(e,t,nested=false,options={}) {
    const open=!!t.eventExpanded[e.id];let body;
    if(e.type==='message')body=textBlock(t,e.id,e.text,'message-content');
    else if(e.type==='thinking')body=`<div class="thinking-call"><button class="thinking-head" data-action="toggle-event" data-event-id="${esc(e.id)}" data-focus="thinking-${esc(e.id)}" aria-expanded="${open}">${svg('thinking','row-icon')}<span class="activity-label">${esc(thinkingLabel(e))}</span>${svg('down','chevron')}${e.visibility==='redacted'?'<small>内容不可读</small>':''}</button>${open?`<div class="thinking-details">${e.visibility==='redacted'?'<div class="redacted-note">此条内容不可读，没有可显示的文本。</div>':textBlock(t,e.id,e.text,'thinking-content')}</div>`:''}</div>`;
    else if(e.type==='tool')body=isDispatch(e)?renderDispatch(e,t):renderTool(e,t);
    else if(e.type==='system') {
      const sys=systemLabel(e);
      body=`<div class="system-content tone-${sys.tone}"><button class="system-head" data-action="toggle-event" data-event-id="${esc(e.id)}" data-focus="system-${esc(e.id)}" aria-expanded="${open}" title="${esc(e.text)}"><span class="system-rule"></span><span class="system-label">${esc(sys.label)}</span>${svg('down','chevron')}<span class="system-rule"></span></button>${open?`<div class="system-raw"><div class="call-meta"><span>${esc(recordIdentity(e,t))}</span></div>${textBlock(t,e.id,e.text,'system-text')}</div>`:''}</div>`;
    } else if(e.type==='artifact') {
      const r=t.results[e.resultId],kind=r?.kind||'unknown',kindLabel={draft:'正文',plan:'章节方案',review:'检查报告'}[kind]||kind;
      const badge=r?.broken?'<span class="badge failed">暂时无法读取</span>':r?.finalized?'<span class="badge done">作者已定稿</span>':'<span class="badge">已保存 · 未定稿</span>';
      body=`<button class="artifact-link kind-${esc(kind)}" data-result="${esc(e.resultId)}" data-focus="result-${esc(e.resultId)}"><span class="artifact-tile">${svg(kind==='plan'?'plan':kind==='review'?'review':'doc')}</span><span class="artifact-text"><small class="artifact-kind">${esc(kindLabel)} · <code>${esc(e.resultId)}</code></small><strong>${esc(r?.title||'已保存产物')}</strong></span>${badge}<span class="artifact-open">阅读${svg('right')}</span></button>`;
    } else body=`<div class="payload-label">${esc(e.type||'unknown_event')}</div>${textBlock(t,e.id,e)}`;
    const mark=options.mark&&e.type==='message'&&e.role!=='user'?`<div class="agent-mark"><span class="agent-glyph">N</span><span>${e.agentId==='main'?'Main':esc(e.agentId)}</span></div>`:'';
    return `<article class="event-item type-${esc(['message','thinking','tool','system','artifact'].includes(e.type)?e.type:'unknown')} ${isDispatch(e)?'type-dispatch':''} ${e.role==='user'?'is-user':''} ${nested?'group-event':''}" data-event-id="${esc(e.id)}" data-agent="${esc(e.agentId)}" data-scroll-key="${esc(e.id)}" title="${esc(recordIdentity(e,t))}">${mark}<div class="event-body">${body}</div></article>`;
  }
  function renderGroup(group,t) {
    const open=!!t.groupExpanded[group.id],tools=group.events.filter(e=>e.type==='tool');
    const states=[['error','报错'],['interrupted','已中断'],['stopped','已停止'],['running','执行中']].filter(([status])=>tools.some(e=>(e.error?'error':e.status)===status));
    if(tools.some(e=>!['completed','error','interrupted','stopped','running'].includes(e.status)))states.push(['unknown','状态未知']);
    const summary=activitySummary(group.events);
    return `<section class="process-group" data-group-id="${esc(group.id)}" data-agent="${esc(group.agentId)}" data-scroll-key="${esc(group.id)}" title="${esc(recordIdentity(group.events[0],t))}"><button class="process-head" data-action="toggle-group" data-group-id="${esc(group.id)}" data-focus="group-${esc(group.id)}" aria-expanded="${open}">${svg(tools.length?'layers':'thinking','row-icon')}<span class="process-summary" title="${esc(summary)}">${esc(summary)}</span>${group.events.length>1?`<span class="process-count">${group.events.length} 步</span>`:''}${svg('down','chevron')}${states.length?`<span class="process-states">${states.map(([status,label])=>`<span class="tool-state status-${status}">${status==='running'?'<i class="streaming-dot"></i>':''}${label}${status==='running'&&!state.connected?' · 最后已知':''}</span>`).join('')}</span>`:''}</button>${open?`<div class="process-details">${group.events.map(e=>renderEvent(e,t,true)).join('')}</div>`:''}</section>`;
  }
  function floatingTask(t){return {...t,groupExpanded:t.subtaskGroupExpanded,eventExpanded:t.subtaskEventExpanded,fullText:t.subtaskFullText};}
  function latestAction(t,id) {
    const e=t.events.filter(e=>e.agentId===id&&(e.type==='tool'||e.type==='message')).at(-1);
    if(!e)return '<span class="subtask-latest">尚无过程记录</span>';
    return e.type==='tool'?`<span class="subtask-latest">最近调用 <code>${esc(e.name||'unknown_tool')}</code> · ${esc(toolStates[e.error?'error':e.status]||e.status||'状态未知')}</span>`:`<span class="subtask-latest" title="${esc(e.text)}">最近消息 · ${esc(e.text)}</span>`;
  }
  function floatingRow(sub,t) {
    return `<button class="subtask-option status-${esc(sub.agent?.status||'unknown')} ${t.subtaskView===sub.id?'selected':''}" data-action="open-subtask" data-agent-id="${esc(sub.id)}" data-focus="sub-option-${esc(sub.id)}"><span class="agent-tile">${svg('subagent')}</span><span class="subtask-row-content"><strong class="subtask-target">${sub.target?esc(sub.target):'记录未提供目标文本'}</strong><span class="subtask-row-meta"><code>${esc(sub.id)}</code>${sub.agent?.round?`<span>第 ${sub.agent.round} 轮</span>`:''}<span>${sub.count} 份产物</span></span>${latestAction(t,sub.id)}</span><span class="subtask-option-end">${subStatus(sub)}${svg('right','chevron')}</span></button>`;
  }
  function renderSubtasks(t) {
    const subs=subagents(t),running=subs.filter(s=>s.agent?.status==='running').length,failed=subs.filter(s=>s.agent?.status==='failed').length;
    const label=running?`${state.connected?'':'最后已知 '}${running} 个进行中`:failed?`${failed} 个失败`:subs.length?`${subs.length} 个子任务`:'子任务';
    html('subtask-capsule',`${svg('subagent')}<span>${esc(label)}</span>${running?'<i class="streaming-dot"></i>':''}${svg('down','chevron')}`);
    $('subtask-capsule').dataset.tone=running?'running':failed?'failed':subs.length?'idle':'empty';
    $('subtask-capsule').setAttribute('aria-expanded',String(state.floatingOpen));
    $('subtask-float').hidden=!state.floatingOpen;
    if(!state.floatingOpen)return;
    const selected=t.subtaskView,sub=subs.find(s=>s.id===selected),key=selected||'list',floatingScope=`${state.workId}/${t.id}/${key}`,list=$('subtask-float-list');
    const scroll=lastFloatingScope===floatingScope?list.scrollTop:t.subtaskPositions[key]||0;
    $('subtask-float').dataset.view=selected?'detail':'list';$('floating-back').hidden=!selected;
    html('floating-status',selected?`<strong>${esc(selected)}</strong>${subStatus(sub||{id:selected})}`:`<strong>子任务</strong><span class="float-count">${subs.length}</span>`);
    $('floating-task').textContent=selected?(sub?.target||'记录未提供目标文本'):`${t.name} · ${state.connected?(t.events.length?taskStates[t.status]:'尚未开始'):'连接断开 · 最后已知记录'}`;$('floating-task').title=`${work().name} / ${t.name} / ${t.id}${selected?' / '+selected:''}`;
    if(selected) {
      const detailTask=floatingTask(t);
      const requests=t.events.filter(e=>isDispatch(e)&&e.childId===selected).map(e=>{
        const target=dispatchTarget(e);
        return `<article class="parent-request" data-event-id="${esc(e.id)}" data-scroll-key="request-${esc(e.id)}"><span class="parent-request-label"><span class="agent-glyph">N</span>${e.agentId==='main'?'Main':esc(agentName(e.agentId))} ${e.name==='send_subagent'?'补充的要求':'派发的要求'}</span>${target?textBlock(detailTask,e.id+':target',target,'dispatch-text'):'<p class="target-unavailable">派发记录未提供目标文本</p>'}${renderTool(e,detailTask)}</article>`;
      }).join('');
      const content=renderFlow(processGroups(t,selected),detailTask);
      html('subtask-float-list',`<div class="floating-detail">${(`${requests?`<section class="parent-context" aria-label="派发要求">${requests}</section>`:''}<div class="agent-records" data-agent="${esc(selected)}">${content||'<p class="subtask-empty">这个子任务尚无已保存的过程记录。</p>'}</div>`).replaceAll('data-focus="','data-focus="floating-')}</div>`);
    } else {
      let primary=subs.filter(s=>!['idle','stopped','retired'].includes(s.agent?.status));
      if(!primary.length&&subs.length)primary=[subs[0]];
      const history=subs.filter(s=>!primary.includes(s));
      html('subtask-float-list',subs.length?`<div class="subtask-section-label">${primary.some(s=>s.agent?.status==='running')?'进行中':'最近'}</div>`+primary.map(sub=>floatingRow(sub,t)).join('')+(history.length?`<button class="subtask-history-toggle" data-action="toggle-subtask-history" data-focus="subtask-history" aria-expanded="${!!t.subtaskHistoryExpanded}"><span>此前的子任务</span><span class="float-count">${history.length}</span>${svg('down','chevron')}</button>${t.subtaskHistoryExpanded?`<div class="subtask-history">${history.map(sub=>floatingRow(sub,t)).join('')}</div>`:''}`:''):'<p class="subtask-empty">本任务尚未安排子任务。</p>');
    }
    list.scrollTop=scroll;lastFloatingScope=floatingScope;updateComposerMeta();
    positionFloating();
  }
  function positionFloating() {
    if(!state.floatingOpen)return;
    const available=Math.max(100,$('subtask-capsule').getBoundingClientRect().top-12);
    $('subtask-float').style.setProperty('--floating-height',`${available}px`);
  }
  function closeFloating(returnFocus=false) {
    if(!state.floatingOpen)return;
    const hadFocus=$('subtask-anchor').contains(document.activeElement);
    rememberFloating();lastFloatingScope=null;state.floatingOpen=false;$('subtask-float').hidden=true;$('subtask-capsule').setAttribute('aria-expanded','false');updateComposerMeta();save();
    if(returnFocus&&hadFocus)$('subtask-capsule').focus({preventScroll:true});
  }
  function rememberFloating(){if(state.floatingOpen)task().subtaskPositions[task().subtaskView||'list']=$('subtask-float-list').scrollTop;}
  function openSubtask(id){if(id==='main')return;rememberFloating();task().subtaskView=id;state.floatingOpen=true;renderSubtasks(task());save();$('floating-back').focus({preventScroll:true});}
  function backSubtasks(){rememberFloating();task().subtaskView=null;renderSubtasks(task());save();$('subtask-capsule').focus({preventScroll:true});}
  function updateComposerMeta(){const t=task();$('composer-meta').textContent=!state.connected?'等待重连，输入会保留':elsewhere()?'另一条任务正在执行；输入会保留':state.floatingOpen&&t.subtaskView?`发送给 Main · 正在查看 ${t.subtaskView}`:'发送给 Main';}
  function toggleFloating() {
    if(state.floatingOpen){closeFloating(true);return;}
    state.floatingOpen=true;renderSubtasks(task());save();
  }
  function render(options={}) {
    const t=task(),feed=$('feed'),same=lastScope===scope(),top=feed.getBoundingClientRect().top;
    const anchor=same?[...feed.querySelectorAll('[data-scroll-key]')].find(el=>el.getBoundingClientRect().bottom>top):null;
    const anchorData=anchor?{id:anchor.dataset.scrollKey,y:anchor.getBoundingClientRect().top}:null;
    const previousScroll=feed.scrollTop,readerScroll=$('reader-scroll').scrollTop,focus=document.activeElement?.dataset?.focus;
    $('task-title').textContent=t.name;
    html('task-status',`${state.connected&&t.status==='running'&&t.events.length?'<i class="streaming-dot"></i>':'<i class="dot"></i>'}${esc(state.connected?(t.events.length?taskStates[t.status]:'可以开始对话'):'连接断开 · 显示最后已知记录')}`);
    $('task-status').dataset.tone=!state.connected?'offline':!t.events.length?'idle':t.status;
    renderSidebar(t);renderSubtasks(t);
    html('connection',`<span class="slot"><i class="dot ${state.connected?'':'offline'}"></i></span><span class="fade">${state.connected?'本机已连接':'连接已断开'}</span>`);$('connection').dataset.tip=state.connected?'本机已连接':'连接已断开';
    $('connection-notice').hidden=state.connected;html('connection-notice','<span>连接已断开，最新执行状态尚未确认。已加载的消息、调用与产物仍可阅读。</span><button class="quiet" data-action="reconnect">重试连接</button>');
    $('active-notice').hidden=!elsewhere();
    if(elsewhere())html('active-notice',`<span>${esc(state.works.find(w=>w.id===state.activeRef.workId)?.name)} · 「${esc(taskAt(state.activeRef)?.name)}」仍在执行。</span><button class="quiet" data-action="return-active">返回执行任务 ${svg('arrow')}</button><button class="quiet" data-action="stop-active" ${!state.connected?'disabled':''}>停止该任务</button>`);
    const items=processGroups(t);
    html('event-list',items.length?renderFlow(items,t,{marks:true}):'<div class="empty-flow"><div class="empty-page" aria-hidden="true"><i></i><i></i><i></i></div><h2>下一页，从这里开始。</h2><p>发给 Main 的要求和 Main 的消息、工具调用会保留在这里。派发子任务后，可从输入框上方查看各自的过程。</p></div>');
    const failedCall=t.events.findLast(e=>e.type==='tool'&&e.error),failedSub=failedCall&&failedCall.agentId!=='main'?failedCall.agentId:null;
    const notice=t.status==='failed'?`执行已失败。错误原文保留在${failedSub?'子任务详情':'Main 的对应调用'}中；先前保存的产物仍可打开。`:t.status==='interrupted'?'程序退出时仍有执行未结束。缺少最终返回的调用已标为中断，历史记录保留。':t.status==='stopped'?'本任务已停止，消息、工具输出和产物保留。':'';
    $('task-notice').hidden=!notice;$('task-notice').dataset.tone=t.status;html('task-notice',`${svg(t.status==='failed'?'alert':t.status==='stopped'?'stop':'pause')}<span>${esc(notice)}</span>${t.status==='failed'&&failedSub?` <button class="quiet" data-action="open-subtask" data-agent-id="${esc(failedSub)}" data-focus="failure-${esc(failedSub)}">查看失败子任务 ${svg('arrow')}</button>`:''}`);
    $('new-events').hidden=!t.unseen;$('new-events').textContent=`有 ${t.unseen} 次更新 · 查看最新`;
    if($('message').value!==t.input)$('message').value=t.input;
    const locked=!state.connected||elsewhere()||t.status==='stopping';
    $('send').disabled=locked||!t.input.trim();$('stop').hidden=!state.activeRef||elsewhere();$('stop').disabled=!state.connected||t.status==='stopping';
    $('continue').hidden=!['failed','stopped','interrupted'].includes(t.status);$('continue').disabled=locked||!!state.activeRef;
    updateComposerMeta();
    $('reference').hidden=!t.reference;
    if(t.reference)html('reference',`<span>针对 ${esc(t.results[t.reference]?.title||t.reference)} 提出意见</span><button class="quiet" data-action="clear-reference" aria-label="取消产物引用">×</button>`);
    renderReader(t);$('reader-scroll').scrollTop=readerScroll;
    if(options.bottom)feed.scrollTop=feed.scrollHeight;
    else if(!same)feed.scrollTop=t.feedPositions[t.agentFilter]??feed.scrollHeight;
    else {feed.scrollTop=previousScroll;if(anchorData){const next=feed.querySelector(`[data-scroll-key="${CSS.escape(anchorData.id)}"]`);if(next)feed.scrollTop+=next.getBoundingClientRect().top-anchorData.y;}}
    lastScope=scope();
    if(focus)document.querySelector(`[data-focus="${CSS.escape(focus)}"]`)?.focus({preventScroll:true});
    positionFloating();save();
  }
  function renderSidebar(t) {
    const w=work(),desktop=!compact(),collapsed=desktop?!!state.sidebarCollapsed:!drawerOpen,rail=desktop&&collapsed,root=$('noya');
    root.classList.toggle('sidebar-collapsed',collapsed);root.classList.toggle('drawer-open',!desktop&&drawerOpen);$('sidebar').dataset.mode=rail?'rail':'full';
    const toggle=document.querySelector('.sidebar-toggle'),label=desktop?'收起侧边栏':'关闭侧边栏';
    toggle.tabIndex=rail?-1:0;toggle.setAttribute('aria-hidden',String(rail));toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',label);toggle.dataset.tip=label;toggle.dataset.kbd=desktop?`${modKey}\\`:'';
    $('brand-slot').tabIndex=rail?0:-1;$('brand-slot').setAttribute('aria-hidden',String(!rail));$('brand-slot').dataset.kbd=`${modKey}\\`;
    $('work-cover').textContent=w.name.slice(0,1);$('work-name').textContent=w.name;$('work-meta').textContent=`${w.tasks.length} 个写作任务`;$('crumb-work').textContent=w.name;
    $('work-picker').dataset.tipSub=w.name;$('work-picker').setAttribute('aria-label',`切换作品，当前 ${w.name}`);$('work-picker').setAttribute('aria-expanded',String(worksOpen));
    html('work-list',`<div class="work-list-label">${rail?esc(w.name)+' · ':''}切换作品</div>`+state.works.map(x=>{const live=state.activeRef?.workId===x.id;return `<button class="work-option ${x.id===w.id?'selected':''}" role="option" aria-selected="${x.id===w.id}" data-work="${esc(x.id)}" data-focus="work-${esc(x.id)}"><span class="work-cover">${esc(x.name.slice(0,1))}</span><span class="work-text"><strong>${esc(x.name)}</strong><small>${x.tasks.length} 个写作任务${live?' · 执行中':''}</small></span>${x.id===w.id?svg('check'):''}</button>`;}).join(''));
    const list=$('work-list'),picker=$('work-picker');list.hidden=!worksOpen;list.dataset.placement=rail?'side':'below';
    if(worksOpen){list.style.top=`${rail?picker.offsetTop-6:picker.offsetTop+picker.offsetHeight+6}px`;list.style.left=rail?'calc(100% + 8px)':`${picker.offsetLeft}px`;}
    $('task-count').textContent=w.tasks.length;
    const running=w.tasks.some(x=>state.connected&&state.activeRef?.workId===w.id&&state.activeRef?.taskId===x.id&&x.status==='running'),failed=w.tasks.some(x=>x.status==='failed');
    $('task-badge').dataset.tone=running?'running':failed?'failed':'';
    const sw=$('task-switch');if(!rail)tasksOpen=false;sw.tabIndex=rail?0:-1;sw.setAttribute('aria-hidden',String(!rail));sw.setAttribute('aria-expanded',String(tasksOpen));sw.setAttribute('aria-label',`写作任务，当前 ${t.name}`);sw.dataset.tipSub=`${w.tasks.length} 个 · 当前「${t.name}」`;
    const fly=$('task-flyout');fly.hidden=!tasksOpen;fly.dataset.placement='side';
    html('task-flyout',`<div class="work-list-label">${esc(w.name)} · 写作任务</div><div class="flyout-scroll">`+w.tasks.map(x=>{const current=x.id===state.taskId,live=state.connected&&state.activeRef?.workId===w.id&&state.activeRef?.taskId===x.id&&x.status==='running',tone=!state.connected?'offline':!x.events.length?'idle':x.status,status=x.events.length?taskShort[x.status]||x.status:'尚未开始';
      return `<button class="work-option task-option ${current?'selected':''}" role="option" aria-selected="${current}" data-task="${esc(x.id)}" data-tone="${tone}"><span class="task-option-dot">${live?'<i class="streaming-dot"></i>':'<i class="dot"></i>'}</span><span class="work-text"><strong>${esc(x.name)}</strong><small>${esc(status)}</small></span>${current?svg('check'):''}</button>`;}).join('')+`</div><div class="flyout-foot"><button class="work-option flyout-new" data-action="new-task" ${state.connected?'':'disabled'}>${svg('plus')}<span>新建任务</span></button></div>`);
    if(tasksOpen){fly.style.top=`${sw.offsetTop-6}px`;fly.style.left='calc(100% + 8px)';}
    html('task-list',w.tasks.map(x=>{const live=state.connected&&state.activeRef?.workId===w.id&&state.activeRef?.taskId===x.id,tone=!state.connected?'offline':!x.events.length?'idle':x.status,current=x.id===state.taskId,status=x.events.length?taskShort[x.status]||x.status:'尚未开始';
      return `<button class="side-item task-row ${current?'current':''}" data-task="${esc(x.id)}" data-focus="task-${esc(x.id)}" data-tone="${tone}" data-tip="${esc(x.name)}" data-tip-sub="${esc(status)}" ${current?'aria-current="page"':''}><span class="slot">${live&&x.status==='running'?'<i class="streaming-dot"></i>':'<i class="dot"></i>'}</span><span class="task-text fade"><strong>${esc(x.name)}</strong><small>${esc(status)}</small></span></button>`;}).join(''));
    $('new-task').disabled=!state.connected;$('new-task').dataset.tipSub=state.connected?'':'连接恢复后可用';
    if(tipTarget&&!tipTarget.isConnected)hideTip();
  }
  function toggleSidebar(){
    worksOpen=false;tasksOpen=false;hideTip();
    if(compact()){drawerOpen=!drawerOpen;render();document.querySelector(drawerOpen?'.sidebar-toggle':'.sidebar-open').focus({preventScroll:true});return;}
    const inside=$('sidebar').contains(document.activeElement);
    state.sidebarCollapsed=!state.sidebarCollapsed;render();
    if(inside)(state.sidebarCollapsed?$('brand-slot'):document.querySelector('.sidebar-toggle')).focus({preventScroll:true});
  }
  function openSidebar(){if(compact())drawerOpen=true;else state.sidebarCollapsed=false;}
  const tip=document.createElement('div');tip.className='side-tip';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.append(tip);
  let tipTimer=null,tipTarget=null,tipWarmUntil=0;
  const truncated=el=>{const n=el.querySelector('.task-text strong');return !!n&&n.scrollWidth>n.clientWidth;};
  const tipEnabled=el=>!compact()&&!(el===$('work-picker')&&worksOpen)&&!(el===$('task-switch')&&tasksOpen)&&(state.sidebarCollapsed||el.hasAttribute('data-tip-always')||(el.classList.contains('task-row')&&truncated(el)));
  function showTip(el){
    clearTimeout(tipTimer);tipTarget=el;
    tip.innerHTML=`<span>${esc(el.dataset.tip)}</span>${el.dataset.tipSub?`<small>${esc(el.dataset.tipSub)}</small>`:''}${el.dataset.kbd?`<kbd>${esc(el.dataset.kbd)}</kbd>`:''}`;
    const r=el.getBoundingClientRect();tip.style.left=`${$('sidebar').getBoundingClientRect().right+8}px`;tip.style.top=`${r.top+r.height/2}px`;
    const warm=!tip.hidden;tip.hidden=false;tip.classList.toggle('show',!warm);
  }
  function hideTip(){clearTimeout(tipTimer);if(!tip.hidden)tipWarmUntil=Date.now()+350;tip.hidden=true;tipTarget=null;}
  function queueTip(el,immediate){
    if(el===tipTarget)return;
    if(!el||!tipEnabled(el)){hideTip();return;}
    clearTimeout(tipTimer);
    if(immediate||!tip.hidden||Date.now()<tipWarmUntil)showTip(el);else tipTimer=setTimeout(()=>showTip(el),420);
  }
  function renderReader(t) {
    $('reader').hidden=!state.reader;
    const modal=!!state.reader&&matchMedia('(max-width:780px)').matches;
    for(const node of [document.querySelector('.task-pane'),$('connection-notice'),$('active-notice')])node.inert=modal;
    $('sidebar').inert=modal||(compact()&&!drawerOpen);
    if(modal){$('reader').setAttribute('role','dialog');$('reader').setAttribute('aria-modal','true');}else{$('reader').removeAttribute('role');$('reader').removeAttribute('aria-modal');}
    if(!state.reader)return;
    const r=t.results[state.reader];$('reader-type').textContent=`${r?({draft:'正文',plan:'章节方案',review:'检查报告'}[r.kind]||r.kind):'已保存产物'} · 只读`;
    const identity=r?`${work().name} / ${t.name} / ${agentName(r.agentId)} / 第 ${r.round} 轮`:`${work().name} / ${t.name}`;
    if(!r||r.broken){html('reader-scroll',`<div class="reader-label">${esc(r?.title||state.reader)}</div><h2>暂时无法读取这项产物</h2><div class="result-context">${esc(identity)}<br>${esc(r?.binding||'')}<br>其他已加载记录仍可阅读。</div><button class="secondary" data-action="retry-result">重试读取</button>`);html('reader-footer','<button class="secondary" data-action="close-reader">返回执行过程</button>');return;}
    html('reader-scroll',`<div class="reader-label">${esc(identity)}</div><h2>${esc(r.title)}</h2><div class="result-context">${esc(r.binding||'')}<br>${esc(r.finalized?'作者已定稿':r.review||'产物已保存；不代表作者定稿或资料已应用。')}</div><article class="result-prose">${r.text.split('\n\n').map(p=>`<p>${esc(p).replace(/\n/g,'<br>')}</p>`).join('')}</article><div class="reader-label">— 本份产物结束 —</div>`);
    html('reader-footer',`<button class="secondary" data-action="close-reader">返回执行过程</button>${r.canFinalize?`<button class="secondary" data-action="revise">对这版提意见</button><button class="primary" data-action="finalize" ${state.activeRef||!state.connected||r.finalized?'disabled':''}>${r.finalized?'已定稿':'将这版定稿'}</button>`:''}`);
  }
  function dialog(title,content,kind='generic'){closeFloating();opener=document.activeElement;$('picker-dialog').dataset.kind=kind;$('picker-title').textContent=title;html('picker-content',content);$('picker-dialog').showModal();}
  function closeDialog(){$('picker-dialog').close();if(opener?.isConnected&&!opener.closest('[inert]'))opener.focus({preventScroll:true});}
  function rememberFeed(){task().feedPositions[task().agentFilter]=$('feed').scrollTop;}
  function select(wid,tid){closeFloating();worksOpen=false;tasksOpen=false;drawerOpen=false;rememberFeed();state.workId=wid;state.taskId=tid;state.reader=null;state.readerOrigin=null;closeDialog();render();}
  function pickWorks(){if(compact())drawerOpen=true;worksOpen=true;tasksOpen=false;render();$('work-picker').focus({preventScroll:true});}
  function pickTasks(){worksOpen=false;if(compact())drawerOpen=true;else if(state.sidebarCollapsed){tasksOpen=true;render();$('task-flyout').querySelector('.selected')?.focus({preventScroll:true});return;}render();document.querySelector('.task-row.current')?.focus({preventScroll:true});}
  function newTask(){if(!state.connected)return;const t=blankTask(`task-new-${++state.sequence}`);work().tasks.unshift(t);select(state.workId,t.id);toast('已新建独立任务，原任务记录保留');}
  function openResult(id){
    readerOpenerKey=document.activeElement?.dataset?.focus||`result-${id}`;
    state.readerOrigin=state.floatingOpen&&task().subtaskView?{workId:state.workId,taskId:state.taskId,subId:task().subtaskView,focus:readerOpenerKey}:null;
    closeFloating();state.reader=id;render();$('reader-scroll').scrollTop=task().readerPositions[id]||0;$('reader').querySelector('button').focus({preventScroll:true});
  }
  function closeReader(){
    if(state.reader)task().readerPositions[state.reader]=$('reader-scroll').scrollTop;
    const origin=state.readerOrigin;state.reader=null;state.readerOrigin=null;
    if(origin&&origin.workId===state.workId&&origin.taskId===state.taskId){task().subtaskView=origin.subId;state.floatingOpen=true;readerOpenerKey=origin.focus;}
    render();document.querySelector(`[data-focus="${CSS.escape(readerOpenerKey||'')}"]`)?.focus({preventScroll:true});
  }
  function startMain(t,text) {
    if(state.activeRef||!state.connected)return;
    const main=t.agents.find(a=>a.id==='main');if(t.events.some(e=>e.agentId==='main'&&e.type==='system'&&e.text?.startsWith('agent_start')))main.round++;main.status='running';t.status='running';
    appendEvent(t,{type:'system',agentId:'main',round:main.round,text:`agent_start · session=main · round=${main.round}`});
    appendEvent(t,{type:'message',agentId:'main',round:main.round,text:'已收到要求，将根据当前任务中的记录继续。'});
    const previous=t.agents.find(a=>a.id===t.lastExecutionAgentId),reuse=previous&&['idle','stopped'].includes(previous.status)&&!/重新|重写|结构/.test(text);
    const id=reuse?previous.id:`worker-${++state.sequence}`,round=reuse?previous.round+1:1;
    const call=toolEvent(t,'main',reuse?'send_subagent':'spawn_subagent',{agent_id:id,task:text,reference:t.reference||null},{agent_id:id,accepted:true,round},{round:main.round,childId:id});
    if(reuse){previous.round=round;previous.status='running';}else addAgent(t,id,'main',call.callId,round);
    t.lastExecutionAgentId=id;
    appendEvent(t,{type:'system',agentId:id,round,text:`agent_start · session=${id} · round=${round}`});
    const edit=toolEvent(t,id,'edit',{path:'drafts/chapter-1.md',instruction:text},'',{round,status:'running',updates:[]});
    state.activeRef={workId:state.workId,taskId:t.id};state.job={...state.activeRef,stage:0,nextAt:Date.now()+8000,steps:writingSteps(t,edit.id,id,round)};
  }
  function submit(){const t=task(),text=$('message').value.trim();if(!text||!state.connected||elsewhere()||t.status==='stopping')return;const main=t.agents.find(a=>a.id==='main');const inputRound=!state.activeRef&&t.events.some(e=>e.agentId==='main'&&e.type==='system'&&e.text?.startsWith('agent_start'))?main.round+1:main.round;appendEvent(t,{type:'message',agentId:'main',round:inputRound,role:'user',text});t.input='';if(t.name==='新任务')t.name=text.slice(0,32);if(state.activeRef)appendEvent(t,{type:'message',agentId:'main',round:main.round,text:'补充要求已收到，当前执行继续。'});else startMain(t,text);render({bottom:true});}
  function stopTask(){const t=taskAt(state.activeRef);if(!t||!state.connected||t.status==='stopping')return;t.status='stopping';appendEvent(t,{type:'system',agentId:'main',round:t.agents[0].round,text:'stop_requested · scope=task · waiting for active calls to end'});state.job={...state.activeRef,stage:0,nextAt:Date.now()+1500,steps:[[{op:'stop'}]]};render();}
  function continueTask(){const t=task();if(state.activeRef||!state.connected)return;startMain(t,'继续本任务，根据保存的记录完成剩余工作');render();}
  function applyOperation(t,op) {
    if(op.op==='event'){appendEvent(t,op.event);return;}
    if(op.op==='updateTool'){
      const e=t.events.find(e=>op.eventId?e.id===op.eventId:e.callId===op.callId);if(!e)return;
      if(op.update)e.updates.push({at:Date.now(),text:op.update});
      if(op.status){e.status=op.status;e.ended=Date.now();}
      if(op.output!==undefined)e.output=op.output;if(op.error)e.error=op.error;return;
    }
    if(op.op==='result'){t.results[op.result.id]=op.result;appendEvent(t,{type:'artifact',agentId:op.result.agentId,round:op.result.round,resultId:op.result.id});return;}
    if(op.op==='agentStatus'){const a=t.agents.find(a=>a.id===op.agentId);if(a)a.status=op.status;return;}
    if(op.op==='stop'){
      t.events.filter(e=>e.type==='tool'&&e.status==='running').forEach(e=>{e.status='stopped';e.ended=Date.now();});
      t.agents.filter(a=>a.status==='running').forEach(a=>{a.status='stopped';appendEvent(t,{type:'system',agentId:a.id,round:a.round,text:'agent_end · stopReason=aborted'});});t.status='stopped';state.activeRef=null;state.job=null;return;
    }
    if(op.op==='finish'){t.status=op.status;t.agents.filter(a=>a.status==='running').forEach(a=>a.status='idle');state.activeRef=null;state.job=null;}
  }
  function tick(force=false) {
    if(!state.connected){if(!frozen&&Date.now()>state.reconnectAt){state.connected=true;delete state.reconnectAt;render();}return;}
    if((frozen&&!force)||!state.job||Date.now()<state.job.nextAt)return;
    const job=state.job,t=taskAt(job);if(!t){state.job=null;return;}
    const visible=state.workId===job.workId&&state.taskId===job.taskId;
    const follow=visible&&!state.reader&&!state.floatingOpen&&$('feed').scrollHeight-$('feed').scrollTop-$('feed').clientHeight<70;
    const mainBefore=JSON.stringify(t.events.filter(e=>e.agentId==='main'));
    for(const op of job.steps[job.stage]||[])applyOperation(t,op);
    if(state.job){state.job.stage++;state.job.nextAt=Date.now()+7000;if(state.job.stage>=state.job.steps.length){state.job=null;state.activeRef=null;t.status='idle';}}
    const mainChanged=mainBefore!==JSON.stringify(t.events.filter(e=>e.agentId==='main'));
    if(mainChanged&&!follow)t.unseen++;render({bottom:mainChanged&&follow});
  }
  function finalize(){const r=task().results[state.reader];if(!r?.canFinalize||r.finalized||state.activeRef||!state.connected)return;dialog('确认将这一版定稿？',`<p class="picker-context">${esc(r.title)} 将成为正式正文。后续资料处理仍完整记录在这个任务里。</p><div class="dialog-footer"><button class="secondary" data-action="cancel">再读一读</button><button class="primary" data-action="confirm-finalize">确认定稿</button></div>`);}
  function confirmFinalize(){const t=task(),r=t.results[state.reader];if(!r||state.activeRef||!state.connected)return;r.finalized=true;t.status='running';t.agents[0].status='running';appendEvent(t,{type:'system',agentId:'main',round:t.agents[0].round,text:`artifact_finalized · artifact_id=${r.id} · confirmed_by=author`});const id=`sync-${++state.sequence}`;const spawn=toolEvent(t,'main','spawn_subagent',{agent_id:id,task:'核对已定稿正文对应的资料变化',artifact_id:r.id},{agent_id:id},{childId:id});addAgent(t,id,'main',spawn.callId);const call=toolEvent(t,id,'read',{artifact_id:r.id,change_set:'changes-01'},'',{status:'running',updates:[]});state.activeRef={workId:state.workId,taskId:t.id};state.job={...state.activeRef,stage:0,nextAt:Date.now()+7000,steps:syncSteps(t,call.id,id)};closeDialog();render();toast('已定稿，后续执行记录继续保留');}
  function handle(event){
    const button=event.target.closest('button');if(!button||button.disabled)return;const t=task(),viewTask=button.closest('#subtask-float')?floatingTask(t):t;
    if(button.dataset.result){openResult(button.dataset.result);return;}
    if(button.dataset.work){const w=state.works.find(w=>w.id===button.dataset.work);if(w.id===state.workId){worksOpen=false;render();$('work-picker').focus({preventScroll:true});return;}select(w.id,w.tasks[0].id);return;}
    if(button.dataset.task){select(state.workId,button.dataset.task);return;}
    switch(button.dataset.action){
      case 'open-subtask':openSubtask(button.dataset.agentId);break;
      case 'back-subtasks':backSubtasks();break;
      case 'toggle-tool':
      case 'toggle-event':{const id=button.dataset.eventId;viewTask.eventExpanded[id]=!viewTask.eventExpanded[id];render();break;}
      case 'toggle-group':{const id=button.dataset.groupId;viewTask.groupExpanded[id]=!viewTask.groupExpanded[id];render();break;}
      case 'toggle-subtasks':toggleFloating();break;
      case 'close-subtasks':closeFloating(true);break;
      case 'toggle-subtask-history':t.subtaskHistoryExpanded=!t.subtaskHistoryExpanded;render();break;
      case 'full-text':viewTask.fullText[button.dataset.contentKey]=!viewTask.fullText[button.dataset.contentKey];render();break;
      case 'latest':t.unseen=0;render({bottom:true});break;
      case 'new-task':newTask();break;
      case 'toggle-sidebar':toggleSidebar();break;
      case 'close-drawer':drawerOpen=false;render();break;
      case 'toggle-tasks':hideTip();tasksOpen=!tasksOpen;worksOpen=false;render();if(tasksOpen)$('task-flyout').querySelector('.selected')?.focus({preventScroll:true});break;
      case 'toggle-works':hideTip();worksOpen=!worksOpen;tasksOpen=false;render();if(worksOpen)$('work-list').querySelector('.selected')?.focus({preventScroll:true});break;
      case 'return-active':if(state.activeRef)select(state.activeRef.workId,state.activeRef.taskId);break;
      case 'stop-active':stopTask();break;
      case 'close-reader':closeReader();break;
      case 'revise':t.reference=state.reader;closeReader();$('message').focus();toast('已引用这份正文，意见发送给 Main');break;
      case 'clear-reference':t.reference=null;render();break;
      case 'finalize':finalize();break;
      case 'confirm-finalize':confirmFinalize();break;
      case 'cancel':closeDialog();break;
      case 'reconnect':state.connected=true;delete state.reconnectAt;render();toast('已恢复连接，现有记录保持原位');break;
      case 'retry-result':if(!state.connected){toast('连接尚未恢复，已加载内容仍可阅读');return;}if(t.results[state.reader])t.results[state.reader].broken=false;render();break;
    }
  }
  document.addEventListener('pointerdown',event=>{if(state.floatingOpen&&!$('subtask-anchor').contains(event.target))closeFloating();if(worksOpen&&!event.target.closest('#work-picker,#work-list')){worksOpen=false;render();}if(tasksOpen&&!event.target.closest('#task-switch,#task-flyout')){tasksOpen=false;render();}});
  document.addEventListener('click',handle);
  $('message').addEventListener('input',()=>{task().input=$('message').value;save();$('send').disabled=!task().input.trim()||!state.connected||elsewhere()||task().status==='stopping';});
  $('message').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();submit();}});
  document.addEventListener('keydown',e=>{
    if((e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key==='\\'){e.preventDefault();toggleSidebar();return;}
    if(e.key==='Escape'&&state.floatingOpen){e.preventDefault();e.stopPropagation();closeFloating(true);return;}
    if(e.key==='Escape'&&tasksOpen&&!$('picker-dialog').open){e.preventDefault();tasksOpen=false;render();$('task-switch').focus({preventScroll:true});return;}
    if(e.key==='Escape'&&worksOpen&&!$('picker-dialog').open){e.preventDefault();worksOpen=false;render();$('work-picker').focus({preventScroll:true});return;}
    if(e.key==='Escape'&&drawerOpen&&compact()&&!state.reader&&!$('picker-dialog').open){e.preventDefault();toggleSidebar();return;}
    if(!state.reader||$('picker-dialog').open)return;
    if(e.key==='Escape'){e.preventDefault();closeReader();return;}
    if(e.key==='Tab'&&$('reader').getAttribute('aria-modal')==='true'){
      const nodes=[...$('reader').querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')].filter(n=>n.getClientRects().length),first=nodes[0],last=nodes.at(-1);
      if((e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last)||!$('reader').contains(document.activeElement)){e.preventDefault();(e.shiftKey?last:first)?.focus();}
    }
  });
  $('picker-dialog').addEventListener('close',()=>{if(opener?.isConnected&&!opener.closest('[inert]'))opener.focus({preventScroll:true});});
  $('sidebar').addEventListener('pointerover',e=>{if(e.pointerType!=='touch')queueTip(e.target.closest('[data-tip]'));});
  $('sidebar').addEventListener('pointerleave',hideTip);
  $('sidebar').addEventListener('focusin',e=>{const el=e.target.closest('[data-tip]');if(el?.matches(':focus-visible'))queueTip(el,true);else hideTip();});
  $('sidebar').addEventListener('focusout',e=>{if(!$('sidebar').contains(e.relatedTarget))hideTip();});
  $('sidebar').addEventListener('pointerdown',hideTip);
  $('task-list').addEventListener('scroll',hideTip,{passive:true});
  requestAnimationFrame(()=>requestAnimationFrame(()=>$('noya').classList.add('sidebar-ready')));
  $('subtask-float-list').addEventListener('scroll',()=>{rememberFloating();save();},{passive:true});
  $('feed').addEventListener('scroll',()=>{rememberFeed();save();},{passive:true});
  $('reader-scroll').addEventListener('scroll',()=>{if(state.reader){task().readerPositions[state.reader]=$('reader-scroll').scrollTop;save();}},{passive:true});
  window.addEventListener('resize',()=>{closeFloating(true);render();});
  window.NoyaPrototype={pickWorks,pickTasks,toggleSidebar,toggleFloating,closeFloating,openSubtask,backSubtasks,processGroups:(agentId='main')=>processGroups(task(),agentId),newTask,closeDialog,submit,stopTask,continueTask,closeReader,openResult,render,getState:()=>state,reset:mode=>{closeFloating();state=initial(mode);lastScope=null;render();},advance:()=>{if(state.job)state.job.nextAt=0;tick(true);}};
  const favicon=document.createElement('link');favicon.rel='icon';favicon.href='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text x="7" y="25" fill="#a33f32" font-family="Georgia" font-style="italic" font-size="26">N</text></svg>');document.head.append(favicon);
  render();if(state.reader)$('reader-scroll').scrollTop=task().readerPositions[state.reader]||0;
  setInterval(()=>tick(),600);
})();

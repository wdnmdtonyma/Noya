(() => {
  'use strict';
  const KEY='noya.local-agent-ui.prototype.v2', D=window.NoyaDemo, $=id=>document.getElementById(id);
  const icons={book:'M4 4h6c1 0 2 1 2 2v15c0-2-2-3-4-3H4z M20 4h-6c-1 0-2 1-2 2v15c0-2 2-3 4-3h4z',plus:'M12 5v14 M5 12h14',down:'m7 10 5 5 5-5',right:'m9 5 7 7-7 7',check:'m5 12 4 4L19 6',file:'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z M14 3v6h6 M8 13h8 M8 17h5',arrow:'M12 19V5 m-6 6 6-6 6 6',close:'m6 6 12 12 M6 18 18 6',expand:'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5',collapse:'M3 8h5V3 M21 8h-5V3 M3 16h5v5 M21 16h-5v5',spin:'M21 12a9 9 0 1 1-6-8.5',warning:'M12 3 2 21h20z M12 9v5 M12 17h.01',stop:'M6 6h12v12H6z',chat:'M20 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z',clock:'M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'};
  const icon=(n,cls='')=>`<svg viewBox="0 0 24 24" aria-hidden="true" class="${cls}"><path d="${icons[n]||icons.file}"/></svg>`;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state;try{state=JSON.parse(localStorage.getItem(KEY));}catch{}
  if(!state||state.version!==2||!Array.isArray(state.works))state=D.seed();
  const scene=new URLSearchParams(location.search).get('scene');
  if(scene){state=D.seed(scene==='empty');state.failNext=scene==='failure';state.conflictNext=scene==='sync-conflict';history.replaceState(null,'',location.pathname);}
  let pickerOpen=false,expanded=false,timer,toastTimer,dialogReturn,readerReturn;
  const work=()=>state.works.find(w=>w.id===state.workId)||null;
  const findWork=id=>state.works.find(w=>w.id===id);
  const uid=p=>p+(++state.seq);
  const latest=w=>w.artifacts.at(-1);
  const ownRun=w=>state.run?.workId===w?.id;
  const blocked=w=>Boolean(state.run&&!ownRun(w));
  const canAct=w=>Boolean(w&&!state.run);
  const add=(w,m)=>w.messages.push({id:uid('m'),...m});
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state));state.storageOk=true;}catch{state.storageOk=false;}}
  function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3400);}
  function label(w){if(ownRun(w))return state.run.steps[state.run.index]?.label||'正在处理';if(w.pending)return '等你决定';if(w.sync==='pending')return '正文已定稿 · 资料待同步';return({ready:'可以开始',delivered:'等你读稿',done:'可以继续',stopped:'已停止',failed:'执行未完成',interrupted:'执行已中断'})[w.status]||'可以继续';}
  function renderHeader(){
    const w=work();
    $('work-switcher').innerHTML=`<button class="work-button" data-action="picker" aria-expanded="${pickerOpen}" aria-controls="works-menu"><span>${esc(w?.name||'你的作品')}</span>${icon('down')}</button>${pickerOpen?`<div class="popover" id="works-menu" aria-label="选择作品"><div class="popover-caption">本机作品</div>${state.works.map(x=>`<button class="work-option ${x.id===w?.id?'selected':''}" data-action="switch" data-id="${x.id}" ${x.id===w?.id?'aria-current="true"':''}>${icon('book')}<span>${esc(x.name)}<small>${esc(label(x))}</small></span>${x.id===w?.id?icon('check'):''}</button>`).join('')}<div class="popover-divider"></div><button class="work-option" data-action="new-work">${icon('plus')}<span>新建作品</span></button></div>`:''}`;
    $('task-heading').hidden=!w;
    $('task-heading').innerHTML=w?`<strong>最近任务 · ${esc(w.taskTitle)}</strong><span class="task-state ${w.pending||['stopped','failed','interrupted'].includes(w.status)?'warn':''}">${ownRun(w)?icon('spin','spinner'):''}${esc(label(w))}</span>`:'';
    const other=state.run&&findWork(state.run.workId);
    $('active-work-notice').hidden=!other||other.id===w?.id;
    $('active-work-notice').innerHTML=other?`<span>《${esc(other.name)}》正在执行。这里可以先查看、写下想法。</span><button class="inline-button" data-action="switch" data-id="${other.id}">返回正在执行的作品</button><button class="inline-button" data-action="stop-other">停止《${esc(other.name)}》</button>`:'';
  }
  function artifactCard(w,a){
    const isFinal=w.finalized===a.id;
    return `<button class="artifact-card" data-action="read" data-id="${a.id}"><span class="artifact-icon">${icon('file')}</span><span class="artifact-info"><span class="artifact-title">${esc(a.title)}</span><span class="artifact-meta">第 ${a.version} 版 · ${a.content.replace(/\s/g,'').length} 字${isFinal?' · 已定稿':''}</span></span>${icon('right')}</button><details class="review-summary ${a.concerns.length?'warn':''}"><summary>${icon(a.concerns.length?'warning':'check')}${a.concerns.length?'交稿仍有待你决定的问题':'检查已完成'} ${icon('down')}</summary><p>${esc(a.review)}${a.concerns.length?'<br>'+a.concerns.map(esc).join('<br>'):''}</p></details>`;
  }
  function pendingCard(w){
    const p=w.pending;if(!p)return '';
    const names={canon:['确认写入','暂不写入'],direction:['按新方向重写','继续原方向'],sync:['以正文为准更新','保留原有设定']};
    const actions=names[p.kind];
    return `<div class="decision-card"><div class="decision-label">需要你决定 · ${p.kind==='canon'?'作品资料':p.kind==='sync'?'资料同步':'写作方向'}</div><p>${esc(p.text)}</p><div class="decision-actions"><button class="primary-button" data-action="decision-yes" ${blocked(w)?'disabled':''}>${actions[0]}</button><button class="secondary-button" data-action="decision-no" ${blocked(w)?'disabled':''}>${actions[1]}</button></div></div>`;
  }
  function renderFeed(scroll=false){
    const feed=$('feed'),oldTop=feed.scrollTop,nearEnd=feed.scrollHeight-feed.clientHeight-oldTop<90;
    const opened=[...feed.querySelectorAll('details[open]')].map(x=>x.dataset.messageId).filter(Boolean), w=work();
    if(!w||!w.messages.length){
      $('messages').innerHTML=`<div class="empty-state"><span class="empty-mark">N</span><h1>${w?'故事，可以从这里开始。':'先从一个想法开始。'}</h1><p>${w?'人物、一个场景，或一句还没想好的开头。<br>先聊聊也可以，不必急着写正文。':'创建你的第一部作品，然后和 Noya 聊聊你想写什么。'}</p>${w?`<div class="empty-suggestions"><button data-action="suggest" data-text="我有一个故事想法，想先聊聊。">聊聊故事想法</button><button data-action="suggest" data-text="帮我写第一章，先从一个有悬念的场景开始。">开始写第一章</button></div>`:'<button class="primary-button" data-action="new-work">开始第一部作品</button>'}</div>`;
    }else{
      $('messages').innerHTML=w.messages.map(m=>{
        if(m.type==='user'||m.type==='assistant')return `<article class="message ${m.type==='user'?'user-message':''}"><div class="message-label">${m.type==='user'?'你':'<span class="noya-mark">N</span>Noya'}</div><div class="message-body">${esc(m.text)}</div></article>`;
        if(m.type==='artifact'){const a=w.artifacts.find(x=>x.id===m.artifactId);return a?artifactCard(w,a):'';}
        if(m.type==='activity'){const running=m.steps.some(x=>x.status==='active');return `<details class="activity" data-message-id="${m.id}" ${opened.includes(m.id)?'open':''}><summary>${icon(running?'spin':m.failed?'warning':'check',running?'spinner':'')}<span>${esc(m.title)}</span>${icon('down','chevron')}</summary><div class="steps">${m.steps.map(s=>`<div class="step ${s.status}">${icon(s.status==='active'?'spin':s.status==='done'?'check':s.status==='pending'?'clock':'stop',s.status==='active'?'spinner':'')}<span class="role-tag">${esc(s.role)}</span><span>${esc(s.label)}</span></div>`).join('')}</div></details>`;}
        if(m.type==='notice')return `<div class="notice ${esc(m.level||'')}">${icon(m.level?'warning':'check')}<div>${esc(m.text)}${m.detail?`<small>${esc(m.detail)}</small>`:''}${m.retry&&w.lastRun&&!w.pending?`<button class="inline-button" data-action="retry" ${!canAct(w)?'disabled':''}>${w.sync==='pending'?'继续同步资料':'继续处理'}</button>`:''}</div></div>`;
        return '';
      }).join('')+pendingCard(w);
    }
    if(scroll||(ownRun(w)&&nearEnd))feed.scrollTop=feed.scrollHeight;else feed.scrollTop=oldTop;
  }
  function renderComposer(){
    const w=work();$('composer-area').hidden=!w;if(!w)return;
    const input=$('message');if(input.value!==w.input)input.value=w.input;
    input.disabled=false;input.placeholder=blocked(w)?'可以先写下想法，前一部作品结束后发送…':ownRun(w)?'有新的想法，可以补充给 Noya…':'聊聊想法，或告诉 Noya 接下来写什么…';
    $('reference').hidden=!w.reference;
    $('reference').innerHTML=w.reference?`${icon('file')}<span>针对《${esc(w.reference.title)}》第 ${w.reference.version} 版</span><button class="icon-button" data-action="clear-reference" aria-label="取消稿件引用">${icon('close')}</button>`:'';
    const syncing=ownRun(w)&&state.run.kind.startsWith('sync');
    $('composer-meta').innerHTML=blocked(w)?'另一部作品正在执行':syncing?'资料正在同步，可以先写下想法':ownRun(w)?`${icon('spin','spinner')}可补充要求，或停止执行`:`${icon('chat')}与 Noya 继续这件事`;
    $('send').innerHTML=icon('arrow');$('send').disabled=blocked(w)||syncing||!w.input.trim();
    $('send').setAttribute('aria-label',ownRun(w)?'补充要求':'发送消息');
    $('stop').hidden=!ownRun(w);
    $('save-hint').textContent=state.storageOk?'演示数据 · 未接入模型':'浏览器未能保存演示记录';
  }
  function renderReader(){
    const panel=$('reader'),w=work(),a=w?.artifacts.find(x=>x.id===state.preview?.artifactId&&state.preview.workId===w.id);
    const old=panel.querySelector('.reader-body')?.scrollTop||0,oldKey=panel.dataset.key;
    panel.hidden=!a;$('app').classList.toggle('reading',Boolean(a));
    document.querySelector('.task-pane').inert=Boolean(a&&(innerWidth<=1000||expanded));
    if(!a){panel.innerHTML='';return;}
    panel.dataset.key=a.id;panel.classList.toggle('expanded',expanded);
    const final=w.finalized===a.id,busy=Boolean(state.run),older=latest(w)?.id!==a.id;
    panel.innerHTML=`<div class="reader-toolbar"><span>《${esc(w.name)}》 · 正文阅读</span><div><button class="icon-button" data-action="expand" aria-label="${expanded?'收起阅读视图':'展开阅读视图'}">${icon(expanded?'collapse':'expand')}</button><button class="icon-button" data-action="close-reader" aria-label="关闭正文阅读">${icon('close')}</button></div></div><div class="reader-body"><div class="document-header"><div class="document-kicker">${final?'正式章节':'章节初稿'} · 只读</div><h1>${esc(a.title)}</h1><div class="document-meta"><span>第 ${a.version} 版${older?' · 较早版本':' · 最新版本'}</span><span>${a.content.replace(/\s/g,'').length} 字</span><span>演示样稿</span></div></div><div class="prose">${final?`<div class="document-status ${w.sync!=='done'?'warn':''}">正文已定稿 · ${w.sync==='done'?'资料已同步':'资料待同步'}</div>`:''}${a.content.split(/\n\n+/).map(p=>`<p>${esc(p)}</p>`).join('')}</div></div><div class="reader-footer"><span>${final?'已保存为正式章节':older?'正在阅读较早版本':'修改通过对话完成'}</span><div><button class="secondary-button" data-action="revise" ${busy?'disabled':''}>提出修改</button><button class="primary-button" data-action="finalize" ${busy||final||w.pending||w.sync==='pending'?'disabled':''}>${final?'已定稿':`定稿第 ${a.version} 版`}</button></div></div>`;
    if(oldKey===a.id)panel.querySelector('.reader-body').scrollTop=old;
  }
  function render(scroll=false){renderHeader();renderFeed(scroll);renderComposer();renderReader();}
  function update(scroll=false){save();render(scroll);}
  function switchWork(id){if(!findWork(id))return;state.workId=id;state.preview=null;expanded=false;pickerOpen=false;update();$('feed').scrollTop=$('feed').scrollHeight;document.querySelector('.work-button').focus();}
  function newWork(){const n=state.works.filter(w=>w.name.startsWith('未命名作品')).length+1,w=D.newWork(uid('w'),'未命名作品 '+n);state.works.push(w);switchWork(w.id);$('message').focus();}
  function openReader(id){const w=work();if(!w?.artifacts.some(a=>a.id===id))return;readerReturn=document.activeElement;state.preview={workId:w.id,artifactId:id};expanded=false;update();$('reader').querySelector('[data-action="close-reader"]').focus();}
  function closeReader(){state.preview=null;expanded=false;update();if(readerReturn?.isConnected)readerReturn.focus();else $('message').focus();}
  function modal(title,body){dialogReturn=document.activeElement;$('dialog').innerHTML=`<div class="dialog-head"><h2>${esc(title)}</h2><button class="icon-button" data-action="close-dialog" aria-label="关闭对话框">${icon('close')}</button></div><div class="dialog-body">${body}</div>`;if(!$('dialog').open)$('dialog').showModal();}
  function closeDialog(){$('dialog').close();if(dialogReturn?.isConnected)dialogReturn.focus();}
  function startRun(w,kind,payload={}){
    if(state.run)return false;
    const steps=D.steps[kind].map(([role,label],i)=>({role,label,status:i===0?'active':'pending'}));
    const activity={id:uid('m'),type:'activity',title:steps[0].label,steps};w.messages.push(activity);w.status='running';w.lastRun={kind,payload};
    state.run={id:uid('run'),workId:w.id,kind,payload,index:0,steps,activityId:activity.id,nextAt:Date.now()+1500};update(true);schedule();return true;
  }
  function schedule(){clearTimeout(timer);if(state.run)timer=setTimeout(tick,Math.max(50,state.run.nextAt-Date.now()));}
  function tick(){
    const r=state.run;if(!r)return;const w=findWork(r.workId),m=w?.messages.find(x=>x.id===r.activityId);if(!w||!m){state.run=null;update();return;}
    if(Date.now()<r.nextAt){schedule();return;}
    if(state.failNext&&r.index>=1){state.failNext=false;stopRun('failed');return;}
    m.steps[r.index].status='done';
    if(r.kind==='sync'&&r.index===1&&state.conflictNext){
      state.conflictNext=false;state.run=null;w.status='waiting';m.title='核对完成，有一处需要你决定';
      w.pending={kind:'sync',text:'同步核对发现一处冲突（演示）：既有设定中，旧渡口夜间不留船；这章正文写到一艘船夜里仍停在河心。要把“这晚有船停留”记为例外，还是保留原设定、稍后调整正文？'};
      if(w.story!=='du')w.pending.text='同步核对发现一处冲突（演示）：本章出现的地点与既有资料中的位置不同。按当前定稿更新地点，还是保留原设定、稍后调整正文？';
      update(true);return;
    }
    r.index++;
    if(r.index>=m.steps.length){state.run=null;m.title=r.kind.startsWith('sync')?'资料同步已完成':r.kind==='write'?'写作与检查已完成':'修改与检查已完成';finish(w,r);}
    else{m.steps[r.index].status='active';m.title=m.steps[r.index].label;r.nextAt=Date.now()+1500;}
    update(ownRun(work()));schedule();
  }
  function finish(w,r){
    w.lastRun=null;
    if(r.kind.startsWith('sync')){
      w.sync='done';w.status='done';add(w,{type:'notice',text:'正文已定稿，资料已同步。',detail:r.payload.keepOriginal?'争议项保留原设定，其余有依据的变化与章节摘要已同步。你仍可以提出正文修改。':'章节摘要和相关人物状态已更新，可以继续下一章。'});
      const deferred=w.deferred;w.deferred=null;if(deferred)startRun(w,deferred.kind,deferred.payload);
    }else{
      const a=D.artifact(w,w.artifacts.length+1);w.artifacts.push(a);w.status=w.pending?'waiting':'delivered';
      if(r.payload.unresolved){a.concerns=['铜牌的来源仍有一处待作者确认。'];a.review='自动返修已停止，仍有一处依据无法确认。请阅读正文后决定是否继续调整。';}
      add(w,{type:'assistant',text:r.kind==='write'?'这一稿已经写好，并完成正文检查。打开读读看，哪里不合适就继续告诉我。':'新一版已经完成并重新检查。旧稿保留在上面的消息里，你可以读完再决定用哪一版。'});add(w,{type:'artifact',artifactId:a.id});
      if(work()?.id!==w.id)toast(`《${w.name}》已交稿，可以切回阅读。`);
    }
  }
  function stopRun(reason='stopped',silent=false){
    if(!state.run)return;clearTimeout(timer);const r=state.run,w=findWork(r.workId),m=w.messages.find(x=>x.id===r.activityId);state.run=null;
    m.steps.forEach(s=>{if(s.status==='active')s.status=reason==='failed'?'failed':'stopped';});m.failed=true;m.title=reason==='failed'?'本轮执行未完成':reason==='interrupted'?'执行因程序退出而中断':'本轮执行已停止';w.status=reason;w.lastRun={kind:w.sync==='pending'?'sync':r.kind,payload:r.payload};w.deferred=null;
    if(!silent)add(w,{type:'notice',level:reason==='failed'?'error':'warn',text:reason==='failed'?'模型响应中断，本轮执行未完成。':reason==='interrupted'?'程序已退出，执行中断。已恢复记录和保存的稿件。':'已停止当前执行。',detail:w.sync==='pending'?'正文已定稿，资料仍待同步。':'已经保存的内容保留，可以补充要求后继续。',retry:true});update();
  }
  function beginWriting(w,kind,payload){
    if(w.sync==='pending'){w.deferred={kind,payload};add(w,{type:'assistant',text:'上一章正文已定稿，资料还没同步完。我先完成同步，再继续这次写作。'});startRun(w,'sync');}
    else startRun(w,kind,payload);
  }
  function send(){
    const w=work(),text=w?.input.trim();if(!w||!text||blocked(w)||(ownRun(w)&&state.run.kind.startsWith('sync')))return;
    if(w.pending){toast('请先处理上方的具体决定，再继续这件事。');return;}
    const ref=w.reference;add(w,{type:'user',text:(ref?`针对《${ref.title}》第 ${ref.version} 版：\n`:'')+text});w.input='';w.reference=null;
    if(ownRun(w)){
      if(/推翻|换个方向|重来|重新构思/.test(text)){w.pending={kind:'direction',text:`新的方向：${text}\n\n确认后结束原方向的执行，重新整理方案并写稿。`,request:text};update(true);return;}
      state.run.payload.request=text;add(w,{type:'assistant',text:'收到这条补充。后续写作和检查会按更新后的要求继续。'});update(true);return;
    }
    if(/记下来|记入|写入.*(?:资料|设定)|保存.*设定/.test(text)){
      w.pending={kind:'canon',text:`准备在《${w.name}》的作品资料中记录：\n${text.replace(/(?:请|帮我)?(?:记下来|记入资料|保存设定)[，。]?/g,'').trim()||text}`,request:text};w.status='waiting';update(true);return;
    }
    const noWrite=/先不写|先别写|不要写|只讨论|先聊/.test(text),writing=!noWrite&&/写第|写一章|写正文|开始写|续写|写下一|重写|(?:按|照).{0,35}写/.test(text);
    const revision=!noWrite&&Boolean(latest(w))&&(Boolean(ref)||/修改|调整|润色|改一下|结尾.*改|让.*更|只改|重写|推翻|换个方向/.test(text));
    if(revision&&/推翻|换个方向|重来|重新构思/.test(text)){w.pending={kind:'direction',text:`新的方向：${text}\n\n保留已有稿件，重新整理章节方案并派写手。`,request:text};w.status='waiting';update(true);return;}
    if(revision){beginWriting(w,/措辞|字词|错别字|只改字/.test(text)?'wording':'revise',{request:text,reference:ref});return;}
    if(writing){w.taskTitle=latest(w)?'继续写作':'开始第一章';beginWriting(w,'write',{request:text});return;}
    if(w.sync==='pending'&&/继续|同步/.test(text)){startRun(w,'sync');return;}
    const answer=w.story==='du'?/现在|目前|设定|铜牌/.test(text)?'目前已确认：铜牌是父亲留给阿禾的旧物，尚未确认特殊能力。可以把它用作人物行动的线索，能力部分继续留白。':'可以先聊。你更想调整阿禾的选择，还是渡口这一场的紧张感？我们先定方向。':w.story==='radio'?'我们可以先确定是谁听见了播音，以及这个声音为什么让他无法离开。你更想从误入电台的人，还是等待旧消息的人开始？':'先抓住最吸引你的那个画面。是谁在场，他眼下最想做什么，又是什么拦住了他？我们可以从这里慢慢展开。';
    add(w,{type:'assistant',text:answer});w.status='ready';update(true);
  }
  function decide(yes){
    const w=work(),p=w?.pending;if(!p||blocked(w))return;w.pending=null;
    const names={canon:['确认写入上述内容。','暂不写入。'],direction:['确认按新方向重写。','继续原方向。'],sync:['确认按定稿正文更新这处资料。','保留原有设定，暂不应用这处变更。']};
    add(w,{type:'user',text:names[p.kind][yes?0:1]});
    if(p.kind==='canon'){if(yes)w.canon.push(p.request);add(w,{type:'assistant',text:yes?'已记录你确认的内容。接下来想继续讨论，还是开始写？':'这段先留在讨论里，作品资料保持原样。'});w.status='ready';}
    if(p.kind==='direction'){if(yes){if(ownRun(w))stopRun('stopped',true);beginWriting(w,'write',{request:p.request});}else{add(w,{type:'assistant',text:'继续沿原方向推进，已有稿件保留。'});w.status=ownRun(w)?'running':latest(w)?'delivered':'ready';}}
    if(p.kind==='sync'){if(!yes)add(w,{type:'assistant',text:'这处变更不写入，保留原设定。其余有依据的变化和章节摘要继续同步；完成后可以再调整正文。'});startRun(w,'syncApply',{keepOriginal:!yes});}
    update(true);
  }
  function finalize(){const w=work(),a=w?.artifacts.find(x=>x.id===state.preview?.artifactId);if(!a||!canAct(w)||w.pending||w.sync==='pending')return;
    modal('定稿这份正文',`<p>将《${esc(w.name)}》的<strong>《${esc(a.title)}》第 ${a.version} 版</strong>保存为正式章节。正文保存后，Noya 会继续同步作品资料。</p>${w.finalized?'<p>这会替换本章当前的正式正文，之前的稿件仍保留在任务记录中。</p>':''}<div class="dialog-actions"><button class="secondary-button" data-action="close-dialog">再读一下</button><button class="primary-button" data-action="confirm-finalize" data-id="${a.id}" data-work="${w.id}">确认定稿第 ${a.version} 版</button></div>`);
  }
  function confirmFinalize(b){const w=findWork(b.dataset.work),a=w?.artifacts.find(x=>x.id===b.dataset.id);if(!a||!canAct(w)||w.pending||w.sync==='pending')return;closeDialog();w.finalized=a.id;w.sync='pending';add(w,{type:'user',text:`确认将《${a.title}》第 ${a.version} 版定稿。`});add(w,{type:'notice',text:'正文已保存为正式章节。',detail:`保存的是第 ${a.version} 版，资料正在同步。`});startRun(w,'sync');}
  function revise(){const w=work(),a=w?.artifacts.find(x=>x.id===state.preview?.artifactId);if(!a||!canAct(w))return;w.reference={id:a.id,title:a.title,version:a.version};state.preview=null;expanded=false;update();$('message').focus();}
  function about(){modal('这是一份可点击的设计稿',`<p>使用固定样稿演示作品切换、讨论、写作、修改与定稿。当前没有调用模型，也不会读取或修改本机小说。你的演示操作只保存在这个浏览器。</p><p>可以先打开稿件阅读，提出一次修改，再把选中的版本定稿。</p><details class="review-controls"><summary>走查其他状态</summary><div class="decision-actions"><button class="secondary-button" data-action="demo-reset">恢复多作品示例</button><button class="secondary-button" data-action="demo-empty">从无作品开始</button><button class="secondary-button" data-action="demo-failure">下次执行失败</button><button class="secondary-button" data-action="demo-conflict">下次同步有分歧</button><button class="secondary-button" data-action="demo-restart">模拟程序退出</button></div></details>`);}
  const actions={
    picker:()=>{pickerOpen=!pickerOpen;renderHeader();if(pickerOpen)$('works-menu').querySelector('button')?.focus();},
    switch:b=>switchWork(b.dataset.id),'new-work':newWork,
    read:b=>openReader(b.dataset.id),'close-reader':closeReader,expand:()=>{expanded=!expanded;renderReader();$('reader').querySelector('[data-action="expand"]').focus();},
    suggest:b=>{work().input=b.dataset.text;update();$('message').focus();},
    'clear-reference':()=>{work().reference=null;update();$('message').focus();},
    revise,finalize,'confirm-finalize':confirmFinalize,
    stop:()=>stopRun(),
    'stop-other':()=>{const a=findWork(state.run?.workId);if(a)modal(`停止《${a.name}》`, `<p>停止这部作品当前的 Agent 执行。已经保存的对话、稿件和定稿正文会保留。</p><div class="dialog-actions"><button class="secondary-button" data-action="close-dialog">继续等待</button><button class="primary-button" data-action="confirm-stop" data-run="${state.run.id}">停止执行</button></div>`);},
    'confirm-stop':b=>{closeDialog();if(state.run?.id===b.dataset.run)stopRun();},
    'decision-yes':()=>decide(true),'decision-no':()=>decide(false),
    retry:()=>{const w=work();if(!canAct(w)||!w.lastRun)return;const r=w.lastRun;add(w,{type:'user',text:w.sync==='pending'?'继续完成资料同步。':'继续处理刚才的任务。'});startRun(w,r.kind,r.payload);},
    about,'close-dialog':closeDialog,
    'demo-reset':()=>{clearTimeout(timer);state=D.seed();closeDialog();pickerOpen=false;expanded=false;update();},
    'demo-empty':()=>{clearTimeout(timer);state=D.seed(true);closeDialog();pickerOpen=false;expanded=false;update();},
    'demo-failure':()=>{state.failNext=true;closeDialog();save();toast('已设置：下一次执行会演示失败与恢复。');},
    'demo-conflict':()=>{state.conflictNext=true;closeDialog();save();toast('已设置：下一次同步会出现一处演示冲突。');},
    'demo-restart':()=>{closeDialog();if(state.run)stopRun('interrupted');state.preview=null;update();toast('已模拟程序退出，恢复的是记录与保存的稿件。');}
  };
  document.addEventListener('click',e=>{const inside=Boolean(e.target.closest('#work-switcher')),b=e.target.closest('[data-action]');if(b&&!b.disabled)actions[b.dataset.action]?.(b);if(pickerOpen&&!inside){pickerOpen=false;renderHeader();}});
  $('composer').addEventListener('submit',e=>{e.preventDefault();send();});
  $('message').addEventListener('input',()=>{if(work()){work().input=$('message').value;save();renderComposer();$('message').style.height='auto';$('message').style.height=Math.min(140,Math.max(54,$('message').scrollHeight))+'px';}});
  $('message').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('dialog').open){if(pickerOpen){pickerOpen=false;renderHeader();document.querySelector('.work-button').focus();}else if(state.preview)closeReader();}if(pickerOpen&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){const buttons=[...$('works-menu').querySelectorAll('button')],i=buttons.indexOf(document.activeElement);e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}});
  $('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
  window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue){try{const incoming=JSON.parse(e.newValue);if(incoming.version===2){state=incoming;render();schedule();}}catch{}}});
  window.addEventListener('resize',()=>{document.querySelector('.task-pane').inert=Boolean(state.preview&&(innerWidth<=1000||expanded));});
  const favicon=document.createElement('link');favicon.rel='icon';favicon.href='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"%3E%3Ctext x="4" y="26" fill="%23a33f32" font-size="28" font-family="Georgia" font-style="italic"%3EN%3C/text%3E%3C/svg%3E';document.head.appendChild(favicon);
  update();schedule();
})();

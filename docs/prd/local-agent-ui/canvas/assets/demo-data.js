window.NoyaDemo = (() => {
  const draft1 = `雨从傍晚下到现在，渡口的灯却还亮着。

阿禾站在屋檐底下，把湿透的包袱换到左手。最后一班船早该走了，河心却横着一道黑影，船头那盏灯一动不动。他数了数岸边的缆桩，只有第五根上还拴着绳。

卖姜汤的老头收起凳子，看了他一眼。

“过河？”

阿禾点头。

“明早来。”

“有人等我。”

老头把锅盖扣好，没有再问。他从灶边抽出一截烧黑的木柴，在地上划了一道：“今晚水已经到这里了。半个时辰前还在石阶下头。”

阿禾顺着那道黑痕看过去。雨水越过木柴留下的凹槽，把一片柳叶送到他鞋边。

包袱里藏着的铜牌硌住掌心。那是父亲留下的东西，背面只有一个“渡”字；三天前，有人把一封信压在他们家门口的水缸下面，约他今夜来取一样东西。

他没有告诉老头这些。

河心的灯忽然晃了一下。

有人站到了船头。雨太密，阿禾只能看见那人手里拎着一件衣服——灰布短褂，袖口缝着深色的补丁。

那块补丁是他缝的。

老头伸手拦了他一下。阿禾已经走出屋檐，雨水打进领口，他低头解开第五根缆桩上的绳结。绳子被泡得发胀，怎么也拉不动。

船上的人没有催。他把短褂挂在灯旁，慢慢摊开空着的那只手。

阿禾忽然停住。那人想要的，根本不是船钱。

他把手伸进包袱，握住了铜牌。`;
  const draft2 = `雨从傍晚下到现在，渡口的灯却还亮着。

阿禾站在屋檐底下，把湿透的包袱换到左手。最后一班船早该走了，河心却横着一道黑影。他顺着缆绳看回来，第五根桩上拴着一个活结，结头朝岸。

卖姜汤的老头正在收凳子。

“过河？”

“找人。”

老头的手停了一下，又把凳子倒扣在桌上：“明早来找。”

阿禾没动。信上写的是今夜，落款处画了一只缺了右角的灯笼。他父亲从前给他留字条，也总画那个。

老头从灶边抽出一截黑炭，在地上划了一道：“你看着。”

不过片刻，雨水便漫过了炭痕。一片柳叶转着圈，停在阿禾的鞋尖。

“水涨得不对。”老头说。

阿禾把包袱往怀里收紧。那块铜牌贴着胸口，凉意透过两层衣服。出门前他想过，把牌子留在家里，带封信去也许就够了；可到了门边，还是折了回来。

河心的灯晃了一下。

船头多了个人，手里拎着一件灰布短褂。袖口那块深色补丁被雨浸透了，颜色几乎和衣服连成一片。

阿禾往前走了一步。

那块补丁是他缝的。他认得自己走歪的针脚，也记得父亲当时说，不用拆，结实就行。

“回来。”老头在身后说。

阿禾没有去解缆绳。他蹲在第五根桩旁，捡起一块碎瓦，沿绳子割了两下。麻丝断开，船先是顺流偏了偏，随后才被人用篙撑住。

船上的人终于开口：“你不想见他了？”

阿禾把剩下半块瓦片攥在手里。

“先把衣服扔过来。”`;
  const radio1 = `凌晨两点十三分，最后一盏指示灯亮了。

许安把手里的值班表翻过来，背面干干净净。电台停播已经七年，这张桌子上却放着今天的节目单，纸边还有一道没干的茶渍。

耳机里传来一声椅子拖动的响动。

“别开三号话筒。”那人说。

许安抬起头。控制台上的三号推子被人推到了顶，话筒却不在桌上。她沿着线摸过去，线从门缝伸进了隔壁录音间。

门上贴着一张新便签。她认得那个字，是她自己写的。

上面只有一句话：如果你已经听见，先把灯关掉。`;
  const radio2 = radio1.replace('许安抬起头。', '许安没有回答。她先拔掉了连接主楼的电话线，才抬起头。');
  const blank1 = `她把钥匙放到桌上，先数了一遍窗户。

房间只有一扇窗，朝向她来时的那条巷子。刚才站在楼下，她明明看见有人从这里向她招手；现在桌边只有一把椅子，椅背上搭着一件还没干透的外衣。

“有人吗？”

没有回答。她伸手碰了碰衣角，水珠落到地板上。桌子下面传来轻轻的一声响。

她没有弯腰。她把钥匙重新攥进手里，退到门边，先检查了门锁。

门锁的另一面，正插着一把和她手里一模一样的钥匙。`;
  const blank2 = blank1.replace('她没有弯腰。', '她把椅子向门口拖了一步，故意让椅脚刮过地板。桌下的声音停了。');
  const steps = {
    write: [['Context','整理本章要求与资料'],['Writer','构思章节方案'],['Context','检查方案与创作边界'],['Writer','撰写正文'],['Reviewer','检查本章要求与已有设定'],['Context','核实检查结果，准备交稿']],
    revise: [['Context','整理修改意见'],['Writer','修改正文'],['Reviewer','复查修改后的整章'],['Context','核实结果，准备交稿']],
    wording: [['Context','修正措辞并保存新版本'],['Reviewer','复查修改后的整章'],['Context','核实结果，准备交稿']],
    sync: [['Context','依据定稿整理资料变化'],['Sync Checker','核对正文依据与既有资料'],['Context','更新资料与章节摘要']],
    syncApply: [['Context','应用已确认的资料变化']]
  };
  function newWork(id, name, story='blank') {
    return {id,name,story,taskTitle:'聊聊这个故事',messages:[],artifacts:[],input:'',reference:null,status:'ready',sync:'none',finalized:null,pending:null,lastRun:null,canon:[]};
  }
  function artifact(w, version=1) {
    const content=w.story==='du'?version===1?draft1:draft2:w.story==='radio'?version===1?radio1:radio2:version===1?blank1:blank2;
    const title=w.story==='du'?'第三章 · 渡口的夜雨':w.story==='radio'?'第一章 · 三号话筒':'第一章 · 门后的钥匙';
    return {id:w.id+'-draft-'+version,version,title,content,review:'本章要求、人物动机、持有物与能力、能力规则已完成检查。',concerns:[]};
  }
  function seed(empty=false) {
    const a=newWork('w1','渡灯','du');
    a.taskTitle='续写第三章';a.status='delivered';a.artifacts=[artifact(a)];
    a.messages=[
      {id:'m1',type:'user',text:'接着第二章往下写。让阿禾去旧渡口找父亲的线索，这一章先别揭开船上人的身份。'},
      {id:'m2',type:'activity',title:'写作与检查已完成',steps:steps.write.map(([role,label])=>({role,label,status:'done'}))},
      {id:'m3',type:'assistant',text:'这一章写到阿禾在船头看见父亲的旧衣。船上人的身份和铜牌的作用都留着，接下来由你看这段故事是否成立。'},
      {id:'m4',type:'artifact',artifactId:a.artifacts[0].id}
    ];
    const b=newWork('w2','长夜电台','radio');
    b.messages=[{id:'m5',type:'user',text:'我想写一个停播多年的电台，某天半夜又开始播音的故事。'}, {id:'m6',type:'assistant',text:'先从谁听见这次播音开始。是误入电台的新值班员，还是一直等着这个声音的老听众？这会决定开场的视角。'}];
    return {version:2,works:empty?[]:[a,b],workId:empty?null:'w1',preview:null,run:null,seq:20,failNext:false,conflictNext:false,storageOk:true};
  }
  return {seed,newWork,artifact,steps};
})();

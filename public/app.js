// ===== STORAGE KEYS =====
const STORAGE_KEY='gopi_todos_v3';
const PROJ_KEY='gopi_projects_v1';
const PLOG_KEY='gopi_pomlog_v1';
const HIST_KEY='gopi_history_v1';
const TPL_KEY='gopi_templates_v1';
const THEME_KEY='gopi_theme_v1';
const POM_PREFS_KEY='gopi_pom_prefs_v1';

// ===== STATE =====
let filter='all',sortBy='created',searchQ='',activeTag=null,activeProj=null;
let selectedPriority='medium',dragSrc=null;
let bulkMode=false,selectedIds=new Set();
let showArchived=false;
let calCursor=new Date();calCursor.setDate(1);
let lastIdleTick=Date.now();

// ===== HISTORY =====
function pushHistory(){
  const h=JSON.parse(localStorage.getItem(HIST_KEY)||'[]');
  h.push({todos:load(),ts:Date.now()});
  if(h.length>30)h.shift();
  localStorage.setItem(HIST_KEY,JSON.stringify(h));
}
function undo(){
  const h=JSON.parse(localStorage.getItem(HIST_KEY)||'[]');
  if(!h.length){showToast('// nothing to undo');return}
  const prev=h.pop();
  localStorage.setItem(HIST_KEY,JSON.stringify(h));
  save(prev.todos);
  render();showToast('// undone');
}

const TAG_COLORS=['#36A8A8','#8B5CF6','#4A90B8','#A8C038','#E07A35','#E05555','#C8B840'];
const QUOTES=[
  'The way to get started is to quit talking and begin doing.',
  'Done is better than perfect.',
  'The secret of getting ahead is getting started.',
  'Action is the foundational key to all success.',
  'Focus is a matter of deciding what things you\'re not going to do.',
  'You don\'t have to be great to start, but you have to start to be great.',
  'Small progress is still progress.',
  'Discipline equals freedom.'
];

// ===== STORAGE =====
function load(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||[]}catch{return[]}}
function save(t){localStorage.setItem(STORAGE_KEY,JSON.stringify(t))}
function loadProjs(){try{return JSON.parse(localStorage.getItem(PROJ_KEY))||[]}catch{return[]}}
function saveProjs(p){localStorage.setItem(PROJ_KEY,JSON.stringify(p))}
function loadPomLog(){try{return JSON.parse(localStorage.getItem(PLOG_KEY))||[]}catch{return[]}}
function savePomLog(l){localStorage.setItem(PLOG_KEY,JSON.stringify(l))}
function loadTpls(){try{return JSON.parse(localStorage.getItem(TPL_KEY))||[]}catch{return[]}}
function saveTpls(t){localStorage.setItem(TPL_KEY,JSON.stringify(t))}

// ===== UTILS =====
function tagColor(tag){let h=0;for(let c of tag)h=(h*31+c.charCodeAt(0))%TAG_COLORS.length;return TAG_COLORS[h]}
function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function fmtTime(s){if(!s)return'0m';const m=Math.floor(s/60);const h=Math.floor(m/60);return h>0?`${h}h ${m%60}m`:`${m}m`}
function getAllTags(todos){const s=new Set();todos.forEach(t=>(t.tags||[]).forEach(tg=>s.add(tg)));return[...s]}

function dueBadge(due){
  if(!due)return'';
  const now=new Date();now.setHours(0,0,0,0);
  const d=new Date(due+'T00:00:00');
  const diff=Math.round((d-now)/86400000);
  if(diff<0)return`<span class="due-badge due-overdue">⚑ OVERDUE ${Math.abs(diff)}d</span>`;
  if(diff===0)return`<span class="due-badge due-soon">⚑ TODAY</span>`;
  if(diff===1)return`<span class="due-badge due-soon">⚑ TOMORROW</span>`;
  if(diff<=3)return`<span class="due-badge due-soon">⚑ ${diff}d left</span>`;
  return`<span class="due-badge due-ok">⚑ ${d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</span>`;
}
function isOverdue(t){if(!t.due||t.completed||t.archived)return false;const now=new Date();now.setHours(0,0,0,0);return new Date(t.due+'T00:00:00')<now}
function priOrder(p){return{critical:0,high:1,medium:2,low:3}[p]??2}

// ===== SMART DATE PARSER =====
function parseSmartDate(text){
  const t=text.trim().toLowerCase();
  const today=new Date();today.setHours(0,0,0,0);
  if(t==='today')return today.toISOString().slice(0,10);
  if(t==='tomorrow'||t==='tmrw'||t==='tmr'){const d=new Date(today);d.setDate(d.getDate()+1);return d.toISOString().slice(0,10)}
  if(t==='yesterday'){const d=new Date(today);d.setDate(d.getDate()-1);return d.toISOString().slice(0,10)}
  const inMatch=t.match(/^in\s+(\d+)\s*(d|day|days|w|week|weeks|m|month|months)$/);
  if(inMatch){const n=+inMatch[1];const unit=inMatch[2];const d=new Date(today);
    if(unit.startsWith('d'))d.setDate(d.getDate()+n);
    else if(unit.startsWith('w'))d.setDate(d.getDate()+n*7);
    else d.setMonth(d.getMonth()+n);
    return d.toISOString().slice(0,10)}
  const dows={sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
  const dowMatch=t.match(/^(?:next\s+)?(sun|mon|tue|wed|thu|fri|sat)/);
  if(dowMatch){const want=dows[dowMatch[1]];const d=new Date(today);let diff=(want-d.getDay()+7)%7;if(diff===0||t.startsWith('next'))diff=diff||7;d.setDate(d.getDate()+diff);return d.toISOString().slice(0,10)}
  if(/^\d{4}-\d{2}-\d{2}$/.test(t))return t;
  const dmy=t.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if(dmy){let y=dmy[3]?+dmy[3]:today.getFullYear();if(y<100)y+=2000;const m=+dmy[2];const dd=+dmy[1];return`${y}-${String(m).padStart(2,'0')}-${String(dd).padStart(2,'0')}`}
  return null;
}

// ===== SMART INPUT PARSER =====
// Parses: "buy milk !high #grocery @home ^tomorrow"
function parseSmartInput(raw){
  const out={text:raw,priority:null,tags:[],projectName:null,due:null,recur:null};
  // !priority
  out.text=out.text.replace(/!\s*(critical|crit|high|med|medium|low)\b/gi,(_,p)=>{
    p=p.toLowerCase();out.priority=p==='crit'?'critical':p==='med'?'medium':p;return''});
  // #tags
  out.text=out.text.replace(/#([\w-]+)/g,(_,t)=>{out.tags.push(t.toLowerCase());return''});
  // @project
  out.text=out.text.replace(/@([\w-]+)/g,(_,p)=>{out.projectName=p;return''});
  // ^date  (caret + datetoken until next caret/space-separated phrase end)
  out.text=out.text.replace(/\^([^^!#@]+?)(?=\s+[!#@^]|\s*$)/g,(_,d)=>{
    const parsed=parseSmartDate(d.trim());if(parsed)out.due=parsed;return''});
  // *daily / *weekly / *monthly recurrence
  out.text=out.text.replace(/\*\s*(daily|weekly|monthly)\b/gi,(_,r)=>{out.recur=r.toLowerCase();return''});
  out.text=out.text.replace(/\s+/g,' ').trim();
  return out;
}

// ===== SCORE =====
function calcScore(todos){
  let s=0;
  todos.forEach(t=>{
    if(t.archived)return;
    if(!t.completed)return;
    s+=10;
    if(t.priority==='critical')s+=30;
    else if(t.priority==='high')s+=20;
    else if(t.priority==='medium')s+=10;
    if(t.due&&t.completedAt&&new Date(t.completedAt)<=new Date(t.due+'T23:59:59'))s+=15;
    if((t.subtasks||[]).length>0)s+=5;
  });
  return Math.min(s,9999);
}

// ===== MARKDOWN (mini) =====
function md(src){
  if(!src)return'';
  let s=escHtml(src);
  s=s.replace(/^### (.*)$/gm,'<h3>$1</h3>');
  s=s.replace(/^## (.*)$/gm,'<h2>$1</h2>');
  s=s.replace(/^# (.*)$/gm,'<h1>$1</h1>');
  s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/\*([^*]+)\*/g,'<em>$1</em>');
  s=s.replace(/`([^`]+)`/g,'<code>$1</code>');
  s=s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,t,u)=>{
    const safe=/^https?:\/\//.test(u)?u:'#';
    return`<a href="${safe}" target="_blank" rel="noopener">${t}</a>`});
  s=s.replace(/^[-*] (.*)$/gm,'<li>$1</li>');
  s=s.replace(/(<li>.*<\/li>\n?)+/g,m=>'<ul>'+m+'</ul>');
  s=s.replace(/^(\d+)\. (.*)$/gm,'<li>$2</li>');
  s=s.replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
  return s;
}

// ===== SOUND =====
let audioCtx=null;
function beep(freq=440,duration=0.15,vol=0.05){
  try{
    audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator();const g=audioCtx.createGain();
    o.connect(g);g.connect(audioCtx.destination);
    o.frequency.value=freq;g.gain.value=vol;
    o.start();o.stop(audioCtx.currentTime+duration);
  }catch{}
}

// ===== RENDER =====
function render(){
  let todos=load();
  const live=todos.filter(t=>!t.archived);
  const total=live.length;
  const done=live.filter(t=>t.completed).length;
  const active=total-done;
  const overdue=live.filter(isOverdue).length;
  const pct=total?Math.round(done/total*100):0;
  const score=calcScore(todos);

  document.getElementById('totalCount').textContent=total;
  document.getElementById('activeCount').textContent=active;
  document.getElementById('doneCount').textContent=done;
  document.getElementById('overdueCount').textContent=overdue;
  document.getElementById('pctCount').textContent=pct+'%';
  document.getElementById('scoreCount').textContent=score;
  document.getElementById('footerText').textContent=`// ${active} item${active!==1?'s':''} remaining`;

  // project select in add form
  const projs=loadProjs();
  const ps=document.getElementById('projSelect');
  const pv=ps.value;
  ps.innerHTML='<option value="">No project</option>'+projs.map(p=>`<option value="${p.id}" style="color:${p.color}">${escHtml(p.name)}</option>`).join('');
  ps.value=pv;

  // bulk project select
  const bps=document.getElementById('bulkProject');
  const bv=bps.value;
  bps.innerHTML='<option value="">SET PROJECT...</option><option value="">→ No project</option>'+projs.map(p=>`<option value="${p.id}">→ ${escHtml(p.name)}</option>`).join('');
  bps.value=bv;

  // tag filter
  const allTags=getAllTags(live);
  const tfRow=document.getElementById('tagFilterRow');
  if(allTags.length===0){tfRow.innerHTML='<span class="tag-filter-label">// TAGS: none</span>'}
  else{tfRow.innerHTML='<span class="tag-filter-label">// TAGS:</span>'+allTags.map(t=>`<span class="tag-chip ${activeTag===t?'active':''}" data-tag="${t}"><span class="tag-dot" style="background:${tagColor(t)}"></span>#${t}</span>`).join('')}

  // project filter
  const pfRow=document.getElementById('projFilterRow');
  if(projs.length===0){pfRow.innerHTML='<span class="tag-filter-label">// PROJECTS: none</span>'}
  else{pfRow.innerHTML='<span class="tag-filter-label">// PROJECTS:</span>'+projs.map(p=>`<span class="proj-chip ${activeProj===p.id?'active':''}" data-projid="${p.id}" style="${activeProj===p.id?'border-color:'+p.color+';color:'+p.color:''}"><span class="tag-dot" style="background:${p.color}"></span>${escHtml(p.name)}</span>`).join('')}

  // templates
  renderTemplates();

  // filter
  let f=showArchived?todos.filter(t=>t.archived):live;
  if(filter==='active')f=f.filter(t=>!t.completed);
  if(filter==='completed')f=f.filter(t=>t.completed);
  if(filter==='overdue')f=f.filter(isOverdue);
  if(filter==='today'){const today=new Date().toISOString().slice(0,10);f=f.filter(t=>t.due===today)}
  if(activeTag)f=f.filter(t=>(t.tags||[]).includes(activeTag));
  if(activeProj)f=f.filter(t=>t.projectId===activeProj);
  if(searchQ){const q=searchQ.toLowerCase();f=f.filter(t=>t.text.toLowerCase().includes(q)||(t.tags||[]).some(tg=>tg.includes(q))||(t.notes||'').toLowerCase().includes(q))}
  document.getElementById('searchCount').textContent=searchQ?`${f.length} result${f.length!==1?'s':''}`:'';

  if(sortBy==='priority')f=[...f].sort((a,b)=>priOrder(a.priority)-priOrder(b.priority));
  if(sortBy==='due')f=[...f].sort((a,b)=>{if(!a.due&&!b.due)return 0;if(!a.due)return 1;if(!b.due)return-1;return a.due.localeCompare(b.due)});
  if(sortBy==='alpha')f=[...f].sort((a,b)=>a.text.localeCompare(b.text));
  if(sortBy==='time')f=[...f].sort((a,b)=>(b.timeSpent||0)-(a.timeSpent||0));
  if(sortBy==='created')f=[...f].sort((a,b)=>(b.created||0)-(a.created||0));

  // bulk bar
  const bulkBar=document.getElementById('bulkBar');
  if(bulkMode&&selectedIds.size>0){bulkBar.classList.add('show');document.getElementById('bulkCount').textContent=`// ${selectedIds.size} selected`}
  else{bulkBar.classList.remove('show')}

  const list=document.getElementById('todoList');
  if(f.length===0){list.innerHTML=`<div class="empty-state"><div class="icon">□</div><p>// NO TASKS FOUND</p></div>`;
    if(document.getElementById('panel-analytics').classList.contains('active'))renderAnalytics();
    if(document.getElementById('panel-projects').classList.contains('active'))renderProjects();
    if(document.getElementById('panel-matrix').classList.contains('active'))renderMatrix();
    if(document.getElementById('panel-calendar').classList.contains('active'))renderCalendar();
    return}

  const projMap={};projs.forEach(p=>projMap[p.id]=p);
  const runningTimer=timerState.running&&timerState.taskId;

  list.innerHTML=f.map((todo,i)=>{
    const subTotal=(todo.subtasks||[]).length;
    const subDone=(todo.subtasks||[]).filter(s=>s.done).length;
    const subPct=subTotal?Math.round(subDone/subTotal*100):0;
    const expanded=todo.expanded;
    const p=todo.projectId&&projMap[todo.projectId];
    const isRunning=runningTimer===todo.id;
    const isSel=selectedIds.has(todo.id);

    const tagBadges=(todo.tags||[]).map(tg=>`<span class="meta-tag" style="border-color:${tagColor(tg)};color:${tagColor(tg)}" data-tagclick="${tg}">#${tg}</span>`).join('');
    const projBadge=p?`<span class="proj-badge">◈ ${escHtml(p.name)}</span>`:'';
    const recurBadge=todo.recur?`<span class="recur-badge">↻ ${todo.recur.toUpperCase()}</span>`:'';
    const timeBadge=todo.timeSpent?`<span class="time-badge">⏱ ${fmtTime(todo.timeSpent)}</span>`:'';
    const archBadge=todo.archived?`<span class="archived-badge">📦 ARCHIVED</span>`:'';

    return`
<div class="todo-item ${todo.completed?'completed':''} ${isSel?'selected':''}" draggable="true" data-id="${todo.id}">
  <span class="drag-handle" title="drag to reorder">⠿</span>
  ${bulkMode?`<div class="bulk-check ${isSel?'sel':''}" data-bulksel="${todo.id}">${isSel?'✓':''}</div>`:''}
  <span class="todo-index">${String(i+1).padStart(2,'0')}.</span>
  <div class="pri-indicator pri-${todo.priority||'medium'}"></div>
  <div class="checkbox ${todo.completed?'checked':''}" data-toggle="${todo.id}">${todo.completed?'✓':''}</div>
  <div class="todo-body">
    <div class="todo-text ${todo.completed?'completed':''}" data-edit="${todo.id}" title="double-click to edit">${escHtml(todo.text)}</div>
    <div class="todo-meta">
      ${dueBadge(todo.due)}
      <span class="pri-badge ${todo.priority||'medium'}">[${(todo.priority||'med').slice(0,4).toUpperCase()}]</span>
      ${projBadge}${tagBadges}${recurBadge}${timeBadge}${archBadge}
      ${subTotal?`<span class="due-badge due-ok">◈ ${subDone}/${subTotal} subtasks</span>`:''}
    </div>
    ${subTotal?`<div class="progress-bar"><div class="progress-fill" style="width:${subPct}%"></div></div>`:''}
    ${expanded?`
    <div class="subtask-section">
      ${(todo.subtasks||[]).map((s,si)=>`
        <div class="subtask-item">
          <div class="sub-check ${s.done?'checked':''}" data-subtoggle="${todo.id}-${si}">${s.done?'✓':''}</div>
          <span class="sub-text ${s.done?'done':''}">${escHtml(s.text)}</span>
          <span class="sub-del" data-subdel="${todo.id}-${si}">✕</span>
        </div>`).join('')}
      <div class="subtask-add-row">
        <input class="sub-input" placeholder="+ add subtask..." data-subinput="${todo.id}" />
        <button class="sub-add-btn" data-subadd="${todo.id}">ADD</button>
      </div>
    </div>
    <div class="note-section">
      <div class="note-tab-row">
        <button class="note-tab ${todo.notesEdit?'active':''}" data-notemode="${todo.id}-edit">EDIT</button>
        <button class="note-tab ${!todo.notesEdit?'active':''}" data-notemode="${todo.id}-view">PREVIEW (md)</button>
      </div>
      ${todo.notesEdit?
        `<textarea class="note-input" placeholder="// notes (markdown supported: # h1, **bold**, *em*, \`code\`, [text](url), - lists)" data-noteid="${todo.id}">${escHtml(todo.notes||'')}</textarea>`:
        `<div class="note-preview" data-noteclick="${todo.id}">${todo.notes?md(todo.notes):'<span style="color:var(--text-dim)">// click to add notes (markdown)</span>'}</div>`
      }
    </div>`:''}
  </div>
  <div class="todo-actions">
    <button class="timer-btn ${isRunning?'running':''}" data-timer="${todo.id}">${isRunning?'⏹ '+fmtTime(timerState.elapsed):'⏱ START'}</button>
    <button class="archive-btn" data-archive="${todo.id}" title="${todo.archived?'unarchive':'archive'}">${todo.archived?'📤':'📥'}</button>
    <button class="delete-btn" data-delete="${todo.id}">[DEL]</button>
    <button class="expand-btn" data-expand="${todo.id}">${expanded?'[-]':'[+]'}</button>
  </div>
</div>`;
  }).join('');

  // drag events
  list.querySelectorAll('.todo-item').forEach(el=>{
    el.addEventListener('dragstart',e=>{dragSrc=el.dataset.id;el.classList.add('dragging')});
    el.addEventListener('dragend',e=>{el.classList.remove('dragging');document.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over'))});
    el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('drag-over')});
    el.addEventListener('dragleave',e=>{el.classList.remove('drag-over')});
    el.addEventListener('drop',e=>{
      e.preventDefault();el.classList.remove('drag-over');
      if(!dragSrc||dragSrc===el.dataset.id)return;
      const arr=load();const fi=arr.findIndex(t=>t.id==dragSrc);const ti=arr.findIndex(t=>t.id==el.dataset.id);
      if(fi<0||ti<0)return;const[moved]=arr.splice(fi,1);arr.splice(ti,0,moved);save(arr);render();
    });
  });

  checkRecurring(todos);
  updatePomTaskSel(todos);
  if(document.getElementById('panel-analytics').classList.contains('active'))renderAnalytics();
  if(document.getElementById('panel-projects').classList.contains('active'))renderProjects();
  if(document.getElementById('panel-matrix').classList.contains('active'))renderMatrix();
  if(document.getElementById('panel-calendar').classList.contains('active'))renderCalendar();
}

function checkRecurring(todos){
  const today=new Date().toISOString().slice(0,10);
  let changed=false;
  todos.forEach(t=>{
    if(!t.recur||!t.completed||t.archived)return;
    const compDate=t.completedAt?t.completedAt.slice(0,10):'';
    if(compDate===today)return;
    t.completed=false;t.completedAt=null;
    if(t.recur==='daily'){const d=new Date();d.setDate(d.getDate()+1);t.due=d.toISOString().slice(0,10)}
    else if(t.recur==='weekly'){const d=new Date();d.setDate(d.getDate()+7);t.due=d.toISOString().slice(0,10)}
    else if(t.recur==='monthly'){const d=new Date();d.setMonth(d.getMonth()+1);t.due=d.toISOString().slice(0,10)}
    changed=true;
  });
  if(changed)save(todos);
}

function showToast(msg,cls=''){
  const t=document.getElementById('toast');
  t.textContent=msg;t.className='toast '+(cls?cls:'');t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2500);
}

// ===== ADD TASK =====
function addTodo(){
  const input=document.getElementById('todoInput');
  const raw=input.value.trim();
  if(!raw){input.focus();return}
  const parsed=parseSmartInput(raw);
  if(!parsed.text){input.focus();return}

  const due=document.getElementById('dueInput').value||parsed.due||null;
  const rawTags=document.getElementById('tagInput').value;
  const formTags=rawTags.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  const tags=[...new Set([...formTags,...parsed.tags])];
  const recur=document.getElementById('recurSel').value||parsed.recur||null;
  let projectId=document.getElementById('projSelect').value||null;
  if(!projectId&&parsed.projectName){
    const projs=loadProjs();
    let p=projs.find(x=>x.name.toLowerCase()===parsed.projectName.toLowerCase());
    if(!p){p={id:Date.now(),name:parsed.projectName,color:TAG_COLORS[Math.floor(Math.random()*TAG_COLORS.length)]};projs.push(p);saveProjs(projs)}
    projectId=p.id;
  }
  const priority=parsed.priority||selectedPriority;

  pushHistory();
  const todos=load();
  todos.push({id:Date.now(),text:parsed.text,completed:false,priority,due,tags,subtasks:[],expanded:false,created:Date.now(),notes:'',timeSpent:0,projectId,recur,archived:false,notesEdit:false});
  save(todos);
  input.value='';document.getElementById('tagInput').value='';document.getElementById('dueInput').value='';document.getElementById('recurSel').value='';
  input.focus();render();showToast('// task added');
}

// ===== TEMPLATES =====
function renderTemplates(){
  const tpls=loadTpls();
  const row=document.getElementById('tplRow');
  row.innerHTML=tpls.map(t=>`<button class="tpl-btn" data-tpl="${t.id}">${escHtml(t.name)}<span class="tpl-del" data-tpldel="${t.id}">✕</span></button>`).join('')+
    '<button class="tpl-add-btn" id="tplSaveBtn">+ SAVE CURRENT</button>';
  document.getElementById('tplSaveBtn')?.addEventListener('click',saveTplFromForm);
}
function saveTplFromForm(){
  const text=document.getElementById('todoInput').value.trim();
  if(!text){showToast('// type a task first');return}
  const name=prompt('Template name:',text.slice(0,20));
  if(!name)return;
  const tpls=loadTpls();
  tpls.push({id:Date.now(),name,text,priority:selectedPriority,tags:document.getElementById('tagInput').value,recur:document.getElementById('recurSel').value,projectId:document.getElementById('projSelect').value});
  saveTpls(tpls);renderTemplates();showToast('// template saved');
}
document.getElementById('tplRow').addEventListener('click',e=>{
  const delId=e.target.closest('[data-tpldel]')?.dataset.tpldel;
  if(delId){e.stopPropagation();saveTpls(loadTpls().filter(t=>t.id!=delId));renderTemplates();showToast('// template deleted');return}
  const tplId=e.target.closest('[data-tpl]')?.dataset.tpl;
  if(tplId){const tpl=loadTpls().find(t=>t.id==tplId);if(!tpl)return;
    document.getElementById('todoInput').value=tpl.text;
    document.getElementById('tagInput').value=tpl.tags||'';
    document.getElementById('recurSel').value=tpl.recur||'';
    if(tpl.projectId)document.getElementById('projSelect').value=tpl.projectId;
    if(tpl.priority){selectedPriority=tpl.priority;document.querySelectorAll('.pri-btn').forEach(b=>b.classList.toggle('active',b.dataset.p===tpl.priority))}
    document.getElementById('todoInput').focus();
  }
});

// ===== PRIORITY BTNS =====
document.getElementById('priOpts').addEventListener('click',e=>{
  const btn=e.target.closest('.pri-btn');if(!btn)return;
  selectedPriority=btn.dataset.p;
  document.querySelectorAll('.pri-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
});

document.getElementById('addBtn').addEventListener('click',addTodo);
document.getElementById('todoInput').addEventListener('keypress',e=>{if(e.key==='Enter')addTodo()});

// ===== FILTERS =====
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    filter=btn.dataset.filter;
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    btn.classList.add('active');render();
  });
});
document.getElementById('sortSel').addEventListener('change',e=>{sortBy=e.target.value;render()});
document.getElementById('searchInput').addEventListener('input',e=>{searchQ=e.target.value;render()});

document.getElementById('tagFilterRow').addEventListener('click',e=>{
  const chip=e.target.closest('.tag-chip');if(!chip)return;
  activeTag=activeTag===chip.dataset.tag?null:chip.dataset.tag;render();
});
document.getElementById('projFilterRow').addEventListener('click',e=>{
  const chip=e.target.closest('.proj-chip');if(!chip)return;
  activeProj=activeProj===chip.dataset.projid?null:chip.dataset.projid;render();
});

// ===== STAT QUICK FILTERS =====
document.querySelectorAll('[data-statfilter]').forEach(s=>{
  s.addEventListener('click',()=>{
    const f=s.dataset.statfilter;
    if(!f)return;
    filter=f;
    document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.filter===f));
    render();
  });
});

document.getElementById('clearBtn').addEventListener('click',()=>{
  if(!confirm('Clear all completed tasks?'))return;
  pushHistory();save(load().filter(t=>!t.completed||t.archived));render();showToast('// completed tasks cleared');
});

document.getElementById('archiveToggleBtn').addEventListener('click',()=>{
  showArchived=!showArchived;
  document.getElementById('archiveToggleBtn').textContent=showArchived?'◀ HIDE ARCHIVE':'📦 SHOW ARCHIVE';
  render();
});

document.getElementById('undoBtn').addEventListener('click',undo);

// ===== EXPORT / IMPORT =====
document.getElementById('exportBtn').addEventListener('click',()=>{
  const data=JSON.stringify({todos:load(),projects:loadProjs(),templates:loadTpls(),pomLog:loadPomLog(),exported:new Date().toISOString()},null,2);
  const a=document.createElement('a');a.href='data:application/json,'+encodeURIComponent(data);a.download='gopi_tasks_'+new Date().toISOString().slice(0,10)+'.json';a.click();showToast('// exported JSON');
});
document.getElementById('exportCsvBtn').addEventListener('click',()=>{
  const todos=load();
  const rows=[['ID','Text','Priority','Due','Tags','Project','Completed','Archived','TimeSpent','Notes']];
  todos.forEach(t=>{rows.push([t.id,`"${(t.text||'').replace(/"/g,'""')}"`,t.priority||'',t.due||'',(t.tags||[]).join('|'),t.projectId||'',t.completed?'yes':'no',t.archived?'yes':'no',t.timeSpent||0,`"${(t.notes||'').replace(/"/g,'""')}"`])});
  const csv=rows.map(r=>r.join(',')).join('\n');
  const a=document.createElement('a');a.href='data:text/csv,'+encodeURIComponent(csv);a.download='gopi_tasks.csv';a.click();showToast('// exported CSV');
});
document.getElementById('exportMdBtn').addEventListener('click',()=>{
  const todos=load();const projs=loadProjs();const projMap={};projs.forEach(p=>projMap[p.id]=p);
  let md='# Gopi Tasks Export\n\n_Exported '+new Date().toLocaleString()+'_\n\n';
  ['critical','high','medium','low'].forEach(pri=>{
    const items=todos.filter(t=>!t.archived&&t.priority===pri);
    if(!items.length)return;
    md+=`## ${pri.toUpperCase()} priority\n\n`;
    items.forEach(t=>{
      const cb=t.completed?'[x]':'[ ]';
      const proj=t.projectId&&projMap[t.projectId]?` _@${projMap[t.projectId].name}_`:'';
      const tags=t.tags?.length?' '+t.tags.map(x=>'`#'+x+'`').join(' '):'';
      const due=t.due?` (due ${t.due})`:'';
      md+=`- ${cb} ${t.text}${proj}${tags}${due}\n`;
      (t.subtasks||[]).forEach(s=>{md+=`  - ${s.done?'[x]':'[ ]'} ${s.text}\n`});
      if(t.notes)md+=`\n  > ${t.notes.split('\n').join('\n  > ')}\n\n`;
    });
    md+='\n';
  });
  const a=document.createElement('a');a.href='data:text/markdown,'+encodeURIComponent(md);a.download='gopi_tasks.md';a.click();showToast('// exported Markdown');
});

document.getElementById('importFile').addEventListener('change',e=>{
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const data=JSON.parse(ev.target.result);
      pushHistory();
      if(data.todos&&Array.isArray(data.todos)){save(data.todos);showToast(`// imported ${data.todos.length} tasks`)}
      else if(Array.isArray(data)){save(data);showToast(`// imported ${data.length} tasks`)}
      if(data.projects)saveProjs(data.projects);
      if(data.templates)saveTpls(data.templates);
      if(data.pomLog)savePomLog(data.pomLog);
      render();
    }catch{showToast('// invalid JSON file','danger')}
  };
  reader.readAsText(file);
  e.target.value='';
});

// ===== LIST EVENTS =====
document.getElementById('todoList').addEventListener('click',e=>{
  const bulkId=e.target.closest('[data-bulksel]')?.dataset.bulksel;
  if(bulkId){const id=+bulkId;if(selectedIds.has(id))selectedIds.delete(id);else selectedIds.add(id);render();return}

  const tagClick=e.target.closest('[data-tagclick]')?.dataset.tagclick;
  if(tagClick){activeTag=activeTag===tagClick?null:tagClick;render();return}

  const tId=e.target.closest('[data-toggle]')?.dataset.toggle;
  if(tId){
    pushHistory();const todos=load();const t=todos.find(x=>x.id==tId);
    if(t){t.completed=!t.completed;if(t.completed){t.completedAt=new Date().toISOString();beep(660,0.1)}else t.completedAt=null;save(todos);render();showToast(t.completed?'// task done ✓':'// task reopened')}
    return;
  }
  const dId=e.target.closest('[data-delete]')?.dataset.delete;
  if(dId){
    if(!confirm('Delete this task permanently?'))return;
    pushHistory();save(load().filter(t=>t.id!=dId));selectedIds.delete(+dId);render();showToast('// task deleted','danger');return
  }
  const aId=e.target.closest('[data-archive]')?.dataset.archive;
  if(aId){pushHistory();const todos=load();const t=todos.find(x=>x.id==aId);if(t){t.archived=!t.archived;save(todos);render();showToast(t.archived?'// archived':'// unarchived')}return}

  const eId=e.target.closest('[data-expand]')?.dataset.expand;
  if(eId){const todos=load();const t=todos.find(x=>x.id==eId);if(t){t.expanded=!t.expanded;save(todos);render()}return}

  const saId=e.target.closest('[data-subadd]')?.dataset.subadd;
  if(saId){
    const inp=document.querySelector(`[data-subinput="${saId}"]`);const text=inp?.value.trim();if(!text)return;
    const todos=load();const t=todos.find(x=>x.id==saId);if(t){t.subtasks=t.subtasks||[];t.subtasks.push({text,done:false});save(todos);render()}return;
  }
  const stKey=e.target.closest('[data-subtoggle]')?.dataset.subtoggle;
  if(stKey){const[tid,si]=stKey.split('-');const todos=load();const t=todos.find(x=>x.id==tid);if(t?.subtasks?.[si]){t.subtasks[si].done=!t.subtasks[si].done;save(todos);render()}return}
  const sdKey=e.target.closest('[data-subdel]')?.dataset.subdel;
  if(sdKey){const[tid,si]=sdKey.split('-');const todos=load();const t=todos.find(x=>x.id==tid);if(t?.subtasks){t.subtasks.splice(+si,1);save(todos);render()}return}

  const tmId=e.target.closest('[data-timer]')?.dataset.timer;
  if(tmId){toggleTimer(+tmId);return}

  const noteMode=e.target.closest('[data-notemode]')?.dataset.notemode;
  if(noteMode){const[id,mode]=noteMode.split('-');const todos=load();const t=todos.find(x=>x.id==id);if(t){t.notesEdit=mode==='edit';save(todos);render()}return}

  const noteClick=e.target.closest('[data-noteclick]')?.dataset.noteclick;
  if(noteClick){const todos=load();const t=todos.find(x=>x.id==noteClick);if(t){t.notesEdit=true;save(todos);render()}return}
});

// ===== EDIT TASK TEXT (double-click) =====
document.getElementById('todoList').addEventListener('dblclick',e=>{
  const editId=e.target.closest('[data-edit]')?.dataset.edit;
  if(!editId)return;
  const el=e.target.closest('[data-edit]');
  el.contentEditable=true;el.classList.add('editing');el.focus();
  const range=document.createRange();range.selectNodeContents(el);
  const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
  const finish=()=>{
    el.contentEditable=false;el.classList.remove('editing');
    const newText=el.textContent.trim();
    if(!newText){render();return}
    pushHistory();const todos=load();const t=todos.find(x=>x.id==editId);
    if(t&&t.text!==newText){t.text=newText;save(todos);showToast('// task updated')}
    render();
  };
  el.addEventListener('blur',finish,{once:true});
  el.addEventListener('keydown',ev=>{
    if(ev.key==='Enter'){ev.preventDefault();el.blur()}
    if(ev.key==='Escape'){el.textContent=load().find(x=>x.id==editId)?.text||'';el.blur()}
  });
});

// SUBTASK ENTER
document.getElementById('todoList').addEventListener('keypress',e=>{
  if(e.key!=='Enter')return;const saId=e.target.dataset.subinput;if(!saId)return;
  const text=e.target.value.trim();if(!text)return;
  const todos=load();const t=todos.find(x=>x.id==saId);if(t){t.subtasks=t.subtasks||[];t.subtasks.push({text,done:false});save(todos);render()}
});

// NOTE SAVE ON BLUR
document.getElementById('todoList').addEventListener('focusout',e=>{
  const noteId=e.target.dataset.noteid;if(!noteId)return;
  const todos=load();const t=todos.find(x=>x.id==noteId);if(t){t.notes=e.target.value;save(todos)}
});

// ===== BULK ACTIONS =====
document.getElementById('bulkToggleBtn').addEventListener('click',()=>{
  bulkMode=!bulkMode;
  if(!bulkMode)selectedIds.clear();
  document.getElementById('bulkToggleBtn').textContent=bulkMode?'✕ EXIT BULK':'☑ BULK SELECT';
  render();
});
document.getElementById('bulkSelectAll').addEventListener('click',()=>{
  load().filter(t=>!t.archived).forEach(t=>selectedIds.add(t.id));render();
});
document.getElementById('bulkClearSel').addEventListener('click',()=>{selectedIds.clear();render()});
document.getElementById('bulkComplete').addEventListener('click',()=>{
  pushHistory();const todos=load();
  todos.forEach(t=>{if(selectedIds.has(t.id)){t.completed=true;t.completedAt=new Date().toISOString()}});
  save(todos);selectedIds.clear();render();showToast('// bulk completed')
});
document.getElementById('bulkArchive').addEventListener('click',()=>{
  pushHistory();const todos=load();
  todos.forEach(t=>{if(selectedIds.has(t.id))t.archived=true});
  save(todos);selectedIds.clear();render();showToast('// bulk archived');
});
document.getElementById('bulkDelete').addEventListener('click',()=>{
  if(!confirm(`Delete ${selectedIds.size} task(s) permanently?`))return;
  pushHistory();save(load().filter(t=>!selectedIds.has(t.id)));selectedIds.clear();render();showToast('// bulk deleted','danger')
});
document.getElementById('bulkPriority').addEventListener('change',e=>{
  const p=e.target.value;if(!p)return;
  pushHistory();const todos=load();
  todos.forEach(t=>{if(selectedIds.has(t.id))t.priority=p});
  save(todos);e.target.value='';render();showToast(`// bulk priority → ${p}`);
});
document.getElementById('bulkProject').addEventListener('change',e=>{
  const p=e.target.value;
  pushHistory();const todos=load();
  todos.forEach(t=>{if(selectedIds.has(t.id))t.projectId=p||null});
  save(todos);e.target.value='';render();showToast('// bulk project changed');
});

// ===== TIMER =====
const timerState={running:false,taskId:null,startedAt:null,elapsed:0,interval:null};
function toggleTimer(taskId){
  if(timerState.running&&timerState.taskId===taskId){
    clearInterval(timerState.interval);
    const elapsed=Math.floor((Date.now()-timerState.startedAt)/1000)+timerState.elapsed;
    const todos=load();const t=todos.find(x=>x.id===taskId);
    if(t){t.timeSpent=(t.timeSpent||0)+elapsed;save(todos)}
    timerState.running=false;timerState.taskId=null;timerState.elapsed=0;timerState.interval=null;
    render();showToast(`// timer stopped: ${fmtTime(elapsed)}`);
  }else{
    if(timerState.running){
      clearInterval(timerState.interval);
      const elapsed=Math.floor((Date.now()-timerState.startedAt)/1000)+timerState.elapsed;
      const todos=load();const t=todos.find(x=>x.id===timerState.taskId);
      if(t){t.timeSpent=(t.timeSpent||0)+elapsed;save(todos)}
    }
    timerState.running=true;timerState.taskId=taskId;timerState.startedAt=Date.now();timerState.elapsed=0;
    timerState.interval=setInterval(()=>{
      const elapsed=Math.floor((Date.now()-timerState.startedAt)/1000)+timerState.elapsed;
      timerState.elapsed=elapsed;timerState.startedAt=Date.now();
      const btn=document.querySelector(`[data-timer="${taskId}"]`);
      if(btn){btn.textContent='⏹ '+fmtTime(elapsed)}
      // idle detection: if user idle >5min and timer running, warn once
      if(Date.now()-lastIdleTick>5*60*1000){
        showToast('// idle detected — timer paused','warn');
        toggleTimer(taskId);
      }
    },1000);
    render();showToast('// timer started');
  }
}
['mousemove','keydown','click','scroll','touchstart'].forEach(ev=>document.addEventListener(ev,()=>{lastIdleTick=Date.now()}));

// ===== POMODORO =====
let pomState={phase:'focus',session:0,running:false,paused:false,remaining:0,total:0,interval:null,focusLen:25,breakLen:5,longLen:15};
function loadPomPrefs(){try{return JSON.parse(localStorage.getItem(POM_PREFS_KEY))||{}}catch{return{}}}
function savePomPrefs(p){localStorage.setItem(POM_PREFS_KEY,JSON.stringify(p))}

function updatePomSettings(){
  pomState.focusLen=+document.getElementById('pomFocusLen').value;
  pomState.breakLen=+document.getElementById('pomBreakLen').value;
  pomState.longLen=+document.getElementById('pomLongLen').value;
  document.getElementById('pomFocusVal').textContent=pomState.focusLen+'m';
  document.getElementById('pomBreakVal').textContent=pomState.breakLen+'m';
  document.getElementById('pomLongVal').textContent=pomState.longLen+'m';
  const prefs={focusLen:pomState.focusLen,breakLen:pomState.breakLen,longLen:pomState.longLen,sound:document.getElementById('pomSound').checked,autoStart:document.getElementById('pomAuto').checked};
  savePomPrefs(prefs);
  if(!pomState.running)resetPom();
}
window.updatePomSettings=updatePomSettings;

function resetPom(){
  clearInterval(pomState.interval);
  pomState.running=false;pomState.paused=false;pomState.phase='focus';
  pomState.total=pomState.focusLen*60;pomState.remaining=pomState.total;
  updatePomDisplay();
}

function updatePomDisplay(){
  const m=Math.floor(pomState.remaining/60);const s=pomState.remaining%60;
  const el=document.getElementById('pomTime');
  el.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  el.className='pom-time'+(pomState.phase==='break'||pomState.phase==='long-break'?' break':'')+(pomState.remaining<60&&pomState.running?' urgent':'');
  document.getElementById('pomPhase').textContent=
    pomState.phase==='focus'?'// FOCUS SESSION':pomState.phase==='break'?'// SHORT BREAK':'// LONG BREAK';
  const pct=pomState.total>0?(pomState.remaining/pomState.total*100):100;
  document.getElementById('pomFill').style.width=pct+'%';
  // tab title countdown
  if(pomState.running)document.title=`(${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}) Tasks`;
  else document.title='TASK_MANAGER_v3.0 — Gopi';
  updatePomDots();
}

function updatePomDots(){
  const div=document.getElementById('pomDots');
  let h='';for(let i=0;i<4;i++){h+=`<div class="pom-dot ${i<pomState.session?'done':i===pomState.session&&pomState.running?'current':''}"></div>`}
  div.innerHTML=h;
}

function pomTick(){
  pomState.remaining--;
  updatePomDisplay();
  // tick beep last 3 seconds
  if(pomState.remaining<=3&&pomState.remaining>0&&document.getElementById('pomSound').checked)beep(880,0.05,0.03);
  if(pomState.remaining<=0){
    clearInterval(pomState.interval);pomState.running=false;
    if(pomState.phase==='focus'){
      pomState.session=(pomState.session+1)%4;
      logPom();
      if(pomState.session===0){pomState.phase='long-break';pomState.total=pomState.longLen*60}
      else{pomState.phase='break';pomState.total=pomState.breakLen*60}
    }else{pomState.phase='focus';pomState.total=pomState.focusLen*60}
    pomState.remaining=pomState.total;
    updatePomDisplay();
    if(document.getElementById('pomSound').checked){beep(523,0.2);setTimeout(()=>beep(659,0.2),250);setTimeout(()=>beep(784,0.3),500)}
    showToast(pomState.phase==='focus'?'// break done! back to work':'// session complete! take a break');
    if('Notification'in window&&Notification.permission==='granted'){new Notification('Pomodoro',{body:pomState.phase==='focus'?'Time to focus!':'Take a break!'})}
    if(document.getElementById('pomAuto').checked){startPom()}
  }
}

function startPom(){
  if(pomState.running&&!pomState.paused)return;
  pomState.running=true;pomState.paused=false;
  if(!pomState.remaining){pomState.remaining=pomState.total}
  pomState.interval=setInterval(pomTick,1000);
  updatePomDisplay();
}

document.getElementById('pomStart').addEventListener('click',startPom);
document.getElementById('pomPause').addEventListener('click',()=>{
  if(!pomState.running)return;
  clearInterval(pomState.interval);pomState.paused=true;pomState.running=false;
  document.title='TASK_MANAGER_v3.0 — Gopi';showToast('// paused');
});
document.getElementById('pomReset').addEventListener('click',()=>{resetPom();document.title='TASK_MANAGER_v3.0 — Gopi'});
document.getElementById('pomSkip').addEventListener('click',()=>{pomState.remaining=1;pomTick()});

function logPom(){
  const taskId=document.getElementById('pomTaskSel').value;
  const todos=load();const task=todos.find(t=>t.id==taskId);
  // add time to task
  if(task){task.timeSpent=(task.timeSpent||0)+pomState.focusLen*60;save(todos)}
  const log=loadPomLog();
  log.push({ts:Date.now(),taskId:taskId||null,taskText:task?task.text:'',phase:'focus',duration:pomState.focusLen});
  savePomLog(log);renderPomLog();
}

function renderPomLog(){
  const logDiv=document.getElementById('pomLog');
  const log=loadPomLog().slice(-15).reverse();
  logDiv.innerHTML=log.map(l=>`<div class="pom-log-item">${new Date(l.ts).toLocaleTimeString()} — ${l.duration}m focus${l.taskText?' on "'+escHtml(l.taskText.slice(0,30))+'"':''}</div>`).join('');
}

function updatePomTaskSel(todos){
  const sel=document.getElementById('pomTaskSel');
  const v=sel.value;
  sel.innerHTML='<option value="">— select task to focus on —</option>'+todos.filter(t=>!t.completed&&!t.archived).map(t=>`<option value="${t.id}">${escHtml(t.text.slice(0,50))}</option>`).join('');
  sel.value=v;
}

if('Notification'in window&&Notification.permission==='default')Notification.requestPermission();

// load pom prefs
const pomPrefs=loadPomPrefs();
if(pomPrefs.focusLen){
  document.getElementById('pomFocusLen').value=pomState.focusLen=pomPrefs.focusLen;
  document.getElementById('pomBreakLen').value=pomState.breakLen=pomPrefs.breakLen||5;
  document.getElementById('pomLongLen').value=pomState.longLen=pomPrefs.longLen||15;
  document.getElementById('pomSound').checked=pomPrefs.sound!==false;
  document.getElementById('pomAuto').checked=!!pomPrefs.autoStart;
  document.getElementById('pomFocusVal').textContent=pomState.focusLen+'m';
  document.getElementById('pomBreakVal').textContent=pomState.breakLen+'m';
  document.getElementById('pomLongVal').textContent=pomState.longLen+'m';
}
['pomSound','pomAuto'].forEach(id=>document.getElementById(id).addEventListener('change',updatePomSettings));
resetPom();renderPomLog();

// ===== PROJECTS =====
function renderProjects(){
  const projs=loadProjs();const todos=load().filter(t=>!t.archived);
  const grid=document.getElementById('projGrid');
  if(projs.length===0){grid.innerHTML='<div style="color:var(--text-dim);font-size:.75rem;letter-spacing:1px">// no projects yet</div>';return}
  grid.innerHTML=projs.map(p=>{
    const ptasks=todos.filter(t=>t.projectId===p.id);
    const pdone=ptasks.filter(t=>t.completed).length;
    const pct=ptasks.length?Math.round(pdone/ptasks.length*100):0;
    return`<div class="proj-card ${activeProj===p.id?'active-proj':''}" data-projcard="${p.id}">
      <button class="proj-del-btn" data-projdel="${p.id}">✕</button>
      <div class="proj-card-name"><span class="proj-color-dot" style="background:${p.color}"></span>${escHtml(p.name)}</div>
      <div class="proj-card-stats">${ptasks.length} tasks · ${pdone} done · ${pct}%</div>
      <div class="proj-card-bar"><div class="proj-card-fill" style="width:${pct}%;background:${p.color}"></div></div>
    </div>`;
  }).join('');
}

document.getElementById('addProjBtn').addEventListener('click',()=>{
  const name=document.getElementById('newProjName').value.trim();if(!name)return;
  const color=document.getElementById('newProjColor').value;
  const projs=loadProjs();projs.push({id:Date.now(),name,color});saveProjs(projs);
  document.getElementById('newProjName').value='';renderProjects();render();showToast('// project created');
});

document.getElementById('projGrid').addEventListener('click',e=>{
  const delId=e.target.closest('[data-projdel]')?.dataset.projdel;
  if(delId){
    if(!confirm('Delete this project? Tasks will be unlinked.'))return;
    const projs=loadProjs().filter(p=>p.id!=delId);saveProjs(projs);
    const todos=load();todos.forEach(t=>{if(t.projectId==delId)t.projectId=null});save(todos);
    renderProjects();render();showToast('// project deleted');return;
  }
  const cardId=e.target.closest('[data-projcard]')?.dataset.projcard;
  if(cardId){
    activeProj=activeProj===cardId?null:cardId;
    document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    document.querySelector('[data-panel=tasks]').classList.add('active');
    document.getElementById('panel-tasks').classList.add('active');
    render();
  }
});

// ===== EISENHOWER MATRIX =====
function renderMatrix(){
  const todos=load().filter(t=>!t.archived&&!t.completed);
  const today=new Date();today.setHours(0,0,0,0);
  const isUrgent=t=>{
    if(t.priority==='critical')return true;
    if(!t.due)return false;
    const d=new Date(t.due+'T00:00:00');
    return (d-today)/86400000<=3;
  };
  const isImportant=t=>t.priority==='critical'||t.priority==='high';

  const q1=todos.filter(t=>isUrgent(t)&&isImportant(t));
  const q2=todos.filter(t=>!isUrgent(t)&&isImportant(t));
  const q3=todos.filter(t=>isUrgent(t)&&!isImportant(t));
  const q4=todos.filter(t=>!isUrgent(t)&&!isImportant(t));

  const renderQuad=(items,id)=>{
    const div=document.getElementById(id);
    if(!items.length){div.innerHTML='<div class="matrix-empty">— no tasks —</div>';return}
    div.innerHTML=items.map(t=>`
      <div class="matrix-task ${t.completed?'completed':''}">
        <div class="matrix-check ${t.completed?'checked':''}" data-toggle="${t.id}">${t.completed?'✓':''}</div>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis">${escHtml(t.text)}</span>
        ${t.due?`<span style="font-size:.55rem;color:var(--text-dim)">${t.due.slice(5)}</span>`:''}
      </div>`).join('');
  };
  renderQuad(q1,'matrixQ1');renderQuad(q2,'matrixQ2');renderQuad(q3,'matrixQ3');renderQuad(q4,'matrixQ4');
  document.getElementById('matrixQ1Count').textContent=q1.length;
  document.getElementById('matrixQ2Count').textContent=q2.length;
  document.getElementById('matrixQ3Count').textContent=q3.length;
  document.getElementById('matrixQ4Count').textContent=q4.length;
}

document.getElementById('panel-matrix').addEventListener('click',e=>{
  const tId=e.target.closest('[data-toggle]')?.dataset.toggle;
  if(tId){pushHistory();const todos=load();const t=todos.find(x=>x.id==tId);if(t){t.completed=!t.completed;t.completedAt=t.completed?new Date().toISOString():null;save(todos);render();renderMatrix()}}
});

// ===== CALENDAR =====
function renderCalendar(){
  const todos=load().filter(t=>!t.archived&&t.due);
  const year=calCursor.getFullYear();const month=calCursor.getMonth();
  document.getElementById('calTitle').textContent=calCursor.toLocaleDateString('en-US',{month:'long',year:'numeric'});

  const first=new Date(year,month,1);
  const start=new Date(first);start.setDate(start.getDate()-first.getDay());
  const today=new Date().toISOString().slice(0,10);
  const grid=document.getElementById('calGrid');
  let html=['SUN','MON','TUE','WED','THU','FRI','SAT'].map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    const ds=d.toISOString().slice(0,10);
    const otherMonth=d.getMonth()!==month;
    const isToday=ds===today;
    const dayTasks=todos.filter(t=>t.due===ds);
    const dots=dayTasks.slice(0,3).map(t=>`<div class="cal-task-dot ${t.priority||'medium'} ${t.completed?'completed':''}" title="${escHtml(t.text)}">${escHtml(t.text.slice(0,16))}</div>`).join('');
    const more=dayTasks.length>3?`<div class="cal-more">+${dayTasks.length-3} more</div>`:'';
    html+=`<div class="cal-day ${otherMonth?'other-month':''} ${isToday?'today':''}" data-calday="${ds}">
      <div class="cal-day-num">${d.getDate()}</div>${dots}${more}</div>`;
  }
  grid.innerHTML=html;
}

document.getElementById('calPrev').addEventListener('click',()=>{calCursor.setMonth(calCursor.getMonth()-1);renderCalendar()});
document.getElementById('calNext').addEventListener('click',()=>{calCursor.setMonth(calCursor.getMonth()+1);renderCalendar()});
document.getElementById('calToday').addEventListener('click',()=>{calCursor=new Date();calCursor.setDate(1);renderCalendar()});

document.getElementById('calGrid').addEventListener('click',e=>{
  const day=e.target.closest('[data-calday]')?.dataset.calday;
  if(!day)return;
  document.getElementById('dueInput').value=day;
  document.getElementById('todoInput').focus();
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelector('[data-panel=tasks]').classList.add('active');
  document.getElementById('panel-tasks').classList.add('active');
  showToast(`// due date set: ${day}`);
});

// ===== ANALYTICS =====
function renderAnalytics(){
  const todos=load().filter(t=>!t.archived);
  const today=new Date().toISOString().slice(0,10);
  const completedToday=todos.filter(t=>t.completedAt&&t.completedAt.slice(0,10)===today).length;
  document.getElementById('completedTodayNum').textContent=completedToday;

  const pomLog=loadPomLog();
  const pomToday=pomLog.filter(p=>new Date(p.ts).toISOString().slice(0,10)===today).length;
  document.getElementById('pomSessionsNum').textContent=pomToday;

  const score=calcScore(todos);
  document.getElementById('scoreCount').textContent=score;
  document.getElementById('scoreLabel').textContent=score+' / 9999';
  document.getElementById('scoreBar').style.width=Math.min(score/9999*100,100)+'%';

  const timed=todos.filter(t=>t.timeSpent>0);
  const avgTime=timed.length?Math.round(timed.reduce((a,t)=>a+(t.timeSpent||0),0)/timed.length):0;
  document.getElementById('avgTimeNum').textContent=fmtTime(avgTime);

  // streak
  let streak=0;const d=new Date();
  for(let i=0;i<365;i++){
    const ds=new Date(d);ds.setDate(d.getDate()-i);const day=ds.toISOString().slice(0,10);
    if(todos.some(t=>t.completedAt&&t.completedAt.slice(0,10)===day))streak++;
    else if(i>0)break;
  }
  document.getElementById('streakNum').textContent=streak;

  const pris=['critical','high','medium','low'];
  const priColors=['red','orange','yellow',''];
  const priCounts=pris.map(p=>todos.filter(t=>t.priority===p).length);
  const maxP=Math.max(...priCounts,1);
  document.getElementById('priChart').innerHTML=pris.map((p,i)=>`
    <div class="bar-row">
      <span class="bar-label">${p}</span>
      <div class="bar-track"><div class="bar-fill ${priColors[i]}" style="width:${priCounts[i]/maxP*100}%"></div></div>
      <span class="bar-val">${priCounts[i]}</span>
    </div>`).join('');

  const top5=todos.filter(t=>t.timeSpent>0).sort((a,b)=>b.timeSpent-a.timeSpent).slice(0,5);
  const maxT=Math.max(...top5.map(t=>t.timeSpent||0),1);
  document.getElementById('timeChart').innerHTML=top5.length?top5.map(t=>`
    <div class="bar-row">
      <span class="bar-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.58rem">${escHtml(t.text.slice(0,8))}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(t.timeSpent||0)/maxT*100}%"></div></div>
      <span class="bar-val" style="font-size:.58rem">${fmtTime(t.timeSpent)}</span>
    </div>`).join(''):'<div style="color:var(--text-dim);font-size:.72rem">no time tracked yet</div>';

  // heatmap (last 49 days)
  const hm=document.getElementById('heatmap');
  let hmHtml='';const dayCounts={};
  todos.forEach(t=>{if(t.completedAt){const d=t.completedAt.slice(0,10);dayCounts[d]=(dayCounts[d]||0)+1}});
  for(let i=48;i>=0;i--){
    const dt=new Date();dt.setDate(dt.getDate()-i);const ds=dt.toISOString().slice(0,10);
    const cnt=dayCounts[ds]||0;
    const lvl=cnt===0?0:cnt===1?1:cnt<=3?2:cnt<=5?3:4;
    hmHtml+=`<div class="heat-cell heat-${lvl}" title="${ds}: ${cnt} completed"></div>`;
  }
  hm.innerHTML=hmHtml;

  // weekly bar chart (last 7 days completion)
  const weekDiv=document.getElementById('weeklyChart');
  const weekDays=[];const maxW=Math.max(1,...Array.from({length:7},(_,i)=>{
    const dt=new Date();dt.setDate(dt.getDate()-i);return dayCounts[dt.toISOString().slice(0,10)]||0
  }));
  for(let i=6;i>=0;i--){
    const dt=new Date();dt.setDate(dt.getDate()-i);
    const lbl=dt.toLocaleDateString('en-US',{weekday:'short'});
    const cnt=dayCounts[dt.toISOString().slice(0,10)]||0;
    weekDays.push(`<div class="bar-row"><span class="bar-label">${lbl}</span><div class="bar-track"><div class="bar-fill" style="width:${cnt/maxW*100}%"></div></div><span class="bar-val">${cnt}</span></div>`);
  }
  weekDiv.innerHTML=weekDays.join('');

  // project progress
  const projs=loadProjs();
  if(projs.length===0){document.getElementById('projProgressChart').innerHTML='<div style="color:var(--text-dim);font-size:.72rem">no projects yet</div>'}
  else{
    document.getElementById('projProgressChart').innerHTML=projs.map(p=>{
      const pt=todos.filter(t=>t.projectId===p.id);const pd=pt.filter(t=>t.completed).length;const pct=pt.length?Math.round(pd/pt.length*100):0;
      return`<div class="bar-row">
        <span class="bar-label" style="font-size:.58rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.name.slice(0,7))}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${p.color}"></div></div>
        <span class="bar-val">${pct}%</span>
      </div>`;
    }).join('');
  }
}

// ===== NAV =====
document.querySelectorAll('.nav-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-'+tab.dataset.panel).classList.add('active');
    if(tab.dataset.panel==='analytics')renderAnalytics();
    if(tab.dataset.panel==='projects')renderProjects();
    if(tab.dataset.panel==='matrix')renderMatrix();
    if(tab.dataset.panel==='calendar')renderCalendar();
  });
});

// ===== FOCUS MODE =====
function enterFocus(){
  const todos=load().filter(t=>!t.archived&&!t.completed).sort((a,b)=>priOrder(a.priority)-priOrder(b.priority));
  if(!todos.length){showToast('// no active tasks');return}
  const t=todos[0];
  document.getElementById('focusTask').textContent=t.text;
  document.getElementById('focusMeta').textContent=`[${(t.priority||'med').toUpperCase()}]${t.due?' · DUE '+t.due:''}${(t.tags||[]).length?' · '+t.tags.map(x=>'#'+x).join(' '):''}`;
  document.getElementById('focusQuote').textContent='"'+QUOTES[Math.floor(Math.random()*QUOTES.length)]+'"';
  document.getElementById('focusOverlay').classList.add('active');
  document.getElementById('focusOverlay').dataset.taskid=t.id;
}
document.getElementById('focusBtn').addEventListener('click',enterFocus);
document.getElementById('focusExitBtn').addEventListener('click',()=>document.getElementById('focusOverlay').classList.remove('active'));
document.getElementById('focusDoneBtn').addEventListener('click',()=>{
  const id=document.getElementById('focusOverlay').dataset.taskid;
  const todos=load();const t=todos.find(x=>x.id==id);
  if(t){pushHistory();t.completed=true;t.completedAt=new Date().toISOString();save(todos);beep(660,0.15);render();showToast('// done ✓ next task...')}
  document.getElementById('focusOverlay').classList.remove('active');
  setTimeout(enterFocus,300);
});
document.getElementById('focusSkipBtn').addEventListener('click',()=>{
  document.getElementById('focusOverlay').classList.remove('active');
  setTimeout(enterFocus,200);
});

// ===== THEMES =====
const MODE_KEY='gopi_mode_v1';
function applyTheme(name){
  if(name&&name!=='olive')document.documentElement.setAttribute('data-theme',name);
  else document.documentElement.removeAttribute('data-theme');
  localStorage.setItem(THEME_KEY,name||'olive');
}
function applyMode(mode){
  document.documentElement.setAttribute('data-mode',mode);
  localStorage.setItem(MODE_KEY,mode);
  const btn=document.getElementById('modeToggle');
  btn.textContent=mode==='light'?'☀ LIGHT':'🌙 DARK';
}
function toggleMode(){
  const cur=document.documentElement.getAttribute('data-mode')||'dark';
  applyMode(cur==='dark'?'light':'dark');
}
const savedTheme=localStorage.getItem(THEME_KEY)||'olive';
applyTheme(savedTheme);
document.getElementById('themeSel').value=savedTheme;
document.getElementById('themeSel').addEventListener('change',e=>applyTheme(e.target.value));
const savedMode=localStorage.getItem(MODE_KEY)||(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');
applyMode(savedMode);
document.getElementById('modeToggle').addEventListener('click',toggleMode);

// ===== KEYBOARD =====
document.getElementById('kbdBtn').addEventListener('click',()=>document.getElementById('kbdModal').classList.add('open'));
document.getElementById('kbdClose').addEventListener('click',()=>document.getElementById('kbdModal').classList.remove('open'));
document.getElementById('kbdModal').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.classList.remove('open')});

document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.isContentEditable){
    if(e.key==='Escape'){e.target.blur();searchQ='';document.getElementById('searchInput').value='';render()}
    return;
  }
  if(e.key==='?'){document.getElementById('kbdModal').classList.toggle('open');return}
  if(e.key==='Escape'){
    document.getElementById('kbdModal').classList.remove('open');
    document.getElementById('focusOverlay').classList.remove('active');return
  }
  if(e.key==='f'||e.key==='F'){if(!e.ctrlKey){e.preventDefault();enterFocus();return}}
  if(e.key==='d'||e.key==='D'){if(!e.ctrlKey){e.preventDefault();toggleMode();return}}
  if(e.key==='n'||e.key==='N'){e.preventDefault();document.getElementById('todoInput').focus();return}
  if(e.ctrlKey){
    if(e.key==='/'){{e.preventDefault();document.getElementById('searchInput').focus()}return}
    if(e.key==='z'||e.key==='Z'){e.preventDefault();undo();return}
    if(e.key==='b'||e.key==='B'){e.preventDefault();document.getElementById('bulkToggleBtn').click();return}
    if(e.key==='p'||e.key==='P'){e.preventDefault();document.querySelector('[data-panel=pomodoro]').click();return}
    if(e.key==='m'||e.key==='M'){e.preventDefault();document.querySelector('[data-panel=matrix]').click();return}
    if(e.key==='k'||e.key==='K'){e.preventDefault();document.querySelector('[data-panel=calendar]').click();return}
    const tabMap={'1':'all','2':'active','3':'completed','4':'overdue','5':'today'};
    if(tabMap[e.key]){
      e.preventDefault();filter=tabMap[e.key];
      document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.filter===filter));
      render();
    }
  }
  // Number keys 1-9: toggle Nth visible task
  if(/^[1-9]$/.test(e.key)&&!e.ctrlKey&&!e.altKey&&!e.metaKey){
    const items=document.querySelectorAll('#todoList .checkbox[data-toggle]');
    const idx=+e.key-1;
    if(items[idx]){e.preventDefault();items[idx].click()}
  }
});

// ===== INIT =====
render();

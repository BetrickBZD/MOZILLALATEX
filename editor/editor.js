(function(){
'use strict';
const API='http://localhost:5000';

/* ── Storage ─────────────────────────────────── */
class DB{
  constructor(){this.db=null;}
  init(){return new Promise((r,j)=>{const q=indexedDB.open('latexpy-ext',1);q.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains('files'))d.createObjectStore('files',{keyPath:'id'});if(!d.objectStoreNames.contains('kv'))d.createObjectStore('kv',{keyPath:'key'});};q.onsuccess=e=>{this.db=e.target.result;r();};q.onerror=j;});}
  _t(n,m){return this.db.transaction(n,m||'readonly').objectStore(n);}
  getAll(){return new Promise((r,j)=>{const q=this._t('files').getAll();q.onsuccess=()=>r(q.result);q.onerror=j;});}
  get(id){return new Promise((r,j)=>{const q=this._t('files').get(id);q.onsuccess=()=>r(q.result);q.onerror=j;});}
  put(f){return new Promise((r,j)=>{const q=this._t('files','readwrite').put(f);q.onsuccess=()=>r();q.onerror=j;});}
  del(id){return new Promise((r,j)=>{const q=this._t('files','readwrite').delete(id);q.onsuccess=()=>r();q.onerror=j;});}
  async getKV(k){return new Promise(r=>{const q=this._t('kv').get(k);q.onsuccess=()=>r(q.result?q.result.value:null);q.onerror=()=>r(null);});}
  setKV(k,v){return new Promise((r,j)=>{const q=this._t('kv','readwrite').put({key:k,value:v});q.onsuccess=()=>r();q.onerror=j;});}
}

/* ── Syntax Highlight ────────────────────────── */
function highlight(code){
  const e=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let r='',i=0;
  while(i<code.length){
    if(code[i]==='%'){let n=code.indexOf('\n',i);if(n<0)n=code.length;r+=`<span class="hl-comment">${e(code.slice(i,n))}</span>`;i=n;continue;}
    if(code[i]==='$'&&code[i+1]==='$'){let n=code.indexOf('$$',i+2);if(n<0)n=code.length;else n+=2;r+=`<span class="hl-math">${e(code.slice(i,n))}</span>`;i=n;continue;}
    if(code[i]==='$'){let n=code.indexOf('$',i+1);if(n<0)n=code.length;else n+=1;r+=`<span class="hl-math">${e(code.slice(i,n))}</span>`;i=n;continue;}
    if(code[i]==='\\'){let j=i+1;while(j<code.length&&/[a-zA-Z@]/.test(code[j]))j++;if(j>i+1){const c=code.slice(i,j);const S=['\\section','\\subsection','\\subsubsection','\\chapter','\\part','\\paragraph'];const K=['\\documentclass','\\usepackage','\\begin','\\end','\\newcommand','\\renewcommand','\\input','\\include'];r+=S.includes(c)?`<span class="hl-section">${e(c)}</span>`:K.includes(c)?`<span class="hl-keyword">${e(c)}</span>`:`<span class="hl-command">${e(c)}</span>`;i=j;continue;}r+=e(code.slice(i,j));i=j;continue;}
    if('{}'.includes(code[i])){r+=`<span class="hl-brace">${e(code[i])}</span>`;i++;continue;}
    if('[]'.includes(code[i])){r+=`<span class="hl-bracket">${e(code[i])}</span>`;i++;continue;}
    r+=e(code[i]);i++;
  }
  return r;
}

const TMPL=`\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[ngerman]{babel}
\\usepackage{amsmath, amssymb}
\\usepackage{geometry}
\\geometry{a4paper, margin=2.5cm}

\\begin{document}

\\section*{Hallo Welt}
Dies ist dein LaTeX-Editor im Browser!

\\subsection*{Mathematik}
$$e^{i\\pi} + 1 = 0$$

\\end{document}
`;

/* ═══════════════════════════════════════════════
   Column + Widget System
   ═══════════════════════════════════════════════

   Layout model:
   - #canvas is a flex-row of .col elements
   - Each .col can contain one or more .widget elements (stacked vertically)
   - A .col becomes "collapsed" when ALL its widgets are collapsed
     → the column shrinks to a thin strip (--col-collapsed-w)
   - Widgets can be dragged between columns (and reordered within a column)
   - Columns can be reordered by dragging a widget to an empty area or
     by dragging the column's collapsed strip
*/

function updateLayout(){
  const canvas = document.getElementById('canvas');
  canvas.querySelectorAll('.col').forEach(col => {
    const widgets = [...col.querySelectorAll('.widget')];
    const allCollapsed = widgets.length > 0 && widgets.every(w => w.classList.contains('collapsed'));
    col.classList.toggle('col-collapsed', allCollapsed);
  });
  addResizeHandles();
}

/* ─── Layout persistence ─── */
function saveLayout(){
  const canvas = document.getElementById('canvas');
  const cols = [...canvas.querySelectorAll('.col')];
  const state = {
    columns: cols.map(col => ({
      widgets: [...col.querySelectorAll('.widget')].map(w => w.id),
      flex: col.style.flex || ''
    })),
    collapsed: {}
  };
  document.querySelectorAll('.widget').forEach(w => {
    state.collapsed[w.id] = w.classList.contains('collapsed');
  });
  try{ localStorage.setItem('latexpy-layout', JSON.stringify(state)); }catch(e){}
}

function loadLayout(){
  let raw;
  try{ raw = localStorage.getItem('latexpy-layout'); }catch(e){ return; }
  if(!raw) return;
  try{
    const state = JSON.parse(raw);
    if(!state.columns || !state.columns.length) return;
    const canvas = document.getElementById('canvas');
    // Collect all widgets before removing columns
    const allWidgets = {};
    document.querySelectorAll('.widget').forEach(w => { allWidgets[w.id] = w; });
    // Remove all columns from canvas
    canvas.querySelectorAll('.col').forEach(c => c.remove());
    // Recreate columns in saved order
    state.columns.forEach(colData => {
      const col = document.createElement('div');
      col.className = 'col';
      if(colData.flex) col.style.flex = colData.flex;
      colData.widgets.forEach(wid => {
        const w = allWidgets[wid];
        if(w) col.appendChild(w);
      });
      // Only add column if it has widgets
      if(col.querySelectorAll('.widget').length > 0) canvas.appendChild(col);
    });
    // Restore collapsed state
    Object.entries(state.collapsed).forEach(([wid, collapsed]) => {
      const w = document.getElementById(wid);
      if(w){
        w.classList.toggle('collapsed', collapsed);
        const tog = w.querySelector('.widget-toggle');
        if(tog){ tog.textContent = collapsed ? '+' : '−'; tog.title = collapsed ? 'Aufklappen' : 'Zuklappen'; }
      }
    });
  }catch(e){}
}

/* ─── Column resize handles ─── */
function addResizeHandles(){
  const canvas = document.getElementById('canvas');
  // Remove old handles
  canvas.querySelectorAll('.col-resize-handle').forEach(h => h.remove());
  // Insert a handle after each non-last col
  const cols = [...canvas.querySelectorAll('.col')];
  cols.forEach((col, i) => {
    if(i < cols.length - 1){
      const handle = document.createElement('div');
      handle.className = 'col-resize-handle';
      col.after(handle);
      handle.addEventListener('mousedown', e => {
        e.preventDefault();
        const leftCol  = handle.previousElementSibling;
        const rightCol = handle.nextElementSibling;
        if(!leftCol || !rightCol || !leftCol.classList.contains('col') || !rightCol.classList.contains('col')) return;
        // Skip resize if either column is collapsed
        if(leftCol.classList.contains('col-collapsed') || rightCol.classList.contains('col-collapsed')) return;
        handle.classList.add('resizing');
        const startX  = e.clientX;
        const leftW0  = leftCol.getBoundingClientRect().width;
        const rightW0 = rightCol.getBoundingClientRect().width;
        const total   = leftW0 + rightW0;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const onMove = ev => {
          const dx = ev.clientX - startX;
          const newLeft  = Math.max(80, Math.min(total - 80, leftW0 + dx));
          const newRight = total - newLeft;
          leftCol.style.flex  = `0 0 ${newLeft}px`;
          rightCol.style.flex = `0 0 ${newRight}px`;
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          handle.classList.remove('resizing');
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }
  });
}

/* ─── per-widget toggle ─── */
function initToggle(widget){
  const tog = widget.querySelector('.widget-toggle');
  if(!tog) return;
  tog.addEventListener('click', e => {
    e.stopPropagation();
    const collapsed = widget.classList.toggle('collapsed');
    tog.textContent = collapsed ? '+' : '−';
    tog.title = collapsed ? 'Aufklappen' : 'Zuklappen';
    updateLayout();
    saveLayout();
  });
}

/* ─── drag-to-reorder across columns ─── */
function initDrag(widget){
  const hdr = widget.querySelector('.widget-header');
  if(!hdr) return;

  hdr.addEventListener('mousedown', e => {
    if(e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();

    const canvas = document.getElementById('canvas');
    const startX = e.clientX, startY = e.clientY;
    let started = false;
    let ghost = null;
    let placeholder = null;
    // 'col' = dropping into existing column | 'new' = creating new column
    let dropMode = 'col';
    let newColInsertBefore = null; // reference element for new-column insertion

    const onMove = ev => {
      if(!started && (Math.abs(ev.clientX-startX)>6||Math.abs(ev.clientY-startY)>6)){
        started = true;
        widget.classList.add('dragging');
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';

        // Place placeholder where widget was
        placeholder = document.createElement('div');
        placeholder.className = 'drop-placeholder';
        widget.parentElement.insertBefore(placeholder, widget);

        // Ghost label
        ghost = document.createElement('div');
        ghost.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;opacity:.7;'+
          'background:var(--sf);border:1px solid var(--bl);border-radius:6px;'+
          'padding:.3rem .65rem;font-size:.72rem;font-weight:700;color:var(--td);white-space:nowrap;';
        ghost.textContent = widget.querySelector('.widget-title-normal')?.textContent?.trim() || '…';
        document.body.appendChild(ghost);
      }
      if(!started) return;

      // Update ghost position
      ghost.style.left = (ev.clientX + 14) + 'px';
      ghost.style.top  = (ev.clientY - 12) + 'px';

      const cols = [...canvas.querySelectorAll('.col')];
      const canvasRect = canvas.getBoundingClientRect();

      /* ── Determine best drop: new column vs existing column ── */
      let foundNew = false;
      let newBefore = null; // insert new col before this element (null = append)
      const NEW_COL_ZONE = 48; // px from left/right edge or gap between cols triggers new-col mode

      // Left edge of canvas → new column before first
      if(cols.length > 0 && ev.clientX < cols[0].getBoundingClientRect().left + NEW_COL_ZONE){
        const threshold = cols[0].getBoundingClientRect().left + NEW_COL_ZONE;
        if(ev.clientX < threshold){ foundNew = true; newBefore = cols[0]; }
      }
      // Right edge → new column after last
      if(!foundNew && cols.length > 0){
        const lastRight = cols[cols.length-1].getBoundingClientRect().right;
        if(ev.clientX > lastRight - NEW_COL_ZONE){ foundNew = true; newBefore = null; }
      }
      // Between two adjacent columns (gap area)
      if(!foundNew){
        for(let i = 0; i < cols.length - 1; i++){
          const r1 = cols[i].getBoundingClientRect();
          const r2 = cols[i+1].getBoundingClientRect();
          const gapMid = (r1.right + r2.left) / 2;
          if(Math.abs(ev.clientX - gapMid) < NEW_COL_ZONE / 2){
            foundNew = true;
            newBefore = cols[i+1];
            break;
          }
        }
      }

      if(foundNew){
        dropMode = 'new';
        newColInsertBefore = newBefore;
        // Move placeholder into canvas (strip form) to indicate new column
        if(placeholder.parentElement !== canvas){
          placeholder.style.flex = '0 0 6px';
          placeholder.style.minWidth = '6px';
          placeholder.style.minHeight = '';
          canvas.insertBefore(placeholder, newBefore);
        } else {
          // Already in canvas: just reposition
          if(newBefore) canvas.insertBefore(placeholder, newBefore);
          else canvas.appendChild(placeholder);
        }
        return;
      }

      /* ── Existing column drop ── */
      dropMode = 'col';
      // Restore placeholder style in case it was in canvas mode
      placeholder.style.flex = '';
      placeholder.style.minWidth = '';
      placeholder.style.minHeight = '40px';

      let bestCol = null, bestTarget = null, bestBefore = true, bestDist = Infinity;

      for(const col of cols){
        // Don't allow dropping into a collapsed strip column
        if(col.classList.contains('col-collapsed')) continue;
        const cr = col.getBoundingClientRect();
        if(ev.clientX < cr.left - 30 || ev.clientX > cr.right + 30) continue;

        const items = [...col.querySelectorAll('.widget:not(.dragging), .drop-placeholder')];
        if(items.length === 0){
          const d = Math.abs(ev.clientX - (cr.left + cr.width/2));
          if(d < bestDist){ bestDist=d; bestCol=col; bestTarget=null; bestBefore=true; }
          continue;
        }
        for(const item of items){
          const r = item.getBoundingClientRect();
          const midY = r.top + r.height/2;
          const before = ev.clientY < midY;
          const dy = Math.abs(ev.clientY - midY);
          const dx = Math.max(0, Math.abs(ev.clientX-(cr.left+cr.width/2)) - cr.width/2);
          const dist = dy + dx * 0.5;
          if(dist < bestDist){ bestDist=dist; bestCol=col; bestTarget=item; bestBefore=before; }
        }
      }

      if(bestCol){
        if(placeholder.parentElement !== bestCol){
          // Move placeholder into this column
          bestCol.appendChild(placeholder);
        }
        if(bestTarget && bestTarget !== placeholder){
          if(bestBefore) bestCol.insertBefore(placeholder, bestTarget);
          else           bestCol.insertBefore(placeholder, bestTarget.nextSibling);
        } else if(!bestTarget){
          bestCol.appendChild(placeholder);
        }
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if(ghost) ghost.remove();

      if(!started){
        widget.classList.remove('dragging');
        return;
      }

      if(dropMode === 'new' && placeholder){
        // Create a new column and insert widget there
        const newCol = document.createElement('div');
        newCol.className = 'col';
        placeholder.replaceWith(newCol);
        newCol.appendChild(widget);
      } else if(placeholder){
        // Drop into existing column at placeholder position
        placeholder.parentElement?.insertBefore(widget, placeholder);
        placeholder.remove();
      }

      widget.classList.remove('dragging');

      // Clean up empty columns
      canvas.querySelectorAll('.col').forEach(col => {
        if(col.querySelectorAll('.widget').length === 0) col.remove();
      });

      updateLayout();
      saveLayout();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function initWidgets(){
  loadLayout(); // restore saved layout before wiring up events
  document.querySelectorAll('.widget').forEach(w => {
    initToggle(w);
    initDrag(w);
  });
  updateLayout();
}

/* ═══════════════════════════════════════════════
   App
   ═══════════════════════════════════════════════ */
class App{
  constructor(){this.db=new DB();this.files=[];this.activeFileId=null;this.latexCode=TMPL;this.filename='document';this.pdfUrl=null;this.isCompiling=false;this.contextTarget=null;this.el={};}

  async init(){
    await this.db.init();
    this.el={
      editor:document.getElementById('code-editor'),hl:document.getElementById('highlight-layer'),
      ln:document.getElementById('line-numbers'),
      compile:document.getElementById('btn-compile'),
      pdf:document.getElementById('pdf-viewer'),ph:document.getElementById('pdf-placeholder'),savePanel:document.getElementById('btn-save-panel'),
      overlay:document.getElementById('compile-overlay'),tree:document.getElementById('file-tree'),
      ctx:document.getElementById('context-menu'),modal:document.getElementById('confirm-modal'),
      msg:document.getElementById('confirm-msg'),yes:document.getElementById('confirm-yes'),
      no:document.getElementById('confirm-no'),
    };
    const sc=await this.db.getKV('latex_content');if(sc)this.latexCode=sc;
    const sn=await this.db.getKV('latex_filename');if(sn)this.filename=sn;
    this.el.editor.value=this.latexCode;
    initWidgets();
    this.bind();
    this.onInput();
    this.fetchDocs();
  }

  bind(){
    const ed=this.el.editor;
    ed.addEventListener('input',()=>this.onInput());
    ed.addEventListener('scroll',()=>{this.el.hl.scrollTop=ed.scrollTop;this.el.hl.scrollLeft=ed.scrollLeft;this.el.ln.scrollTop=ed.scrollTop;});
    ed.addEventListener('keydown',e=>this.onKey(e));
    this.el.compile.addEventListener('click',()=>this.compile());
    this.el.savePanel.addEventListener('click',()=>this.saveToFileTree());
    document.addEventListener('click',()=>{this.el.ctx.style.display='none';});
    document.querySelectorAll('.context-item').forEach(i=>i.addEventListener('click',()=>this.ctxAction(i.dataset.action)));
    document.addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();this.compile();}
      if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();this.saveToFileTree();}
    });
    try{if(typeof browser!=='undefined'&&browser.storage){browser.storage.local.get(['pendingContent']).then(d=>{if(d.pendingContent){this.latexCode=d.pendingContent;this.el.editor.value=this.latexCode;this.onInput();browser.storage.local.remove(['pendingContent']);}});}}catch(e){}
  }

  onInput(){
    this.latexCode=this.el.editor.value;
    this.el.hl.innerHTML=highlight(this.latexCode)+'\n';
    const n=this.latexCode.split('\n').length;let h='';for(let i=1;i<=n;i++)h+=`<span class="line-number">${i}</span>`;
    this.el.ln.innerHTML=h;
    clearTimeout(this._st);this._st=setTimeout(()=>this.db.setKV('latex_content',this.latexCode),500);
  }

  onKey(e){
    if(e.key==='Tab'){e.preventDefault();const s=e.target.selectionStart;e.target.value=e.target.value.substring(0,s)+'  '+e.target.value.substring(e.target.selectionEnd);e.target.selectionStart=e.target.selectionEnd=s+2;this.onInput();}
    if(e.key==='{'){e.preventDefault();const s=e.target.selectionStart,v=e.target.value;e.target.value=v.substring(0,s)+'{}'+v.substring(s);e.target.selectionStart=e.target.selectionEnd=s+1;this.onInput();}
  }

  async compile(){
    if(this.isCompiling)return;this.isCompiling=true;this.el.compile.disabled=true;
    this.el.compile.innerHTML='<span class="spinner"></span>';this.el.overlay.style.display='flex';
    try{
      const r=await fetch(`${API}/compile`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:this.latexCode})});
      const d=await r.json();
      if(r.ok){this.pdfUrl=`${API}/api/preview?t=${Date.now()}`;this.el.pdf.src=this.pdfUrl;this.el.pdf.style.display='block';this.el.ph.style.display='none';}
      else throw new Error(d.error);
    }catch(err){
      try{const fd=new FormData();fd.append('filecontents[]',this.latexCode);fd.append('filename[]','document.tex');fd.append('engine','pdflatex');fd.append('return','pdf');const r=await fetch('https://texlive.net/cgi-bin/latexcgi',{method:'POST',body:fd});if(!r.ok)throw 0;const b=await r.blob();if(this.pdfUrl)URL.revokeObjectURL(this.pdfUrl);this.pdfUrl=URL.createObjectURL(b);this.el.pdf.src=this.pdfUrl;this.el.pdf.style.display='block';this.el.ph.style.display='none';}
      catch(e){this.el.ph.innerHTML=`<div class="empty-hint"><div class="empty-icon">⚠️</div><p style="color:var(--rd)">${err.message||'Fehler'}</p></div>`;this.el.ph.style.display='flex';this.el.pdf.style.display='none';}
    }finally{this.isCompiling=false;this.el.compile.disabled=false;this.el.compile.textContent='Compile';this.el.overlay.style.display='none';}
  }

  extractTitle(){
    const c=this.latexCode||'';
    const sanitize=s=>s.trim().replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,'_').slice(0,60);
    let m=c.match(/\\title\s*\{([^{}]+)\}/);
    if(m){const s=sanitize(m[1]);if(s)return s;}
    m=c.match(/\\section\*?\s*\{([^{}]+)\}/);
    if(m){const s=sanitize(m[1]);if(s)return s;}
    return new Date().toISOString().slice(0,10);
  }

  async saveToFileTree(){
    const def=this.extractTitle();
    const input=window.prompt('Dateiname:',def);
    if(input===null)return;
    const name=(input.trim()||def);
    await this.db.put({id:name,name:name,content:this.latexCode});
    await this.db.setKV('latex_content',this.latexCode);
    await this.db.setKV('latex_filename',name);
    this.filename=name;
    if(!this.files.includes(name)) this.files.push(name);
    this.activeFileId=name;
    this.renderTree();
    const btn=this.el.savePanel;
    const orig=btn.textContent;
    btn.textContent='✓';
    setTimeout(()=>{btn.textContent=orig;},800);
  }

  async fetchDocs(){
    const l=await this.db.getAll();
    this.files=l.map(f=>f.name);
    this.renderTree();
  }

  renderTree(){
    const ul=this.el.tree;ul.innerHTML='';
    if(!this.files||!this.files.length){ul.innerHTML='<li class="doc-empty">Keine Dokumente</li>';return;}
    this.files.forEach(name=>{
      const li=document.createElement('li');
      li.className='doc-item'+(name===this.activeFileId?' active':'');
      const icon=document.createElement('span'); icon.className='doc-icon'; icon.textContent='📄';
      const nameSpan=document.createElement('span'); nameSpan.className='doc-name'; nameSpan.textContent=name;
      const actions=document.createElement('div'); actions.className='doc-actions';
      const btnOpen=document.createElement('button'); btnOpen.className='action-btn'; btnOpen.textContent='📂'; btnOpen.title='Im Editor öffnen';
      btnOpen.onclick=e=>{e.stopPropagation();this.openDoc(name);};
      const btnDownload=document.createElement('button'); btnDownload.className='action-btn'; btnDownload.textContent='⬇'; btnDownload.title='In Dateiverzeichnis öffnen (Download)';
      btnDownload.onclick=e=>{e.stopPropagation();this.openInFS(name);};
      const btnRen=document.createElement('button'); btnRen.className='action-btn'; btnRen.textContent='✏️'; btnRen.title='Umbenennen';
      btnRen.onclick=e=>{e.stopPropagation();this.startRename(name,li);};
      const btnDel=document.createElement('button'); btnDel.className='action-btn delete'; btnDel.textContent='🗑️'; btnDel.title='Löschen';
      btnDel.onclick=e=>{e.stopPropagation();this.confirmDel(name);};
      actions.append(btnOpen, btnDownload, btnRen, btnDel);
      li.append(icon, nameSpan, actions);
      li.addEventListener('dblclick',()=>this.openDoc(name));
      li.addEventListener('contextmenu',e=>{e.preventDefault();this.contextTarget=name;this.el.ctx.style.display='block';this.el.ctx.style.left=e.clientX+'px';this.el.ctx.style.top=e.clientY+'px';});
      ul.appendChild(li);
    });
  }

  async openDoc(n){
    const f=await this.db.get(n);
    if(!f)return;
    this.latexCode=f.content;
    this.el.editor.value=f.content;
    this.filename=n;
    this.db.setKV('latex_content',f.content);
    this.db.setKV('latex_filename',n);
    this.activeFileId=n;
    this.onInput();
    this.renderTree();
  }

  async openInFS(n){
    const f=await this.db.get(n);
    const content=f?f.content:this.latexCode;
    const b=new Blob([content],{type:'application/x-tex'});
    const u=URL.createObjectURL(b);
    const a=document.createElement('a');
    a.href=u; a.download=n.endsWith('.tex')?n:n+'.tex';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(u),100);
  }

  startRename(n,li){
    const s=li.querySelector('.doc-name');
    const old=s.textContent;
    s.textContent='';
    const inp=document.createElement('input');
    inp.className='rename-input';
    inp.value=old;
    s.appendChild(inp);
    inp.select();
    inp.focus();
    let done=false;
    const c=async()=>{
      if(done)return; done=true;
      const nn=inp.value.trim();
      if(nn&&nn!==old){
        const f=await this.db.get(old);
        if(f){
          await this.db.del(old);
          await this.db.put({id:nn,name:nn,content:f.content});
          const i=this.files.indexOf(old);
          if(i>=0) this.files[i]=nn;
          if(this.activeFileId===old){this.activeFileId=nn;this.filename=nn;await this.db.setKV('latex_filename',nn);}
          this.renderTree();
        }else{s.textContent=old;}
      }else{s.textContent=old;}
    };
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();c();}if(e.key==='Escape'){done=true;s.textContent=old;}});
    inp.addEventListener('blur',c);
  }

  confirmDel(n){
    this.el.msg.textContent=`„${n}" löschen?`;
    this.el.modal.style.display='flex';
    const y=async()=>{
      await this.db.del(n);
      this.files=this.files.filter(f=>f!==n);
      if(this.activeFileId===n) this.activeFileId=null;
      this.el.modal.style.display='none';
      cl();
      this.renderTree();
    };
    const no=()=>{this.el.modal.style.display='none';cl();};
    const cl=()=>{this.el.yes.removeEventListener('click',y);this.el.no.removeEventListener('click',no);};
    this.el.yes.addEventListener('click',y);
    this.el.no.addEventListener('click',no);
  }

  async ctxAction(a){
    this.el.ctx.style.display='none';
    if(!this.contextTarget)return;
    const n=this.contextTarget;
    if(a==='rename'){
      const nn=prompt('Neuer Name:',n);
      if(nn&&nn.trim()&&nn.trim()!==n){
        const f=await this.db.get(n);
        if(f){
          await this.db.del(n);
          await this.db.put({id:nn.trim(),name:nn.trim(),content:f.content});
          this.fetchDocs();
        }
      }
    }else if(a==='delete'){
      this.confirmDel(n);
    }else if(a==='duplicate'){
      const f=await this.db.get(n);
      if(f){
        let copy=n+'_copy', i=1;
        while(this.files.includes(copy)){copy=n+'_copy'+(++i);}
        await this.db.put({id:copy,name:copy,content:f.content});
        this.fetchDocs();
      }
    }
  }
}

new App().init().catch(e=>console.error('Init:',e));
})();

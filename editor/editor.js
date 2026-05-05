(function(){
'use strict';
const API='http://localhost:5000';

/* ── Storage ─────────────────────────────────── */
class DB{
  constructor(){this.db=null;}
  init(){return new Promise((r,j)=>{const q=indexedDB.open('latexpy-ext',1);q.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains('files'))d.createObjectStore('files',{keyPath:'id'});if(!d.objectStoreNames.contains('kv'))d.createObjectStore('kv',{keyPath:'key'});};q.onsuccess=e=>{this.db=e.target.result;r();};q.onerror=j;});}
  _t(n,m){return this.db.transaction(n,m||'readonly').objectStore(n);}
  getAll(){return new Promise((r,j)=>{const q=this._t('files').getAll();q.onsuccess=()=>r(q.result);q.onerror=j;});}
  put(f){return new Promise((r,j)=>{const q=this._t('files','readwrite').put(f);q.onsuccess=()=>r();q.onerror=j;});}
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
   Widget System – drag, resize, collapse
   ═══════════════════════════════════════════════ */


function initWidgets(){
  const canvas = document.getElementById('canvas');

  document.querySelectorAll('.widget').forEach(w=>{
    const hdr = w.querySelector('.widget-header');
    const tog = w.querySelector('.widget-toggle');

    // ── Collapse / Expand ──
    tog.addEventListener('click', e=>{
      e.stopPropagation();
      const collapsed = w.classList.toggle('collapsed');
      tog.textContent = collapsed ? '+' : '−';
      tog.title = collapsed ? 'Aufklappen' : 'Zuklappen';
    });

    // ── Drag to reorder in grid ──
    hdr.addEventListener('mousedown', e=>{
      if(e.button!==0 || e.target.closest('button')) return;
      e.preventDefault();
      const startX=e.clientX, startY=e.clientY;
      let started=false, placeholder=null;

      const onMove = ev=>{
        if(!started && (Math.abs(ev.clientX-startX)>6||Math.abs(ev.clientY-startY)>6)){
          started=true;
          w.classList.add('dragging');
          // Insert placeholder where widget was
          placeholder = document.createElement('div');
          placeholder.className = 'drop-placeholder';
          canvas.insertBefore(placeholder, w);
          document.body.style.cursor='grabbing';
          document.body.style.userSelect='none';
        }
        if(!started) return;

        // Find which widget or placeholder the cursor is over
        const widgets = [...canvas.querySelectorAll('.widget:not(.dragging), .drop-placeholder')];
        for(const target of widgets){
          const r = target.getBoundingClientRect();
          if(ev.clientX>=r.left && ev.clientX<=r.right && ev.clientY>=r.top && ev.clientY<=r.bottom){
            if(target === placeholder) break;
            const midX = r.left + r.width/2;
            if(ev.clientX < midX){
              canvas.insertBefore(placeholder, target);
            } else {
              canvas.insertBefore(placeholder, target.nextSibling);
            }
            break;
          }
        }
      };

      const onUp = ()=>{
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor='';
        document.body.style.userSelect='';
        if(!started) return;
        w.classList.remove('dragging');
        if(placeholder){
          canvas.insertBefore(w, placeholder);
          placeholder.remove();
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
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
      ln:document.getElementById('line-numbers'),name:document.getElementById('project-name'),
      compile:document.getElementById('btn-compile'),save:document.getElementById('btn-save'),
      pdf:document.getElementById('pdf-viewer'),ph:document.getElementById('pdf-placeholder'),
      overlay:document.getElementById('compile-overlay'),tree:document.getElementById('file-tree'),
      ctx:document.getElementById('context-menu'),modal:document.getElementById('confirm-modal'),
      msg:document.getElementById('confirm-msg'),yes:document.getElementById('confirm-yes'),
      no:document.getElementById('confirm-no'),
    };
    const sc=await this.db.getKV('latex_content');if(sc)this.latexCode=sc;
    const sn=await this.db.getKV('latex_filename');if(sn)this.filename=sn;
    this.el.name.value=this.filename;
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
    this.el.save.addEventListener('click',()=>this.saveTex());
    this.el.name.addEventListener('change',()=>{this.filename=this.el.name.value;this.db.setKV('latex_filename',this.filename);});
    document.addEventListener('click',()=>{this.el.ctx.style.display='none';});
    document.querySelectorAll('.context-item').forEach(i=>i.addEventListener('click',()=>this.ctxAction(i.dataset.action)));
    document.addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();this.compile();}
      if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();this.saveTex();}
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
    }finally{this.isCompiling=false;this.el.compile.disabled=false;this.el.compile.textContent='▶ PDF';this.el.overlay.style.display='none';}
  }

  saveTex(){const b=new Blob([this.latexCode],{type:'application/x-tex'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=this.filename.endsWith('.tex')?this.filename:this.filename+'.tex';a.click();URL.revokeObjectURL(u);}

  async fetchDocs(){
    try{const r=await fetch(`${API}/api/documents`);this.files=await r.json();this.renderTree();}
    catch(e){const l=await this.db.getAll();this.files=l.length?l.map(f=>f.name):['main'];if(!l.length)await this.db.put({id:'main',name:'main',content:this.latexCode});this.renderTree();}
  }

  renderTree(){
    const ul=this.el.tree;ul.innerHTML='';
    if(!this.files||!this.files.length){ul.innerHTML='<li class="doc-empty">Keine Dokumente</li>';return;}
    this.files.forEach(name=>{
      const li=document.createElement('li');li.className='doc-item'+(name===this.activeFileId?' active':'');
      li.innerHTML=`<span class="doc-icon">📄</span><span class="doc-name">${name}</span><div class="doc-actions"><button class="action-btn" data-a="open" data-n="${name}">📂</button><button class="action-btn" data-a="ren" data-n="${name}">✏️</button><button class="action-btn delete" data-a="del" data-n="${name}">🗑️</button></div>`;
      li.addEventListener('dblclick',()=>this.openDoc(name));
      li.querySelectorAll('.action-btn').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const a=b.dataset.a,n=b.dataset.n;if(a==='open')this.openDoc(n);else if(a==='ren')this.startRename(n,li);else if(a==='del')this.confirmDel(n);}));
      li.addEventListener('contextmenu',e=>{e.preventDefault();this.contextTarget=name;this.el.ctx.style.display='block';this.el.ctx.style.left=e.clientX+'px';this.el.ctx.style.top=e.clientY+'px';});
      ul.appendChild(li);
    });
  }

  async openDoc(n){try{const r=await fetch(`${API}/api/documents/${encodeURIComponent(n)}/tex`);const d=await r.json();if(d.code){this.latexCode=d.code;this.el.editor.value=d.code;this.filename=n;this.el.name.value=n;this.db.setKV('latex_content',d.code);this.activeFileId=n;this.onInput();this.renderTree();this.el.pdf.src=`${API}/api/documents/${encodeURIComponent(n)}/pdf?t=${Date.now()}`;this.el.pdf.style.display='block';this.el.ph.style.display='none';}}catch(e){}}

  startRename(n,li){const s=li.querySelector('.doc-name');const old=s.textContent;s.innerHTML=`<input class="rename-input" value="${old}">`;const inp=s.querySelector('input');inp.select();inp.focus();const c=async()=>{const nn=inp.value.trim();if(nn&&nn!==old){try{await fetch(`${API}/api/documents/${encodeURIComponent(old)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({new_name:nn})});this.fetchDocs();}catch(e){s.textContent=old;}}else s.textContent=old;};inp.addEventListener('keydown',e=>{if(e.key==='Enter')c();if(e.key==='Escape')s.textContent=old;});inp.addEventListener('blur',c);}

  confirmDel(n){this.el.msg.textContent=`„${n}.tex" löschen?`;this.el.modal.style.display='flex';const y=async()=>{await fetch(`${API}/api/documents/${encodeURIComponent(n)}`,{method:'DELETE'});this.el.modal.style.display='none';cl();this.fetchDocs();};const no=()=>{this.el.modal.style.display='none';cl();};const cl=()=>{this.el.yes.removeEventListener('click',y);this.el.no.removeEventListener('click',no);};this.el.yes.addEventListener('click',y);this.el.no.addEventListener('click',no);}

  ctxAction(a){this.el.ctx.style.display='none';if(!this.contextTarget)return;const n=this.contextTarget;if(a==='rename'){const nn=prompt('Neuer Name:',n);if(nn&&nn!==n)fetch(`${API}/api/documents/${encodeURIComponent(n)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({new_name:nn})}).then(()=>this.fetchDocs());}else if(a==='delete')this.confirmDel(n);else if(a==='duplicate')fetch(`${API}/api/documents/${encodeURIComponent(n)}/tex`).then(r=>r.json()).then(d=>{if(d.code)return fetch(`${API}/compile`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:d.code,name:n+'_copy'})});}).then(()=>this.fetchDocs()).catch(()=>{});}
}

new App().init().catch(e=>console.error('Init:',e));
})();

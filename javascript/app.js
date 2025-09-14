// Config
const DATA_URL = './drawings.json';
const state = {
  authors: [],
  drawings: [],
  currentAuthorId: 'all',
  view: 'grid', // 'grid' | 'masonry'
  sort: 'desc', // 'asc' | 'desc' (by date)
  sortType: 'all' // 'all' | 'image' | 'gif' | 'video'
};


// Helpers
const qs = s => document.querySelector(s);
const el = (t, c) => { const n=document.createElement(t); if(c) n.className=c; return n; };
const delay = ms => new Promise(r=>setTimeout(r,ms));
const setPressed = (btn, pressed) => btn.setAttribute('aria-pressed', String(pressed));
const fmtDate = iso => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'2-digit' });
};

function setQuery(authorId, sort, sortType){
  const url = new URL(location);
  if(authorId==='all') url.searchParams.delete('author'); else url.searchParams.set('author', authorId);
  if(sort==='desc') url.searchParams.delete('sort'); else url.searchParams.set('sort', sort);
  if(!sortType || sortType==='all') url.searchParams.delete('type'); else url.searchParams.set('type', sortType);
  history.pushState({}, '', url);
}


// Render: authors bar
function renderAuthorBar(){
  const bar = qs('#authorBar'); bar.innerHTML = '';
  const makeChip = (author) => {
    const chip = el('button','chip'); chip.type='button';
    chip.textContent = author ? author.name : 'All';
    chip.dataset.id = author ? author.id : 'all';
    const active = (author && author.id===state.currentAuthorId) || (!author && state.currentAuthorId==='all');
    if(active) chip.classList.add('active');
    chip.addEventListener('click', async () => {
      if(chip.dataset.id===state.currentAuthorId) return;
      state.currentAuthorId = chip.dataset.id;
      setQuery(state.currentAuthorId, state.sort);
      updateCrumb();
      await animateSwitch();
      renderAuthorBar();
      renderGallery();
    });
    return chip;
  };
  bar.appendChild( makeChip(null) );
  state.authors.forEach(a => bar.appendChild( makeChip(a) ));
}

function updateCrumb(){
  const c = qs('#crumb');
  if(state.currentAuthorId==='all') c.textContent = 'All authors';
  else{
    const a = state.authors.find(x=>x.id===state.currentAuthorId);
    c.textContent = a ? `Author: ${a.name}` : 'All authors';
  }
}

async function animateSwitch(){
  const app = qs('#app');
  app.classList.add('switching');
  await delay(140);
  app.classList.remove('switching');
}

const toTime = (v) => {
  if (!v) return NaN;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'unknown') return NaN;
  const iso = Date.parse(s);
  if (!isNaN(iso)) return iso;

  let m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]).getTime();

  const months={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s*(\d{4})$/);
  if (m){ const mon=months[m[1].slice(0,3).toLowerCase()]; if(mon!=null) return new Date(+m[3],mon,+m[2]).getTime(); }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (m){ const mon=months[m[2].slice(0,3).toLowerCase()]; if(mon!=null) return new Date(+m[3],mon,+m[1]).getTime(); }
  return NaN;
};

const cmpByDate = (a,b,dir) => {
  const da = toTime(a.date), db = toTime(b.date);
  const va = isFinite(da),  vb = isFinite(db);
  if (va && vb) return dir==='asc' ? (da-db) : (db-da);
  if (va && !vb) return -1;
  if (!va && vb) return 1;
  return (a._i - b._i); // stable si dates invalides
};

const cmpByTypeThenDate = (a,b) => {
  if (state.sortType && state.sortType !== 'all') {
    // priorité choisie en premier, puis les deux autres
    const first = state.sortType;
    const order = [first, ...['image','gif','video'].filter(t=>t!==first)];
    const rank = t => {
      const i = order.indexOf((t||'image'));
      return i === -1 ? 99 : i;
    };
    const rt = rank(a.type), ru = rank(b.type);
    if (rt !== ru) return rt - ru;
  }
  return cmpByDate(a,b,state.sort);
};



function getFilteredSorted(){
  let list = state.currentAuthorId==='all'
    ? state.drawings
    : state.drawings.filter(d=>d.authorId===state.currentAuthorId);

  return list.slice().sort(cmpByTypeThenDate);
}

// Gallery
function renderGallery(){
  const mount = qs('#gallery');
  mount.className = state.view === 'masonry' ? 'masonry' : '';

  const grid = el('div','grid');
  const list = getFilteredSorted();

  list.forEach((d, idx) => {
    const card = el('article','card');

    // media (image by default)
    let media;
    if (d.type === 'video') {
      media = document.createElement('video');
      media.src = d.url;
      if (d.poster) media.setAttribute('poster', d.poster);
      media.muted = true; media.autoplay = true; media.loop = true;
      media.playsInline = true; media.preload = 'metadata'; media.controls = false;
    } else {
      // image OU gif → <img>
      media = new Image();
      media.src = d.url;
      media.alt = 'Drawing';
      media.loading = 'lazy';
    }


    const badge = el('div','badge');
    badge.textContent = fmtDate(d.date) || '';

    card.append(media, badge);
    grid.append(card);

    // fade-in
    const io = new IntersectionObserver((entries, obs) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
      }
    }, { rootMargin: '40px' });
    io.observe(card);

    // open lightbox
    card.addEventListener('click', () => openLightbox(idx, list));
  });

  mount.replaceChildren(grid);
}

function wireControls(){
  const gridBtn = qs('#gridBtn');
  const masonryBtn = qs('#masonryBtn');
  const sortSel = qs('#sort');
  const typeSel = qs('#sortType');

  gridBtn.addEventListener('click', ()=>{
    state.view='grid'; setPressed(gridBtn,true); setPressed(masonryBtn,false);
    renderGallery();
  });
  masonryBtn.addEventListener('click', ()=>{
    state.view='masonry'; setPressed(gridBtn,false); setPressed(masonryBtn,true);
    renderGallery();
  });

  sortSel.addEventListener('change', async ()=>{
    state.sort = sortSel.value;
    setQuery(state.currentAuthorId, state.sort, state.sortType);
    await animateSwitch(); renderGallery();
  });

  if (typeSel){
    typeSel.addEventListener('change', async ()=>{
      state.sortType = typeSel.value;
      setQuery(state.currentAuthorId, state.sort, state.sortType);
      await animateSwitch(); renderGallery();
    });
  }
}

/* ------- Lightbox (simple) ------- */
let lightbox, lbMedia, lbIndex = 0, lbList = [];

function ensureLightbox(){
  if (lightbox) return;

  lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.setAttribute('role','dialog');
  lightbox.setAttribute('aria-modal','true');
  lightbox.innerHTML = `
    <div class="lightbox-inner" id="lb-inner">
      <div class="lightbox-top">
        <div id="lb-info"></div>
        <button class="lightbox-btn lightbox-close" id="lb-close" aria-label="Close">✕</button>
      </div>
      <div class="lightbox-media" id="lb-media"></div>
      <div class="lightbox-actions">
        <button class="lightbox-btn" id="lb-prev" aria-label="Previous">‹</button>
        <button class="lightbox-btn" id="lb-next" aria-label="Next">›</button>
      </div>
      <div class="lightbox-footer" id="lb-footer"></div>
    </div>
  `;
  document.body.appendChild(lightbox);

  lbMedia  = lightbox.querySelector('#lb-media');
  const lbInfo   = lightbox.querySelector('#lb-info');
  const lbFooter = lightbox.querySelector('#lb-footer');

  const lbDate   = (d)=> (new Date(d).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'2-digit'}));
  const lbAuthor = (id)=> (state.authors.find(a=>a.id===id)?.name ?? 'Unknown');

  lightbox.updateInfo = (item)=>{
    lbInfo.textContent = `${lbAuthor(item.authorId)} — ${lbDate(item.date) || ''}`;
    lbFooter.textContent = 'Use ◀ ▶ or click to navigate — Esc to close';
  };

  // backdrop click to close
  lightbox.addEventListener('click', (e)=>{ if(e.target === lightbox) closeLightbox(); });
  // buttons
  lightbox.querySelector('#lb-close').addEventListener('click', closeLightbox);
  lightbox.querySelector('#lb-prev').addEventListener('click', ()=> showLightboxIndex(lbIndex-1));
  lightbox.querySelector('#lb-next').addEventListener('click', ()=> showLightboxIndex(lbIndex+1));

  // keyboard (bind once)
  if (!lightbox._keysBound){
    lightbox._keysBound = true;
    window.addEventListener('keydown', (e)=>{
      if(!lightbox.classList.contains('open')) return;
      if(e.key === 'Escape') closeLightbox();
      else if(e.key === 'ArrowLeft') showLightboxIndex(lbIndex-1);
      else if(e.key === 'ArrowRight') showLightboxIndex(lbIndex+1);
    });
  }
}

function openLightbox(index, list){
  ensureLightbox();
  lbList  = list;
  lbIndex = index;
  document.body.style.overflow = 'hidden';   // freeze scroll
  lightbox.classList.add('open');
  showLightboxIndex(lbIndex);
}

function closeLightbox(){
  if(!lightbox) return;
  lightbox.classList.remove('open');
  document.body.style.overflow = '';
  lbList = [];
}

function showLightboxIndex(idx){
  if (!lbList.length) return;
  if (idx < 0) idx = lbList.length - 1;
  if (idx >= lbList.length) idx = 0;
  lbIndex = idx;

  const item = lbList[lbIndex];
  lbMedia.innerHTML = '';

  let node;
  if (item.type === 'video') {
    node = document.createElement('video');
    node.src = item.url;
    if (item.poster) node.setAttribute('poster', item.poster);
    node.controls = true;
    node.playsInline = true;
  } else {
    node = new Image();
    node.alt = 'Drawing';
    node.src = item.url;
  }
  lbMedia.appendChild(node);
  if (typeof lightbox.updateInfo === 'function') lightbox.updateInfo(item);
}

/* ------- Boot ------- */
async function boot(){
  try{
    const res = await fetch(DATA_URL, {cache:'no-store'});
    if(!res.ok) throw new Error('Failed to load drawings.json');
    const data = await res.json();
    state.authors = data.authors || [];
    state.drawings = (data.drawings || []).map((d,i) => ({
      id:d.id, authorId:d.authorId, url:d.url, date:(d.date||'').trim(),
      type:d.type || 'image', poster:d.poster || null, _i:i
    }));

    // URL params
    const url = new URL(location);
    const pAuthor = url.searchParams.get('author');
    const pSort = url.searchParams.get('sort');
    const pType = url.searchParams.get('type');
    qs('#sort').value = state.sort;
    if (qs('#sortType')) qs('#sortType').value = state.sortType;

    if (pType && ['all','image','gif','video'].includes(pType)) state.sortType = pType;
    if(pAuthor && (pAuthor==='all' || state.authors.some(a=>a.id===pAuthor))) state.currentAuthorId = pAuthor;
    if(pSort && (pSort==='asc' || pSort==='desc')) state.sort = pSort;

    // reflect UI
    qs('#sort').value = state.sort;
    setPressed(qs('#gridBtn'), state.view==='grid');
    setPressed(qs('#masonryBtn'), state.view==='masonry');

    renderAuthorBar();
    updateCrumb();
    wireControls();
    renderGallery();
  }catch(err){
    console.error(err);
    qs('#gallery').innerHTML = `<p style="color:#f88">Could not load <code>drawings.json</code>. Make sure it is next to <code>index.html</code>.</p>`;
  }
}
boot();

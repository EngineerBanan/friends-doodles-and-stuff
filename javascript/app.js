// Config
const DATA_URL = './drawings.json';
const state = {
  authors: [],
  drawings: [],
  currentAuthorId: 'all',
  view: 'grid', // 'grid' | 'masonry'
  sort: 'desc'  // 'asc' | 'desc' (by date)
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

function setQuery(authorId, sort){
  const url = new URL(location);
  if(authorId==='all') url.searchParams.delete('author'); else url.searchParams.set('author', authorId);
  if(sort==='desc') url.searchParams.delete('sort'); else url.searchParams.set('sort', sort);
  history.pushState({}, '', url);
}

// Render
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

function getFilteredSorted(){
  let list = state.currentAuthorId==='all'
    ? state.drawings
    : state.drawings.filter(d=>d.authorId===state.currentAuthorId);
  // sort by date
  list = list.slice().sort((a,b)=>{
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    return state.sort==='asc' ? (da-db) : (db-da);
  });
  return list;
}

function renderGallery(){
  const mount = qs('#gallery');
  // active/désactive le mode masonry (le CSS s'occupe du layout en colonnes)
  mount.className = state.view === 'masonry' ? 'masonry' : '';

  const grid = el('div','grid');
  const list = getFilteredSorted(); // déjà existant

  list.forEach((d, idx) => {
    const card = el('article','card');

    // --- média (image par défaut si type absent) ---
    let media;
    if (d.type === 'video') {
      media = document.createElement('video');
      media.src = d.url;
      media.controls = true;
      media.playsInline = true;
    } else {
      media = new Image();
      media.src = d.url;
      media.alt = 'Drawing';
      media.loading = 'lazy';
    }

    // --- badge date ---
    const badge = el('div','badge');
    badge.textContent = fmtDate(d.date) || '';

    card.append(media, badge);
    grid.append(card);

    // --- fade-in au scroll ---
    const io = new IntersectionObserver((entries, obs) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
      }
    }, { rootMargin: '40px' });
    io.observe(card);

    // --- ouverture lightbox au clic ---
    card.addEventListener('click', () => openLightbox(idx, list));
  });

  mount.replaceChildren(grid);
}


function wireControls(){
  const gridBtn = qs('#gridBtn');
  const masonryBtn = qs('#masonryBtn');
  const sortSel = qs('#sort');

  gridBtn.addEventListener('click', ()=>{ state.view='grid'; setPressed(gridBtn,true); setPressed(masonryBtn,false); renderGallery(); });
  masonryBtn.addEventListener('click', ()=>{ state.view='masonry'; setPressed(gridBtn,false); setPressed(masonryBtn,true); renderGallery(); });
  sortSel.addEventListener('change', async ()=>{ state.sort = sortSel.value; setQuery(state.currentAuthorId, state.sort); await animateSwitch(); renderGallery(); });
}

let lightbox, lbMedia, lbDate, lbAuthor, lbIndex = 0, lbList = [];

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

  // petites helpers
  lbDate   = (d)=> (new Date(d).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'2-digit'}));
  lbAuthor = (id)=> (state.authors.find(a=>a.id===id)?.name ?? 'Unknown');

  // Click background to close
  lightbox.addEventListener('click', (e)=>{
    if(e.target === lightbox) closeLightbox();
  });
  // Close button
  lightbox.querySelector('#lb-close').addEventListener('click', closeLightbox);
  // Prev/Next
  lightbox.querySelector('#lb-prev').addEventListener('click', ()=> showLightboxIndex(lbIndex-1));
  lightbox.querySelector('#lb-next').addEventListener('click', ()=> showLightboxIndex(lbIndex+1));
  // Keyboard
  window.addEventListener('keydown', (e)=>{
    if(!lightbox.classList.contains('open')) return;
    if(e.key === 'Escape') closeLightbox();
    else if(e.key === 'ArrowLeft') showLightboxIndex(lbIndex-1);
    else if(e.key === 'ArrowRight') showLightboxIndex(lbIndex+1);
  });

  // expose pour mise à jour d'infos
  lightbox.updateInfo = (item)=>{
    lbInfo.textContent = `${lbAuthor(item.authorId)} — ${lbDate(item.date) || ''}`;
    lbFooter.textContent = 'Use ◀ ▶ or click to navigate — Esc to close';
  };
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

function enableZoom(wrap, layer){
  let scale = 1, min = 1, max = 4, x = 0, y = 0;
  let dragging = false, lastX = 0, lastY = 0;

  const active = new Map(); // for pinch
  let startDist = 0, startScale = 1, startX = 0, startY = 0, startCx = 0, startCy = 0;

  const apply = () => {
    // clamp to keep content roughly in view
    const rect = wrap.getBoundingClientRect();
    const lw = layer.scrollWidth * scale;
    const lh = layer.scrollHeight * scale;
    const maxX = Math.max(0, (lw - rect.width) / 2 + 80);
    const maxY = Math.max(0, (lh - rect.height) / 2 + 80);
    x = Math.min(maxX, Math.max(-maxX, x));
    y = Math.min(maxY, Math.max(-maxY, y));
    layer.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  };

  const zoomAt = (clientX, clientY, factor) => {
    const r = layer.getBoundingClientRect();
    const cx = clientX - r.left, cy = clientY - r.top;
    const prev = scale;
    scale = Math.min(max, Math.max(min, scale * factor));
    // keep cursor point stable
    x = cx - (cx - x) * (scale / prev);
    y = cy - (cy - y) * (scale / prev);
    if (scale === 1) { x = 0; y = 0; }
    apply();
  };

  // Wheel zoom
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1/1.12;
    zoomAt(e.clientX, e.clientY, factor);
  }, { passive:false });

  // Double click/tap toggle 1x/2x
  wrap.addEventListener('dblclick', e => {
    e.preventDefault();
    const targetScale = scale > 1 ? 1 : 2;
    const factor = targetScale / scale;
    zoomAt(e.clientX, e.clientY, factor);
  });

  // Drag to pan (when zoomed)
  wrap.addEventListener('pointerdown', e => {
    wrap.setPointerCapture(e.pointerId);
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    wrap.classList.add('dragging');
    active.set(e.pointerId, {x:e.clientX, y:e.clientY});
    // pinch start
    if (active.size === 2){
      const pts = [...active.values()];
      startDist = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
      startScale = scale; startX = x; startY = y;
      startCx = (pts[0].x + pts[1].x)/2; startCy = (pts[0].y + pts[1].y)/2;
    }
  });

  wrap.addEventListener('pointermove', e => {
    const a = active.get(e.pointerId);
    if (a){ a.x = e.clientX; a.y = e.clientY; }

    // pinch
    if (active.size === 2){
      const pts = [...active.values()];
      const dist = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
      if (startDist > 0){
        scale = Math.min(max, Math.max(min, startScale * (dist / startDist)));
        // keep pinch center stable
        const factor = scale / startScale;
        x = startCx - (startCx - startX) * factor;
        y = startCy - (startCy - startY) * factor;
        apply();
      }
      return;
    }

    // pan
    if (dragging && scale > 1){
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      x += dx; y += dy;
      apply();
    }
  });

  wrap.addEventListener('pointerup', e => {
    active.delete(e.pointerId);
    dragging = false; wrap.classList.remove('dragging');
    if (active.size < 2){ startDist = 0; }
  });
  wrap.addEventListener('pointercancel', e => {
    active.delete(e.pointerId);
    dragging = false; wrap.classList.remove('dragging');
    if (active.size < 2){ startDist = 0; }
  });
}

function showLightboxIndex(idx){
  lbMedia.innerHTML = '';
  
  const wrap = document.createElement('div');
  wrap.className = 'lb-zoom';
  const layer = document.createElement('div');
  layer.className = 'lb-zoom-layer';

  let node;
  if (item.type === 'video') {
    node = document.createElement('video');
    node.src = item.url;
    node.controls = true;
    node.playsInline = true;
    // autoplay/loop/muted à ta guise
  } else {
    node = new Image();
    node.alt = 'Drawing';
    node.src = item.url;
  }
  layer.appendChild(node);
  wrap.appendChild(layer);
  lbMedia.appendChild(wrap);

  // activate zoom/pan
  enableZoom(wrap, layer);
}


async function boot(){
  try{
    const res = await fetch(DATA_URL, {cache:'no-store'});
    if(!res.ok) throw new Error('Failed to load drawings.json');
    const data = await res.json();
    state.authors = data.authors || [];
    state.drawings = (data.drawings || []).map(d=>({ id:d.id, authorId:d.authorId, url:d.url, date:d.date }));

    // URL params
    const url = new URL(location);
    const pAuthor = url.searchParams.get('author');
    const pSort = url.searchParams.get('sort');
    if(pAuthor && (pAuthor==='all' || state.authors.some(a=>a.id===pAuthor))) state.currentAuthorId = pAuthor;
    if(pSort && (pSort==='asc' || pSort==='desc')) state.sort = pSort;

    // reflect in UI
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
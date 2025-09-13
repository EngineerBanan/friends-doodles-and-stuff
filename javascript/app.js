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
  mount.className = state.view === 'masonry' ? 'masonry' : '';
  const grid = el('div','grid');
  const list = getFilteredSorted();

  for(const d of list){
    const card = el('article','card');
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

    const badge = el('div','badge');
    badge.textContent = fmtDate(d.date) || '';
    card.append(media, badge);
    grid.append(card);

    const io = new IntersectionObserver((entries, obs)=>{
      for(const e of entries){
        if(e.isIntersecting){ e.target.classList.add('visible'); obs.unobserve(e.target); }
      }
    }, {rootMargin:'40px'});
    io.observe(card);
  }

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
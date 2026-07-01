// app.js — Scratch Project Searcher
const searchForm = document.getElementById('searchForm');
const queryInput = document.getElementById('query');
const resultsEl = document.getElementById('results');
const resultsInfo = document.getElementById('resultsInfo');
const perPageEl = document.getElementById('perPage');
const backupModeEl = document.getElementById('backupMode');
const paginationEl = document.getElementById('pagination');
const searchBtn = document.getElementById('searchBtn');

let currentPage = 1;
let lastQuery = '';

searchBtn.addEventListener('click', () => { currentPage = 1; doSearch(); });
queryInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { currentPage = 1; doSearch(); } });

function buildPrimaryUrl(q, perPage, page){
  // Scratch search API — documented to accept q and limit; we'll use limit & offset-based page
  const limit = perPage;
  const offset = (page - 1) * perPage;
  const url = `https://api.scratch.mit.edu/search/projects?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`;
  return url;
}

function buildProxyUrl(q, perPage, page){
  // Proxy backup using AllOrigins to bypass network/CORS issues: it returns the proxied content
  const apiUrl = buildPrimaryUrl(q, perPage, page);
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`;
}

async function fetchJson(url){
  const res = await fetch(url, {cache: 'no-store'});
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  // try JSON.parse first (proxy returns raw JSON too)
  try{ return JSON.parse(text); } catch(e){
    // If parse failed, try to extract JSON embedded in HTML — not ideal but a fallback
    const jsonMatch = text.match(/(\[\s*\{[\s\S]*\}\s*\])/m);
    if(jsonMatch) return JSON.parse(jsonMatch[1]);
    throw new Error('Invalid JSON response');
  }
}

async function fetchWithBackups(q, perPage, page){
  const mode = backupModeEl.value; // auto, primary, proxy
  const primary = buildPrimaryUrl(q, perPage, page);
  const proxy = buildProxyUrl(q, perPage, page);

  const attempts = mode === 'primary' ? [primary]
    : mode === 'proxy' ? [proxy]
    : [primary, proxy];

  let lastErr = null;
  for(const url of attempts){
    try{
      const data = await fetchJson(url);
      if(!data) throw new Error('No data');
      // Expecting an array of projects
      if(Array.isArray(data)) return data;
      // Some proxies may return {data: [...]}
      if(data.data && Array.isArray(data.data)) return data.data;
      // otherwise try to find array in object
      for(const v of Object.values(data)) if(Array.isArray(v)) return v;
      // if still not array, treat as error
      throw new Error('Unexpected response shape');
    }catch(err){
      lastErr = err;
      console.warn('Fetch failed for', url, err);
      // try next
    }
  }
  throw lastErr || new Error('All fetch attempts failed');
}

function normalizeProject(p){
  // try to find common properties across different responses
  const id = p.id || p.project_id || p.projectId || p.key || p.project || null;
  const title = p.title || p.name || p.project_name || '';
  let author = 'unknown';
  if(p.author){
    if(typeof p.author === 'string') author = p.author;
    else if(p.author.username) author = p.author.username;
    else if(p.author.name) author = p.author.name;
  } else if(p.author_name) author = p.author_name;
  // thumbnail handling — Scratch serves thumbnails under uploads.scratch.mit.edu
  let thumbnail = p.image || p.thumbnail || p.images?.thumbnail || p.thumbnail_url || '';
  if(!thumbnail && id) thumbnail = `https://uploads.scratch.mit.edu/projects/thumbnails/${id}.png`;
  return {id, title, author, thumbnail};
}

function renderProjects(arr){
  resultsEl.innerHTML = '';
  if(!arr.length){ resultsInfo.textContent = 'No projects found.'; return; }
  resultsInfo.textContent = `Showing ${arr.length} project(s).`;
  for(const raw of arr){
    const p = normalizeProject(raw);
    const card = document.createElement('article');
    card.className = 'card';

    const img = document.createElement('img');
    img.className = 'thumb';
    img.alt = p.title || 'Project thumbnail';
    img.src = p.thumbnail || '';
    img.loading = 'lazy';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = p.title || `Project ${p.id || ''}`;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `by ${p.author || 'unknown'}`;

    const actions = document.createElement('div');
    actions.style.marginTop = 'auto';

    const viewBtn = document.createElement('a');
    viewBtn.className = 'btn';
    viewBtn.textContent = 'View on Scratch';
    viewBtn.target = '_blank';
    viewBtn.rel = 'noopener noreferrer';
    if(p.id) viewBtn.href = `https://scratch.mit.edu/projects/${p.id}/`;
    else viewBtn.href = '#';

    actions.appendChild(viewBtn);

    card.appendChild(img);
    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(actions);

    resultsEl.appendChild(card);
  }
}

async function doSearch(){
  const q = (queryInput.value || '').trim();
  if(!q) return;
  const perPage = parseInt(perPageEl.value,10) || 20;
  resultsInfo.textContent = 'Loading…';
  resultsEl.innerHTML = '';
  try{
    const data = await fetchWithBackups(q, perPage, currentPage);
    lastQuery = q;
    renderProjects(data);
    renderPagination(data.length, perPage);
  }catch(err){
    resultsInfo.textContent = `Error: ${err.message}`;
    resultsEl.innerHTML = '';
  }
}

function renderPagination(count, perPage){
  // The Scratch API doesn't always tell total results; we provide simple Prev/Next controls
  paginationEl.innerHTML = '';
  const prev = document.createElement('button');
  prev.className = 'page-btn';
  prev.textContent = 'Prev';
  prev.disabled = currentPage <= 1;
  prev.onclick = () => { if(currentPage>1){ currentPage--; doSearch(); } };

  const next = document.createElement('button');
  next.className = 'page-btn';
  next.textContent = 'Next';
  next.onclick = () => { currentPage++; doSearch(); };

  paginationEl.appendChild(prev);
  const pageLabel = document.createElement('span');
  pageLabel.style.alignSelf = 'center';
  pageLabel.style.margin = '0 0.5rem';
  pageLabel.textContent = `Page ${currentPage}`;
  paginationEl.appendChild(pageLabel);
  paginationEl.appendChild(next);
}

// initial demo search
queryInput.value = 'music';
currentPage = 1;
// doSearch(); // don't auto-run — wait for user to click

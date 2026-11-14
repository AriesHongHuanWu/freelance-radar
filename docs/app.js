const get = (id) => document.getElementById(id);
const categories = ['AI／資料', '前端／軟體', '影片／音訊', 'UI／產品', '3D／CAD'];
const statuses = ['想投遞', '已投遞', '面試中', '已接案', '已結束'];
const types = { Contractor: '接案', 'Part Time': '兼職', Temporary: '短期', Intern: '實習', Other: '任務／人才庫' };
const rank = { 作品集: 0, 表單: 1, 未公布: 2, '測驗／試做': 3 };
const storageKey = 'freelance-radar:tracking:v1';
const taipeiDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' });
const dateTime = new Intl.DateTimeFormat('zh-TW', {timeZone:'Asia/Taipei', dateStyle:'medium', timeStyle:'short'});
const filters = ['search', 'category', 'screen', 'sort', 'pay-filter'];
const pageSize = 24;
let jobs = [];
let tracking = {};
let mode = 'all';
let limit = pageSize;
let activeJob;
let storageFailed = false;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? value : null;
  } catch {
    return null;
  }
}

function link(label, url, className) {
  const node = element('a', label, className);
  node.href = safeUrl(url) || '#opportunities';
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
  return node;
}

function sanitize(input) {
  const result = Object.create(null);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('格式錯誤');
  for (const [id, value] of Object.entries(input)) {
    if (!id || id.length > 500 || !value || !statuses.includes(value.status)) continue;
    const job = value.job;
    if (!job || !safeUrl(job.url) || typeof job.title !== 'string' || typeof job.company !== 'string') continue;
    result[id] = {
      status: value.status,
      date: typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? value.date : '',
      note: typeof value.note === 'string' ? value.note.slice(0, 2000) : '',
      job: {id, title: job.title.slice(0,300), company: job.company.slice(0,200), url: job.url,
            category: categories.includes(job.category) ? job.category : '', screen: '未公布', custom: job.custom === true},
    };
  }
  return result;
}

try {
  tracking = sanitize(JSON.parse(localStorage.getItem(storageKey) || '{}'));
} catch {
  tracking = Object.create(null);
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(tracking));
    storageFailed = false;
  } catch {
    storageFailed = true;
  }
  render();
}

function isDue(record) {
  return record && record.date && record.date <= taipeiDate.format(new Date()) && !['已結束','已接案'].includes(record.status);
}

function jobCard(job) {
  const record = tracking[job.id];
  const title = job.title || '案件';
  const article = element('article', '', 'job');
  const meta = element('div', [job.company, job.category, types[job.type]].filter(Boolean).join(' · '), 'meta');
  const chips = element('div', '', 'chips');
  const level = job.screen;
  chips.append(element('span', level, rank[level] < 2 ? 'easy' : level === '測驗／試做' ? 'test' : ''));
  if (job.region) chips.append(element('span', job.region));
  if (record) chips.append(element('span', record.status + (isDue(record) ? ' · 待跟進' : '')));
  const actions = element('div', '', 'actions');
  const track = element('button', record ? '編輯追蹤' : '＋ 追蹤');
  track.type = 'button';
  track.setAttribute('aria-label', (record ? '編輯追蹤 ' : '追蹤 ') + title);
  track.addEventListener('click', () => openTrack(job));
  actions.append(link('看案件 ↗', job.url, 'action'), track);
  if (job.source === 'Himalayas' && safeUrl(job.sourceUrl)) actions.append(link('Himalayas', job.sourceUrl, 'source-link'));
  article.append(meta, element('h3',title), chips, element('div', job.pay || '費率未公布', 'pay'));
  if (job.note) article.append(element('p', job.note, 'note'));
  if (record?.date) article.append(element('p', '跟進 ' + record.date, 'note'));
  article.append(actions);
  return article;
}

function render() {
  const q = get('search').value.trim().toLowerCase();
  const category = get('category').value;
  const screen = get('screen').value;
  const sort = get('sort').value;
  const pay = get('pay-filter').checked;
  const now = Date.now() / 1000;
  const current = jobs.filter(job => !job.expires || job.expires > now);
  const visible = new Map(current.map(job => [job.id, job]));
  if (mode !== 'all') {
    for (const record of Object.values(tracking)) {
      if (!visible.has(record.job.id)) {
        visible.set(record.job.id, {...record.job, note:record.job.custom ? '自訂案件' : '原來源目前未列此案。'});
      }
    }
  }
  const items = [...visible.values()].filter(job => {
    const record = tracking[job.id];
    return (mode === 'all' || (mode === 'due' ? isDue(record) : record)) &&
      (!q || [job.title, job.company, job.category, job.note, record?.note].filter(Boolean).join(' ').toLowerCase().includes(q)) &&
      (!category || job.category === category) && (!screen || job.screen === screen) && (!pay || job.hourly >= 30);
  });
  items.sort((a,b) => {
    const recent = (b.posted || 0) - (a.posted || 0);
    if (sort === 'recent') return recent;
    if (sort === 'pay') return (b.hourly || 0) - (a.hourly || 0) || recent;
    return rank[a.screen] - rank[b.screen] || recent;
  });
  get('total').textContent = current.length;
  get('fresh').textContent = current.filter(job => job.posted && now - job.posted <= 604800).length;
  get('tracked').textContent = Object.keys(tracking).length;
  get('summary').textContent = '符合 ' + items.length + ' 筆' + (storageFailed ? ' · 瀏覽器無法寫入，請匯出備份' : '');
  get('jobs').replaceChildren(...(items.length ? items.slice(0,limit).map(jobCard) :
    [element('div',mode === 'all' ? '沒有符合目前條件的案件。' : '目前沒有符合條件的追蹤案件。','empty')]));
  get('more').hidden = items.length <= limit;
}

function openTrack(job) {
  activeJob = job;
  const record = job && tracking[job.id];
  get('track-title').textContent = job?.title || '新增自訂案件';
  const custom = !job || job.custom;
  get('custom-fields').hidden = !custom;
  for (const field of ['title','company','url']) {
    const control = get('custom-' + field);
    control.disabled = !custom;
    control.required = !!custom;
    control.value = custom ? job?.[field] || '' : '';
    control.setCustomValidity('');
  }
  get('track-status').value = record?.status || '想投遞';
  get('track-date').value = record?.date || '';
  get('track-note').value = record?.note || '';
  get('remove').hidden = !record;
  get('track-dialog').showModal();
}

get('track-form').addEventListener('submit', event => {
  event.preventDefault();
  const urlField = get('custom-url');
  const custom = !activeJob || activeJob.custom;
  if (custom && !safeUrl(urlField.value.trim())) {
    urlField.setCustomValidity('請輸入 HTTPS 連結。');
    urlField.reportValidity();
    return;
  }
  const job = custom ? {id:activeJob?.id || 'custom:' + crypto.randomUUID(), title:get('custom-title').value.trim(),
                        company:get('custom-company').value.trim(), url:urlField.value.trim(),
                        category:'', screen:'未公布', custom:true} : activeJob;
  const {id,title,company,url,category} = job;
  tracking[id] = {status:get('track-status').value, date:get('track-date').value, note:get('track-note').value,
                  job:{id,title,company,url,category,screen:'未公布',custom:!!custom}};
  get('track-dialog').close();
  if (custom && mode !== 'tracked') get('opportunities').querySelector('[data-mode="tracked"]').click();
  save();
});
get('custom-url').addEventListener('input', event => event.target.setCustomValidity(''));
get('add-job').addEventListener('click', () => openTrack());
get('remove').addEventListener('click', () => {
  delete tracking[activeJob.id];
  get('track-dialog').close();
  save();
});
get('close-track').addEventListener('click', () => get('track-dialog').close());
get('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(tracking,null,2)], {type:'application/json'}));
  const anchor = element('a');
  anchor.download = 'freelance-tracking-' + taipeiDate.format(new Date()) + '.json';
  anchor.href = url;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
});
get('import').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2000000) throw new Error('檔案過大');
    const imported = sanitize(JSON.parse(await file.text()));
    const added = Object.keys(imported).filter(id => !tracking[id]).length;
    tracking = Object.assign(Object.create(null), imported, tracking);
    save();
    get('summary').textContent += ' · 新增 ' + added + ' 筆追蹤';
  } catch {
    get('summary').textContent = '無法匯入，請選擇本網站匯出的 JSON。';
  } finally {
    event.target.value = '';
  }
});
for (const id of filters) {
  get(id).addEventListener(id === 'search' ? 'input' : 'change', () => { limit = pageSize; render(); });
}
for (const button of document.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => {
    mode = button.dataset.mode;
    limit = pageSize;
    for (const other of document.querySelectorAll('[data-mode]')) other.setAttribute('aria-pressed', other === button);
    render();
  });
}
get('more').addEventListener('click', () => { limit += pageSize; render(); });
for (const category of categories) get('category').add(new Option(category));

async function readJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(path + ': ' + response.status);
  return response.json();
}

const [manual, feed] = await Promise.allSettled([readJson('./curated.json'), readJson('./feed.json')]);
const pool = new Map();
for (const dataset of [manual, feed]) {
  if (dataset.status !== 'fulfilled') continue;
  for (const job of dataset.value.jobs) {
    if (!safeUrl(job.url)) continue;
    const key = (job.company + ' ' + job.title).toLowerCase().replace(/[^a-z0-9\p{L}]/gu,'');
    if (!pool.has(key)) pool.set(key,job);
  }
}
jobs = [...pool.values()];
if (manual.status === 'fulfilled') {
  get('source-list').replaceChildren(...manual.value.sources.map(([name,note,url]) => {
    const anchor = link(name + ' ↗',url);
    anchor.append(element('small',note));
    return anchor;
  }));
}
get('updated').textContent = feed.status === 'fulfilled' ? '遠端清單更新 ' + dateTime.format(new Date(feed.value.updated)) :
  '自動清單暫時無法載入';
render();


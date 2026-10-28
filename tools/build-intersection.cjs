/* Rebuild the self-contained presentation using Node.js and the extracted PPTX assets. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const contentDir = path.join(root, 'content', '02-intersection');
const engineDir = path.join(root, 'src', 'intersection');
const config = JSON.parse(fs.readFileSync(path.join(contentDir, 'deck.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(contentDir, 'source-manifest.json'), 'utf8'));
const sourcePages = new Map(manifest.pages.map(page => [page.page, page]));
const originalIds = new Set(['hero', 'issue', 'stop', 'extension', 'yield', 'closing']);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const clean = value => String(value ?? '').replace(/\u200b/g, '').trim();
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const round = value => Math.round(value * 100) / 100;

function text(page, tag, key, value, className = '') {
  return `<${tag} class="${className}" data-template-edit data-edit-id="${page.id}-${key}">${escape(value).replace(/\n/g, '<br>')}</${tag}>`;
}
function asset(page, item) {
  const picture = sourcePages.get(page.sourcePage)?.pictures.find(value => value.index === item.index);
  if (!picture) throw new Error(`Missing source picture p${page.sourcePage}/${item.index}`);
  const absolute = path.resolve(root, picture.webFile);
  if (!absolute.startsWith(root + path.sep)) throw new Error('Asset is outside the project');
  const bytes = fs.readFileSync(absolute);
  const extension = path.extname(absolute).toLowerCase();
  const mime = { '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }[extension];
  if (!mime) throw new Error('Unsupported web image: ' + picture.webFile);
  return { ...picture, ...item, mime, src: `data:${mime};base64,${bytes.toString('base64')}`, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
function image(page, picture) {
  return `<img src="${picture.src}" alt="${escape(picture.caption)}" width="${picture.width}" height="${picture.height}" loading="lazy" data-image-id="${page.id}-image-${picture.index}" data-source-file="${escape(picture.webFile)}">`;
}
function gallery(page, pictures, extra = '') {
  return `<div class="source-gallery gallery-count-${pictures.length} ${extra}">${pictures.map(picture =>
    `<figure><div>${image(page, picture)}</div>${text(page, 'figcaption', 'caption-' + picture.index, picture.caption)}</figure>`).join('')}</div>`;
}
function resolvePage(page) {
  const source = sourcePages.get(page.sourcePage);
  const paragraphs = source?.paragraphs || [];
  const body = page.body || (page.bodySource || []).map(index => clean(paragraphs[index]));
  const points = (page.points || []).map(point => ({
    ...point,
    title: clean(point.title || paragraphs[point.source?.[0]]),
    description: clean(point.body || (point.bodySource ? point.bodySource.map(index => paragraphs[index]).join('；') : paragraphs[point.source?.[1]]))
  }));
  const images = (page.images || []).map(item => asset(page, item));
  const supplements = (page.supplementaryImages || []).map(item => asset(page, item));
  const steps = !points.length ? null : [
    { kicker: '圖面總覽', title: page.title, description: page.overview, chips: [page.subtitle], hint: '', ...(page.type === 'compare' ? { focus: 'both', highlight: 0 } : { feature: 0 }) },
    ...points.map((point, index) => ({ kicker: `重點 ${String(index + 1).padStart(2, '0')} / ${String(points.length).padStart(2, '0')}`, title: point.title, description: point.description, chips: [page.module + ' ' + config.modules.find(module => module.id === page.module).title], hint: '', ...(page.type === 'compare' ? { focus: 'both', highlight: index + 1 } : { feature: index + 1 }) })),
    { kicker: '圖面回顧', title: '回看完整配置', description: '依序回顧：' + points.map(point => point.title).join('、') + '。', chips: ['本頁重點整理'], hint: '', ...(page.type === 'compare' ? { focus: 'both', highlight: 0 } : { feature: 'all' }) }
  ];
  return { ...page, body, points, images, supplements, steps };
}
const pages = config.pages.map(resolvePage);

function overlay(page, picture, side = 'main') {
  return `<svg class="overlays" viewBox="0 0 ${picture.width} ${picture.height}" role="presentation" aria-hidden="true">${page.points.map((point, index) => {
    const box = point.boxes?.[side];
    if (!box) return '';
    if (box.some(value => !Number.isFinite(value)) || box[2] <= 0 || box[3] <= 0) throw new Error('Invalid highlight box');
    const attributes = side === 'main' ? `data-feature="${index + 1}"` : `data-side="${side}" data-comparefeature="${index + 1}"`;
    return `<g class="hotspot-group" ${attributes}><rect class="highlight-box" x="${round(box[0] * picture.width)}" y="${round(box[1] * picture.height)}" width="${round(box[2] * picture.width)}" height="${round(box[3] * picture.height)}" rx="5" ry="5"/></g>`;
  }).join('')}</svg>`;
}
function reference(page) {
  const source = page.sourcePage ? `《模組解說.pptx》原稿第 ${page.sourcePage} 頁` : '章末整理｜轉製補充';
  return `<span class="source-reference">${escape(source)}</span>` + (page.editorial ? '<span class="editorial-note">轉製整理：標題、看圖對照或導讀文字為補充</span>' : '');
}
function render(page) {
  const module = config.modules.find(value => value.id === page.module);
  const label = module ? module.id + ' ' + module.title + ' · 原稿 p.' + page.sourcePage : page.eyebrow;
  const attrs = `id="${page.id}" data-module="${page.module}"${page.sourcePage ? ` data-source-page="${page.sourcePage}"` : ''}${originalIds.has(page.id) ? '' : ` data-added-page data-template="${page.type}"`}`;
  if (page.type === 'cover') {
    const cards = `<div class="module-cards">${config.modules.map(value => `<button class="module-card" data-module-jump="${value.id}" type="button"><span>${value.id}</span><strong>${escape(value.title)}</strong><small>${escape(value.description)}</small></button>`).join('')}</div>`;
    return `<section class="hero" ${attrs}>${text(page, 'div', 'eyebrow', page.eyebrow, 'eyebrow')}${text(page, 'h1', 'title', page.title)}${page.body.map((value, index) => text(page, 'p', 'body-' + index, value)).join('')}${cards}${text(page, 'div', 'hint', '方向鍵、圓點或右下按鈕可逐步播放；捲動瀏覽頁面，點圖放大。', 'hint')}<span class="source-reference">轉製範圍：原稿第 21–35 頁</span></section>`;
  }
  if (page.type === 'closing') return `<section class="closing" ${attrs}>${text(page, 'div', 'eyebrow', page.eyebrow, 'eyebrow')}${text(page, 'h2', 'title', page.title)}${page.body.map((value, index) => text(page, 'p', 'body-' + index, value)).join('')}${text(page, 'span', 'tag', '第 2 章結束', 'tag')}${reference(page)}</section>`;
  if (page.type === 'single') return `<section class="section" ${attrs}><div>${text(page, 'div', 'label', label, 'num')}${text(page, 'h2', 'title', page.title)}${page.body.map((value, index) => text(page, 'p', 'body-' + index, value)).join('')}${text(page, 'span', 'tag', page.tag, 'tag')}${reference(page)}</div><div class="visual">${gallery(page, page.images)}</div></section>`;
  const compare = page.type === 'compare';
  const count = page.steps.length;
  const head = `<div class="lesson-head"><div>${text(page, 'div', 'label', label, 'num')}${text(page, 'h2', 'title', page.title)}</div><div class="stage-count"><span id="${page.id}-count">01</span> / <span class="stage-total">${String(count).padStart(2, '0')}</span><br><small>逐步解說</small></div></div>`;
  const figure = compare ? `<div class="comparison-grid">${page.images.map((picture, index) => {
    const side = index ? 'island' : 'basic';
    const cardId = page.id === 'extension' ? 'cmp-' + side : page.id + '-' + side;
    return `<div class="comparison-card" id="${cardId}" data-template-side="${side}"><div class="comparison-title">${text(page, 'span', 'side-' + index, picture.label, 'label')}${text(page, 'strong', 'figure-title-' + index, picture.caption)}</div><div class="comparison-image">${image(page, picture)}${overlay(page, picture, side)}</div>${text(page, 'div', 'caption-' + picture.index, picture.caption, 'caption')}</div>`;
  }).join('')}</div>` : `<div class="figure-card"><div class="figure-top">${text(page, 'strong', 'figure-title', page.subtitle)}<small>原稿圖面</small></div><div class="figure-frame">${image(page, page.images[0])}${overlay(page, page.images[0])}</div><div class="figure-legend">${text(page, 'span', 'figure-legend', page.images[0].caption)}<span>矩形打亮為教學示意</span></div></div>`;
  const panel = `<div class="explain-card" aria-live="polite"><div class="kicker" id="${page.id}-kicker"></div><h3 id="${page.id}-title"></h3><p id="${page.id}-description"></p><div class="chip-row" id="${page.id}-chips"></div>${compare && page.id === 'extension' ? '' : `<p class="micro" id="${page.id}-hint"></p>`}</div>`;
  const strip = `<div class="stage-strip"><div class="stage-dots" id="${page.id}-dots" aria-label="解說進度"></div><div class="stage-help">使用圓點、方向鍵或右下按鈕逐點解說</div></div>`;
  const supplements = page.supplements.length ? `<details class="supplementary"><summary>展開原稿補充圖（${page.supplements.length} 張）</summary>${gallery(page, page.supplements)}</details>` : '';
  return `<section class="lesson${compare ? ' compare' : ''}" ${attrs}>${head}<div class="workspace">${figure}${panel}</div>${strip}${reference(page)}${supplements}</section>`;
}

const nativeSteps = Object.fromEntries(pages.filter(page => ['stop', 'extension'].includes(page.id)).map(page => [page.id, page.steps]));
const additionalSteps = Object.fromEntries(pages.filter(page => !originalIds.has(page.id) && page.steps).map(page => [page.id, page.steps]));
const runtime = { title: config.title, documentId: config.documentId, modules: config.modules, pages: pages.map(page => ({ id: page.id, module: page.module, sourcePage: page.sourcePage, title: page.title, type: page.type })), nativeSteps, additionalSteps };
const state = {
  version: 1, updatedAt: 0, texts: {}, images: {}, highlights: {},
  steps: { ...nativeSteps, ...additionalSteps },
  pages: pages.filter(page => !originalIds.has(page.id)).map(page => ({ id: page.id, type: page.type })),
  pageOrder: pages.map(page => page.id), pageModules: Object.fromEntries(pages.map(page => [page.id, page.module]))
};
let html = fs.readFileSync(path.join(engineDir, 'presentation-shell.html'), 'utf8');
html = html.replace(/\{\{STYLE:([a-z-]+)\}\}/g, (_, name) => fs.readFileSync(path.join(engineDir, name + '.css'), 'utf8') + (name === 'editor' ? '\n' + fs.readFileSync(path.join(engineDir, 'chapter.css'), 'utf8') : ''));
html = html.replace(/\{\{SCRIPT:([a-z-]+)\}\}/g, (_, name) => fs.readFileSync(path.join(engineDir, name + '.js'), 'utf8'));
html = html.replace('{{DECK_TITLE}}', escape(config.title)).replace('{{DECK_PAGES}}', pages.map(render).join('\n'));
html = html.replace('{{DECK_DATA}}', 'window.intersectionContent=' + json(runtime) + ';').replace('{{EDITOR_STATE}}', json(state));
if (/\{\{(?:STYLE|SCRIPT|DECK_|EDITOR_STATE)/.test(html)) throw new Error('Unresolved build token');
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (!/type="application\/json"/.test(match[1])) new vm.Script(match[2]);
}
fs.writeFileSync(path.join(root, '路口管制.html'), html, 'utf8');

const resolved = { ...config, pages: pages.map(page => ({ ...page, images: page.images.map(({ src, ...item }) => item), supplements: page.supplements.map(({ src, ...item }) => item) })) };
fs.writeFileSync(path.join(contentDir, 'resolved-deck.json'), JSON.stringify(resolved, null, 2), 'utf8');
for (const module of config.modules) {
  const modulePages = pages.filter(page => page.module === module.id);
  const directory = path.join(root, 'materials', '02-路口管制', sourcePages.get(modulePages[0].sourcePage).module);
  const lines = [`# ${module.id} ${module.title}`, '', '來源：模組解說.pptx。圖片直接擷取自原始檔；EMF 另提供 PNG 供網頁顯示。', '', '| 原稿頁次 | HTML 頁面 | 圖片 |', '|---|---|---|'];
  for (const page of modulePages) lines.push(`| ${page.sourcePage} | ${page.id}：${page.title} | ${[...page.images, ...page.supplements].map(item => path.basename(item.webFile)).join('、')} |`);
  lines.push('', '頁面標題、素材順序及打亮框位置：content/02-intersection/deck.json。', '完整原稿文字及圖片來源對照：content/02-intersection/source-manifest.json。', '解說文字與建置結果對照：content/02-intersection/resolved-deck.json。', '原稿數值與用語按原文保留；圖面矩形為教學提示，可在編輯模式調整。');
  fs.writeFileSync(path.join(directory, 'README.md'), lines.join('\n'), 'utf8');
}
console.log(JSON.stringify({ pages: pages.length, steps: pages.reduce((sum, page) => sum + (page.steps?.length || 1), 0), images: pages.reduce((sum, page) => sum + page.images.length + page.supplements.length, 0), output: ['路口管制.html'], bytes: Buffer.byteLength(html) }, null, 2));

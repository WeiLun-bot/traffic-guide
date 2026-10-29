(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VisualLayoutCore = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DOCUMENT_ID = 'general-road-scenarios';
  const fonts = Object.freeze({
    system: '"Microsoft JhengHei", system-ui, sans-serif',
    sans: '"Noto Sans TC", "Microsoft JhengHei", sans-serif',
    serif: '"Noto Serif TC", "PMingLiU", serif',
    latin: 'Lato, "Microsoft JhengHei", sans-serif'
  });
  const limits = {x: [-10000, 10000], y: [-10000, 10000], width: [12, 6000], height: [12, 6000], fontSize: [8, 240], fontWeight: [100, 900], lineHeight: [.8, 4]};
  const clone = value => JSON.parse(JSON.stringify(value));
  const record = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  function assert(condition, message) { if (!condition) throw new Error(message); }
  function inspect(value, depth = 0) {
    assert(depth < 40, '設定層級過深');
    if (typeof value === 'number') assert(Number.isFinite(value), '設定包含無效數值');
    if (!value || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      assert(!['__proto__', 'prototype', 'constructor'].includes(key), '設定包含不允許的屬性');
      inspect(value[key], depth + 1);
    }
  }
  function validate(value) {
    inspect(value);
    assert(record(value) && value.schemaVersion === 1, '不支援的版面設定版本');
    assert(value.documentId === DOCUMENT_ID && value.units === 'css-px', '這不是本簡報的版面設定');
    assert(record(value.legacyState) && value.legacyState.version === 1 && Number.isFinite(value.legacyState.updatedAt), '缺少有效的原簡報編輯設定');
    for (const key of ['texts', 'images', 'highlights', 'disabledHighlights', 'styles', 'frames', 'layouts', 'blocks', 'comparisonTransforms', 'templateMigrations']) assert(record(value.legacyState[key]), '原簡報的 ' + key + ' 設定無效');
    assert(Array.isArray(value.legacyState.pages) && Array.isArray(value.legacyState.pageOrder), '原簡報的頁面設定無效');
    assert(record(value.elements) && Object.keys(value.elements).length <= 20000, '元素清單無效');
    assert(value.imageViews === undefined || record(value.imageViews), '初始圖面設定無效');
    const result = clone(value);
    result.content = validateContent(result.content);
    result.imageViews = result.imageViews || {};
    assert(Object.keys(result.imageViews).length <= 2000, '初始圖面設定過多');
    for (const [id, view] of Object.entries(result.imageViews)) {
      assert(record(view) && typeof view.pageId === 'string' && /^[\w-]{1,160}$/.test(view.pageId), '初始圖面頁面 ID 無效');
      assert(typeof view.assetKey === 'string' && /^[\w:-]{1,200}$/.test(view.assetKey), '初始圖面素材 ID 無效');
      assert(view.id === id && imageView(view.pageId, view.assetKey).id === id && view.units === 'percent', '初始圖面識別資料無效');
      assert(Number.isFinite(view.zoom) && view.zoom >= .02 && view.zoom <= 200, '初始縮放須介於 2% 與 20000%');
      for (const axis of ['x', 'y']) assert(Number.isFinite(view[axis]) && Math.abs(view[axis]) <= 1000, '初始圖面位置須介於 -1000% 與 1000%');
    }
    for (const [id, item] of Object.entries(result.elements)) {
      assert(record(item) && item.id === id && id.length <= 3000, '元素 ID 無效');
      assert(typeof item.pageId === 'string' && /^[\w-]{1,160}$/.test(item.pageId), '頁面 ID 無效');
      assert(Number.isInteger(item.phase) && item.phase >= 0 && item.phase < 100, '頁面階段無效');
      assert(['text', 'image'].includes(item.kind), '元素類型無效');
      assert(record(item.target) && ['edit-key', 'image-key', 'path'].includes(item.target.type) && typeof item.target.value === 'string', '元素定位資料無效');
      assert(element(item.pageId, item.phase, item.kind, item.target).id === id, '元素 ID 與定位資料不一致');
      for (const [key, [min, max]] of Object.entries(limits)) {
        const number = item[key];
        assert(number === null && !['x', 'y'].includes(key) || Number.isFinite(number) && number >= min && number <= max, '元素的 ' + key + ' 超出範圍');
      }
      assert(item.fontFamily === null || Object.hasOwn(fonts, item.fontFamily), '字體設定無效');
    }
    return result;
  }
  function checkSize(text) {
    assert(typeof text === 'string' && new TextEncoder().encode(text).byteLength <= 25 * 1024 * 1024, '設定檔上限為 25 MB');
    return text;
  }
  function validateContent(content) {
    if (content === undefined) return {conditions:{},articles:{},overviews:{},modules:{}};
    assert(record(content) && record(content.conditions) && record(content.articles), '內容設定無效');
    if(content.overviews===undefined)content.overviews={};
    assert(record(content.overviews),'佈設策略設定無效');
    if(content.modules===undefined)content.modules={};
    assert(record(content.modules),'模組說明設定無效');
    const id=value=>typeof value==='string' && /^[\w:-]{1,240}$/.test(value);
    const text=value=>typeof value==='string' && value.length<=100000;
    const key=value=>typeof value==='string' && value.length>0 && value.length<=1000 && !['__proto__','constructor','prototype'].includes(value);
    function points(items) {
      assert(Array.isArray(items) && items.length<=500, '說明項目清單無效');
      const seen=new Set();
      for(const item of items){assert(record(item)&&id(item.id)&&!seen.has(item.id)&&text(item.text)&&key(item.textKey),'說明項目內容或 ID 無效');seen.add(item.id);}
    }
    for(const [page,entry] of Object.entries(content.conditions)) {
      assert(id(page)&&record(entry)&&Array.isArray(entry.issues)&&entry.issues.length<=200,'現況問題清單無效');
      const seen=new Set();
      for(const issue of entry.issues){assert(record(issue)&&id(issue.id)&&!seen.has(issue.id)&&text(issue.title)&&key(issue.titleKey)&&key(issue.imageKey)&&id(issue.imageKey)&&typeof issue.photo==='boolean','現況問題內容或 ID 無效');seen.add(issue.id);points(issue.points);}
    }
    for(const [page,entry] of Object.entries(content.articles)){assert(id(page)&&record(entry),'條文說明設定無效');points(entry.points);}
    for(const [page,entry] of Object.entries(content.modules)){
      assert(id(page)&&record(entry),'模組說明設定無效');points(entry.points);
      for(const point of entry.points)assert(text(point.title)&&key(point.titleKey)&&(point.topicId===undefined||id(point.topicId)),'模組說明標題或主題無效');
    }
    for(const [page,entry] of Object.entries(content.overviews)) {
      assert(id(page)&&record(entry)&&Array.isArray(entry.items)&&entry.items.length<=200,'佈設策略清單無效');
      const seen=new Set();
      for(const item of entry.items) {
        assert(record(item)&&id(item.id)&&!seen.has(item.id)&&text(item.title)&&key(item.titleKey),'佈設策略內容或 ID 無效');seen.add(item.id);
        assert(Array.isArray(item.articleIds)&&item.articleIds.length<=100&&item.articleIds.every(id)&&new Set(item.articleIds).size===item.articleIds.length,'關聯條文清單無效');
        assert(item.targetId===null||typeof item.targetId==='string'&&item.articleIds.includes(item.targetId),'主要跳轉必須為關聯條文，或選擇不連結');
      }
    }
    assert(Object.values(content).reduce((sum,table)=>sum+Object.keys(table).length,0)<=2000,'內容頁面過多');
    return content;
  }
  function validateOverviewReferences(config,data) {
    for(const [page,entry] of Object.entries(config.content?.overviews||{})) {
      const scene=data.scenarios.find(scene=>scene.overviewId===page);
      assert(scene,'佈設策略所屬頁面不存在');
      const available=new Set(data.articles.filter(article=>article.scenario===scene.id).map(article=>article.id));
      for(const item of entry.items)assert(item.articleIds.every(id=>available.has(id)),'關聯條文必須屬於該情境，且條文頁面仍存在');
    }
    return config;
  }
  function parse(text) {
    checkSize(text);
    return validate(JSON.parse(text));
  }
  function element(pageId, phase, kind, target) {
    const id = [pageId, phase, kind, target.type, target.value].map(encodeURIComponent).join('/');
    return {id, pageId, phase, kind, target: clone(target), x: 0, y: 0, width: null, height: null, fontFamily: null, fontSize: null, fontWeight: null, lineHeight: null};
  }
  function overrides(item) {
    return item.x !== 0 || item.y !== 0 || Object.keys(limits).some(key => !['x', 'y'].includes(key) && item[key] !== null) || item.fontFamily !== null;
  }
  function imageView(pageId, assetKey) {
    return {id: [pageId, assetKey].map(encodeURIComponent).join('/'), pageId, assetKey, units: 'percent', zoom: 1, x: 0, y: 0};
  }
  function viewBounds(value) {
    assert(Array.isArray(value) && value.length === 4 && value.every(Number.isFinite) && value[2] > 0 && value[3] > 0, '圖面視角無效');
  }
  function viewBoxFor(home, settings) {
    viewBounds(home);
    assert(Number.isFinite(settings.zoom) && settings.zoom > 0 && Number.isFinite(settings.x) && Number.isFinite(settings.y), '圖面視角設定無效');
    const width = home[2] / settings.zoom, height = home[3] / settings.zoom;
    return [home[0] + (home[2] - width) / 2 - width * settings.x / 100, home[1] + (home[3] - height) / 2 - height * settings.y / 100, width, height];
  }
  function settingsForView(home, view) {
    viewBounds(home); viewBounds(view);
    return {zoom: home[2] / view[2], x: (home[0] + (home[2] - view[2]) / 2 - view[0]) / view[2] * 100, y: (home[1] + (home[3] - view[3]) / 2 - view[1]) / view[3] * 100};
  }
  function signature(config) {
    const views = config.imageViews || {};
    return JSON.stringify({legacyState: config.legacyState, content:config.content||{conditions:{},articles:{},overviews:{}}, elements: Object.keys(config.elements).sort().filter(id => overrides(config.elements[id])).map(id => config.elements[id]), imageViews: Object.keys(views).sort().filter(id => views[id].zoom !== 1 || views[id].x !== 0 || views[id].y !== 0).map(id => views[id])});
  }
  class Store {
    constructor(config) {
      this.config = validate(config);
      this.past = []; this.future = []; this.saved = signature(this.config);
    }
    get dirty() { return signature(this.config) !== this.saved; }
    register(item) {
      if (!Object.hasOwn(this.config.elements, item.id)) this.config.elements[item.id] = clone(item);
      return this.config.elements[item.id];
    }
    snapshot() { return clone(this.config); }
    commit(next) {
      next = validate(next);
      if (signature(next) === signature(this.config)) return false;
      this.past.push(this.snapshot()); if (this.past.length > 100) this.past.shift();
      this.config = next; this.future = []; return true;
    }
    patch(id, patch) {
      assert(Object.hasOwn(this.config.elements, id), '找不到這個元素');
      const next = this.snapshot(); Object.assign(next.elements[id], patch); return this.commit(next);
    }
    undo() { if (!this.past.length) return false; this.future.push(this.snapshot()); this.config = this.past.pop(); return true; }
    redo() { if (!this.future.length) return false; this.past.push(this.snapshot()); this.config = this.future.pop(); return true; }
    load(config) {
      const next = validate(config);
      this.past.push(this.snapshot()); this.future = []; this.config = next; this.markSaved(next);
    }
    markSaved(snapshot) { this.saved = signature(snapshot); }
    serialize(snapshot = this.config) { return checkSize(JSON.stringify(validate(snapshot), null, 2) + '\n'); }
  }
  return {DOCUMENT_ID, fonts, limits, clone, validate, validateOverviewReferences, parse, checkSize, element, overrides, imageView, viewBoxFor, settingsForView, signature, Store};
});

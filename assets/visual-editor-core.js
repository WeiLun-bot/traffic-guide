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
  const coverArtDefaults=Object.freeze({rotation:-52,tilt:52,scale:1,x:0,y:0});
  const coverArtLimits=Object.freeze({rotation:[-85,85],tilt:[15,70],scale:[.7,1.4],x:[-25,25],y:[-25,25]});
  function coverArtSettings(value={}){
    assert(record(value)&&Object.keys(value).every(key=>Object.hasOwn(coverArtDefaults,key)),'封面圖設定無效');
    const settings={...coverArtDefaults,...value};
    for(const [key,[min,max]]of Object.entries(coverArtLimits))assert(Number.isFinite(settings[key])&&settings[key]>=min&&settings[key]<=max,'封面圖的 '+key+' 超出範圍');
    return settings;
  }
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
    for (const highlight of Object.values(value.legacyState.highlights)) {
      if (record(highlight) && highlight.rotation !== undefined) assert(Number.isFinite(highlight.rotation) && Math.abs(highlight.rotation) <= 360, '打亮框旋轉角度須介於 -360° 與 360°');
    }
    assert(Array.isArray(value.legacyState.pages) && Array.isArray(value.legacyState.pageOrder), '原簡報的頁面設定無效');
    assert(record(value.elements) && Object.keys(value.elements).length <= 20000, '元素清單無效');
    assert(value.imageViews === undefined || record(value.imageViews), '初始圖面設定無效');
    const result = clone(value);
    if(result.roadFlowPaths===undefined)result.roadFlowPaths={};
    assert(record(result.roadFlowPaths)&&Object.keys(result.roadFlowPaths).length<=100,'動線路徑清單無效');
    for(const [page,entry]of Object.entries(result.roadFlowPaths)){
      assert(/^results-[\w-]{1,150}$/.test(page)&&record(entry)&&typeof entry.assetKey==='string'&&/^[\w:-]{1,200}$/.test(entry.assetKey)&&Array.isArray(entry.routes)&&entry.routes.length<=12,'動線路徑所屬圖面無效');
      const seen=new Set();for(const route of entry.routes){assert(record(route)&&typeof route.id==='string'&&/^[\w-]{1,100}$/.test(route.id)&&!seen.has(route.id)&&Array.isArray(route.points)&&route.points.length>=2&&route.points.length<=100&&route.points.every(point=>Array.isArray(point)&&point.length===2&&point.every(n=>Number.isFinite(n)&&Math.abs(n)<=10000)),'動線節點無效');seen.add(route.id);}
    }
    result.content = validateContent(result.content);
    if (result.imageOrders === undefined) result.imageOrders = {};
    assert(record(result.imageOrders) && Object.keys(result.imageOrders).length <= 2000, '圖片排序設定無效');
    for (const [key, ids] of Object.entries(result.imageOrders)) assert(/^(results|module):[\w-]{1,160}\/[\w.:-]{1,240}$/.test(key) && Array.isArray(ids) && ids.length <= 300 && ids.every(id=>typeof id==='string'&&/^[\w:-]{1,200}$/.test(id)) && new Set(ids).size===ids.length, '圖片排序清單無效');
    if (result.navigationOrders === undefined) result.navigationOrders = {};
    assert(record(result.navigationOrders) && Object.keys(result.navigationOrders).length <= 2000, '導覽排序設定無效');
    for (const [key, ids] of Object.entries(result.navigationOrders)) {
      assert(/^(module|scenario):[\w-]{1,160}$/.test(key) && Array.isArray(ids) && ids.length <= 300 && ids.every(id => typeof id === 'string' && /^[\w-]{1,240}$/.test(id)) && new Set(ids).size === ids.length, '導覽排序清單無效');
    }
    if (result.extensionLayouts === undefined) result.extensionLayouts = {};
    assert(record(result.extensionLayouts) && Object.keys(result.extensionLayouts).length <= 2000, '延伸應用版型設定無效');
    for (const [key, layout] of Object.entries(result.extensionLayouts)) assert(/^[\w-]{1,160}\/[\w-]{1,160}$/.test(key) && ['horizontal','vertical'].includes(layout), '延伸應用圖文排列無效');
    if (result.tableColumns === undefined) result.tableColumns = {};
    assert(record(result.tableColumns) && Object.keys(result.tableColumns).length <= 2000, '表格欄寬設定無效');
    for (const [key, columns] of Object.entries(result.tableColumns)) assert(/^[\w-]{1,160}\/[\w-]{1,160}$/.test(key) && Array.isArray(columns) && columns.length === 3 && columns.every(width=>Number.isFinite(width)&&width>=8&&width<=84) && Math.abs(columns.reduce((sum,width)=>sum+width,0)-100)<.001, '表格欄寬比例無效');
    if(result.coverArt===undefined)result.coverArt={};
    assert(record(result.coverArt)&&Object.keys(result.coverArt).length<=100,'封面圖清單無效');
    for(const [id,settings]of Object.entries(result.coverArt)){assert(/^[\w-]{1,160}$/.test(id),'封面圖頁面 ID 無效');result.coverArt[id]=coverArtSettings(settings);}
    if (result.removedModuleExtensions === undefined) result.removedModuleExtensions = [];
    assert(Array.isArray(result.removedModuleExtensions) && result.removedModuleExtensions.length <= 500 && result.removedModuleExtensions.every(id=>typeof id==='string'&&/^[\w-]{1,160}$/.test(id)) && new Set(result.removedModuleExtensions).size===result.removedModuleExtensions.length, '已移除的延伸應用頁設定無效');
    result.imageViews = result.imageViews || {};
    assert(Object.keys(result.imageViews).length <= 2000, '初始圖面設定過多');
    for (const [id, view] of Object.entries(result.imageViews)) {
      assert(record(view) && typeof view.pageId === 'string' && /^[\w-]{1,160}$/.test(view.pageId), '初始圖面頁面 ID 無效');
      assert(typeof view.assetKey === 'string' && /^[\w:-]{1,200}$/.test(view.assetKey), '初始圖面素材 ID 無效');
      assert(view.id === id && imageView(view.pageId, view.assetKey).id === id && view.units === 'percent', '初始圖面識別資料無效');
      assert(Number.isFinite(view.zoom) && view.zoom >= .02 && view.zoom <= 200, '初始縮放須介於 2% 與 20000%');
      for (const axis of ['x', 'y']) assert(Number.isFinite(view[axis]) && Math.abs(view[axis]) <= 1000, '初始圖面位置須介於 -1000% 與 1000%');
      if (view.rotation === undefined) view.rotation = 0;
      assert(Number.isFinite(view.rotation) && Math.abs(view.rotation) <= 360, '旋轉角度須介於 -360° 與 360°');
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
    if (content === undefined) return {conditions:{},articles:{},overviews:{},modules:{},results:{}};
    assert(record(content) && record(content.conditions) && record(content.articles), '內容設定無效');
    if(content.overviews===undefined)content.overviews={};
    assert(record(content.overviews),'佈設策略設定無效');
    if(content.modules===undefined)content.modules={};
    assert(record(content.modules),'模組說明設定無效');
    if(content.results===undefined)content.results={};
    assert(record(content.results),'情境議題與佈設說明設定無效');
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
    for(const [page,entry] of Object.entries(content.results)){
      assert(/^results-(?:scenario-[gc][1-4]-\d{2}(?:-strategy)?|module-m[1-4]-\d{2}|module-example|review(?:-[gc][1-4]-\d{2})?)$/.test(page)&&record(entry),'成果說明所屬頁面無效');points(entry.points);
      for(const point of entry.points)assert(text(point.title)&&key(point.titleKey)&&(point.moduleId===undefined||typeof point.moduleId==='string'&&/^M[1-4]-\d{2}$/.test(point.moduleId)),'情境說明標題或關聯模組無效');
      for(const point of entry.points)assert(point.descriptionHidden===undefined||/^results-review(?:-[gc][1-4]-\d{2})?$/.test(page)&&typeof point.descriptionHidden==='boolean','差異說明欄位顯示設定無效');
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
    return {id: [pageId, assetKey].map(encodeURIComponent).join('/'), pageId, assetKey, units: 'percent', zoom: 1, x: 0, y: 0, rotation: 0};
  }
  function viewBounds(value) {
    assert(Array.isArray(value) && value.length === 4 && value.every(Number.isFinite) && value[2] > 0 && value[3] > 0, '圖面視角無效');
  }
  function viewBoxFor(home, settings) {
    home = rotatedHome(home, settings.rotation ?? 0);
    assert(Number.isFinite(settings.zoom) && settings.zoom > 0 && Number.isFinite(settings.x) && Number.isFinite(settings.y), '圖面視角設定無效');
    const width = home[2] / settings.zoom, height = home[3] / settings.zoom;
    return [home[0] + (home[2] - width) / 2 - width * settings.x / 100, home[1] + (home[3] - height) / 2 - height * settings.y / 100, width, height];
  }
  function rotatedHome(home, rotation) {
    viewBounds(home);
    assert(Number.isFinite(rotation) && Math.abs(rotation) <= 360, '旋轉角度須介於 -360° 與 360°');
    const radians = rotation * Math.PI / 180;
    // Snap right angles to avoid drift when repeatedly capturing/resetting views.
    const cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians));
    const c = cos < 1e-12 ? 0 : cos, s = sin < 1e-12 ? 0 : sin;
    const width = home[2] * c + home[3] * s, height = home[2] * s + home[3] * c;
    return [home[0] + (home[2] - width) / 2, home[1] + (home[3] - height) / 2, width, height];
  }
  function settingsForView(home, view, rotation = 0) {
    home = rotatedHome(home, rotation); viewBounds(view);
    return {zoom: home[2] / view[2], x: (home[0] + (home[2] - view[2]) / 2 - view[0]) / view[2] * 100, y: (home[1] + (home[3] - view[3]) / 2 - view[1]) / view[3] * 100, rotation};
  }
  function highlightAngle(value = 0) {
    assert(Number.isFinite(value), '打亮框旋轉角度無效');
    const angle = ((value + 180) % 360 + 360) % 360 - 180;
    return Math.abs(angle) < 1e-10 ? 0 : angle;
  }
  function highlightCorners(box, rotation = 0) {
    const [x,y,w,h] = box, cx = x+w/2, cy = y+h/2, radians = highlightAngle(rotation)*Math.PI/180, c = Math.cos(radians), s = Math.sin(radians);
    return [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([dx,dy]) => [cx+dx*c-dy*s,cy+dx*s+dy*c]);
  }
  function highlightBounds(box, rotation = 0) {
    if (!highlightAngle(rotation)) return [...box];
    const corners = highlightCorners(box,rotation), xs = corners.map(p=>p[0]), ys = corners.map(p=>p[1]);
    return [Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];
  }
  function highlightTransform(box, rotation = 0) {
    return `rotate(${highlightAngle(rotation)} ${box[0]+box[2]/2} ${box[1]+box[3]/2})`;
  }
  function fitHighlight(box, rotation, width, height) {
    const envelope = highlightBounds(box,rotation), scale = Math.min(1,width/Math.max(box[2],envelope[2]),height/Math.max(box[3],envelope[3]));
    const w = box[2]*scale, h = box[3]*scale, halfW = Math.max(w,envelope[2]*scale)/2, halfH = Math.max(h,envelope[3]*scale)/2;
    const cx = Math.max(halfW,Math.min(width-halfW,box[0]+box[2]/2)), cy = Math.max(halfH,Math.min(height-halfH,box[1]+box[3]/2));
    return [cx-w/2,cy-h/2,w,h];
  }
  function resizeHighlight(box, rotation, corner, dx, dy, width, height) {
    const [x,y,w,h] = box, radians = highlightAngle(rotation)*Math.PI/180, c = Math.cos(radians), s = Math.sin(radians), sx = corner.includes('e')?1:-1, sy = corner.includes('s')?1:-1;
    const localX = dx*c+dy*s, localY = -dx*s+dy*c;
    const anchor = [x+w/2-(sx*w*c-sy*h*s)/2,y+h/2-(sx*w*s+sy*h*c)/2];
    const candidate = t => {
      const nw = Math.max(Math.min(4,w),w+sx*localX*t), nh = Math.max(Math.min(4,h),h+sy*localY*t);
      return [anchor[0]+(sx*nw*c-sy*nh*s)/2-nw/2,anchor[1]+(sx*nw*s+sy*nh*c)/2-nh/2,nw,nh];
    };
    const inside = b => [b,highlightBounds(b,rotation)].every(r=>r[0]>=-1e-8&&r[1]>=-1e-8&&r[0]+r[2]<=width+1e-8&&r[1]+r[3]<=height+1e-8);
    if (inside(candidate(1))) return candidate(1);
    let low=0,high=1;
    for(let i=0;i<40;i++){const mid=(low+high)/2;if(inside(candidate(mid)))low=mid;else high=mid;}
    return candidate(low);
  }
  function signature(config) {
    const views = config.imageViews || {};
    return JSON.stringify({legacyState: config.legacyState, content:config.content||{conditions:{},articles:{},overviews:{}}, imageOrders:config.imageOrders||{}, navigationOrders:config.navigationOrders||{}, extensionLayouts:config.extensionLayouts||{}, tableColumns:config.tableColumns||{}, coverArt:config.coverArt||{}, roadFlowPaths:config.roadFlowPaths||{}, removedModuleExtensions:[...(config.removedModuleExtensions||[])].sort(), elements: Object.keys(config.elements).sort().filter(id => overrides(config.elements[id])).map(id => config.elements[id]), imageViews: Object.keys(views).sort().filter(id => views[id].zoom !== 1 || views[id].x !== 0 || views[id].y !== 0 || (views[id].rotation ?? 0) !== 0).map(id => views[id])});
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
  return {DOCUMENT_ID, fonts, limits, coverArtDefaults,coverArtLimits,coverArtSettings,clone, validate, validateOverviewReferences, parse, checkSize, element, overrides, imageView, viewBoxFor, settingsForView, highlightAngle, highlightCorners, highlightBounds, highlightTransform, fitHighlight, resizeHighlight, signature, Store};
});

(() => {
  'use strict';
  const Core = window.VisualLayoutCore;
  const configURL = new URL(document.getElementById('editor-saved-data').dataset.source || 'layout/presentation-layout.json', document.baseURI);
  const files = new window.VisualLayoutIO.Files(window, configURL.pathname);
  const root = document.getElementById('presentation');
  const originalStyles = new Map();
  const owned = ['translate', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'font-family', 'font-size', 'font-weight', 'line-height', 'display'];
  let store, api, editing = false, selectedId = '', items = new Map(), drag = null, busy = false, readyResolve, loop = 0;
  let legacyPages = [], suppressClick = false;
  window.visualLayoutReady = new Promise(resolve => { readyResolve = resolve; });

  const ui = document.createElement('section');
  ui.id = 'visual-layout-editor'; ui.dataset.editorUi = 'visual-layout';
  ui.setAttribute('aria-label', '視覺版面編輯器');
  ui.innerHTML = `
    <div class="vl-toolbar" role="toolbar" aria-label="版面編輯工具" hidden>
      <button type="button" data-vl-action="mode" aria-pressed="false">進階版面</button>
      <div class="vl-edit-actions">
        <button type="button" data-vl-action="undo" title="Ctrl+Z">復原</button>
        <button type="button" data-vl-action="redo" title="Ctrl+Shift+Z">重做</button>
        <button type="button" data-vl-action="save" title="Ctrl+S">儲存</button>
        <details class="vl-files"><summary>設定檔</summary><div>
          <button type="button" data-vl-action="open">連結設定檔</button>
          <button type="button" data-vl-action="reconnect" hidden>重新授權舊檔</button>
          <button type="button" data-vl-action="reload">重新載入</button>
          <button type="button" data-vl-action="export">匯出 JSON</button>
          <button type="button" data-vl-action="import">匯入 JSON</button>
        </div></details>
        <button type="button" data-vl-action="panel" aria-expanded="true" hidden>版面屬性</button>
      </div>
      <button type="button" class="vl-recovery" data-vl-action="import" hidden>匯入設定以開啟</button>
    </div>
    <aside class="vl-panel" hidden aria-label="選取元素屬性">
      <strong>進階版面</strong>
      <p class="vl-instructions">點選文字或圖片並拖曳；拖曳四角調整大小。切回預覽可操作原有圖面與連結。</p>
      <label class="vl-select-label">本頁元素<select data-vl-elements aria-label="選取本頁元素"><option value="">請選取元素</option></select></label>
      <p class="vl-selected" data-vl-selected>尚未選取</p>
      <div class="vl-fields">
        <label>X 位移<input type="number" data-vl-field="x" min="-10000" max="10000" step="1"></label>
        <label>Y 位移<input type="number" data-vl-field="y" min="-10000" max="10000" step="1"></label>
        <label>寬度<input type="number" data-vl-field="width" min="12" max="6000" step="1" placeholder="沿用原版面"></label>
        <label>高度<input type="number" data-vl-field="height" min="12" max="6000" step="1" placeholder="沿用原版面"></label>
      </div>
      <fieldset class="vl-layout-fields"><legend>左右欄分割</legend><label>左欄比例 %<input type="number" min="20" max="80" step="0.1" data-vl-layout="split"></label><label>欄間距 px<input type="number" min="0" max="100" step="0.1" data-vl-layout="gap"></label></fieldset>
      <label class="vl-lock"><input type="checkbox" data-vl-ratio checked> 圖片縮放保持比例（Shift 暫時切換）</label>
      <button type="button" data-vl-action="reset">還原此元素版面</button>
      <small>位移以原版面為起點，單位為 CSS px。清空寬高或字級欄位可沿用原設定。</small>
    </aside>
    <div class="vl-status" role="status" aria-live="polite">正在載入版面設定…</div>
    <input type="file" accept="application/json,.json" data-vl-import hidden>
    <div class="vl-outline" hidden>
      <button type="button" class="vl-move" data-vl-handle="move" aria-label="拖曳移動選取元素" title="拖曳移動">✥</button>
      <button type="button" data-vl-handle="nw" aria-label="左上角縮放"></button><button type="button" data-vl-handle="ne" aria-label="右上角縮放"></button>
      <button type="button" data-vl-handle="sw" aria-label="左下角縮放"></button><button type="button" data-vl-handle="se" aria-label="右下角縮放"></button>
    </div>`;
  document.body.append(ui);
  const panel = ui.querySelector('.vl-panel'), outline = ui.querySelector('.vl-outline');
  const status = ui.querySelector('.vl-status'), chooser = ui.querySelector('[data-vl-elements]');
  status.id = 'visual-layout-status'; status.dataset.editorUi='visual-status'; document.body.append(status);
  const action = name => ui.querySelector(`[data-vl-action="${name}"]`);
  const round = number => Math.round(number * 100) / 100;
  function report(message, error = false) { status.textContent = message; status.classList.toggle('vl-error', error); }
  function current() { return items.get(selectedId); }
  function updateButtons() {
    action('undo').disabled = !store?.past.length || busy;
    action('redo').disabled = !store?.future.length || busy;
    action('mode').disabled = !api || busy;
    for (const name of ['save', 'open', 'reconnect', 'reload', 'import', 'export']) ui.querySelectorAll(`[data-vl-action="${name}"]`).forEach(button => { button.disabled = busy; });
    action('open').disabled = busy || !files.supported;
    action('reconnect').hidden = !files.candidate || !files.supported;
    action('save').textContent = store?.dirty ? '儲存 *' : '儲存';
    const toolbar = document.getElementById('editor-toolbar');
    if (toolbar) {
      for (const button of toolbar.querySelectorAll('.editor-actions>button')) button.hidden = editing || button.matches('.editor-add-explanation,.editor-download,.editor-image');
      toolbar.querySelector('.editor-instructions strong').textContent = editing ? '進階版面' : '編輯內容';
      toolbar.querySelector('.editor-instructions p').textContent = editing ? '拖曳位置與尺寸，或調整左右欄比例。' : '直接修改文字，在問題與條列旁新增、排序或刪除項目。';
      action('panel').hidden=!editing;
      for(const input of ui.querySelectorAll('[data-vl-layout]')){const layout=window.generalRoadFormatting?.layout;input.disabled=busy||!layout?.enabled;if(input!==document.activeElement)input.value=layout?round(layout[input.dataset.vlLayout]):'';}
      if (editing) panel.style.top = Math.max(90, Math.min(toolbar.getBoundingClientRect().bottom + 10, innerHeight - 220)) + 'px';
    }
    window.VisualInitialViews?.update();
  }
  function restoreStyles() {
    for (const [element, properties] of originalStyles) {
      for (const [key, value, priority] of properties) {
        if (value) element.style.setProperty(key, value, priority); else element.style.removeProperty(key);
      }
    }
    originalStyles.clear();
  }
  function apply(element, settings) {
    if (!Core.overrides(settings)) return;
    if (!originalStyles.has(element)) originalStyles.set(element, owned.map(key => [key, element.style.getPropertyValue(key), element.style.getPropertyPriority(key)]));
    if ((settings.x || settings.y || settings.width !== null || settings.height !== null) && getComputedStyle(element).display === 'inline') element.style.setProperty('display', 'inline-block');
    if (settings.x || settings.y) element.style.setProperty('translate', `${settings.x}px ${settings.y}px`, 'important');
    for (const key of ['width', 'height']) if (settings[key] !== null) {
      element.style.setProperty(key, settings[key] + 'px', 'important');
      element.style.setProperty('min-' + key, '0', 'important');
      element.style.setProperty('max-' + key, 'none', 'important');
    }
    if (settings.kind === 'text') {
      if (settings.fontFamily) element.style.setProperty('font-family', Core.fonts[settings.fontFamily], 'important');
      for (const [key, css] of [['fontSize', 'font-size'], ['fontWeight', 'font-weight'], ['lineHeight', 'line-height']]) if (settings[key] !== null) element.style.setProperty(css, String(settings[key]) + (key === 'fontSize' ? 'px' : ''), 'important');
    }
  }
  function path(element) {
    const parts = [];
    while (element && element !== root) {
      const name = element.localName;
      const siblings = [...element.parentElement.children].filter(sibling => sibling.localName === name && !sibling.hasAttribute('data-editor-ui'));
      parts.unshift(name + ':' + siblings.indexOf(element)); element = element.parentElement;
    }
    return parts.join('>');
  }
  function collect() {
    const state = api.state, result = new Map();
    const candidates = root.querySelectorAll('[data-edit-key],h1,h2,h3,h4,p,.eyebrow,.tag,.metric-value,.takeaway,.context-note,.issue-row strong,.road-fact strong,.cover-meta strong,.cover-meta small,img,svg');
    const seen = new Map();
    for (const element of candidates) {
      if (element.closest('[data-editor-ui],.minimap,.viewport-tools,.scenario-switcher') || element.closest('[hidden],[data-template-hidden]')) continue;
      const kind = element.matches('img,svg') ? 'image' : 'text';
      if (kind === 'image' && element.parentElement.closest('svg')) continue;
      if (kind === 'image' && element.closest('button') && !element.matches('.scenario-preview,.road-symbol,.module-extension-thumbnail')) continue;
      if (kind === 'text' && (element.matches('svg *') || element.querySelector('button') || !element.textContent.trim())) continue;
      // A metric is one text box; its inline number/unit must retain their markup.
      if (kind === 'text' && element.closest('.metric-value') && !element.matches('.metric-value')) continue;
      const box = element.getBoundingClientRect(); if (!box.width || !box.height) continue;
      let target;
      if (element.dataset.editKey) target = {type: 'edit-key', value: element.dataset.editKey};
      else if (kind === 'image') {
        const key = element.dataset.editorImageKey || element.closest('[data-editor-image-key]')?.dataset.editorImageKey;
        const contentId=element.closest('[data-content-item-id]')?.dataset.contentItemId;
        target = key ? {type: 'image-key', value: key + '@' + (contentId?'content:'+contentId:path(element))} : {type: 'path', value: path(element)};
      } else target = {type: 'path', value: path(element)};
      const pageId=element.closest('[data-module-source-page]')?.dataset.moduleSourcePage||state.page;
      let entry = Core.element(pageId, state.phase, kind, target);
      const duplicate = seen.get(entry.id) || 0; seen.set(entry.id, duplicate + 1);
      if (duplicate) { target = {type: 'path', value: path(element)}; entry = Core.element(pageId, state.phase, kind, target); }
      const settings = store.register(entry);
      element.dataset.layoutId = entry.id;
      result.set(entry.id, {element, settings, label: (kind === 'image' ? '圖片 · ' + (element.getAttribute('aria-label') || element.getAttribute('alt') || target.value) : element.textContent).trim().replace(/\s+/g, ' ').slice(0, 70)});
    }
    return result;
  }
  function render() {
    if (!api || !store) return;
    if (drag) cancelDrag();
    restoreStyles();
    items = collect();
    for (const {element, settings} of items.values()) apply(element, settings);
    window.VisualInitialViews?.mount(root, {
      pageId: api.state.page, getConfig: () => store.config, isBusy: () => busy, report,
      prepare() {if(editing)setMode(false);if(window.generalRoadEditor?.editing)window.generalRoadEditor.setEditing(false);},
      setView(value) {const next=store.snapshot();next.imageViews[value.id]=value;store.commit(next);render();report('初始畫面已更新，請儲存設定。');},
      save: () => run('save')
    });
    if (!items.has(selectedId)) selectedId = '';
    chooser.replaceChildren(new Option('請選取元素', ''));
    for (const [id, item] of items) chooser.add(new Option(item.label, id));
    select(selectedId); updateButtons();
  }
  function refreshFields() {
    const item = current(), settings = item && store.config.elements[selectedId];
    ui.querySelector('[data-vl-selected]').textContent = item ? item.label : '尚未選取';
    ui.querySelector('[data-vl-selected]').title = selectedId;
    for (const field of ui.querySelectorAll('[data-vl-field]')) {
      field.disabled = !settings || busy || settings.kind === 'image' && !['x', 'y', 'width', 'height'].includes(field.dataset.vlField);
      field.value = settings?.[field.dataset.vlField] ?? '';
    }
    action('reset').disabled = !settings || busy;
  }
  function select(id) { selectedId = items.has(id) ? id : ''; chooser.value = selectedId; refreshFields(); updateOutline(); }
  function updateOutline() {
    const item = current(); outline.hidden = !editing || !item;
    if (outline.hidden) return;
    const box = item.element.getBoundingClientRect();
    Object.assign(outline.style, {left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px'});
  }
  function tick() { updateOutline(); if (editing) loop = requestAnimationFrame(tick); }
  function setMode(value) {
    if (!api || busy) return;
    if (editing === Boolean(value)) return;
    cancelDrag();
    if (value) {
      window.VisualInitialViews?.close();
      window.generalRoadFormatting?.setActive(false);
      window.generalRoadEditor?.setAdjusting(false, false);
    }
    editing = Boolean(value); document.body.classList.toggle('is-visual-editing', editing);
    action('mode').textContent = editing ? '返回內容編輯' : '進階版面';
    action('mode').setAttribute('aria-pressed', String(editing));
    panel.hidden = !editing;
    cancelAnimationFrame(loop);
    if (editing) syncLegacy();
    if (editing && !window.generalRoadEditor?.editing) window.generalRoadEditor?.setEditing(true);
    else refreshPresentation();
    if (editing) tick();
    updateOutline(); updateButtons();
    report(editing ? '視覺編輯：拖曳文字或圖片，或使用右側欄位調整。' : '文字編輯：點文字修改，使用圖片旁的按鈕更換圖片。');
  }
  function syncLegacy() {
    if (!store || !window.generalRoadEditor) return;
    const next = store.snapshot(); next.legacyState = Core.clone(window.generalRoadEditor.state); store.commit(next);
  }
  function captureComparison() {
    if(!api||!root.querySelector('.compare-stage'))return null;
    return {page:api.state.page,views:['.compare-before','.compare-after'].map(selector=>({selector,view:window.generalRoadViewport?.get(root.querySelector(selector))?.read()}))};
  }
  function restoreComparison(captured) {
    if(!captured||api.state.page!==captured.page)return;
    for(const {selector,view}of captured.views)if(view)window.generalRoadViewport?.get(root.querySelector(selector))?.write(view);
  }
  function refreshPresentation() {const captured=captureComparison();api.refresh();restoreComparison(captured);}
  function transact(mutator,refresh=true) {
    if(!store||busy&&refresh)return false;
    try {
      const next=store.snapshot();next.legacyState=Core.clone(window.generalRoadEditor.state);
      mutator(next);store.commit(next);
      Object.assign(window.generalRoadEditor.state.texts,store.config.legacyState.texts);
      if(refresh)refreshPresentation();else updateButtons();
      report('內容已修改，請儲存設定。');return true;
    } catch(error){report(error.message,true);return false;}
  }
  function restoreLegacy(preserveComparison=false) {
    const editor = window.generalRoadEditor;
    if (!editor || !api) return;
    const captured=preserveComparison?captureComparison():null;
    if (JSON.stringify(editor.state) === JSON.stringify(store.config.legacyState)) { api.refresh();restoreComparison(captured);return; }
    restoreStyles();
    for (const key of Object.keys(editor.state)) delete editor.state[key];
    Object.assign(editor.state, Core.clone(store.config.legacyState));
    const fresh = JSON.parse(document.getElementById('presentation-data').textContent);
    for (const key of Object.keys(api.data)) delete api.data[key]; Object.assign(api.data, fresh);
    window.generalRoadConditions?.prepare(api.data); window.PresentationModules?.prepare(api.data); editor.prepare(api.data);
    api.pages.splice(0, api.pages.length, ...legacyPages.map(page => ({...page, ...(page.article ? {article: api.data.articles.find(article => article.id === page.article.id)} : {})})));
    editor.restorePages(api.pages); api.refreshStructure(api.state.page, api.state.phase);restoreComparison(captured);
  }
  function change(patch) {
    if (!current()) return;
    try { store.patch(selectedId, patch); render(); report('版面已修改，尚未儲存。'); }
    catch (error) { report(error.message, true); refreshFields(); }
  }
  function cancelDrag() {
    if (!drag) return;
    const previous = drag; drag = null;
    try { previous.capture.releasePointerCapture(previous.pointerId); } catch {}
    restoreStyles();
    for (const {element, settings} of items.values()) apply(element, store.config.elements[settings.id]);
    document.body.classList.remove('is-visual-dragging'); updateOutline();
  }
  function finishDrag(event, cancelled = false) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const previous = drag;
    if (cancelled) { cancelDrag(); refreshFields(); return; }
    drag = null; try { previous.capture.releasePointerCapture(previous.pointerId); } catch {}
    document.body.classList.remove('is-visual-dragging');
    if (previous.patch) store.patch(selectedId, previous.patch);
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    render(); if (previous.patch) report('版面已修改，尚未儲存。');
  }
  document.addEventListener('pointerdown', event => {
    if (!editing || busy || event.button !== 0) return;
    const handle = event.target.closest('[data-vl-handle]');
    if (!handle && event.target.closest('[data-editor-ui]')) return;
    const element = event.target.closest('[data-layout-id]');
    if (!handle && (!element || !root.contains(element) || !items.has(element.dataset.layoutId))) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (element && !handle) select(element.dataset.layoutId);
    const item = current(); if (!item) return;
    const box = item.element.getBoundingClientRect();
    drag = {pointerId: event.pointerId, capture: handle || item.element, corner: handle?.dataset.vlHandle || 'move', x: event.clientX, y: event.clientY, width: box.width, height: box.height, start: Core.clone(store.config.elements[selectedId]), patch: null};
    try { drag.capture.setPointerCapture(event.pointerId); } catch {}
    document.body.classList.add('is-visual-dragging');
  }, true);
  document.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.patch && Math.abs(dx) + Math.abs(dy) < 2) return;
    let patch;
    if (drag.corner === 'move') patch = {x: round(Math.max(-10000, Math.min(10000, drag.start.x + dx))), y: round(Math.max(-10000, Math.min(10000, drag.start.y + dy)))};
    else {
      let width = Math.max(12, Math.min(6000, drag.width + (drag.corner.includes('w') ? -dx : dx)));
      let height = Math.max(12, Math.min(6000, drag.height + (drag.corner.includes('n') ? -dy : dy)));
      const locked = drag.start.kind === 'image' && ui.querySelector('[data-vl-ratio]').checked !== event.shiftKey;
      if (locked) { const factor = Math.max(12 / drag.width, 12 / drag.height, Math.min(6000 / drag.width, 6000 / drag.height, Math.abs(dx) >= Math.abs(dy) ? width / drag.width : height / drag.height)); width = drag.width * factor; height = drag.height * factor; }
      patch = {width: round(width), height: round(height), x: round(drag.start.x + (drag.corner.includes('w') ? drag.width - width : 0)), y: round(drag.start.y + (drag.corner.includes('n') ? drag.height - height : 0))};
    }
    drag.patch = patch;
    restoreStyles(); for (const {element, settings} of items.values()) apply(element, settings.id === selectedId ? {...drag.start, ...patch} : store.config.elements[settings.id]);
    updateOutline();
  }, true);
  document.addEventListener('pointerup', event => finishDrag(event), true);
  document.addEventListener('pointercancel', event => finishDrag(event, true), true);
  document.addEventListener('lostpointercapture', event => { if (drag?.capture === event.target) finishDrag(event, true); }, true);
  window.addEventListener('blur', cancelDrag);
  document.addEventListener('wheel', event => {
    if (editing && event.target.closest('[data-layout-id]') && root.contains(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, {capture: true, passive: false});
  document.addEventListener('click', event => {
    if (event.target.closest('.editor-download')) { event.preventDefault(); event.stopImmediatePropagation(); if (!busy) run('save'); return; }
    if(event.target.closest('.edit-toggle'))window.VisualInitialViews?.close();
    if (!editing) return;
    if (event.target.closest('.edit-toggle')) { if (busy) { event.preventDefault(); event.stopImmediatePropagation(); } else setMode(false); return; }
    if (event.target.closest('[data-editor-ui]')) return;
    if (suppressClick || event.target.closest('[data-layout-id]') && root.contains(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('keydown', event => {
    if (!editing && !window.generalRoadEditor?.editing && !window.VisualInitialViews?.isOpen) return;
    const field = event.target.closest('input,textarea,select,[contenteditable]');
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 's') { event.preventDefault(); event.stopImmediatePropagation(); const initialField=event.target.closest('[data-iv-field]'); if(initialField&&!initialField.dispatchEvent(new Event('change',{bubbles:true,cancelable:true})))return; if (!busy) run('save'); return; }
    if (!editing) {
      if((!field||event.target.closest('[data-content-field]')) && modifier && ['z','y'].includes(event.key.toLowerCase())){event.preventDefault();event.stopImmediatePropagation();run(event.key.toLowerCase()==='y'||event.shiftKey?'redo':'undo');}
      return;
    }
    if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopImmediatePropagation(); cancelDrag(); return; }
    if (field) return;
    if (modifier && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault(); event.stopImmediatePropagation(); run(event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo'); return;
    }
    if (!modifier && !event.altKey && /^Arrow(Left|Right|Up|Down)$/.test(event.key) && current()) {
      event.preventDefault(); event.stopImmediatePropagation(); const step = event.shiftKey ? 10 : 1, settings = store.config.elements[selectedId];
      change({x: settings.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: settings.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0)}); return;
    }
    if (!field && !event.target.closest('button,a') && [' ', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  function download(config) {
    const url = URL.createObjectURL(new Blob([store.serialize(config)], {type: 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'presentation-layout.json'; link.dataset.editorUi = 'layout-download'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function install(config, saved = true) {
    const validated = Core.validate(config);
    if(Object.keys(validated.content.overviews).length)Core.validateOverviewReferences(validated,api?.data||JSON.parse(document.getElementById('presentation-data').textContent));
    if (window.generalRoadTemplates && !validated.legacyState.pages.every(window.generalRoadTemplates.validPage)) throw new Error('設定包含無效的自訂頁面');
    if (!store) { store = new Core.Store(validated); document.getElementById('editor-saved-data').textContent = JSON.stringify(validated.legacyState); readyResolve(); }
    else { cancelDrag(); store.load(validated); restoreLegacy(); window.VisualInitialViews?.restore(); }
    if (saved) store.markSaved(validated);
    ui.querySelector('.vl-recovery').hidden = true; updateButtons();
  }
  async function run(name) {
    if (busy) return;
    if (name === 'mode') { setMode(!editing); return; }
    if (name === 'panel') { panel.hidden = !panel.hidden; action('panel').setAttribute('aria-expanded', String(!panel.hidden)); return; }
    if (name === 'import') { if (store?.dirty && !confirm('匯入會取代目前版面，未儲存的修改可用復原取回。是否繼續？')) return; ui.querySelector('[data-vl-import]').value = ''; ui.querySelector('[data-vl-import]').click(); return; }
    if (name === 'reset') { if (current()) { const item = store.config.elements[selectedId]; change(Core.element(item.pageId, item.phase, item.kind, item.target)); } return; }
    if (name === 'undo' || name === 'redo') { cancelDrag(); if (store?.[name]()) { restoreLegacy(true); updateButtons(); report(name === 'undo' ? '已復原。' : '已重做。'); } return; }
    if (name === 'export') { if (store) { syncLegacy(); download(store.snapshot()); report('已匯出 JSON 副本；如需更新專案檔，請連結設定檔後儲存。'); } return; }
    if (['open', 'reconnect', 'reload'].includes(name) && store?.dirty && !confirm('載入會取代目前版面，未儲存的修改可用復原取回。是否繼續？')) return;
    busy = true; updateButtons();
    try {
      if (name === 'save') {
        syncLegacy(); const snapshot = store.snapshot(); snapshot.updatedAt = new Date().toISOString();
        const result = await files.save(snapshot);
        if (result.download) { download(snapshot); report('瀏覽器不支援直接寫檔，已匯出 JSON；請將檔案放回專案的 layout 資料夾。'); }
        else { store.markSaved(snapshot); report('已寫入 ' + result.name + (store.dirty ? '；另有較新的修改尚未儲存。' : '。')); }
      } else if (name === 'open' || name === 'reconnect') {
        const config = name === 'reconnect' ? await files.reconnect() : await files.open(); install(config); report('已連結 ' + files.handle.name + '，後續儲存會寫回此檔案。');
      } else if (name === 'reload') {
        const config = files.handle ? await files.read(files.handle, true) : await loadDefault(); install(config); report('已重新載入設定。');
      }
    } catch (error) { if (error.name !== 'AbortError') report(error.message || '檔案操作失敗，修改仍保留。', true); }
    finally { busy = false; updateButtons(); refreshFields(); }
  }
  ui.addEventListener('click', event => { const button = event.target.closest('[data-vl-action]'); if (button) {ui.querySelector('.vl-files').open=false;run(button.dataset.vlAction);} });
  chooser.addEventListener('change', () => select(chooser.value));
  ui.addEventListener('change', event => {
    const field = event.target.closest('[data-vl-field]'); if (!field || busy) return;
    const key = field.dataset.vlField;
    change({[key]: field.value === '' ? ['x', 'y'].includes(key) ? 0 : null : key === 'fontFamily' ? field.value : Number(field.value)});
  });
  ui.addEventListener('input',event=>{const input=event.target.closest('[data-vl-layout]');if(!input||busy||!input.validity.valid||input.value==='')return;window.generalRoadFormatting.setLayout(input.dataset.vlLayout,Number(input.value));transact(()=>{},false);});
  ui.querySelector('[data-vl-import]').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    busy = true; updateButtons();
    try { if (file.size > 25 * 1024 * 1024) throw new Error('設定檔上限為 25 MB'); const config = Core.parse(await file.text()); install(config); files.disconnect(); report('已匯入 ' + file.name + '；可連結專案檔後直接儲存。'); }
    catch (error) { report(error.message, true); }
    finally { busy = false; updateButtons(); refreshFields(); }
  });
  window.addEventListener('beforeunload', event => { syncLegacy(); if (store?.dirty) { event.preventDefault(); event.returnValue = ''; } });
  async function loadDefault() {
    const response = await fetch(configURL, {cache: 'no-store'});
    if (!response.ok) throw new Error('無法讀取版面設定（HTTP ' + response.status + '）');
    return Core.parse(await response.text());
  }
  window.visualLayoutEditor = {
    connect(presentation) { api = presentation; legacyPages = api.pages.filter(page => page.kind !== 'custom').map(page => ({...page})); document.querySelector('#editor-toolbar .editor-actions').prepend(ui); ui.querySelector('.vl-toolbar').hidden = false; window.PresentationContent?.configureTools(ui); const legacySave = document.querySelector('.editor-download'); if (legacySave) { legacySave.textContent = '儲存 JSON 設定'; legacySave.title = '將內容與版面存入連結的 JSON 設定檔'; } updateButtons(); report(files.handle ? '已載入連結的 ' + files.handle.name : '版面已載入，按「編輯內容」開始。'); },
    sessionChanged() {updateButtons();if(!editing)report(window.generalRoadEditor?.editing ? '文字編輯：點文字修改，使用圖片旁的按鈕更換圖片。' : '預覽模式：可正常切頁、放大圖片與操作圖面。' + (store?.dirty ? '（有修改尚未儲存）' : ''));},
    beforeRender() { cancelDrag(); restoreStyles(); }, render, setMode, select,transact,report,refresh:refreshPresentation,
    legacyChanged(){transact(()=>{},false);},
    formatChanged(element,property){const key={fontSize:'fontSize',fontWeight:'fontWeight',fontFamily:'fontFamily',lineHeight:'lineHeight'}[property];transact(next=>{if(key&&next.elements[element.dataset.layoutId])next.elements[element.dataset.layoutId][key]=null;},false);refreshPresentation();},
    resetTextStyle(element){transact(next=>{const item=next.elements[element.dataset.layoutId];if(item)for(const key of ['fontSize','fontFamily','fontWeight','lineHeight'])item[key]=null;},false);refreshPresentation();},
    fontOverrides(element){return store?.config.elements[element?.dataset.layoutId];},
    get editing() { return editing; }, get store() { return store; }, get files() { return files; }, get items() { return items; }, get busy() { return busy; }
  };
  updateButtons();
  window.addEventListener('resize', updateButtons);
  (async () => {
    try { install(await files.restore() || await loadDefault()); }
    catch (error) { report('設定未載入。請用 localhost 開啟，或匯入 layout/presentation-layout.json。' + error.message, true); ui.querySelector('.vl-toolbar').hidden = false; ui.querySelector('.vl-recovery').hidden = false; }
  })();
})();

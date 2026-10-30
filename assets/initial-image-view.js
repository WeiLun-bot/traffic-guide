(() => {
  'use strict';
  const Core = window.VisualLayoutCore;
  const records = new WeakMap(), active = new Map(), opened = new Set();
  const selector = '.context-map-canvas svg.context-map,.conditions-current-canvas svg.conditions-current-diagram,.module-map-canvas svg.module-diagram';
  const number = value => String(Math.round(value * 1000) / 1000);
  function place(record) {
    if (record.panel.hidden) return;
    const rect = record.figure.getBoundingClientRect(), width = Math.min(300, innerWidth - 24);
    const beside = rect.right + 12;
    record.panel.style.width = width + 'px';
    record.panel.style.left = Math.max(12, beside + width <= innerWidth - 12 ? beside : Math.min(rect.right - width, innerWidth - width - 12)) + 'px';
    const top = Math.min(Math.max(90, rect.top + 42), Math.max(90, innerHeight - 460));
    record.panel.style.top = top + 'px'; record.panel.style.maxHeight = Math.max(140, innerHeight - top - 85) + 'px';
  }
  function setting(record) { return record.context.getConfig().imageViews[record.id] || Core.imageView(record.pageId, record.assetKey); }
  function fields(record) {
    const value = setting(record);
    for (const input of record.panel.querySelectorAll('[data-iv-field]')) {
      if (input !== document.activeElement) input.value = number(input.dataset.ivField === 'zoom' ? value.zoom * 100 : value[input.dataset.ivField] ?? 0);
      input.disabled = record.context.isBusy();
    }
    for (const button of record.panel.querySelectorAll('button')) button.disabled = record.context.isBusy();
  }
  function apply(record, force = false) {
    const value = setting(record), signature = JSON.stringify(value);
    if (force || record.signature !== signature) {
      const view = Core.viewBoxFor(record.home, value);
      if (value.rotation || record.rotationLayer) {
        if (!record.rotationLayer) {
          const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          layer.dataset.initialViewRotation = '';
          // Keep definitions/metadata at the root and rotate artwork and highlights together.
          for (const child of [...record.svg.children]) if (!['defs', 'title', 'desc', 'style', 'metadata'].includes(child.localName)) layer.append(child);
          record.svg.append(layer); record.rotationLayer = layer;
        }
        const [x, y, width, height] = record.home;
        record.rotationLayer.setAttribute('transform', `rotate(${value.rotation ?? 0} ${x + width / 2} ${y + height / 2})`);
      }
      record.controller.configure({home: view}); record.controller.write(view, false);
      record.signature = signature;
    }
    fields(record); place(record);
  }
  function close(record) {
    opened.delete(record.id); record.panel.hidden = true; record.button.setAttribute('aria-expanded', 'false');
  }
  function open(record) {
    opened.add(record.id);
    record.context.prepare();
    const current = active.get(record.id);
    if (!current) return;
    current.panel.hidden = false; current.button.setAttribute('aria-expanded', 'true'); fields(current); place(current);
  }
  function commit(record, patch) {
    if (record.context.isBusy()) return false;
    try {
      record.context.setView({...setting(record), ...patch});
      const current = active.get(record.id); if (current) apply(current, true);
      return true;
    } catch (error) { record.context.report(error.message, true); fields(record); return false; }
  }
  function create(svg, context, pageId, assetKey) {
    const figure = svg.closest('figure'), toolbar = figure?.querySelector('.map-toolbar .map-tools') || figure?.querySelector('.map-toolbar');
    const controller = window.generalRoadViewport?.get(svg);
    if (!figure || !toolbar || !controller) return null;
    const id = Core.imageView(pageId, assetKey).id;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'iv-trigger'; button.textContent = '設定初始畫面';
    button.dataset.editorUi = 'initial-view-toggle'; button.setAttribute('aria-expanded', 'false');
    const panel = document.createElement('section');
    panel.className = 'iv-panel'; panel.dataset.editorUi = 'initial-image-view'; panel.dataset.imageViewId = id;
    panel.setAttribute('aria-label', '圖面初始畫面設定'); panel.hidden = !opened.has(id);
    panel.innerHTML = `<div class="iv-heading"><strong>設定初始畫面</strong><button type="button" data-iv-action="close" aria-label="關閉初始畫面設定">×</button></div>
      <p>可調整旋轉角度，再在圖上縮放、拖曳並套用目前畫面，也可直接調整下方數值。</p>
      <div class="iv-fields"><label>初始縮放（%）<input type="number" data-iv-field="zoom" min="2" max="20000" step="1"></label><label>左右位置（%）<input type="number" data-iv-field="x" min="-1000" max="1000" step="0.1"></label><label>上下位置（%）<input type="number" data-iv-field="y" min="-1000" max="1000" step="0.1"></label></div>
      <div class="iv-fields iv-rotation"><label>旋轉角度（°）<input type="number" data-iv-field="rotation" min="-360" max="360" step="1"></label><button type="button" data-iv-action="rotate-left">左轉 90°</button><button type="button" data-iv-action="rotate-right">右轉 90°</button></div>
      <small>左右正值向右、上下正值向下；角度正值順時針。各頁與各圖分別保存。</small>
      <div class="iv-actions"><button type="button" data-iv-action="capture">套用目前畫面</button><button type="button" data-iv-action="reset">回到原始畫面</button><button type="button" data-iv-action="save">儲存設定</button></div>
      <p class="iv-note">儲存後，切頁、重新開啟及重設視圖會使用這個初始畫面。</p>`;
    toolbar.append(button); document.body.append(panel);
    const record = {id, pageId, assetKey, svg, figure, button, panel, controller, context, home: controller.read(), signature: null};
    records.set(svg, record); active.set(id, record);
    button.addEventListener('click', event => {event.preventDefault();event.stopPropagation();if(!record.context.isBusy())record.panel.hidden ? open(record) : close(record);});
    panel.addEventListener('change', event => {
      const input = event.target.closest('[data-iv-field]'); if (!input) return;
      if (input.value.trim() === '') {fields(record);return;}
      const value = Number(input.value), key = input.dataset.ivField;
      if(!commit(record, {[key]: key === 'zoom' ? value / 100 : value}))event.preventDefault();
    });
    panel.addEventListener('click', event => {
      const target = event.target.closest('[data-iv-action]'); if (!target) return;
      event.preventDefault(); event.stopPropagation();
      const action = target.dataset.ivAction;
      if (action === 'close') {close(record);return;}
      if (record.context.isBusy()) return;
      if (action === 'save') {record.context.save();return;}
      if (action === 'reset') {commit(record, Core.imageView(pageId, assetKey));return;}
      if (action === 'rotate-left' || action === 'rotate-right') {
        const angle = (setting(record).rotation ?? 0) + (action === 'rotate-left' ? -90 : 90);
        commit(record, {rotation: ((angle + 180) % 360 + 360) % 360 - 180});return;
      }
      if (action === 'capture') {
        try {commit(record, Core.settingsForView(record.home, record.controller.read(), setting(record).rotation ?? 0));}
        catch (error) {record.context.report(error.message, true);}
      }
    });
    panel.addEventListener('keydown', event => {if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(record);button.focus({preventScroll:true});}});
    button.setAttribute('aria-expanded', String(!panel.hidden));
    return record;
  }
  function mount(root, context) {
    for (const [id, record] of active) if (!record.svg.isConnected) {record.panel.remove();active.delete(id);}
    for (const svg of root.querySelectorAll(selector)) {
      const assetKey = svg.closest('[data-editor-image-key]')?.dataset.editorImageKey;
      if (!assetKey) continue;
      let record = records.get(svg);
      if (!record) record = create(svg, context, svg.closest('[data-module-source-page]')?.dataset.moduleSourcePage||context.pageId, assetKey);
      if (!record) continue;
      record.context = context; active.set(record.id, record); apply(record);
    }
  }
  window.addEventListener('resize', () => {for(const record of active.values())place(record);});
  document.addEventListener('scroll', () => {for(const record of active.values())place(record);}, true);
  window.VisualInitialViews = {
    mount,
    restore() {for(const record of active.values())apply(record, true);},
    close() {for(const record of active.values())close(record);},
    update() {for(const record of active.values())fields(record);},
    get isOpen() {return [...active.values()].some(record => !record.panel.hidden && record.svg.isConnected);}
  };
})();

(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./visual-editor-core.js') : root.VisualLayoutCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VisualLayoutIO = api;
})(typeof globalThis === 'object' ? globalThis : this, function (Core) {
  'use strict';
  class Files {
    constructor(env = globalThis, key = Core.DOCUMENT_ID) { this.env = env; this.key = key; this.handle = null; this.candidate = null; this.lastText = null; }
    get supported() { return Boolean(this.env.isSecureContext && this.env.showOpenFilePicker && this.env.showSaveFilePicker); }
    options() { return {id: 'road-layout', types: [{description: '簡報版面 JSON', accept: {'application/json': ['.json']}}], excludeAcceptAllOption: true}; }
    async remember(handle) {
      try {
        const db = await this.database();
        await new Promise((resolve, reject) => {
          const transaction = db.transaction('handles', 'readwrite');
          transaction.objectStore('handles').put(handle, this.key);
          transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
        }); db.close();
      } catch { /* A session handle still works when IndexedDB is unavailable. */ }
    }
    database() {
      return new Promise((resolve, reject) => {
        if (!this.env.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
        const request = this.env.indexedDB.open('road-visual-layout-files', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('handles');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    }
    async restore() {
      if (!this.supported) return null;
      try {
        const db = await this.database();
        const handle = await new Promise((resolve, reject) => {
          const request = db.transaction('handles').objectStore('handles').get(this.key);
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        }); db.close();
        if (!handle) return null;
        this.candidate = handle;
        if (await handle.queryPermission({mode: 'read'}) === 'granted') return await this.read(handle);
      } catch { /* Missing/revoked handles must not prevent loading the project JSON. */ }
      return null;
    }
    async read(handle = this.handle, permission = false) {
      if (!handle) throw new Error('請先連結設定檔');
      if (permission && await handle.queryPermission({mode: 'read'}) !== 'granted' && await handle.requestPermission({mode: 'read'}) !== 'granted') throw new Error('尚未授權讀取設定檔');
      const file = await handle.getFile();
      if (file.size > 25 * 1024 * 1024) throw new Error('設定檔上限為 25 MB');
      const text = await file.text(), config = Core.parse(text);
      this.handle = handle; this.candidate = null; this.lastText = text;
      await this.remember(handle); return config;
    }
    async open() {
      if (!this.supported) throw new Error('此瀏覽器請使用匯入／匯出 JSON');
      const [handle] = await this.env.showOpenFilePicker({...this.options(), multiple: false});
      return this.read(handle);
    }
    async reconnect() { return this.read(this.candidate, true); }
    async save(config) {
      const text = Core.checkSize(JSON.stringify(Core.validate(config), null, 2) + '\n');
      if (!this.supported) return {download: true, text};
      let handle = this.handle, newlyChosen = false;
      if (!handle) {
        handle = await this.env.showSaveFilePicker({...this.options(), suggestedName: 'presentation-layout.json'});
        newlyChosen = true;
      }
      if (await handle.queryPermission({mode: 'readwrite'}) !== 'granted' && await handle.requestPermission({mode: 'readwrite'}) !== 'granted') throw new Error('尚未授權寫入；修改仍保留在畫面中');
      if (!newlyChosen) {
        const current = await (await handle.getFile()).text();
        if (current !== this.lastText) { const error = new Error('設定檔已被其他程式修改。請先匯出目前版本，再重新載入合併。'); error.name = 'ConflictError'; throw error; }
      }
      let writable;
      try {
        writable = await handle.createWritable(); await writable.write(text); await writable.close();
      } catch (error) { try { await writable?.abort(); } catch {} throw error; }
      this.handle = handle; this.lastText = text; await this.remember(handle);
      return {download: false, name: handle.name};
    }
    disconnect() { this.handle = null; this.candidate = null; this.lastText = null; }
  }
  return {Files};
});

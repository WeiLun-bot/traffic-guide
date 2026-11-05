(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./visual-editor-core.js') : root.VisualLayoutCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VisualLayoutIO = api;
})(typeof globalThis === 'object' ? globalThis : this, function (Core) {
  'use strict';
  class Files {
    constructor(env = globalThis, key = Core.DOCUMENT_ID) { this.env = env; this.key = key; this.handle = null; this.candidate = null; this.lastText = null; }
    parse(text) { return Core.parse(text); }
    serialize(config) { return Core.checkSize(JSON.stringify(Core.validate(config), null, 2) + '\n'); }
    get suggestedName() { return 'presentation-layout.json'; }
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
      const text = await file.text(), config = this.parse(text);
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
      const text = this.serialize(config);
      if (!this.supported) return {download: true, text};
      let handle = this.handle, newlyChosen = false;
      if (!handle) {
        handle = await this.env.showSaveFilePicker({...this.options(), suggestedName: this.suggestedName});
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
  class ProjectFiles extends Files {
    constructor(env=globalThis,key=Core.DOCUMENT_ID){super(env,key);this.local=null;this.owners={};}
    document(){return this.env.PresentationDocument||globalThis.PresentationDocument;}
    parse(text){return this.document().parse(text);}
    serialize(config){return Core.checkSize(JSON.stringify(this.document().bundle(config,this.owners),null,2)+'\n');}
    get suggestedName(){return 'presentation-project.json';}
    options(){return {...super.options(),types:[{description:'簡報專案 JSON',accept:{'application/json':['.json']}}]};}
    async connectLocal(){
      const url=new URL('__project',this.env.document.baseURI);
      if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname))return null;
      const response=await this.env.fetch(url,{cache:'no-store'});
      if(response.status===404||response.status===405)return null;
      if(!response.ok)throw new Error('無法連結本機專案（HTTP '+response.status+'）');
      const value=await response.json();this.local={url,token:value.token,revision:value.revision};this.owners=value.owners;return Core.validate(value.config);
    }
    async save(config){
      if(!this.local)return super.save(config);
      const response=await this.env.fetch(this.local.url,{method:'POST',headers:{'Content-Type':'application/json','X-Project-Token':this.local.token},body:JSON.stringify({revision:this.local.revision,config})});
      const result=await response.json();if(!response.ok){const error=new Error(result.error||'專案儲存失敗');error.name=response.status===409?'ConflictError':'Error';throw error;}
      this.local.revision=result.revision;
      const verified=await this.env.fetch(this.local.url,{cache:'no-store'});if(!verified.ok)throw new Error('無法確認路線是否已儲存，請稍後再試。');
      const stored=await verified.json();
      if(JSON.stringify(stored.config?.roadFlowPaths||{})!==JSON.stringify(config.roadFlowPaths||{}))throw new Error('路線未完整寫入；請關閉並重新啟動 start-editor.cmd，再儲存一次。目前修改仍保留。');
      return {download:false,name:'專案內容、導覽與版面檔'};
    }
    async open(){const config=await super.open();this.local=null;return config;}
    disconnect(){super.disconnect();this.local=null;}
  }
  return {Files,ProjectFiles};
});

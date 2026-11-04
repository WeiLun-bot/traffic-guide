(() => {
  'use strict';
  const readOnly = new URLSearchParams(location.search).get('mode') === 'view';
  window.PresentationMode = Object.freeze({readOnly});
  document.documentElement.dataset.presentationMode = readOnly ? 'view' : 'edit';
  if (!readOnly) return;
  // Set the mode before any editor scripts run, including during startup.
  const style = document.createElement('style');
  style.textContent = 'html[data-presentation-mode="view"] :is([data-editor-ui]:not([data-editor-ui="viewport-controls"]):not([data-editor-ui="results-image-picker"]),#editor-toolbar,.edit-toggle,#presentation-startup-import,[data-editor-help]){display:none!important}';
  document.head.append(style);
})();

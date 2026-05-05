document.getElementById('btn-new-tab').addEventListener('click', () => {
  browser.runtime.sendMessage({ action: 'openEditor', mode: 'tab' });
  window.close();
});

document.getElementById('btn-split').addEventListener('click', () => {
  browser.runtime.sendMessage({ action: 'openEditor', mode: 'split' });
  window.close();
});

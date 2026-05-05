// Background script for LaTeX Editor Pro

// Create context menu item when extension is installed
browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: 'open-latex-editor',
    title: 'In LaTeX Editor öffnen',
    contexts: ['selection']
  });
});

// Handle context menu clicks
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-latex-editor') {
    const selectedText = info.selectionText || '';
    openEditor('tab', selectedText);
  }
});

// Listen for messages from popup and content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openEditor') {
    openEditor(message.mode || 'tab', message.content || '');
    sendResponse({ success: true });
  }
  if (message.action === 'openSplitScreen') {
    openSplitScreen(sender.tab.id, message.content || '');
    sendResponse({ success: true });
  }
  return true;
});

// Open editor in a new tab
function openEditor(mode, content) {
  if (mode === 'tab') {
    const url = browser.runtime.getURL('editor/editor.html');
    browser.tabs.create({ url }).then((tab) => {
      // Store content for the new tab to pick up
      if (content) {
        browser.storage.local.set({
          pendingContent: content,
          pendingTabId: tab.id
        });
      }
    });
  } else if (mode === 'split') {
    // Get the active tab and inject the split screen
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs.length > 0) {
        openSplitScreen(tabs[0].id, content);
      }
    });
  }
}

// Open split-screen mode by injecting into the current tab
function openSplitScreen(tabId, content) {
  browser.tabs.sendMessage(tabId, {
    action: 'toggleSplitScreen',
    content: content
  });
}

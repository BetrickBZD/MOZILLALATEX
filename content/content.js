// LaTeX Editor Pro - Content Script
// Detects LaTeX selections and provides split-screen mode

(function () {
  'use strict';

  let fab = null;
  let splitContainer = null;

  // LaTeX detection patterns
  const LATEX_PATTERNS = [
    /\\documentclass/,
    /\\begin\{document\}/,
    /\\section\{/,
    /\\usepackage/,
    /\\\\(?:text|math|emph|cite|ref|label)\{/,
    /\$[^$]+\$/,
    /\\(?:frac|sqrt|sum|int|prod)\{/,
    /\\begin\{(?:equation|align|itemize|enumerate|figure|table)\}/
  ];

  function isLikelyLatex(text) {
    if (!text || text.trim().length < 5) return false;
    let matchCount = 0;
    for (const pattern of LATEX_PATTERNS) {
      if (pattern.test(text)) matchCount++;
    }
    return matchCount >= 1;
  }

  // Create floating action button
  function createFAB() {
    if (fab) return fab;
    fab = document.createElement('button');
    fab.className = 'latex-editor-fab';
    fab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="15" x2="15" y2="15"/>
      <line x1="12" y1="12" x2="12" y2="18"/>
    </svg>`;
    fab.title = 'In LaTeX Editor öffnen';
    fab.addEventListener('click', () => {
      const selection = window.getSelection().toString();
      browser.runtime.sendMessage({
        action: 'openEditor',
        mode: 'tab',
        content: selection
      });
      hideFAB();
    });
    document.body.appendChild(fab);
    return fab;
  }

  function showFAB() {
    const btn = createFAB();
    requestAnimationFrame(() => btn.classList.add('visible'));
  }

  function hideFAB() {
    if (fab) fab.classList.remove('visible');
  }

  // Listen for text selection
  document.addEventListener('mouseup', () => {
    setTimeout(() => {
      const selection = window.getSelection().toString();
      if (isLikelyLatex(selection)) {
        showFAB();
      } else {
        hideFAB();
      }
    }, 100);
  });

  document.addEventListener('mousedown', (e) => {
    if (fab && !fab.contains(e.target)) {
      hideFAB();
    }
  });

  // Split screen handling
  function toggleSplitScreen(content) {
    if (splitContainer) {
      closeSplitScreen();
      return;
    }

    splitContainer = document.createElement('div');
    splitContainer.className = 'latex-editor-split-container';

    const iframe = document.createElement('iframe');
    iframe.src = browser.runtime.getURL('editor/editor.html');
    splitContainer.appendChild(iframe);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'latex-editor-split-close';
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('click', closeSplitScreen);
    splitContainer.appendChild(closeBtn);

    // Resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'latex-editor-split-resize';
    let isResizing = false;
    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      const pct = Math.max(20, Math.min(80, (newWidth / window.innerWidth) * 100));
      splitContainer.style.width = pct + 'vw';
      document.body.style.marginRight = pct + 'vw';
    });
    document.addEventListener('mouseup', () => { isResizing = false; });
    splitContainer.appendChild(resizeHandle);

    document.body.appendChild(splitContainer);
    document.body.style.marginRight = '50vw';
    document.body.style.transition = 'margin-right 0.3s ease';

    // Send content to iframe once loaded
    if (content) {
      iframe.addEventListener('load', () => {
        iframe.contentWindow.postMessage({
          type: 'latex-editor-content',
          content: content
        }, '*');
      });
    }
  }

  function closeSplitScreen() {
    if (splitContainer) {
      splitContainer.remove();
      splitContainer = null;
      document.body.style.marginRight = '0';
    }
  }

  // Listen for messages from background script
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'toggleSplitScreen') {
      toggleSplitScreen(message.content || '');
    }
  });
})();

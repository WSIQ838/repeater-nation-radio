import { useCallback, useState } from 'react';

// Detaches the radio widget into its own window so it keeps working (and
// stays reachable) even when the main tab loses focus. Prefers the Document
// Picture-in-Picture API (Chrome) which stays visible above other windows;
// falls back to a plain popup window elsewhere, still a separate, focusable
// window independent of the main tab. Either way the target window's <head>
// gets a copy of the main document's stylesheets so the portaled content
// (see RadioWidget) renders identically.
export default function useRadioPopout() {
  const [popoutWindow, setPopoutWindow] = useState(null);

  const isDocPip = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

  const copyStyles = (targetDoc) => {
    for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
      targetDoc.head.appendChild(node.cloneNode(true));
    }
  };

  const popOut = useCallback(async (width = 340, height = 760) => {
    let win;
    if (isDocPip) {
      win = await window.documentPictureInPicture.requestWindow({ width, height });
    } else {
      win = window.open('', 'repeaterNationRadio', `width=${width},height=${height},popup=1`);
      if (!win) throw new Error('Pop-up blocked — allow pop-ups for this site to pop out the radio.');
    }
    win.document.title = 'Repeater Nation Radio';
    copyStyles(win.document);
    win.document.body.style.margin = '0';
    win.document.body.style.background = '#0a0a0a';
    win.document.body.style.overflow = 'visible';
    const onClose = () => setPopoutWindow(null);
    win.addEventListener('pagehide', onClose, { once: true });
    setPopoutWindow(win);
    return win;
  }, [isDocPip]);

  const popIn = useCallback(() => {
    if (popoutWindow) { try { popoutWindow.close(); } catch { /* noop */ } }
    setPopoutWindow(null);
  }, [popoutWindow]);

  return { popoutWindow, isDocPip, popOut, popIn };
}

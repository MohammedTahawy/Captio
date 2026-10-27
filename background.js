/**
 * Captio - Background Service Worker
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Captio] Extension installed successfully.');
  // Initialize default configuration
  chrome.storage.local.get(['autoEnableCaptions', 'autoDownloadOnLeave'], (res) => {
    const updates = {};
    if (res.autoEnableCaptions === undefined) updates.autoEnableCaptions = true;
    if (res.autoDownloadOnLeave === undefined) updates.autoDownloadOnLeave = true;
    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'DOWNLOAD_TRANSCRIPT') {
    handleDownload(message.payload)
      .then(downloadId => sendResponse({ success: true, downloadId }))
      .catch(err => {
        console.error('[Captio] Download error:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // async response
  }

  if (message.action === 'UPDATE_BADGE') {
    const count = message.count || 0;
    const tabId = sender.tab ? sender.tab.id : undefined;
    if (tabId) {
      chrome.action.setBadgeText({
        tabId: tabId,
        text: count > 0 ? (count > 999 ? '999+' : String(count)) : ''
      });
      chrome.action.setBadgeBackgroundColor({
        tabId: tabId,
        color: '#1a73e8'
      });
    }
    sendResponse({ success: true });
    return false;
  }
});

/**
 * Perform reliable file download via chrome.downloads API
 */
async function handleDownload(payload) {
  const { filename, content, format } = payload;
  
  // Add UTF-8 BOM (\uFEFF) to guarantee Arabic & international text encodes correctly in Notepad / Mac TextEdit
  const utf8BOM = '\uFEFF';
  const fullContent = utf8BOM + (content || '');
  
  const mimeType = format === 'json' ? 'application/json' : 'text/plain;charset=utf-8';
  const base64Data = btoa(unescape(encodeURIComponent(fullContent)));
  const dataUrl = `data:${mimeType};base64,${base64Data}`;

  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: dataUrl,
      filename: filename || `Meet-Transcript-${Date.now()}.txt`,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve(downloadId);
    });
  });
}

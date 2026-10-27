/**
 * Captio - Content Script
 * Monitors live captions, automatically enables them, and saves transcripts locally.
 */

(() => {
  'use strict';

  // Prevent multiple injections
  if (window.__captioLoaded) return;
  window.__captioLoaded = true;

  console.log('[Captio] Content script initialized.');

  // Configuration and State
  const state = {
    meetingId: extractMeetingId(window.location.href),
    startTime: new Date(),
    entries: [], // Array of { id, speaker, text, timestamp, rawTime }
    activeTurnMap: new WeakMap(), // Maps DOM elements to transcript entries
    autoEnableCaptions: true,
    autoDownloadOnLeave: true,
    downloadTriggered: false,
    hudElement: null,
    observer: null,
    pollInterval: null,
    captionsEnabledAttempts: 0
  };

  // Known Google Meet selectors
  const SELECTORS = {
    // Caption containers
    CAPTION_REGION: [
      '[aria-label*="Captions" i][role="region"]',
      '[aria-label*="الترجمة" i][role="region"]',
      '[aria-label*="ترجمة" i][role="region"]',
      '[aria-label*="subtitles" i][role="region"]',
      '[role="region"][aria-label*="caption" i]',
      '[jsname="dsyhDe"]'
    ].join(','),

    // Turn / speaker speech blocks
    TURN_BLOCK: '.nMcdL, .bj4p3b, [jscontroller="TEjq6e"], [jscontroller="D1tHje"]',
    
    // Speaker name
    SPEAKER_NAME: '.NWpY1d, .ellip, [data-sender-name]',
    
    // Caption text container
    TEXT_CONTAINER: '.ygicle, .VbkSUe, .iTTPOb',

    // Closed Caption button in bottom bar
    CC_BUTTON: [
      'button[aria-label*="caption" i]',
      'button[aria-label*="ترجمة" i]',
      'button[aria-label*="الترجمة" i]',
      'button[aria-label*="subtitle" i]',
      'button[data-tooltip-id*="caption" i]',
      'button[jsname="r8qRAd"]'
    ].join(','),

    // Leave call button
    LEAVE_BUTTON: [
      'button[aria-label*="Leave call" i]',
      'button[aria-label*="مغادرة المكالمة" i]',
      'button[aria-label*="مغادرة" i]',
      'button[aria-label*="إنهاء المكالمة" i]',
      'button[data-tooltip-id*="leave" i]',
      'button[jsname="CQylAd"]'
    ].join(',')
  };

  /**
   * Extract Meet code (e.g. 'vcb-nyum-rqz') from current URL
   */
  function extractMeetingId(url) {
    try {
      const match = url.match(/meet\.google\.com\/([a-z0-9-]+)/i);
      if (match && match[1] && match[1] !== 'landing' && match[1] !== 'new') {
        return match[1].split('?')[0];
      }
    } catch (e) {}
    return 'meeting-' + new Date().toISOString().slice(0, 10);
  }

  /**
   * Format current local time as HH:MM:SS
   */
  function formatTime(date = new Date()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  /**
   * Format date as YYYY-MM-DD
   */
  function formatDate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Filter out Google Meet UI buttons / icons mistaken for captions
   */
  function isGarbageUiText(text) {
    if (!text || text.length < 2) return true;
    const lower = text.trim().toLowerCase();
    const uiIcons = [
      'mic', 'mic_off', 'videocam', 'videocam_off', 'present_to_all', 'screen_share',
      'chat', 'people', 'settings', 'call_end', 'info', 'more_vert', 'expand_more',
      'expand_less', 'check', 'content_copy', 'closed_caption', 'subtitles'
    ];
    return uiIcons.includes(lower);
  }

  // =========================================================================
  // Auto-Enable Captions Logic
  // =========================================================================

  function tryAutoEnableCaptions() {
    if (!state.autoEnableCaptions) return;
    state.captionsEnabledAttempts++;

    // Check if captions are already showing on screen
    const captionRegion = document.querySelector(SELECTORS.CAPTION_REGION) || document.querySelector('.nMcdL');
    if (captionRegion && captionRegion.offsetParent !== null) {
      console.log('[Meet Caption Saver] Captions are already active and visible.');
      return;
    }

    // Look for the CC button in the Meet toolbar
    const buttons = document.querySelectorAll(SELECTORS.CC_BUTTON);
    let ccBtn = null;
    for (const b of buttons) {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      // If label indicates it's already ON (e.g. "Turn off captions" or "إيقاف الترجمة"), we are good
      if (label.includes('turn off') || label.includes('إيقاف') || label.includes('تعطيل') || b.getAttribute('aria-pressed') === 'true') {
        console.log('[Meet Caption Saver] Captions button is already turned ON.');
        return;
      }
      if (label.includes('turn on') || label.includes('تفعيل') || label.includes('تشغيل') || b.getAttribute('aria-pressed') === 'false' || label.includes('caption')) {
        ccBtn = b;
        break;
      }
    }

    if (ccBtn) {
      console.log('[Meet Caption Saver] Clicking CC button to enable captions...');
      ccBtn.click();
      showToast('Closed captions enabled automatically');
      return;
    }

    // Fallback: Dispatch keyboard shortcut 'c' (Google Meet standard toggle for captions)
    if (state.captionsEnabledAttempts <= 10) {
      try {
        const ev = { key: 'c', code: 'KeyC', keyCode: 67, which: 67, bubbles: true };
        document.dispatchEvent(new KeyboardEvent('keydown', ev));
        document.dispatchEvent(new KeyboardEvent('keyup', ev));
        console.log('[Meet Caption Saver] Dispatched "c" key shortcut to enable captions.');
      } catch (e) {}
    }
  }

  // =========================================================================
  // Caption Observation & Extraction Logic
  // =========================================================================

  function processTurnElement(turnEl) {
    if (!turnEl || isGarbageUiText(turnEl.textContent)) return;

    // Extract speaker name
    let speakerName = 'Unknown Speaker';
    const speakerEl = turnEl.querySelector(SELECTORS.SPEAKER_NAME);
    if (speakerEl && speakerEl.textContent.trim()) {
      speakerName = speakerEl.textContent.trim();
    }

    // Extract caption text
    let text = '';
    const textEls = turnEl.querySelectorAll(SELECTORS.TEXT_CONTAINER);
    if (textEls.length > 0) {
      const pieces = [];
      textEls.forEach(el => {
        const t = el.textContent.trim();
        if (t && !isGarbageUiText(t)) pieces.push(t);
      });
      text = pieces.join(' ');
    } else {
      // Fallback: take direct text of container minus speaker name
      const fullText = turnEl.innerText || turnEl.textContent || '';
      text = fullText.replace(speakerName, '').trim();
    }

    if (!text || isGarbageUiText(text)) return;

    const existingEntry = state.activeTurnMap.get(turnEl);
    const nowTime = formatTime();

    if (existingEntry) {
      // If same turn is updating in real-time (Google Meet updates speech incrementally)
      if (existingEntry.text !== text) {
        existingEntry.text = text;
        existingEntry.rawTime = Date.now();
        updateHud();
        persistSessionDebounced();
      }
    } else {
      // Check if this matches our last added entry (e.g. re-rendered DOM element for same speaker)
      const lastEntry = state.entries[state.entries.length - 1];
      if (lastEntry && lastEntry.speaker === speakerName && (text.startsWith(lastEntry.text) || text === lastEntry.text)) {
        lastEntry.text = text;
        lastEntry.rawTime = Date.now();
        state.activeTurnMap.set(turnEl, lastEntry);
        updateHud();
        persistSessionDebounced();
        return;
      }

      // New speaker turn
      const newEntry = {
        id: 'turn_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        speaker: speakerName,
        text: text,
        timestamp: nowTime,
        rawTime: Date.now()
      };

      state.entries.push(newEntry);
      state.activeTurnMap.set(turnEl, newEntry);
      updateHud();
      persistSessionDebounced();
    }
  }

  /**
   * Scan visible caption elements across the DOM
   */
  function scanCaptions() {
    // Priority 1: Specific known turn blocks
    const turnBlocks = document.querySelectorAll(SELECTORS.TURN_BLOCK);
    if (turnBlocks.length > 0) {
      turnBlocks.forEach(el => processTurnElement(el));
      return;
    }

    // Priority 2: Generic caption region children
    const captionRegion = document.querySelector(SELECTORS.CAPTION_REGION);
    if (captionRegion) {
      const children = captionRegion.querySelectorAll('div[jscontroller], div[class*="n"], div[class*="b"]');
      if (children.length > 0) {
        children.forEach(el => {
          if (el.querySelector(SELECTORS.TEXT_CONTAINER) || el.querySelector(SELECTORS.SPEAKER_NAME)) {
            processTurnElement(el);
          }
        });
      } else {
        // Direct text inside caption region
        const textNodes = captionRegion.querySelectorAll(SELECTORS.TEXT_CONTAINER);
        textNodes.forEach(el => {
          const parent = el.parentElement;
          if (parent) processTurnElement(parent);
        });
      }
    }
  }

  /**
   * Initialize MutationObserver to catch caption nodes dynamically
   */
  function initCaptionObserver() {
    if (state.observer) state.observer.disconnect();

    state.observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0 || m.type === 'characterData') {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) {
        scanCaptions();
      }
    });

    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Also run a lightweight periodic scan (every 800ms) to guarantee no missed mutations
    if (state.pollInterval) clearInterval(state.pollInterval);
    state.pollInterval = setInterval(scanCaptions, 800);
  }

  // =========================================================================
  // Transcript Generation & Export Logic
  // =========================================================================

  /**
   * Format transcript array into clean, human-readable TXT format with metadata
   */
  function generateTranscriptText() {
    const divider = '='.repeat(60);
    const dateStr = formatDate(state.startTime);
    const startTimeStr = formatTime(state.startTime);
    const endTimeStr = formatTime(new Date());

    let header = [
      divider,
      `CAPTIO - MEETING TRANSCRIPT`,
      `Meeting Code : ${state.meetingId}`,
      `Date         : ${dateStr}`,
      `Time         : ${startTimeStr} - ${endTimeStr}`,
      `Total Turns  : ${state.entries.length}`,
      divider,
      ''
    ].join('\n');

    let body = state.entries.map(entry => {
      return `[${entry.timestamp}] ${entry.speaker}:\n${entry.text}\n`;
    }).join('\n');

    let footer = [
      '',
      divider,
      `End of Transcript (${state.entries.length} lines recorded)`,
      `Saved locally by Captio`,
      divider
    ].join('\n');

    return `${header}\n${body}\n${footer}`;
  }

  /**
   * Generate filename for the transcript download
   */
  function generateFilename(extension = 'txt') {
    const dateStr = formatDate(state.startTime);
    const timeStr = formatTime(state.startTime).replace(/:/g, '-');
    return `Captio-${state.meetingId}-${dateStr}-${timeStr}.${extension}`;
  }

  /**
   * Download transcript file
   */
  function downloadTranscript(reason = 'manual') {
    if (state.entries.length === 0) {
      showToast('No captions captured yet to save.');
      return;
    }

    const content = generateTranscriptText();
    const filename = generateFilename('txt');

    console.log(`[Meet Caption Saver] Triggering download (${reason}): ${filename} (${state.entries.length} lines)`);

    // Use background service worker via chrome.downloads for maximum reliability
    try {
      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_TRANSCRIPT',
        payload: {
          filename: filename,
          content: content,
          format: 'txt'
        }
      }, (res) => {
        if (chrome.runtime.lastError || !res?.success) {
          // Fallback to in-page blob download
          fallbackDownload(filename, content);
        } else {
          showToast(`Transcript downloaded: ${filename}`);
        }
      });
    } catch (e) {
      fallbackDownload(filename, content);
    }

    state.downloadTriggered = true;
  }

  /**
   * Fallback in-page download using Blob and <a> tag
   */
  function fallbackDownload(filename, content) {
    try {
      // Add UTF-8 BOM so Arabic displays correctly everywhere
      const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showToast(`Transcript downloaded: ${filename}`);
    } catch (err) {
      console.error('[Meet Caption Saver] Fallback download failed:', err);
    }
  }

  // =========================================================================
  // Persistence & Storage Backup
  // =========================================================================

  let persistTimer = null;
  function persistSessionDebounced() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persistSession, 1200);
  }

  async function persistSession() {
    if (state.entries.length === 0) return;

    try {
      const sessionData = {
        meetingId: state.meetingId,
        url: window.location.href,
        date: formatDate(state.startTime),
        startTime: state.startTime.toISOString(),
        lastUpdated: new Date().toISOString(),
        count: state.entries.length,
        entries: state.entries
      };

      const storageKey = `meet_session_${state.meetingId}`;
      const toSet = {};
      toSet[storageKey] = sessionData;
      toSet['active_session_id'] = state.meetingId;

      chrome.storage.local.set(toSet);

      // Update extension badge
      chrome.runtime.sendMessage({
        action: 'UPDATE_BADGE',
        count: state.entries.length
      }).catch(() => {});
    } catch (e) {}
  }

  // =========================================================================
  // Meeting Exit & Leave Detection Logic
  // =========================================================================

  function handleMeetingEnd(reason) {
    if (state.downloadTriggered || state.entries.length === 0) return;
    if (!state.autoDownloadOnLeave) return;

    console.log(`[Meet Caption Saver] Meeting leave detected (${reason}). Auto-saving transcript...`);
    downloadTranscript(`auto-leave: ${reason}`);
  }

  function setupLeaveDetection() {
    // 1. Intercept clicks on the Leave Call button
    document.addEventListener('click', (e) => {
      const target = e.target;
      const leaveBtn = target.closest(SELECTORS.LEAVE_BUTTON);
      if (leaveBtn) {
        console.log('[Meet Caption Saver] User clicked Leave button.');
        // Small delay to capture any final spoken words
        setTimeout(() => handleMeetingEnd('leave_button_clicked'), 300);
      }
    }, true);

    // 2. Before unload / pagehide (tab closed or URL navigated away)
    window.addEventListener('beforeunload', () => {
      handleMeetingEnd('beforeunload');
    });

    window.addEventListener('pagehide', () => {
      handleMeetingEnd('pagehide');
    });

    // 3. Monitor page DOM for "You left the meeting" or "Rejoin" screen
    const exitObserver = new MutationObserver(() => {
      const bodyText = document.body ? document.body.innerText : '';
      if (
        bodyText.includes('You left the meeting') ||
        bodyText.includes('لقد غادرت الاجتماع') ||
        bodyText.includes('Rejoin') && bodyText.includes('Return to home screen') ||
        bodyText.includes('إعادة الانضمام')
      ) {
        handleMeetingEnd('end_screen_detected');
      }
    });

    exitObserver.observe(document.body, { childList: true, subtree: true });
  }

  // =========================================================================
  // Floating On-Screen HUD UI
  // =========================================================================

  function createHud() {
    if (document.getElementById('meet-caption-saver-hud')) return;

    const hud = document.createElement('div');
    hud.id = 'meet-caption-saver-hud';
    hud.title = 'Captio - Meeting Caption Saver';

    hud.innerHTML = `
      <div class="hud-status" id="hud-toggle-minimize" title="Click to minimize/expand">
        <span class="status-dot"></span>
        <span class="hud-count" id="hud-line-count">0 lines</span>
      </div>
      <div class="hud-actions" id="hud-actions-bar">
        <button class="btn-download" id="hud-btn-download" title="Download Transcript (.txt)">
          <span>💾</span>
          <span>Save TXT</span>
        </button>
        <button id="hud-btn-copy" title="Copy transcript to clipboard">
          <span>📋</span>
          <span>Copy</span>
        </button>
        <button class="btn-icon-only" id="hud-btn-minimize" title="Minimize">
          <span>_</span>
        </button>
      </div>
    `;

    document.body.appendChild(hud);
    state.hudElement = hud;

    // Attach HUD events
    document.getElementById('hud-btn-download').addEventListener('click', (e) => {
      e.stopPropagation();
      downloadTranscript('hud_button');
    });

    document.getElementById('hud-btn-copy').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (state.entries.length === 0) {
        showToast('No captions to copy yet.');
        return;
      }
      try {
        const text = generateTranscriptText();
        await navigator.clipboard.writeText(text);
        showToast('Transcript copied to clipboard!');
      } catch (err) {
        showToast('Failed to copy to clipboard.');
      }
    });

    const toggleMinimize = (e) => {
      e.stopPropagation();
      hud.classList.toggle('minimized');
    };

    document.getElementById('hud-btn-minimize').addEventListener('click', toggleMinimize);
    document.getElementById('hud-toggle-minimize').addEventListener('click', toggleMinimize);
  }

  function updateHud() {
    const countEl = document.getElementById('hud-line-count');
    if (countEl) {
      const count = state.entries.length;
      countEl.textContent = `${count} ${count === 1 ? 'line' : 'lines'}`;
    }
  }

  function showToast(message) {
    let toast = document.querySelector('.meet-caption-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'meet-caption-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }

  // =========================================================================
  // Extension Messages Listener (from popup)
  // =========================================================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'GET_MEET_STATUS') {
      sendResponse({
        meetingId: state.meetingId,
        count: state.entries.length,
        startTime: state.startTime.toISOString(),
        entries: state.entries.slice(-20), // preview last 20 lines
        autoEnableCaptions: state.autoEnableCaptions,
        autoDownloadOnLeave: state.autoDownloadOnLeave
      });
      return false;
    }

    if (message.action === 'TRIGGER_DOWNLOAD') {
      downloadTranscript('popup_trigger');
      sendResponse({ success: true, count: state.entries.length });
      return false;
    }

    if (message.action === 'SET_SETTINGS') {
      if (message.autoEnableCaptions !== undefined) state.autoEnableCaptions = message.autoEnableCaptions;
      if (message.autoDownloadOnLeave !== undefined) state.autoDownloadOnLeave = message.autoDownloadOnLeave;
      sendResponse({ success: true });
      return false;
    }
  });

  // =========================================================================
  // Initialization Sequence
  // =========================================================================

  function init() {
    // Only activate if we are on an active meeting URL
    const isMeetingUrl = /meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i.test(window.location.href);
    if (!isMeetingUrl) {
      console.log('[Meet Caption Saver] Not in an active meeting room URL yet.');
      return;
    }

    console.log(`[Meet Caption Saver] Active meeting detected: ${state.meetingId}`);

    // Load user settings from storage
    chrome.storage.local.get(['autoEnableCaptions', 'autoDownloadOnLeave'], (res) => {
      if (res.autoEnableCaptions !== undefined) state.autoEnableCaptions = res.autoEnableCaptions;
      if (res.autoDownloadOnLeave !== undefined) state.autoDownloadOnLeave = res.autoDownloadOnLeave;
    });

    createHud();
    initCaptionObserver();
    setupLeaveDetection();

    // Auto-enable captions loop during the first 45 seconds (handling pre-join / joining screen)
    const captionInterval = setInterval(() => {
      tryAutoEnableCaptions();
      if (state.captionsEnabledAttempts > 25) {
        clearInterval(captionInterval);
      }
    }, 2000);

    // Initial check
    setTimeout(tryAutoEnableCaptions, 1500);
  }

  // Run when document is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

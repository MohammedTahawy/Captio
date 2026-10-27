/**
 * Captio - Instant Live Meeting Caption Saver (Console & Bookmarklet)
 * 
 * HOW TO USE IN AN ACTIVE GOOGLE MEET CALL:
 * 1. Press F12 (or right-click anywhere -> Inspect).
 * 2. Click the "Console" tab.
 * 3. Copy and paste all the code below and press Enter.
 * 4. Captions will be recorded live with speaker names and timestamps.
 * 5. A floating badge [💾 Save TXT] appears at the top-right.
 * 6. When you leave the call, the transcript downloads automatically as a .txt file!
 */

(() => {
  if (window.__captioActive) {
    console.log('⚠️ Captio is already running in this tab.');
    return;
  }
  window.__captioActive = true;

  console.log('🎙️ Captio started! Monitoring Google Meet live captions...');

  const transcript = [];
  const turnMap = new WeakMap();
  const startTime = new Date();

  // Extract meeting code
  const meetCodeMatch = window.location.href.match(/meet\.google\.com\/([a-z0-9-]+)/i);
  const meetCode = meetCodeMatch ? meetCodeMatch[1].split('?')[0] : 'meet-call';

  // 1. Ensure Captions are ON
  function ensureCaptionsOn() {
    const buttons = document.querySelectorAll('button[aria-label*="caption" i], button[aria-label*="ترجمة" i], button[aria-label*="الترجمة" i], button[data-tooltip-id*="caption" i], button[jsname="r8qRAd"]');
    for (const b of buttons) {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('turn off') || label.includes('إيقاف') || b.getAttribute('aria-pressed') === 'true') {
        console.log('✅ Captions are already ON.');
        return;
      }
      if (label.includes('turn on') || label.includes('تفعيل') || b.getAttribute('aria-pressed') === 'false') {
        b.click();
        console.log('✅ Captio turned ON captions automatically.');
        return;
      }
    }
    // Fallback: keyboard shortcut 'c'
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', keyCode: 67, which: 67, bubbles: true }));
  }
  ensureCaptionsOn();

  // 2. Format Time Helper
  function getTimeString() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  // 3. Process Turn Node
  function processTurn(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

    // Detect speaker
    const speakerEl = node.querySelector('.NWpY1d, .ellip, [data-sender-name]');
    let speaker = speakerEl ? speakerEl.textContent.trim() : 'Speaker';

    // Detect text
    const textEls = node.querySelectorAll('.ygicle, .VbkSUe, .iTTPOb');
    let text = '';
    if (textEls.length > 0) {
      text = Array.from(textEls).map(el => el.textContent.trim()).filter(Boolean).join(' ');
    } else {
      text = (node.innerText || node.textContent || '').replace(speaker, '').trim();
    }

    if (!text || text.length < 2) return;

    // Filter out UI control text
    const lower = text.toLowerCase();
    if (['more_vert', 'mic', 'mic_off', 'videocam', 'settings', 'call_end', 'info'].includes(lower)) return;

    const existing = turnMap.get(node);
    if (existing) {
      existing.text = text;
      updateFloatingHud();
    } else {
      const last = transcript[transcript.length - 1];
      if (last && last.speaker === speaker && (text.startsWith(last.text) || text === last.text)) {
        last.text = text;
        turnMap.set(node, last);
        updateFloatingHud();
        return;
      }

      const entry = {
        speaker: speaker,
        text: text,
        timestamp: getTimeString()
      };
      transcript.push(entry);
      turnMap.set(node, entry);
      updateFloatingHud();
      console.log(`[${entry.timestamp}] ${entry.speaker}: ${entry.text}`);
    }
  }

  // 4. Scan Captions Function
  function scan() {
    const turns = document.querySelectorAll('.nMcdL, .bj4p3b, [aria-label*="Captions" i] > div, [aria-label*="الترجمة" i] > div');
    turns.forEach(t => processTurn(t));
  }

  // 5. Setup Observer
  const observer = new MutationObserver(() => scan());
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  setInterval(scan, 800);

  // 6. Generate Text File
  function buildTextFile() {
    const divider = '='.repeat(60);
    const dateStr = new Date().toISOString().slice(0, 10);
    const startStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const endStr = getTimeString();

    let output = [
      divider,
      `CAPTIO - MEETING TRANSCRIPT`,
      `Meeting Code : ${meetCode}`,
      `Date         : ${dateStr}`,
      `Duration     : ${startStr} - ${endStr}`,
      `Total Lines  : ${transcript.length}`,
      divider,
      ''
    ].join('\n');

    output += transcript.map(e => `[${e.timestamp}] ${e.speaker}:\n${e.text}\n`).join('\n');
    output += `\n${divider}\nEnd of Transcript (${transcript.length} lines)\nSaved locally by Captio\n${divider}\n`;
    return output;
  }

  // 7. Download Function
  let hasDownloaded = false;
  function downloadTranscript(trigger = 'manual') {
    if (transcript.length === 0) {
      alert('No captions captured yet.');
      return;
    }
    if (hasDownloaded && trigger !== 'manual') return;

    const content = buildTextFile();
    // \uFEFF ensures Arabic and UTF-8 characters render perfectly in Notepad/Mac
    const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Captio-${meetCode}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    hasDownloaded = true;
    console.log(`✅ Captio: Transcript downloaded (${transcript.length} lines).`);
  }

  // 8. Create Floating HUD Widget
  const hud = document.createElement('div');
  hud.id = 'captio-console-hud';
  hud.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 9999999;
    background: rgba(32, 33, 36, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 24px;
    padding: 8px 16px;
    color: white;
    font-family: Roboto, Arial, sans-serif;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.5);
  `;
  hud.innerHTML = `
    <span style="display:flex;align-items:center;gap:6px;">
      <span style="width:8px;height:8px;border-radius:50%;background:#ea4335;"></span>
      <strong style="color:#8ab4f8;">Captio:</strong>
      <b id="captio-count-text">0 lines</b>
    </span>
    <button id="captio-save-btn" style="background:#1a73e8;border:none;color:white;border-radius:14px;padding:4px 12px;cursor:pointer;font-weight:600;font-size:12px;">💾 Save TXT</button>
  `;
  document.body.appendChild(hud);

  document.getElementById('captio-save-btn').onclick = () => downloadTranscript('manual');

  function updateFloatingHud() {
    const el = document.getElementById('captio-count-text');
    if (el) el.textContent = `${transcript.length} lines`;
  }

  // 9. Auto-Download on Leaving Call
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[aria-label*="Leave" i], button[aria-label*="مغادرة" i], button[aria-label*="إنهاء" i], button[jsname="CQylAd"]');
    if (btn) {
      setTimeout(() => downloadTranscript('leave_button'), 400);
    }
  }, true);

  window.addEventListener('beforeunload', () => downloadTranscript('beforeunload'));
  window.addEventListener('pagehide', () => downloadTranscript('pagehide'));

  console.log('🎉 Captio is active! Captions are being monitored. Click "Save TXT" or leave the call to auto-download.');
})();

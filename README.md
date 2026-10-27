# Captio 🎙️💾

> **Auto-Captions & Meeting Transcript Saver for Google Meet**  
> *Private • 100% On-Device • Multi-language & Arabic (RTL) Supported*

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Privacy: 100% Local](https://img.shields.io/badge/Privacy-100%25%20On--Device-green.svg)](#privacy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Captio** is a lightweight, open-source browser extension and script that automatically enables closed captions when you join a Google Meet call, records every spoken word with speaker names and timestamps, and automatically downloads the transcript as a clean `.txt` file when you leave the meeting.

---

## ✨ Features

- ⚡ **Auto-Enable Captions**: Turns on Google Meet captions automatically upon joining.
- 💾 **Auto-Download on Leave**: When you press the red "Leave call" button or close the tab, your transcript is saved immediately.
- 🌐 **Full Arabic & Multilingual Support (UTF-8 BOM)**: Exports with UTF-8 BOM encoding so Arabic, English, and multilingual text display flawlessly in Windows Notepad, Mac TextEdit, and all text editors.
- 🕒 **Speaker Names & Timestamps**: Accurately attributes speech to each speaker with exact timestamps (e.g. `[10:08:12] Mohamed: ...`).
- 🛡️ **100% Local & Private**: No data is sent to external servers or third-party APIs. Everything runs in your browser.
- 🔄 **Crash Recovery & History**: Automatically saves recent meeting transcripts in local storage so you never lose notes even if your browser closes unexpectedly.
- 🎛️ **Sleek Floating HUD**: Non-intrusive live counter and quick download/copy buttons directly on your Google Meet screen.

---

## 🚀 Quick Start (Two Ways to Use)

### Option 1: Install as a Chrome / Brave Extension (Permanent)
1. Clone or download this repository.
2. In your browser (Chrome or Brave), navigate to:
   - **Brave**: `brave://extensions`
   - **Chrome**: `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** (top-left).
5. Select the folder containing `manifest.json`.
6. That's it! Captio will now automatically manage your Google Meet transcripts.

---

### Option 2: Instant Console Script (No Installation Needed)
If you are **already inside a live meeting right now**:
1. Press `F12` (or Right-click anywhere ➔ **Inspect**).
2. Go to the **Console** tab.
3. Paste the contents of [`meet-caption-saver-console.js`](./meet-caption-saver-console.js) and hit `Enter`.
4. A floating **Captio** badge will appear with a live line counter. When the call ends, your `.txt` transcript downloads automatically!

---

## 📄 Sample Transcript Output

```text
============================================================
CAPTIO - MEETING TRANSCRIPT
Meeting Code : vcb-nyum-rqz
Date         : 2026-10-27
Time         : 10:08:00 - 10:45:15
Total Turns  : 42
============================================================

[10:08:12] amro ahmed:
بقى هي اللي ممكن نجيبها كده مثلا انا اخترت.

[10:08:25] icsa egypt:
هنعكس بقى ايه العملاء العملاء هتحط لي الاولاتيه المشروع.

[10:08:35] amro ahmed:
ماشي تمام.

============================================================
End of Transcript (42 lines recorded)
Saved locally by Captio
============================================================
```

---

## 🏪 Chrome Web Store Publishing Guidelines

When submitting **Captio** to the Chrome Web Store:
- **Title**: `Captio – Auto Caption & Transcript Saver`
- **Short Name**: `Captio`
- **Category**: `Productivity`
- **Single Purpose**: *"Automatically enables Google Meet captions and downloads the meeting transcript locally upon exit."*
- **Permission Justifications**:
  - `storage`: Required to save meeting history and user settings locally.
  - `downloads`: Required to save the `.txt` transcript file to the user's downloads folder upon leaving the meeting.

---

## 🔒 Privacy
Captio does not collect, transmit, or store any personal data on external servers. All caption parsing and text generation happens strictly within the client-side DOM of Google Meet on your machine.

---

## 📜 License
MIT License. Free to use, modify, and distribute.

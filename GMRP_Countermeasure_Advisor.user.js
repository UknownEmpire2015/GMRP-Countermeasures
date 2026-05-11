// ==UserScript==
// @name         GMRP Countermeasure Advisor
// @namespace    https://geo-fs.com/
// @version      1.3.0
// @description  GeoFS Military Roleplay — detects missile launches targeting YOUR callsign and triggers Chaff or Flare alerts
// @author       GMRP Addon
// @match        https://www.geo-fs.com/*
// @match        https://geo-fs.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── AUDIO URLS ──────────────────────────────────────────────────────────
  const AUDIO_URLS = {
    chaff: 'https://raw.githubusercontent.com/UknownEmpire2015/GMRP-Countermeasures/main/Track3_Chaff.m4a',
    flare: 'https://raw.githubusercontent.com/UknownEmpire2015/GMRP-Countermeasures/main/Track4_Flare.m4a',
    lock:  'https://raw.githubusercontent.com/UknownEmpire2015/GMRP-Countermeasures/main/Track2_Missile_Lock.m4a',
  };

  // ─── MISSILE LISTS ───────────────────────────────────────────────────────
  const CHAFF_MISSILES = [
    'AIM-7', 'Sparrow',
    'AIM-9C', 'AIM-9C Sidewinder',
    'Matra Super 530', 'Super 530',
    'PL-11',
    'R-27R', 'AA-10R', 'Alamo',
    'R-33', 'AA-9', 'Amos',
    'R-23R', 'AA-7', 'Apex', 'Izdeliye 340', 'Izd 340',
    'Alenia Aspide', 'Aspide',
    'K-13R', 'AA-2D', 'Atoll', 'Izdeliye 380', 'Izd 380',
    'R-40RD', 'AA-6', 'Acrid', 'Izdeliye 46D', 'Izd 46D',
    'AIM-120', 'AMRAAM',
    'MBDA Meteor', 'Meteor',
    'Astra Mk 1', 'Astra',
    'AAM-4',
    'Gökdoğan', 'Goekdogan', 'Peregrine',
    'Rafael Derby', 'Derby',
    'Matra R.511', 'R.511', 'R511',
    'R-Darter',
    'MBDA MICA EM', 'MICA EM',
    'PL-15',
    'R-77', 'AA-12', 'Adder',
    'R-27EA', 'AA-10EA',
    'Sky Sword 2', 'TC-2',
    'AIM-174B', 'Gunslinger',
    'R-37', 'AA-13', 'Axehead', 'Izdeliye 610', 'Izd 610',
    'PL-12', 'CH-AA-7', 'Adze',
    'Fakour-90', 'Fakour',
  ];

  const FLARE_MISSILES = [
    'AIM-9', 'Sidewinder',
    'ASRAAM', 'AIM-132',
    'IRIS-T',
    'AAM-3',
    'Bozdogan', 'Bozdoğan', 'Merlin',
    'Rafael Python 5', 'Python 5', 'Python',
    'Matra Magic II', 'Magic II', 'Magic 2',
    'Matra R.510', 'R.510', 'R510',
    'Matra R.530', 'R.530', 'R530',
    'MAA-1A', 'MAA-1B', 'Piranha',
    'MBDA MICA IR', 'MICA IR',
    'PL-9',
    'R-60', 'AA-8', 'Aphid',
    'R-27T', 'AA-10T',
    'Sky Sword 1', 'TC-1',
    'R-73', 'AA-11', 'Archer', 'Izdeliye 72', 'Izd 72',
    'V3E', 'A-Darter',
  ];

  const LOCK_KEYWORDS = [
    'lock on', 'locking', 'locked on', 'locked', 'missile lock',
    'tone', 'got tone', 'tracking', 'radar lock', 'heat lock',
    'fox 1', 'fox 2', 'fox 3', 'fox1', 'fox2', 'fox3',
  ];

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function buildPattern(list) {
    const sorted = [...list].sort((a, b) => b.length - a.length);
    return new RegExp(sorted.map(escapeRegex).join('|'), 'i');
  }

  const CHAFF_RE = buildPattern(CHAFF_MISSILES);
  const FLARE_RE = buildPattern(FLARE_MISSILES);
  const LOCK_RE  = buildPattern(LOCK_KEYWORDS);

  function detectMissileType(text) {
    if (CHAFF_RE.test(text)) return 'chaff';
    if (FLARE_RE.test(text)) return 'flare';
    if (LOCK_RE.test(text))  return 'lock';
    return null;
  }

  // ─── CALLSIGN DETECTION ──────────────────────────────────────────────────
  const CALLSIGN_SELECTORS = [
    '.geofs-user-name', '.geofs-username',
    '[class*="userName"]', '[class*="user-name"]', '[class*="username"]',
    '.geofs-login-name', '#geofs-user-name',
  ];

  let myCallsign   = null;
  let myCallsignRE = null;
  let myUserId     = null;

  function tryReadCallsign() {
    try {
      const u = window.geofs && (geofs.userRecord || geofs.user || geofs.api?.user);
      if (u) {
        const name = u.callsign || u.displayName || u.name || u.username || u.login;
        const id   = u.id || u.uid || u.userId;
        if (name) { setCallsign(name, id); return true; }
      }
    } catch(e) {}

    for (const sel of CALLSIGN_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) { setCallsign(el.textContent.trim(), null); return true; }
    }

    const ownMsg = document.querySelector(
      '.geofs-chat-message.geofs-own, .geofs-own-message, [class*="ownMessage"], [class*="own-message"]'
    );
    if (ownMsg) {
      const nameEl = ownMsg.querySelector('[class*="name"], [class*="user"], [class*="author"]');
      if (nameEl && nameEl.textContent.trim()) { setCallsign(nameEl.textContent.trim(), null); return true; }
    }

    return false;
  }

  function setCallsign(name, id) {
    if (myCallsign === name) return;
    myCallsign   = name;
    myUserId     = id || null;
    myCallsignRE = new RegExp(
      '(?:^|[\\s@\\[\\(\\-_,\\.:\\/])' + escapeRegex(name) + '(?:[\\s@\\]\\),\\.:\\-_!?]|$)',
      'i'
    );
    updateStatusPip();
    console.log(`[GMRP] Callsign set to: "${name}"${id ? ` (ID: ${id})` : ''}`);
  }

  function pollForCallsign() {
    if (!tryReadCallsign()) setTimeout(pollForCallsign, 3000);
  }

  // ─── TARGETING CHECK ─────────────────────────────────────────────────────
  const TARGET_RE = /(?:on|at|locking|locked|targeting|tracking|firing on|firing at)\s+([A-Za-z0-9_\-\[\]]+)|@([A-Za-z0-9_\-]+)/gi;

  function isTargetingMe(text) {
    if (!myCallsign) return true;
    if (myCallsignRE && myCallsignRE.test(text)) return true;
    TARGET_RE.lastIndex = 0;
    let match;
    while ((match = TARGET_RE.exec(text)) !== null) {
      const target = (match[1] || match[2] || '').trim();
      if (!target) continue;
      if (myCallsignRE && !myCallsignRE.test(target)) return false;
    }
    return true;
  }

  // ─── AUDIO ───────────────────────────────────────────────────────────────
  let activeAudio = null;
  function playAlert(type) {
    if (activeAudio) { activeAudio.pause(); activeAudio.currentTime = 0; }
    const audio = new Audio(AUDIO_URLS[type]);
    audio.volume = 1.0;
    audio.play().catch(() => {});
    activeAudio = audio;
  }

  // ─── STYLES ──────────────────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@700;900&display=swap');

      #gmrp-panel {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        pointer-events: none;
        font-family: 'Share Tech Mono', monospace;
      }

      #gmrp-card {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 10px 16px 10px 14px;
        background: rgba(0,0,0,0.82);
        backdrop-filter: blur(8px);
        border-left: 3px solid currentColor;
        border-radius: 2px;
        opacity: 0;
        transform: translateX(24px);
        transition: opacity 0.15s ease, transform 0.15s ease;
        min-width: 220px;
        max-width: 320px;
      }
      #gmrp-card.visible { opacity: 1; transform: translateX(0); }
      #gmrp-card.chaff { color: #00cfff; }
      #gmrp-card.flare { color: #ff9d00; }
      #gmrp-card.lock  { color: #ff2244; }

      #gmrp-icon  { font-size: 22px; line-height: 1; flex-shrink: 0; }
      #gmrp-text  { display: flex; flex-direction: column; gap: 2px; }
      #gmrp-label {
        font-family: 'Orbitron', monospace;
        font-size: 15px; font-weight: 900;
        letter-spacing: 4px; line-height: 1;
      }
      #gmrp-sublabel {
        font-size: 9px; letter-spacing: 2px;
        opacity: 0.6; text-transform: uppercase;
      }
      #gmrp-card.lock.visible #gmrp-label {
        animation: gmrp-blink 0.5s step-end infinite;
      }
      @keyframes gmrp-blink {
        0%, 49% { opacity: 1; }
        50%, 100% { opacity: 0.15; }
      }

      #gmrp-toasts {
        display: flex; flex-direction: column;
        align-items: flex-end; gap: 5px;
      }
      .gmrp-toast {
        font-size: 10px; letter-spacing: 1.5px;
        padding: 4px 10px 4px 8px;
        background: rgba(0,0,0,0.7);
        backdrop-filter: blur(4px);
        border-left: 2px solid currentColor;
        border-radius: 1px; opacity: 0;
        transform: translateX(12px);
        animation: gmrp-tin 0.15s forwards, gmrp-tout 0.3s 4.7s forwards;
        text-transform: uppercase; max-width: 300px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .gmrp-toast.chaff { color: #00cfff; }
      .gmrp-toast.flare { color: #ff9d00; }
      .gmrp-toast.lock  { color: #ff2244; }
      @keyframes gmrp-tin  { to { opacity: 0.75; transform: translateX(0); } }
      @keyframes gmrp-tout { to { opacity: 0; transform: translateX(8px); } }

      #gmrp-status {
        font-size: 9px; letter-spacing: 2.5px;
        color: rgba(0,255,120,0.4);
        text-transform: uppercase; padding-right: 2px;
        transition: color 0.3s;
      }
      #gmrp-status::before { content: '● '; color: rgba(0,255,120,0.6); }
      #gmrp-status.no-callsign { color: rgba(255,200,0,0.5); }
      #gmrp-status.no-callsign::before { color: rgba(255,200,0,0.7); }
    `;
    document.head.appendChild(style);
  }

  // ─── BUILD UI ─────────────────────────────────────────────────────────────
  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'gmrp-panel';
    panel.innerHTML = `
      <div id="gmrp-toasts"></div>
      <div id="gmrp-card">
        <div id="gmrp-icon">⚠</div>
        <div id="gmrp-text">
          <div id="gmrp-label">CHAFF</div>
          <div id="gmrp-sublabel">RADAR-GUIDED INBOUND</div>
        </div>
      </div>
      <div id="gmrp-status" class="no-callsign">DETECTING CALLSIGN…</div>
    `;
    document.body.appendChild(panel);
  }

  function updateStatusPip() {
    const el = document.getElementById('gmrp-status');
    if (!el) return;
    if (myCallsign) {
      el.textContent = `GMRP — ${myCallsign.toUpperCase()}`;
      el.classList.remove('no-callsign');
    } else {
      el.textContent = 'DETECTING CALLSIGN…';
      el.classList.add('no-callsign');
    }
  }

  // ─── ALERT ────────────────────────────────────────────────────────────────
  const ALERT_CONFIG = {
    chaff: { icon: '📡', label: 'CHAFF',  sub: 'RADAR-GUIDED INBOUND' },
    flare: { icon: '🔥', label: 'FLARES', sub: 'HEAT-SEEKER INBOUND'  },
    lock:  { icon: '🎯', label: 'LOCK',   sub: 'YOU ARE BEING TRACKED' },
  };

  let dismissTimer = null;

  function triggerAlert(type, chatMsg) {
    const cfg  = ALERT_CONFIG[type];
    const card = document.getElementById('gmrp-card');
    document.getElementById('gmrp-icon').textContent     = cfg.icon;
    document.getElementById('gmrp-label').textContent    = cfg.label;
    document.getElementById('gmrp-sublabel').textContent = cfg.sub;
    card.className = type;
    requestAnimationFrame(() => card.classList.add('visible'));
    playAlert(type);
    addToast(type, chatMsg);
    if (dismissTimer) clearTimeout(dismissTimer);
    dismissTimer = setTimeout(() => card.classList.remove('visible'), 6000);
  }

  function addToast(type, msg) {
    const toasts = document.getElementById('gmrp-toasts');
    const el = document.createElement('div');
    el.className = `gmrp-toast ${type}`;
    el.textContent = msg.length > 55 ? msg.slice(0, 52) + '…' : msg;
    toasts.appendChild(el);
    setTimeout(() => el.remove(), 5200);
  }

  // ─── CHAT WATCHER ─────────────────────────────────────────────────────────
  const seenMessages = new Set();

  function processMessage(text) {
    if (!text || text.trim().length < 3) return;
    let content = text.trim();
    const colonIdx = content.indexOf(':');
    if (colonIdx > 0 && colonIdx < 32) content = content.slice(colonIdx + 1).trim();
    if (!content) return;
    const key = content.toLowerCase();
    if (seenMessages.has(key)) return;
    seenMessages.add(key);
    if (seenMessages.size > 500) seenMessages.delete(seenMessages.values().next().value);
    const missileType = detectMissileType(content);
    if (!missileType) return;
    if (!isTargetingMe(content)) {
      console.log(`[GMRP] Ignoring (not targeting me): "${content}"`);
      return;
    }
    triggerAlert(missileType, text.trim());
  }

  function watchChat() {
    const SELECTORS = [
      '.geofs-chat-messages', '.geofs-list.geofs-chat-messages',
      '[class*="chat"]', '#geofs-chat',
    ];
    let chatContainer = null;
    for (const sel of SELECTORS) {
      chatContainer = document.querySelector(sel);
      if (chatContainer) break;
    }
    if (!chatContainer) { setTimeout(watchChat, 2000); return; }
    console.log('[GMRP] Chat container found:', chatContainer);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations)
        for (const node of mutation.addedNodes)
          if (node.nodeType === 1) processMessage(node.textContent || '');
    });
    observer.observe(chatContainer, { childList: true, subtree: true });
  }

  // ─── INIT ─────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    buildPanel();
    watchChat();
    pollForCallsign();
    new MutationObserver(() => { if (!myCallsign) tryReadCallsign(); })
      .observe(document.body, { childList: true, subtree: true });
    console.log('[GMRP Countermeasure Advisor v1.3] Loaded.');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();

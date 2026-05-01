(function () {
'use strict';

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const API_KEY = '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';
const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL   = 'meta-llama/llama-4-scout-17b-16e-instruct';

let currentChatId   = null;
let chatSessions    = {};
let currentMessages = [];
let isGenerating    = false;
let pendingImages   = [];
let isSpeaking      = false;
let saveTimer       = null;

const el = (id) => document.getElementById(id);
const DOM = {
  sidebar:          el('tutorSidebar'),
  sidebarCollapse:  el('sidebarCollapse'),
  sidebarOpen:      el('sidebarOpen'),
  newChatBtn:       el('newChatBtn'),
  historyList:      el('chatHistoryList'),
  clearHistoryBtn:  el('clearHistoryBtn'),
  chatTitle:        el('chatTitle'),
  messages:         el('chatMessages'),
  welcomeState:     el('welcomeState'),
  typingIndicator:  el('typingIndicator'),
  chatInput:        el('chatInput'),
  sendBtn:          el('sendBtn'),
  imageInput:       el('imageInput'),
  imageAttachBtn:   el('imageAttachBtn'),
  imagePreviewRow:  el('imagePreviewRow'),
  imagePreviewList: el('imagePreviewList'),
  charCount:        el('charCount'),
  welcomeCards:     document.querySelectorAll('.welcome-card'),
};

const SYSTEM_PROMPT = `You are Curiosity, the AI Tutor of CoreDeck — a witty, warm, and slightly humorous study companion for Class 11 students in Nepal and India (NEB/CBSE syllabus).
Your personality:
Your name is Curiosity. Introduce yourself ONLY when:
It's the very first message / greeting (like "hi", "hello", "hey")
Someone directly asks your name or who you are
Someone asks "how are you" — respond naturally and warmly
In all other cases, just answer naturally like a helpful friend. Do NOT keep repeating your name.
You are helpful, encouraging, and genuinely excited about learning.
You have a light sense of humor — crack a small joke or fun remark occasionally, but never at the cost of clarity.
You feel like a smart friend who happens to know everything about Physics, Chemistry, Math, and Biology — not a robot reciting facts.
Celebrate efforts with lines like "Great question!", "You're thinking like a scientist!", "Let's crack this together!" — but don't overdo it.
Your rules:
Give clear, step-by-step explanations.
Use bullet points and simple language.
For formulas always write: "Formula: [formula]"
If the user sends an image, analyze it carefully and explain it with enthusiasm.
Keep answers concise but complete.
If someone asks who made you or what you are, say: "I'm Curiosity — CoreDeck's AI Tutor, built to make studying less boring and more exciting!"
Never say you are made by Meta, Groq, or any company. You are Curiosity from CoreDeck.
Never start every message with your name. Talk like a natural, smart friend.`;

/* ─────────────────────────────────────────────
   INIT
   ───────────────────────────────────────────── */
function init() {
  try {
    chatSessions = JSON.parse(localStorage.getItem('cd_chats') || '{}');
  } catch (e) {
    chatSessions = {};
  }
  updateHistoryUI();
  startNewChat();
  setupResponsiveSidebar();
}

/* ─────────────────────────────────────────────
   CHAT MANAGEMENT
   ───────────────────────────────────────────── */
function startNewChat() {
  currentChatId   = 'chat_' + Date.now();
  currentMessages = [];
  DOM.chatTitle.textContent         = 'AI Tutor';
  DOM.messages.innerHTML            = '';
  DOM.messages.appendChild(DOM.welcomeState);
  DOM.messages.appendChild(DOM.typingIndicator);
  DOM.welcomeState.style.display    = '';
  DOM.typingIndicator.style.display = 'none';
  clearImages();
  updateHistoryUI();
}

function saveCurrentChat() {
  if (!currentMessages.length || !currentChatId) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const first = currentMessages.find(m => m.role === 'user');
    const title = first ? first.content.slice(0, 45) || 'Image message' : 'New Chat';
    
    chatSessions[currentChatId] = {
      id:        currentChatId,
      title,
      messages:  currentMessages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp, images: m.images || [] })),
      timestamp: Date.now()
    };

    try {
      localStorage.setItem('cd_chats', JSON.stringify(chatSessions));
    } catch (e) {
      const old = Object.values(chatSessions).sort((a, b) => a.timestamp - b.timestamp);
      if (old.length > 1) {
        delete chatSessions[old[0].id];
        try { localStorage.setItem('cd_chats', JSON.stringify(chatSessions)); } catch(_) {}
      }
    }
    updateHistoryUI();
  }, 400);
}

function loadChat(id) {
  const s = chatSessions[id];
  if (!s) return;
  currentChatId   = id;
  currentMessages = s.messages || [];
  DOM.chatTitle.textContent         = s.title || 'AI Tutor';
  DOM.messages.innerHTML            = '';
  DOM.messages.appendChild(DOM.typingIndicator);
  DOM.typingIndicator.style.display = 'none';
  DOM.welcomeState.style.display = 'none';
  currentMessages.forEach(m => renderMessage(m.role, m.content, m.images || [], m.timestamp, false));
  scrollToBottom();
  updateHistoryUI();
}

function updateHistoryUI() {
  const list = Object.values(chatSessions).sort((a, b) => b.timestamp - a.timestamp).slice(0, 25);
  if (!list.length) {
    DOM.historyList.innerHTML = '<p style="padding:.6rem 1rem;font-size:.75rem;color:var(--clr-text-secondary);opacity:.6">No chats yet</p>';
    return;
  }
  DOM.historyList.innerHTML = list.map(s => `
    <div class="history-item${s.id === currentChatId ? ' active' : ''}" data-id="${s.id}">
      <span class="history-item-text">${escHTML(s.title)}</span>
      <button class="history-item-del" data-del="${s.id}" title="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  `).join('');

  DOM.historyList.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.history-item-del')) return;
      loadChat(item.dataset.id);
      if (window.innerWidth < 900) collapseSidebar();
    });
  });

  DOM.historyList.querySelectorAll('.history-item-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      delete chatSessions[btn.dataset.del];
      try { localStorage.setItem('cd_chats', JSON.stringify(chatSessions)); } catch(_) {}
      if (currentChatId === btn.dataset.del) startNewChat();
      updateHistoryUI();
    });
  });
}

DOM.clearHistoryBtn?.addEventListener('click', () => {
  if (!confirm('Delete all chats?')) return;
  chatSessions = {};
  try { localStorage.removeItem('cd_chats'); } catch(_) {}
  startNewChat();
  showToast('All chats cleared', 'success');
});

/* ─────────────────────────────────────────────
   SEND MESSAGE
   ───────────────────────────────────────────── */
async function sendMessage() {
  if (isGenerating) return;
  const text   = DOM.chatInput.value.trim();
  const images = [...pendingImages];
  if (!text && !images.length) return;

  isGenerating = true;
  DOM.welcomeState.style.display = 'none';

  const userMsg = { role: 'user', content: text, images: images.map(i => ({ base64: i.base64, mimeType: i.mimeType })), timestamp: Date.now() };
  currentMessages.push(userMsg);
  renderMessage('user', text, userMsg.images, userMsg.timestamp, true);

  DOM.chatInput.value = ''; DOM.chatInput.style.height = 'auto';
  updateCharCount(); clearImages(); updateSendBtn();
  DOM.typingIndicator.style.display = 'flex';
  scrollToBottom();

  try {
    const reply = await callGroq();
    DOM.typingIndicator.style.display = 'none';
    const aiMsg = { role: 'ai', content: reply, timestamp: Date.now() };
    currentMessages.push(aiMsg);
    renderMessage('ai', reply, [], aiMsg.timestamp, true);
    saveCurrentChat();
  } catch (err) {
    DOM.typingIndicator.style.display = 'none';
    renderMessage('ai', `⚠️ ${escHTML(err.message)}`, [], Date.now(), true);
  }
  isGenerating = false;
  updateSendBtn(); scrollToBottom();
}

async function callGroq() {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...currentMessages.slice(-12).map(m => {
    if (m.role === 'user' && m.images?.length) {
      const contentParts = [];
      if (m.content?.trim()) contentParts.push({ type: 'text', text: m.content });
      m.images.forEach(img => contentParts.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } }));
      return { role: 'user', content: contentParts };
    }
    return { role: m.role === 'ai' ? 'assistant' : 'user', content: m.content || '' };
  })];

  const resp = await fetch(API_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 1500, temperature: 0.7, stream: false })
  });

  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    const msg = e?.error?.message || `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response.');
  return text;
}

/* ─────────────────────────────────────────────
   RENDER MESSAGE
   ───────────────────────────────────────────── */
function renderMessage(role, content, images, timestamp, animate) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;
  const time = timestamp ? new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
  
  const avatar = role === 'user' 
    ? `<div class="msg-avatar user">U</div>` 
    : `<div class="msg-avatar ai"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9 10c0-2 1.5-3 3-3s3 1 3 3 c0 1.5-.8 2.5-2 3v1"/><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none"/></svg></div>`;

  let imgs = '';
  if (images?.length) imgs = `<div class="user-images">${images.map(i => `<img class="user-img-thumb" src="data:${i.mimeType};base64,${i.base64}" alt="attached">`).join('')}</div>`;
  
  const body = role === 'ai' ? formatMarkdown(content) : `<p style="margin:0">${escHTML(content).replace(/\n/g, '<br>')}</p>`;
  
  const cpIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const spkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
  const vidIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="3"/><polygon points="10 8 16 12 10 16"/></svg>`;
  
  const aiActions = `<div class="msg-actions">
    <button class="msg-action-btn copy-btn">${cpIcon} Copy</button>
    <button class="msg-action-btn speak-btn">${spkIcon} Speak</button>
    <button class="msg-action-btn videos-btn">${vidIcon} Videos</button>
  </div>`;
  const userActions = `<div class="msg-actions"><button class="msg-action-btn copy-btn">${cpIcon} Copy</button></div>`;

  row.innerHTML = `${avatar}<div class="msg-bubble">${imgs}<div class="msg-content">${body}</div>${role === 'ai' ? aiActions : userActions}<div class="msg-time">${time}</div></div>`;

  row.querySelector('.copy-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(content).then(() => {
      const b = row.querySelector('.copy-btn');
      b.innerHTML = `✓ Copied`;
      setTimeout(() => { b.innerHTML = `${cpIcon} Copy`; }, 2000);
    });
  });
  row.querySelector('.speak-btn')?.addEventListener('click', function() { speakEnglish(content, this); });
  row.querySelector('.videos-btn')?.addEventListener('click', () => {
    const last = currentMessages.filter(m => m.role === 'user').slice(-1)[0];
    const q = (last?.content || content).slice(0, 60).replace(/[#_`]/g, '').trim();
    window.open(`videos.html?q=${encodeURIComponent(q)}`, '_blank');
  });

  DOM.messages.insertBefore(row, DOM.typingIndicator);
  if (animate) scrollToBottom();
}

/* ─────────────────────────────────────────────
   SPEAK
   ───────────────────────────────────────────── */
function cleanForSpeech(text) {
  return text.replace(/#{1,6}\s+/g,'').replace(/\*{1,3}([^*]+)\*{1,3}/g,'$1').replace(/_{1,2}([^_]+)_{1,2}/g,'$1').replace(/`[^`]+`/g,'').replace(/^[\s][•-*]\s+/gm,'').replace(/^\d+.\s+/gm,'').replace(/\n{2,}/g,'. ').replace(/\n/g,', ').replace(/:\s*/g,'. ').replace(/\.{2,}/g,'.').replace(/\s{2,}/g,' ').trim().slice(0,3000);
}

function speakEnglish(text, btnEl) {
  const s = window.speechSynthesis;
  if (!s) return showToast('Voice not supported', 'error');
  if (isSpeaking) {
    s.cancel(); isSpeaking = false;
    btnEl.classList.remove('speaking');
    btnEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Speak`;
    return;
  }
  const clean = cleanForSpeech(text);
  if (!clean) return showToast('Nothing to read', 'error');
  
  const trySpeak = () => {
    const voices = s.getVoices();
    const u = new SpeechSynthesisUtterance(clean);
    const best = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en'));
    if (best) u.voice = best;
    u.lang = 'en-US'; u.rate = 0.88; u.pitch = 1.0;

    u.onstart = () => { isSpeaking = true; btnEl.classList.add('speaking'); btnEl.innerHTML = `⏸ Stop`; };
    u.onend = u.onerror = () => { isSpeaking = false; btnEl.classList.remove('speaking'); btnEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Speak`; };
    s.speak(u);
  };
  if (s.getVoices().length === 0) s.onvoiceschanged = () => setTimeout(trySpeak, 100);
  else setTimeout(trySpeak, 100);
}
if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();

/* ─────────────────────────────────────────────
   IMAGE HANDLING
   ───────────────────────────────────────────── */
DOM.imageAttachBtn?.addEventListener('click', () => DOM.imageInput.click());
DOM.imageInput?.addEventListener('change', async e => {
  for (const f of Array.from(e.target.files).slice(0, 4)) {
    if (!f.type.startsWith('image/')) continue;
    if (f.size > 5 * 1024 * 1024) { showToast('Max 5MB per image', 'error'); continue; }
    const b64 = await fileToBase64(f);
    pendingImages.push({ base64: b64, mimeType: f.type });
  }
  renderImagePreviews(); e.target.value = ''; updateSendBtn();
});

function fileToBase64(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(f); }); }

function renderImagePreviews() {
  if (!pendingImages.length) { DOM.imagePreviewRow.style.display = 'none'; return; }
  DOM.imagePreviewRow.style.display = 'block';
  DOM.imagePreviewList.innerHTML = pendingImages.map((img, i) => `<div class="preview-item"><img class="preview-img" src="data:${img.mimeType};base64,${img.base64}"><button class="preview-remove" data-idx="${i}">✕</button></div>`).join('');
  DOM.imagePreviewList.querySelectorAll('.preview-remove').forEach(b => {
    b.addEventListener('click', () => { pendingImages.splice(+b.dataset.idx, 1); renderImagePreviews(); updateSendBtn(); });
  });
}

function clearImages() { pendingImages = []; DOM.imagePreviewRow.style.display = 'none'; DOM.imagePreviewList.innerHTML = ''; }
function updateSendBtn() { DOM.sendBtn.disabled = (!DOM.chatInput.value.trim() && !pendingImages.length) || isGenerating; }
function updateCharCount() {
  const len = DOM.chatInput.value.length;
  DOM.charCount.textContent = `${len}/4000`;
  DOM.charCount.classList.toggle('warn', len > 3500);
}

/* ─────────────────────────────────────────────
   INPUT EVENTS
   ───────────────────────────────────────────── */
DOM.chatInput.addEventListener('input', () => {
  DOM.chatInput.style.height = 'auto';
  DOM.chatInput.style.height = Math.min(DOM.chatInput.scrollHeight, 140) + 'px';
  updateCharCount(); updateSendBtn();
});
DOM.chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!DOM.sendBtn.disabled) sendMessage(); } });
DOM.sendBtn.addEventListener('click', sendMessage);

DOM.welcomeCards.forEach(card => {
  const go = () => {
    if (isGenerating) return;
    DOM.chatInput.value = card.dataset.prompt;
    DOM.chatInput.style.height = 'auto';
    DOM.chatInput.style.height = Math.min(DOM.chatInput.scrollHeight, 140) + 'px';
    updateCharCount(); updateSendBtn(); sendMessage();
  };
  card.addEventListener('click', go);
  card.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
});

/* ─────────────────────────────────────────────
   SIDEBAR
   ───────────────────────────────────────────── */
function setupResponsiveSidebar() {
  if (window.innerWidth < 900) collapseSidebar();
}
const collapseSidebar = () => DOM.sidebar.classList.add('collapsed');
const expandSidebar = () => DOM.sidebar.classList.remove('collapsed');
DOM.sidebarCollapse?.addEventListener('click', collapseSidebar);
DOM.sidebarOpen?.addEventListener('click', () => expandSidebar());
DOM.newChatBtn?.addEventListener('click', () => { startNewChat(); if (window.innerWidth < 900) collapseSidebar(); });

document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === '/') { e.preventDefault(); DOM.chatInput.focus(); }
  if (e.key === 'n' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); startNewChat(); }
});

window.addEventListener('resize', () => {
  if (window.innerWidth < 900) DOM.sidebar.classList.add('collapsed');
  else DOM.sidebar.classList.remove('collapsed');
});

/* ─────────────────────────────────────────────
   UTILS
   ───────────────────────────────────────────── */
function scrollToBottom() { setTimeout(() => { DOM.messages.scrollTop = DOM.messages.scrollHeight; }, 60); }

function formatMarkdown(text) {
  if (!text) return '';
  const cb = [], ic = [];
  let h = text.replace(/```([\s\S]*?)```/g, (_, c) => { cb.push(`<pre><code>${escHTML(c)}</code></pre>`); return `%%CB${cb.length-1}%%`; });
  h = h.replace(/`([^`]+)`/g, (_, c) => { ic.push(`<code>${escHTML(c)}</code>`); return `%%IC${ic.length-1}%%`; });
  h = escHTML(h);
  h = h.replace(/%%IC(\d+)%%/g, (_, i) => ic[+i]);
  h = h.replace(/%%CB(\d+)%%/g, (_, i) => cb[+i]);
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  h = h.replace(/^---+$/gm, '<hr>');
  h = h.replace(/Formula: (.+)/g, '<div class="formula-block">📐 <strong>Formula:</strong> $1</div>');
  h = h.replace(/((?:^[-*•] .+$\n?)+)/gm, b => `<ul>${b.trim().split('\n').map(l => `<li>${l.replace(/^[-*•] /, '')}</li>`).join('')}</ul>`);
  h = h.replace(/((?:^\d+\. .+$\n?)+)/gm, b => `<ol>${b.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('')}</ol>`);
  
  const lines = h.split('\n'), out = [], inP = false;
  for (const line of lines) {
    const t = line.trim(), bl = /^<(h[1-3]|ul|ol|pre|div|hr|li)/.test(t);
    if (!t) { if (inP) { out.push('</p>'); inP = false; } }
    else if (bl) { if (inP) { out.push('</p>'); inP = false; } out.push(t); }
    else { if (!inP) { out.push('<p>'); inP = true; } out.push(t + ' '); }
  }
  if (inP) out.push('</p>');
  return out.join('');
}

function showToast(msg, type='') {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateY(10px)'; setTimeout(()=>t.remove(), 300); }, 3000);
}

function escHTML(s) {
  if(!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

/* ─────────────────────────────────────────────
   CONSTELLATION BACKGROUND
   ───────────────────────────────────────────── */
(function initStarfield() {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let stars = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    stars = [];
    const count = Math.floor((canvas.width * canvas.height) / 7500);
    for(let i=0; i<count; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.1 + 0.2,
        a: Math.random() * 0.4 + 0.1,
        dx: (Math.random() - 0.5) * 0.12,
        dy: (Math.random() - 0.5) * 0.12
      });
    }
  }

  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const accent = 'rgba(141, 170, 145, ';
    
    stars.forEach((s, i) => {
      s.x += s.dx; s.y += s.dy;
      if(s.x < 0) s.x = canvas.width; if(s.x > canvas.width) s.x = 0;
      if(s.y < 0) s.y = canvas.height; if(s.y > canvas.height) s.y = 0;
      
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.fillStyle = accent + s.a + ')';
      ctx.fill();
      
      for(let j=i+1; j<stars.length; j++) {
        const s2 = stars[j];
        const dist = Math.hypot(s.x-s2.x, s.y-s2.y);
        if(dist < 110) {
          ctx.beginPath();
          ctx.strokeStyle = accent + ((1 - dist/110) * 0.12) + ')';
          ctx.lineWidth = 0.5;
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s2.x, s2.y);
          ctx.stroke();
        }
      }
    });
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  draw();
})();

/* ─────────────────────────────────────────────
   START
   ───────────────────────────────────────────── */
init();
})();
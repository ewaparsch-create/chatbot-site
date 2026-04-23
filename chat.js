// ============================================
// CHAT v2.0 (White-Label Edition)
// ⚠️ NUR CONFIG ÄNDERN
// ============================================

// === CONFIG: Nur oberste 3 Werte anpassen  ===
let CONFIG = {
  WORKER_URL: "https:/nina-disk.ewa-parsch.workers.dev"  
  BOT_NAME: "Nina",  
  BOT_ROLE: "Assistant",
  COLORS: {
    background: "#FAF8F2",
    card: "#ffffff",
    border: "#e6e1d8",
    text: "#111",
    linkColor: "#1b79ff"
  },
  TEXTS: {
    placeholder: "Schreib etwas…",
    sendButton: "Senden",
    statusReady: "Bereit.",
    statusSending: "Sende…"
  }
};

// === Parse CONFIG from URL hash (passed by parent) ===
(function(){
  try {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const configStr = params.get('config');
    if(configStr){
      const parentConfig = JSON.parse(decodeURIComponent(configStr));
      CONFIG = Object.assign({}, CONFIG, parentConfig);
    }
  } catch(e){
    console.warn('Could not parse parent config:', e);
  }
})();

// === Apply CONFIG to DOM ===
(function(){
  // Title
  const pageTitle = document.getElementById('page-title');
  const chatTitle = document.getElementById('chat-title');
  if(pageTitle) pageTitle.textContent = CONFIG.PANEL_TITLE || CONFIG.BOT_NAME || 'Chat';
  if(chatTitle) chatTitle.textContent = CONFIG.PANEL_TITLE || CONFIG.BOT_NAME || 'Chat';

  // Placeholder & Button
  const msgEl = document.getElementById('msg');
  const sendEl = document.getElementById('send');
  if(msgEl && CONFIG.TEXTS && CONFIG.TEXTS.placeholder) msgEl.placeholder = CONFIG.TEXTS.placeholder;
  if(sendEl && CONFIG.TEXTS && CONFIG.TEXTS.sendButton) sendEl.textContent = CONFIG.TEXTS.sendButton;

  // CSS Variables
  const root = document.documentElement;
  if(CONFIG.COLORS){
    if(CONFIG.COLORS.background) root.style.setProperty('--chat-bg', CONFIG.COLORS.background);
    if(CONFIG.COLORS.card) root.style.setProperty('--chat-card', CONFIG.COLORS.card);
    if(CONFIG.COLORS.border) root.style.setProperty('--chat-border', CONFIG.COLORS.border);
    if(CONFIG.COLORS.text) root.style.setProperty('--chat-text', CONFIG.COLORS.text);
  }
})();

// === CHAT LOGIC ===
const log = document.getElementById("log");
const msg = document.getElementById("msg");
const send = document.getElementById("send");
const statusEl = document.getElementById("status");

const THREAD_KEY = "chat_thread_id";
const GREETED_KEY = "chat_greeted";

function getThreadId() { 
  try {
    return localStorage.getItem(THREAD_KEY) || "";
  } catch (e) {
    console.warn("localStorage nicht verfügbar:", e);
    return "";
  }
}

function setThreadId(id) { 
  try {
    if (id) localStorage.setItem(THREAD_KEY, id);
  } catch (e) {
    console.warn("localStorage nicht verfügbar:", e);
  }
}

function hasGreeted() { 
  try {
    return localStorage.getItem(GREETED_KEY) === "true";
  } catch (e) {
    return false;
  }
}

function setGreeted() { 
  try {
    localStorage.setItem(GREETED_KEY, "true");
  } catch (e) {
    console.warn("localStorage nicht verfügbar:", e);
  }
}

function escapeHtml(s) {
  return (s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    "\"": "&quot;", "'": "&#39;"
  }[c]));
}

function linkifyText(text) {
  let safe = escapeHtml(text);
  const linkColor = (CONFIG.COLORS && CONFIG.COLORS.linkColor) || "#1b79ff";

  // Markdown-Links: [Text](URL) → <a href="URL">Text</a>
  safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, linkText, url) {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: ${linkColor}; text-decoration: underline;">${linkText}</a>`;
  });

  // Nackte URLs (http/https) → <a href="URL">URL</a>
  safe = safe.replace(/(^|[^">])(https?:\/\/[^\s<]+)/g, function(match, prefix, url) {
    const cleanUrl = url.replace(/[.,;:!?]$/, '');
    return `${prefix}<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" style="color: ${linkColor}; text-decoration: underline;">${cleanUrl}</a>`;
  });

  // Zeilenumbrüche → <br>
  safe = safe.replace(/\n/g, '<br>');

  return safe;
}

function addLine(who, text) {
  const div = document.createElement("div");
  div.className = "row";
  const label = who === "me" ? "Du" : (CONFIG.BOT_NAME || "Bot");

  div.innerHTML = `<span class="${who}">${label}:</span> ${linkifyText(text)}`;

  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function setBusy(isBusy) {
  msg.disabled = isBusy;
  send.disabled = isBusy;
  const statusText = isBusy 
    ? (CONFIG.TEXTS && CONFIG.TEXTS.statusSending) || "Sende…"
    : (CONFIG.TEXTS && CONFIG.TEXTS.statusReady) || "Bereit.";
  statusEl.textContent = statusText;
}

function autoResizeTextarea() {
  msg.style.height = "auto";
  msg.style.height = Math.min(msg.scrollHeight, 140) + "px";
}

async function callChat(text) {
  const body = { message: text };
  const threadId = getThreadId();
  if (threadId) body.thread_id = threadId;

  const workerUrl = CONFIG.WORKER_URL || "https://your-worker.workers.dev";

  const res = await fetch(`${workerUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`Worker ${res.status}: ${raw}`);

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Worker antwortete nicht mit JSON: " + raw);
  }

  if (data.thread_id) setThreadId(data.thread_id);
  return data;
}

async function onSend() {
  const text = msg.value.trim();
  if (!text) return;

  addLine("me", text);
  msg.value = "";
  autoResizeTextarea();
  setBusy(true);

  try {
    const data = await callChat(text);
    addLine("bot", data.reply ?? "(keine reply im JSON)");
  } catch (e) {
    addLine("bot", "Fehler: " + (e?.message || e));
    console.error(e);
    statusEl.textContent = "Fehler – siehe Konsole/Chat.";
  } finally {
    setBusy(false);
    msg.focus();
  }
}

async function autoGreet() {
  if (!getThreadId() && !hasGreeted()) {
    setBusy(true);
    try {
      const data = await callChat("Hallo");
      addLine("bot", data.reply ?? "(keine reply im JSON)");
      setGreeted();
    } catch (e) {
      addLine("bot", "Fehler beim Laden: " + (e?.message || e));
      console.error(e);
    } finally {
      setBusy(false);
    }
  }
}

send.addEventListener("click", onSend);

msg.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    onSend();
  }
});

msg.addEventListener("input", autoResizeTextarea);

// Initial
setBusy(false);
autoResizeTextarea();
msg.focus();

// Automatische Begrüßung starten
setTimeout(autoGreet, 500);

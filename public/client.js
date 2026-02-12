// public/client.js
// Enhanced UX + Typing Indicator + Splash hide
const socket = io();

const loginBox = document.querySelector(".login-box");
const chatBox = document.querySelector(".chat-box");
const joinBtn = document.getElementById("joinBtn");
const sendBtn = document.getElementById("sendBtn");
const chatWindow = document.getElementById("chatWindow");

const nameInput = document.getElementById("username");
const receiverInput = document.getElementById("receiver");
const messageInput = document.getElementById("message");

// Splash elements (NEW)
const splash = document.getElementById("splash");

// Typing indicator elements
const typingEl = document.getElementById("typingIndicator");
const typingTextEl = document.getElementById("typingText");

let username = localStorage.getItem("ansh_name") || "";
let typingTimeout = null;
const TYPING_DELAY = 1200; // ms to consider "stopped typing"

// ===== Splash handling (NEW) =====
function hideSplash() {
  if (!splash || splash.dataset.hidden === "1") return;
  // graceful fade-out; CSS animation already runs, this is JS fallback/skip
  splash.style.transition = "opacity .4s ease";
  splash.style.opacity = "0";
  setTimeout(() => {
    splash.style.display = "none";
    splash.setAttribute("data-hidden", "1");
    // Focus the name field right after splash
    nameInput?.focus();
  }, 420);
}

window.addEventListener("load", () => {
  if (!splash) return;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Match total splash duration (~2.2s) unless reduced-motion
  setTimeout(hideSplash, prefersReducedMotion ? 300 : 2200);
  // Let user click/tap to skip the splash immediately
  splash.addEventListener("click", hideSplash);
});

// ===== Init states =====
if (username) nameInput.value = username;
toggleJoin();
toggleSend();

// ===== Join Chat =====
joinBtn.onclick = handleJoin;

// Enter to join
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleJoin();
});
nameInput.addEventListener("input", toggleJoin);

function handleJoin() {
  username = (nameInput.value || "").trim();
  if (username.length < 2) return;

  socket.emit("register", username);
  localStorage.setItem("ansh_name", username);

  loginBox.classList.add("hidden");
  chatBox.classList.remove("hidden");

  addMessage(`✅ Logged in as ${username}`, { meta: true });
  receiverInput?.focus();

  // Confetti burst for delight
  confettiBurst(120);
}

function toggleJoin() {
  const ok = (nameInput.value || "").trim().length >= 2;
  joinBtn.disabled = !ok;
}

// ===== Send message (button or Enter) =====
sendBtn.onclick = sendMessage;
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});
messageInput.addEventListener("input", () => {
  toggleSend();
  emitTyping();
});

function toggleSend() {
  sendBtn.disabled = (messageInput.value || "").trim().length === 0;
}

// ===== Send message function =====
function sendMessage() {
  const receiver = (receiverInput.value || "").trim();
  const message = (messageInput.value || "").trim();

  if (!receiver || !message) return;

  socket.emit("privateMessage", { sender: username, receiver, message });
  addMessage(`You → ${receiver}: ${message}`, { you: true });

  // Stop typing indicator on send
  socket.emit("stopTyping", { sender: username, receiver });

  messageInput.value = "";
  toggleSend();
  messageInput.focus();
}

// ===== Receive incoming message =====
socket.on("privateMessage", ({ sender, message }) => {
  addMessage(`${sender}: ${message}`);
  hideTyping(); // hide indicator when message arrives
});

// ===== (Optional) message history if server supports it =====
receiverInput?.addEventListener("change", () => {
  const receiver = (receiverInput.value || "").trim();
  if (receiver) socket.emit("getMessages", { sender: username, receiver });
});

socket.on("messageHistory", (history = []) => {
  chatWindow.innerHTML = "";
  history.forEach((msg) => {
    const fromYou = msg.sender === username;
    const text = fromYou
      ? `You → ${msg.receiver}: ${msg.message}`
      : `${msg.sender} → ${msg.receiver}: ${msg.message}`;
    addMessage(text, { you: fromYou });
  });
});

// ===== Typing indicator: emit while typing, stop after idle =====
function emitTyping() {
  const receiver = (receiverInput.value || "").trim();
  if (!username || !receiver) return;

  socket.emit("typing", { sender: username, receiver });

  // debounce stopTyping after inactivity
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit("stopTyping", { sender: username, receiver });
  }, TYPING_DELAY);
}

// ===== Listen for typing from others =====
socket.on("typing", ({ sender }) => {
  if (!sender || sender === username) return; // ignore self
  showTyping(sender);
});

socket.on("stopTyping", ({ sender }) => {
  if (!sender || sender === username) return; // ignore self
  hideTyping();
});

// ===== Display message in chat window (safe, styled) =====
function addMessage(text, opts = {}) {
  const div = document.createElement("div");
  div.classList.add("message");
  if (opts.meta) div.classList.add("meta");
  if (opts.you) div.classList.add("you");
  div.textContent = text; // safer than innerHTML
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// ===== Typing UI helpers =====
function showTyping(senderName) {
  if (!typingEl || !typingTextEl) return;
  typingTextEl.innerHTML = `<strong>${escapeHtml(senderName)}</strong> is typing`;
  typingEl.classList.remove("hidden");
  // keep indicator visible near the bottom
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function hideTyping() {
  if (!typingEl) return;
  typingEl.classList.add("hidden");
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (s) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[s]));
}

// ===== Confetti (CSS-powered, no library) =====
function confettiBurst(count = 100) {
  const colors = [
    "#22d3ee", "#67e8f9", "#a5f3fc", "#cffafe",
    "#06b6d4", "#0891b2", "#e0f2fe", "#ffffff"
  ];
  const durationMin = 900;
  const durationMax = 1800;

  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "confetti";
    const size = 6 + Math.random() * 6;
    const left = Math.random() * 100; // vw
    const rot = (Math.random() * 360) | 0;
    const dur = (durationMin + Math.random() * (durationMax - durationMin)) | 0;
    const delay = (Math.random() * 120) | 0;

    s.style.left = `${left}vw`;
    s.style.width = `${size}px`;
    s.style.height = `${size * 1.6}px`;
    s.style.background = colors[(Math.random() * colors.length) | 0];
    s.style.setProperty("--rot", rot + "deg");
    s.style.animationDuration = `${dur}ms, ${Math.max(700, dur - 400)}ms`;
    s.style.animationDelay = `${delay}ms, ${delay}ms`;
    s.style.transform = `translateY(-10px) rotate(${rot}deg)`;

    document.body.appendChild(s);
    setTimeout(() => s.remove(), dur + delay + 150);
  }
}
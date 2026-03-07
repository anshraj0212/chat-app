// client.js (Enhanced UX + Typing Indicator + WhatsApp-style Timestamp + Splash hide)
const socket = io();

const loginBox = document.querySelector(".login-box");
const chatBox = document.querySelector(".chat-box");
const joinBtn = document.getElementById("joinBtn");
const sendBtn = document.getElementById("sendBtn");
const chatWindow = document.getElementById("chatWindow");

const nameInput = document.getElementById("username");
const receiverInput = document.getElementById("receiver");
const messageInput = document.getElementById("message");

const typingEl = document.getElementById("typingIndicator");
const typingTextEl = document.getElementById("typingText");

const splash = document.getElementById("splash");

let username = localStorage.getItem("ansh_name") || "";
let typingTimeout = null;
const TYPING_DELAY = 1200;

// ===== Splash =====
function hideSplash() {
  if (!splash) return;
  splash.style.opacity = "0";
  setTimeout(() => {
    splash.style.display = "none";
    nameInput?.focus();
  }, 400);
}

window.addEventListener("load", () => {
  setTimeout(hideSplash, 2200);
  splash.addEventListener("click", hideSplash);
});

// Initial Form states
if (username) nameInput.value = username;
toggleJoin();
toggleSend();

// Join Chat
joinBtn.onclick = handleJoin;

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

  addMessage(`Logged in as ${username}`, { meta: true });
  receiverInput.focus();

  confettiBurst(120);
}

function toggleJoin() {
  joinBtn.disabled = (nameInput.value || "").trim().length < 2;
}

// Send message
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

function sendMessage() {
  const receiver = receiverInput.value.trim();
  const message = messageInput.value.trim();

  if (!receiver || !message) return;

  socket.emit("privateMessage", {
    sender: username,
    receiver,
    message,
  });

  addMessage(`You: ${message}`, {
    you: true,
    timestamp: Date.now(),
  });

  socket.emit("stopTyping", { sender: username, receiver });

  messageInput.value = "";
  toggleSend();
  messageInput.focus();
}

// Receive message
socket.on("privateMessage", ({ sender, message, timestamp }) => {
  addMessage(`${sender}: ${message}`, { timestamp });
  hideTyping();
});

// Load message history
receiverInput.addEventListener("change", () => {
  const receiver = receiverInput.value.trim();
  if (receiver) socket.emit("getMessages", { sender: username, receiver });
});

socket.on("messageHistory", (history) => {
  chatWindow.innerHTML = "";
  history.forEach((msg) => {
    const isYou = msg.sender === username;
    addMessage(
      isYou
        ? `You: ${msg.message}`
        : `${msg.sender}: ${msg.message}`,
      { you: isYou, timestamp: msg.timestamp }
    );
  });
});

// Typing Indicator
function emitTyping() {
  const receiver = receiverInput.value.trim();
  if (!username || !receiver) return;

  socket.emit("typing", { sender: username, receiver });

  if (typingTimeout) clearTimeout(typingTimeout);

  typingTimeout = setTimeout(() => {
    socket.emit("stopTyping", { sender: username, receiver });
  }, TYPING_DELAY);
}

socket.on("typing", ({ sender }) => {
  if (sender === username) return;
  showTyping(sender);
});

socket.on("stopTyping", ({ sender }) => {
  if (sender === username) return;
  hideTyping();
});

// WhatsApp-style bubble with shiny pink timestamp
function addMessage(text, opts = {}) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("message");
  if (opts.you) wrapper.classList.add("you");

  const ts = opts.timestamp ? formatTime(opts.timestamp) : formatTime(Date.now());

  wrapper.innerHTML = `
    <span class="msg-text">${escapeHtml(text)}</span>
    <span class="msg-time">${ts}</span>
  `;

  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}
// Format timestamp (WhatsApp style)
function formatTime(ts) {
  const d = new Date(ts);
  let hrs = d.getHours();
  let mins = d.getMinutes().toString().padStart(2, "0");
  let ampm = hrs >= 12 ? "pm" : "am";
  hrs = hrs % 12 || 12;
  return `${hrs}:${mins} ${ampm}`;
}

// Escape dangerous characters
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (s) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[s]);
}

// Confetti effect
function confettiBurst(count = 100) {
  const colors = [
    "#22d3ee",
    "#67e8f9",
    "#a5f3fc",
    "#cffafe",
    "#06b6d4",
    "#0891b2",
    "#e0f2fe",
    "#ffffff",
  ];

  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "confetti";
    const size = 6 + Math.random() * 6;
    s.style.width = `${size}px`;
    s.style.height = `${size * 1.6}px`;
    s.style.left = Math.random() * 100 + "vw";
    s.style.background = colors[Math.floor(Math.random() * colors.length)];
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 2000);
  }
}
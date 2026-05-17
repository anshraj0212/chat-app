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
const recordBtn = document.getElementById("recordBtn");

const typingEl = document.getElementById("typingIndicator");
const typingTextEl = document.getElementById("typingText");

const splash = document.getElementById("splash");
const motionLayer = document.getElementById("motionLayer");

let username = localStorage.getItem("ansh_name") || "";
let typingTimeout = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
const TYPING_DELAY = 1200;

// ===== Splash =====
function hideSplash() {
  if (!splash) return;
  splash.style.opacity = "0";
  setTimeout(() => {
    splash.style.display = "none";
    nameInput?.focus();
    confettiBurst(55);
  }, 400);
}

window.addEventListener("load", () => {
  createAmbientMotion();
  setTimeout(hideSplash, 2200);
  splash.addEventListener("click", hideSplash);
});

// Initial Form states
if (username) nameInput.value = username;
toggleJoin();
toggleSend();
toggleRecord();
resizeMessageInput();

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
  if (e.key === "Enter" && (e.ctrlKey || e.shiftKey)) {
    e.preventDefault();
    sendMessage();
  }
});

messageInput.addEventListener("input", () => {
  toggleSend();
  resizeMessageInput();
  emitTyping();
});

function toggleSend() {
  sendBtn.disabled = (messageInput.value || "").trim().length === 0;
}

function toggleRecord() {
  recordBtn.disabled = !receiverInput.value.trim() || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder;
}

function resizeMessageInput() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
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
  resizeMessageInput();
  messageInput.focus();
}

// Receive message
socket.on("privateMessage", ({ sender, message, timestamp, type, audio }) => {
  if (type === "voice") {
    addVoiceMessage(audio, { sender, timestamp });
  } else {
    addMessage(`${sender}: ${message}`, { timestamp });
  }
  hideTyping();
});

// Load message history
receiverInput.addEventListener("change", () => {
  const receiver = receiverInput.value.trim();
  if (receiver) socket.emit("getMessages", { sender: username, receiver });
  toggleRecord();
});

receiverInput.addEventListener("input", toggleRecord);

socket.on("messageHistory", (history) => {
  chatWindow.innerHTML = "";
  history.forEach((msg) => {
    const isYou = msg.sender === username;
    if (msg.type === "voice") {
      addVoiceMessage(msg.audio, {
        you: isYou,
        sender: isYou ? "You" : msg.sender,
        timestamp: msg.timestamp,
      });
    } else {
      addMessage(
        isYou
          ? `You: ${msg.message}`
          : `${msg.sender}: ${msg.message}`,
        { you: isYou, timestamp: msg.timestamp }
      );
    }
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

recordBtn.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

async function startRecording() {
  const receiver = receiverInput.value.trim();
  if (!receiver) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    };
    mediaRecorder.onstop = () => sendVoiceMessage(stream);
    mediaRecorder.start();
    isRecording = true;
    recordBtn.textContent = "Stop";
    recordBtn.classList.add("recording");
    socket.emit("typing", { sender: username, receiver });
  } catch (err) {
    addMessage("System: Microphone permission was blocked.", { meta: true });
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
}

function sendVoiceMessage(stream) {
  stream.getTracks().forEach((track) => track.stop());
  isRecording = false;
  recordBtn.textContent = "Rec";
  recordBtn.classList.remove("recording");

  const receiver = receiverInput.value.trim();
  if (!receiver || recordedChunks.length === 0) return;

  const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
  const reader = new FileReader();

  reader.onloadend = () => {
    const audio = reader.result;
    socket.emit("privateMessage", {
      sender: username,
      receiver,
      type: "voice",
      audio,
      mimeType: blob.type,
    });
    addVoiceMessage(audio, {
      you: true,
      sender: "You",
      timestamp: Date.now(),
    });
    socket.emit("stopTyping", { sender: username, receiver });
  };

  reader.readAsDataURL(blob);
}

function showTyping(sender) {
  typingTextEl.innerHTML = `<strong>${escapeHtml(sender)}</strong> is typing`;
  typingEl.classList.remove("hidden");
}

function hideTyping() {
  typingEl.classList.add("hidden");
}

// WhatsApp-style bubble with shiny pink timestamp
function addMessage(text, opts = {}) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("message");
  if (opts.you) wrapper.classList.add("you");
  if (opts.meta) wrapper.classList.add("meta");

  const ts = opts.timestamp ? formatTime(opts.timestamp) : formatTime(Date.now());

  wrapper.innerHTML = `
    <span class="msg-text">${escapeHtml(text)}</span>
    <span class="msg-time">${ts}</span>
  `;

  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addVoiceMessage(audioSrc, opts = {}) {
  if (!audioSrc || !audioSrc.startsWith("data:audio/")) return;

  const wrapper = document.createElement("div");
  wrapper.classList.add("message", "voice-message");
  if (opts.you) wrapper.classList.add("you");

  const label = document.createElement("span");
  label.className = "msg-text";
  label.textContent = `${opts.sender || "Voice"}: Voice message`;

  const audio = document.createElement("audio");
  audio.controls = true;
  audio.preload = "metadata";
  audio.src = audioSrc;

  const time = document.createElement("span");
  time.className = "msg-time";
  time.textContent = opts.timestamp ? formatTime(opts.timestamp) : formatTime(Date.now());

  wrapper.appendChild(label);
  wrapper.appendChild(audio);
  wrapper.appendChild(time);
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
    "#f0abfc",
    "#c084fc",
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
    s.style.setProperty("--drift", `${-45 + Math.random() * 90}vw`);
    s.style.setProperty("--spin", `${180 + Math.random() * 540}deg`);
    s.style.animationDuration = `${1.8 + Math.random() * 1.3}s`;
    s.style.animationDelay = `${Math.random() * 0.18}s`;
    s.style.background = colors[Math.floor(Math.random() * colors.length)];
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 3400);
  }
}

function createAmbientMotion() {
  if (!motionLayer) return;

  const items = ["Hi", "...", "Yo", "Ping", "Talk", "Now"];
  const total = window.matchMedia("(max-width: 640px)").matches ? 12 : 20;

  for (let i = 0; i < total; i++) {
    const token = document.createElement("span");
    const isBubble = i % 3 !== 0;
    token.className = isBubble ? "float-token token-bubble" : "float-token token-spark";

    if (isBubble) {
      token.textContent = items[i % items.length];
    }

    token.style.left = `${4 + Math.random() * 92}%`;
    token.style.top = `${8 + Math.random() * 84}%`;
    token.style.animationDuration = `${12 + Math.random() * 14}s`;
    token.style.animationDelay = `${Math.random() * -14}s`;
    token.style.setProperty("--x", `${-36 + Math.random() * 72}px`);
    token.style.setProperty("--y", `${-42 + Math.random() * 84}px`);
    token.style.setProperty("--r", `${-10 + Math.random() * 20}deg`);

    motionLayer.appendChild(token);
  }
}

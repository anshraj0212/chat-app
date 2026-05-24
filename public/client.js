const socket = io();

const loginBox = document.querySelector(".login-box");
const chatBox = document.querySelector(".chat-box");
const joinBtn = document.getElementById("joinBtn");
const sendBtn = document.getElementById("sendBtn");
const recordBtn = document.getElementById("recordBtn");
const newChatBtn = document.getElementById("newChatBtn");
const changeUserBtn = document.getElementById("changeUserBtn");

const chatWindow = document.getElementById("chatWindow");
const contactList = document.getElementById("contactList");
const currentUserEl = document.getElementById("currentUser");
const chatTitle = document.getElementById("chatTitle");
const chatSubtitle = document.getElementById("chatSubtitle");

const nameInput = document.getElementById("username");
const messageInput = document.getElementById("message");
const newChatModal = document.getElementById("newChatModal");
const modalReceiverInput = document.getElementById("modalReceiverInput");
const modalError = document.getElementById("modalError");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const modalCancelBtn = document.getElementById("modalCancelBtn");
const modalStartBtn = document.getElementById("modalStartBtn");
const deleteChatModal = document.getElementById("deleteChatModal");
const deleteChatTitle = document.getElementById("deleteChatTitle");
const deleteChatCopy = document.getElementById("deleteChatCopy");
const deleteContactName = document.getElementById("deleteContactName");
const deleteChatTail = document.getElementById("deleteChatTail");
const deleteForeverWarning = document.getElementById("deleteForeverWarning");
const deleteModalCloseBtn = document.getElementById("deleteModalCloseBtn");
const deleteCancelBtn = document.getElementById("deleteCancelBtn");
const deleteConfirmBtn = document.getElementById("deleteConfirmBtn");
const deleteForeverBtn = document.getElementById("deleteForeverBtn");
const typingEl = document.getElementById("typingIndicator");
const typingTextEl = document.getElementById("typingText");

const splash = document.getElementById("splash");
const motionLayer = document.getElementById("motionLayer");

const NAME_KEY = "ansh_name";
const ACTIVE_CONTACT_KEY = "talksy_active_contact";

let username = localStorage.getItem(NAME_KEY) || "";
let contacts = [];
let activeReceiver = "";
let typingTimeout = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let pendingDeleteContact = "";
let confirmingPermanentDelete = false;
let onlineUsers = new Set();
const unreadContacts = new Set();
const TYPING_DELAY = 1200;

function contactStorageKey() {
  return `talksy_contacts_${username.toLowerCase()}`;
}

function hideSplash() {
  if (!splash) return;
  splash.style.opacity = "0";
  setTimeout(() => {
    splash.style.display = "none";
    if (username) {
      (activeReceiver ? messageInput : newChatBtn)?.focus();
    } else {
      nameInput?.focus();
    }
    confettiBurst(55);
  }, 400);
}

window.addEventListener("load", () => {
  createAmbientMotion();
  if (username) {
    nameInput.value = username;
    enterChat({ celebrate: false });
  }
  setTimeout(hideSplash, 2200);
  splash.addEventListener("click", hideSplash);
});

if (username) nameInput.value = username;
toggleJoin();
toggleComposer();
resizeMessageInput();

joinBtn.onclick = () => {
  username = (nameInput.value || "").trim();
  if (username.length < 2) return;
  enterChat({ celebrate: true });
};

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinBtn.click();
});
nameInput.addEventListener("input", toggleJoin);

newChatBtn.addEventListener("click", startNewChat);
changeUserBtn.addEventListener("click", changeUser);
sendBtn.addEventListener("click", sendMessage);
modalCloseBtn.addEventListener("click", closeNewChatModal);
modalCancelBtn.addEventListener("click", closeNewChatModal);
modalStartBtn.addEventListener("click", submitNewChatModal);
deleteModalCloseBtn.addEventListener("click", closeDeleteChatModal);
deleteCancelBtn.addEventListener("click", closeDeleteChatModal);
deleteConfirmBtn.addEventListener("click", confirmDeleteChat);
deleteForeverBtn.addEventListener("click", confirmPermanentDeleteChat);
newChatModal.addEventListener("click", (e) => {
  if (e.target === newChatModal) closeNewChatModal();
});
deleteChatModal.addEventListener("click", (e) => {
  if (e.target === deleteChatModal) closeDeleteChatModal();
});
modalReceiverInput.addEventListener("input", () => {
  modalError.classList.add("hidden");
});
modalReceiverInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitNewChatModal();
  if (e.key === "Escape") closeNewChatModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !newChatModal.classList.contains("hidden")) {
    closeNewChatModal();
  }
  if (e.key === "Escape" && !deleteChatModal.classList.contains("hidden")) {
    closeDeleteChatModal();
  }
});
recordBtn.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.shiftKey)) {
    e.preventDefault();
    sendMessage();
  }
});

messageInput.addEventListener("input", () => {
  toggleComposer();
  resizeMessageInput();
  emitTyping();
});

socket.on("privateMessage", ({ sender, message, timestamp, type, audio }) => {
  hideTyping();

  if (sender === "System") {
    addMessage(`System: ${message}`, { timestamp, meta: true });
    return;
  }

  addContact(sender);

  if (sender !== activeReceiver) {
    unreadContacts.add(sender);
    renderContacts();
    return;
  }

  if (type === "voice") {
    addVoiceMessage(audio, { sender, timestamp });
  } else {
    addMessage(`${sender}: ${message}`, { timestamp });
  }
});

socket.on("onlineUsers", (users = []) => {
  onlineUsers = new Set(users.map((name) => String(name).toLowerCase()));
  renderContacts();
});

socket.on("chatDeleted", ({ contact }) => {
  removeContact(contact);
});

socket.on("chatPermanentlyDeleted", ({ contact }) => {
  removeContact(contact);
  closeDeleteChatModal();
});

socket.on("chatDeleteFailed", ({ message }) => {
  deleteConfirmBtn.disabled = false;
  deleteForeverBtn.disabled = false;
  addMessage(`System: ${message || "Could not delete this chat."}`, { meta: true });
});

socket.on("messageHistory", (history) => {
  chatWindow.innerHTML = "";

  if (!history.length) {
    showEmptyChat("No messages yet", "Send the first message when you are ready.");
    return;
  }

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
        isYou ? `You: ${msg.message}` : `${msg.sender}: ${msg.message}`,
        { you: isYou, timestamp: msg.timestamp }
      );
    }
  });
});

socket.on("typing", ({ sender }) => {
  if (sender === username || sender !== activeReceiver) return;
  showTyping(sender);
});

socket.on("stopTyping", ({ sender }) => {
  if (sender === username || sender !== activeReceiver) return;
  hideTyping();
});

function enterChat({ celebrate }) {
  socket.emit("register", username);
  localStorage.setItem(NAME_KEY, username);

  contacts = loadContacts();
  const savedActive = localStorage.getItem(ACTIVE_CONTACT_KEY);
  activeReceiver = contacts.includes(savedActive) ? savedActive : contacts[0] || "";

  currentUserEl.textContent = `Logged in as ${username}`;
  loginBox.classList.add("hidden");
  chatBox.classList.remove("hidden");

  renderContacts();
  if (activeReceiver) {
    selectContact(activeReceiver, { save: false });
  } else {
    showNoContactSelected();
  }

  if (celebrate) confettiBurst(120);
}

function changeUser() {
  const ok = window.confirm("Change user? Your recent contacts stay saved in this browser.");
  if (!ok) return;

  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(ACTIVE_CONTACT_KEY);
  window.location.reload();
}

function startNewChat() {
  modalReceiverInput.value = "";
  modalError.classList.add("hidden");
  newChatModal.classList.remove("hidden");
  setTimeout(() => modalReceiverInput.focus(), 50);
}

function closeNewChatModal() {
  newChatModal.classList.add("hidden");
  newChatBtn.focus();
}

function openDeleteChatModal(contact) {
  pendingDeleteContact = contact;
  confirmingPermanentDelete = false;
  updateDeleteChatModal();
  deleteChatModal.classList.remove("hidden");
  setTimeout(() => deleteConfirmBtn.focus(), 50);
}

function closeDeleteChatModal() {
  pendingDeleteContact = "";
  confirmingPermanentDelete = false;
  deleteConfirmBtn.disabled = false;
  deleteForeverBtn.disabled = false;
  deleteChatModal.classList.add("hidden");
}

function confirmDeleteChat() {
  if (!pendingDeleteContact) return;

  const contact = pendingDeleteContact;
  removeContact(contact);
  closeDeleteChatModal();
}

function confirmPermanentDeleteChat() {
  if (!pendingDeleteContact) return;

  if (!confirmingPermanentDelete) {
    confirmingPermanentDelete = true;
    updateDeleteChatModal();
    setTimeout(() => deleteForeverBtn.focus(), 50);
    return;
  }

  const contact = pendingDeleteContact;
  deleteConfirmBtn.disabled = true;
  deleteForeverBtn.disabled = true;
  socket.emit("deleteChatForever", { sender: username, receiver: contact });
}

function updateDeleteChatModal() {
  deleteContactName.textContent = pendingDeleteContact;
  deleteForeverWarning.classList.toggle("hidden", !confirmingPermanentDelete);
  deleteConfirmBtn.classList.toggle("hidden", confirmingPermanentDelete);

  if (confirmingPermanentDelete) {
    deleteChatTitle.textContent = "Delete forever?";
    deleteChatCopy.textContent = "Permanently delete all messages with";
    deleteChatTail.textContent = " from MongoDB?";
    deleteForeverBtn.textContent = "Yes, delete forever";
  } else {
    deleteChatTitle.textContent = "Manage chat";
    deleteChatCopy.textContent = "Choose what to do with";
    deleteChatTail.textContent = ".";
    deleteForeverBtn.textContent = "Delete forever";
  }
}

function showModalError(message) {
  modalError.textContent = message;
  modalError.classList.remove("hidden");
}

function submitNewChatModal() {
  const cleanName = normalizeName(modalReceiverInput.value);

  if (!cleanName) {
    showModalError("Please enter a receiver name.");
    modalReceiverInput.focus();
    return;
  }
  if (cleanName.toLowerCase() === username.toLowerCase()) {
    showModalError("Choose another user's name.");
    modalReceiverInput.focus();
    return;
  }

  addContact(cleanName);
  selectContact(cleanName);
  closeNewChatModal();
  messageInput.focus();
}

function normalizeName(name) {
  return (name || "").trim().replace(/\s+/g, " ").slice(0, 24);
}

function loadContacts() {
  try {
    const saved = JSON.parse(localStorage.getItem(contactStorageKey()) || "[]");
    return Array.isArray(saved) ? saved.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveContacts() {
  localStorage.setItem(contactStorageKey(), JSON.stringify(contacts));
}

function addContact(name) {
  const cleanName = normalizeName(name);
  if (!cleanName) return;

  contacts = contacts.filter((contact) => contact.toLowerCase() !== cleanName.toLowerCase());
  contacts.unshift(cleanName);
  contacts = contacts.slice(0, 20);
  saveContacts();
  renderContacts();
}

function removeContact(name) {
  const cleanName = normalizeName(name);
  if (!cleanName) return;

  contacts = contacts.filter((contact) => contact.toLowerCase() !== cleanName.toLowerCase());
  for (const contact of [...unreadContacts]) {
    if (contact.toLowerCase() === cleanName.toLowerCase()) {
      unreadContacts.delete(contact);
    }
  }
  saveContacts();

  if (activeReceiver.toLowerCase() === cleanName.toLowerCase()) {
    localStorage.removeItem(ACTIVE_CONTACT_KEY);
    showNoContactSelected();
  }

  renderContacts();
}

function isContactOnline(contact) {
  return onlineUsers.has(String(contact).toLowerCase());
}

function renderContacts() {
  contactList.innerHTML = "";

  if (!contacts.length) {
    const empty = document.createElement("div");
    empty.className = "contacts-empty";
    empty.textContent = "No recent chats yet.";
    contactList.appendChild(empty);
    return;
  }

  contacts.forEach((contact) => {
    const item = document.createElement("div");
    item.className = `contact-item${contact === activeReceiver ? " active" : ""}`;
    item.role = "button";
    item.tabIndex = 0;
    item.onclick = () => selectContact(contact);
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectContact(contact);
      }
    });

    const avatarWrap = document.createElement("span");
    avatarWrap.className = "contact-avatar-wrap";

    const avatar = document.createElement("span");
    avatar.className = "contact-avatar";
    avatar.textContent = contact[0]?.toUpperCase() || "?";

    avatarWrap.appendChild(avatar);

    if (isContactOnline(contact)) {
      const online = document.createElement("span");
      online.className = "online-dot";
      online.title = "Online";
      avatarWrap.appendChild(online);
    }

    const name = document.createElement("span");
    name.className = "contact-name";
    name.textContent = contact;

    item.appendChild(avatarWrap);
    item.appendChild(name);

    if (unreadContacts.has(contact)) {
      const unread = document.createElement("span");
      unread.className = "unread-dot";
      item.appendChild(unread);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "contact-delete";
    deleteBtn.textContent = "x";
    deleteBtn.title = "Remove chat from list";
    deleteBtn.setAttribute("aria-label", `Remove chat with ${contact} from list`);
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      openDeleteChatModal(contact);
    };

    item.appendChild(deleteBtn);
    contactList.appendChild(item);
  });
}

function selectContact(contact, opts = {}) {
  activeReceiver = contact;
  unreadContacts.delete(contact);
  if (opts.save !== false) localStorage.setItem(ACTIVE_CONTACT_KEY, contact);

  chatTitle.textContent = `Chatting with ${contact}`;
  chatSubtitle.textContent = "Messages are private between these two names.";
  chatWindow.innerHTML = "";
  hideTyping();
  toggleComposer();
  resizeMessageInput();
  renderContacts();

  socket.emit("getMessages", { sender: username, receiver: contact });
}

function showNoContactSelected() {
  activeReceiver = "";
  chatTitle.textContent = "Select a chat";
  chatSubtitle.textContent = "Choose a recent contact or start a new chat.";
  chatWindow.innerHTML = "";
  showEmptyChat("No chat selected", "Use New Chat once, then it will appear here.");
  hideTyping();
  toggleComposer();
}

function showEmptyChat(title, text) {
  const empty = document.createElement("div");
  empty.className = "chat-empty";
  empty.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <span>${escapeHtml(text)}</span>
  `;
  chatWindow.appendChild(empty);
}

function toggleJoin() {
  joinBtn.disabled = (nameInput.value || "").trim().length < 2;
}

function toggleComposer() {
  const hasContact = Boolean(activeReceiver);
  messageInput.disabled = !hasContact;
  sendBtn.disabled = !hasContact || (messageInput.value || "").trim().length === 0;
  recordBtn.disabled = !hasContact || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder;
}

function resizeMessageInput() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
}

function sendMessage() {
  const message = messageInput.value.trim();
  if (!activeReceiver || !message) return;

  socket.emit("privateMessage", {
    sender: username,
    receiver: activeReceiver,
    message,
  });

  addContact(activeReceiver);
  addMessage(`You: ${message}`, {
    you: true,
    timestamp: Date.now(),
  });

  socket.emit("stopTyping", { sender: username, receiver: activeReceiver });

  messageInput.value = "";
  toggleComposer();
  resizeMessageInput();
  messageInput.focus();
}

function emitTyping() {
  if (!username || !activeReceiver) return;

  socket.emit("typing", { sender: username, receiver: activeReceiver });

  if (typingTimeout) clearTimeout(typingTimeout);

  typingTimeout = setTimeout(() => {
    socket.emit("stopTyping", { sender: username, receiver: activeReceiver });
  }, TYPING_DELAY);
}

async function startRecording() {
  if (!activeReceiver) return;

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
    socket.emit("typing", { sender: username, receiver: activeReceiver });
  } catch {
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

  if (!activeReceiver || recordedChunks.length === 0) return;

  const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
  const reader = new FileReader();

  reader.onloadend = () => {
    const audio = reader.result;
    socket.emit("privateMessage", {
      sender: username,
      receiver: activeReceiver,
      type: "voice",
      audio,
      mimeType: blob.type,
    });
    addContact(activeReceiver);
    addVoiceMessage(audio, {
      you: true,
      sender: "You",
      timestamp: Date.now(),
    });
    socket.emit("stopTyping", { sender: username, receiver: activeReceiver });
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

function addMessage(text, opts = {}) {
  clearChatEmpty();

  const wrapper = document.createElement("div");
  wrapper.classList.add("message");
  if (opts.you) wrapper.classList.add("you");
  if (opts.meta) wrapper.classList.add("meta");

  const body = document.createElement("span");
  body.className = "msg-text";
  body.textContent = text;

  const time = document.createElement("span");
  time.className = "msg-time";
  time.textContent = opts.timestamp ? formatTime(opts.timestamp) : formatTime(Date.now());

  wrapper.appendChild(body);
  wrapper.appendChild(time);
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addVoiceMessage(audioSrc, opts = {}) {
  if (!audioSrc || !audioSrc.startsWith("data:audio/")) return;
  clearChatEmpty();

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

function clearChatEmpty() {
  chatWindow.querySelector(".chat-empty")?.remove();
}

function formatTime(ts) {
  const d = new Date(ts);
  let hrs = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, "0");
  const ampm = hrs >= 12 ? "pm" : "am";
  hrs = hrs % 12 || 12;
  return `${hrs}:${mins} ${ampm}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[s]);
}

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

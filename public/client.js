// Talksy Client Script (Clean + Professional)

const socket = io();

const loginBox = document.querySelector(".login-box");
const chatBox = document.querySelector(".chat-box");
const joinBtn = document.getElementById("joinBtn");
const sendBtn = document.getElementById("sendBtn");
const chatWindow = document.getElementById("chatWindow");

const nameInput = document.getElementById("username");
const receiverInput = document.getElementById("receiver");
const messageInput = document.getElementById("message");

// Persistent username
let username = localStorage.getItem("talksy_user") || "";

// Pre-fill name
if (username) {
  nameInput.value = username;
  socket.emit("register", username);
  loginBox.classList.add("hidden");
  chatBox.classList.remove("hidden");
}

toggleJoin();
toggleSend();


// ================= JOIN =================

joinBtn.onclick = handleJoin;

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleJoin();
});

nameInput.addEventListener("input", toggleJoin);

function handleJoin() {
  username = (nameInput.value || "").trim();
  if (username.length < 2) return;

  socket.emit("register", username);
  localStorage.setItem("talksy_user", username);

  loginBox.classList.add("hidden");
  chatBox.classList.remove("hidden");

  addMessage(`Logged in as ${username}`, { meta: true });
  receiverInput.focus();
}

function toggleJoin() {
  joinBtn.disabled = (nameInput.value || "").trim().length < 2;
}


// ================= SEND MESSAGE =================

sendBtn.onclick = sendMessage;

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

messageInput.addEventListener("input", toggleSend);

function toggleSend() {
  sendBtn.disabled = (messageInput.value || "").trim().length === 0;
}

function sendMessage() {
  const receiver = (receiverInput.value || "").trim();
  const message = (messageInput.value || "").trim();

  if (!receiver || !message) return;

  socket.emit("privateMessage", { sender: username, receiver, message });

  addMessage(`You: ${message}`, { you: true });

  messageInput.value = "";
  toggleSend();
  messageInput.focus();
}


// ================= RECEIVE MESSAGE =================

socket.on("privateMessage", ({ sender, message }) => {
  const isYou = sender === username;
  addMessage(isYou ? `You: ${message}` : `${sender}: ${message}`, { you: isYou });
});


// ================= LOAD HISTORY =================

receiverInput.addEventListener("change", loadHistory);
receiverInput.addEventListener("blur", loadHistory);

function loadHistory() {
  const receiver = (receiverInput.value || "").trim();
  if (!receiver) return;

  socket.emit("getMessages", { sender: username, receiver });
}

socket.on("messageHistory", (history = []) => {
  chatWindow.innerHTML = "";

  history.forEach((msg) => {
    const fromYou = msg.sender === username;
    const text = fromYou
      ? `You: ${msg.message}`
      : `${msg.sender}: ${msg.message}`;

    addMessage(text, { you: fromYou });
  });
});


// ================= ONLINE USERS =================

socket.on("onlineUsers", (list) => {
  const receiver = (receiverInput.value || "").trim();
  const status = document.getElementById("onlineStatus");
  if (!status) return;

  if (receiver && list.includes(receiver)) {
    status.innerText = "Online";
    status.style.color = "#22c55e";
  } else {
    status.innerText = "Offline";
    status.style.color = "#ef4444";
  }
});


// ================= UI MESSAGE RENDER =================

function addMessage(text, opts = {}) {
  const div = document.createElement("div");
  div.classList.add("message");

  if (opts.meta) div.classList.add("meta");
  if (opts.you) div.classList.add("you");

  div.textContent = text;

  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

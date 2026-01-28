const socket = io();

const loginBox = document.querySelector(".login-box");
const chatBox = document.querySelector(".chat-box");
const joinBtn = document.getElementById("joinBtn");
const sendBtn = document.getElementById("sendBtn");
const chatWindow = document.getElementById("chatWindow");

let username = "";
let currentReceiver = "";

// === Join Chat ===
joinBtn.onclick = () => {
  username = document.getElementById("username").value.trim();
  if (username) {
    socket.emit("register", username);
    loginBox.classList.add("hidden");
    chatBox.classList.remove("hidden");
    addMessage(`✅ Logged in as ${username}`);
  }
};

// === Send message ===
sendBtn.onclick = sendMessage;
document.getElementById("message").addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const receiver = document.getElementById("receiver").value.trim();
  const message = document.getElementById("message").value.trim();

  if (!receiver || !message) return;

  currentReceiver = receiver; // save last receiver
  socket.emit("privateMessage", { sender: username, receiver, message });
  addMessage(`🟢 You → ${receiver}: ${message}`);
  document.getElementById("message").value = "";
}

// === Receive messages ===
socket.on("privateMessage", ({ sender, message }) => {
  addMessage(`💬 ${sender}: ${message}`);
});

// === Request chat history when receiver is entered ===
document.getElementById("receiver").addEventListener("change", () => {
  const receiver = document.getElementById("receiver").value.trim();
  if (receiver) {
    socket.emit("getMessages", { sender: username, receiver });
  }
});

// === Receive message history ===
socket.on("messageHistory", (history) => {
  chatWindow.innerHTML = "";
  history.forEach((msg) => {
    const from = msg.sender === username ? "🟢 You" : `💬 ${msg.sender}`;
    addMessage(`${from} → ${msg.receiver}: ${msg.message}`);
  });
});

// === Display message in chat window ===
function addMessage(msg) {
  const div = document.createElement("div");
  div.classList.add("message");
  div.innerHTML = `<strong>${msg}</strong>`;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

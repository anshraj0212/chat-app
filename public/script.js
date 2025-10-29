const socket = io();

const loginBox = document.querySelector(".login-box");
const chatBox = document.querySelector(".chat-box");
const joinBtn = document.getElementById("joinBtn");
const sendBtn = document.getElementById("sendBtn");
const chatWindow = document.getElementById("chatWindow");

let username = "";

// === Join Chat ===
joinBtn.onclick = () => {
  username = document.getElementById("username").value.trim();
  if (username) {
    socket.emit("register", username);
    loginBox.classList.add("hidden");
    chatBox.classList.remove("hidden");
  }
};

// === Send message (button or Enter) ===
sendBtn.onclick = sendMessage;
document.getElementById("message").addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

// === Send message function ===
function sendMessage() {
  const receiver = document.getElementById("receiver").value.trim();
  const message = document.getElementById("message").value.trim();

  if (receiver && message) {
    socket.emit("privateMessage", { sender: username, receiver, message });
    addMessage(`You → ${receiver}: ${message}`);
    document.getElementById("message").value = "";
  }
}

// === Receive incoming message ===
socket.on("privateMessage", ({ sender, message }) => {
  addMessage(`${sender}: ${message}`);
});

// === Display message in chat window ===
function addMessage(msg) {
  const div = document.createElement("div");
  div.classList.add("message");
  div.innerHTML = `<strong>${msg}</strong>`;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

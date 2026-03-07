// === Import Required Modules ===
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const mongoose = require("mongoose");

// === Initialize Express and Server ===
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// === Serve frontend from /public ===
app.use(express.static(path.join(__dirname, "public")));

// === Connect to MongoDB ===
mongoose
  .connect("mongodb+srv://rajansh2004:anshraj02122004@cluster0.kczmgcv.mongodb.net/?appName=Cluster0")
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.log("❌ MongoDB connection error:", err));

// === Message Schema ===
const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  message: String,
  timestamp: { type: Date, default: Date.now },
});

const Message = mongoose.model("Message", messageSchema);

// === Active Users Map ===
let users = {}; // username: socketId

// === Socket.IO Connection ===
io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  // Register username
  socket.on("register", (username) => {
    users[username] = socket.id;
    console.log(`👤 ${username} logged in as ${socket.id}`);
  });

  // Private Message
  socket.on("privateMessage", async ({ sender, receiver, message }) => {
    const receiverId = users[receiver];

    const msg = new Message({ sender, receiver, message });
    await msg.save();

    if (receiverId) {
      io.to(receiverId).emit("privateMessage", {
        sender,
        message,
        timestamp: msg.timestamp,
      });
    } else {
      socket.emit("privateMessage", {
        sender: "System",
        message: `${receiver} is offline.`,
        timestamp: Date.now(),
      });
    }
  });

  // Fetch history
  socket.on("getMessages", async ({ sender, receiver }) => {
    const history = await Message.find({
      $or: [
        { sender, receiver },
        { sender: receiver, receiver: sender },
      ],
    }).sort({ timestamp: 1 });

    socket.emit("messageHistory", history);
  });

  // Typing Indicator
  socket.on("typing", ({ sender, receiver }) => {
    const id = users[receiver];
    if (id) io.to(id).emit("typing", { sender });
  });

  socket.on("stopTyping", ({ sender, receiver }) => {
    const id = users[receiver];
    if (id) io.to(id).emit("stopTyping", { sender });
  });

  // Cleanup on Disconnect
  socket.on("disconnect", () => {
    for (let name in users) {
      if (users[name] === socket.id) {
        delete users[name];
        break;
      }
    }
    console.log("🔴 Disconnected:", socket.id);
  });
});

// === Start Server ===
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
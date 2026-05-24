// === Import Required Modules ===
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const mongoose = require("mongoose");

// === Initialize Express and Server ===
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 5e6,
});

// === Serve frontend from /public ===
app.use(express.static(path.join(__dirname, "public")));

// === Connect to MongoDB ===
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error("MONGODB_URI environment variable is required.");
  process.exit(1);
}

mongoose
  .connect(mongoUri)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.log("❌ MongoDB connection error:", err));

// === Message Schema ===
const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  message: { type: String, default: "" },
  type: { type: String, enum: ["text", "voice"], default: "text" },
  audio: String,
  mimeType: String,
  timestamp: { type: Date, default: Date.now },
});

const Message = mongoose.model("Message", messageSchema);

// === Active Users Map ===
let users = {}; // username: socketId

function emitOnlineUsers() {
  io.emit("onlineUsers", Object.keys(users));
}

// === Socket.IO Connection ===
io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  // Register username
  socket.on("register", (username) => {
    users[username] = socket.id;
    emitOnlineUsers();
    console.log(`👤 ${username} logged in as ${socket.id}`);
  });

  // Private Message
  socket.on("privateMessage", async ({ sender, receiver, message, type = "text", audio, mimeType }) => {
    const receiverId = users[receiver];
    const isVoice = type === "voice";

    if (isVoice && (!audio || !mimeType)) return;
    if (!isVoice && !message) return;

    const msg = new Message({
      sender,
      receiver,
      message: isVoice ? "" : message,
      type: isVoice ? "voice" : "text",
      audio: isVoice ? audio : undefined,
      mimeType: isVoice ? mimeType : undefined,
    });
    await msg.save();

    if (receiverId) {
      io.to(receiverId).emit("privateMessage", {
        sender,
        message: msg.message,
        type: msg.type,
        audio: msg.audio,
        mimeType: msg.mimeType,
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

  // Remove conversation from the sender's UI only. MongoDB history stays saved.
  socket.on("deleteChat", ({ sender, receiver }) => {
    if (!sender || !receiver || users[sender] !== socket.id) return;

    socket.emit("chatDeleted", { contact: receiver });
  });

  // Permanently delete conversation from MongoDB for both users.
  socket.on("deleteChatForever", async ({ sender, receiver }) => {
    if (!sender || !receiver || users[sender] !== socket.id) return;

    try {
      await Message.deleteMany({
        $or: [
          { sender, receiver },
          { sender: receiver, receiver: sender },
        ],
      });

      socket.emit("chatPermanentlyDeleted", { contact: receiver });

      const receiverId = users[receiver];
      if (receiverId) {
        io.to(receiverId).emit("chatPermanentlyDeleted", { contact: sender });
      }
    } catch (err) {
      console.log("Permanent chat delete error:", err);
      socket.emit("chatDeleteFailed", {
        message: "Could not permanently delete this chat. Please try again.",
      });
    }
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
    emitOnlineUsers();
    console.log("🔴 Disconnected:", socket.id);
  });
});

// === Start Server ===
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

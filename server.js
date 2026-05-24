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
let users = {}; // normalized username: { socketId, username }

function cleanUserName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function userKey(name) {
  return cleanUserName(name).toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactNameQuery(name) {
  return new RegExp(`^${escapeRegex(cleanUserName(name))}$`, "i");
}

function getOnlineUser(name) {
  return users[userKey(name)];
}

function emitOnlineUsers() {
  io.emit("onlineUsers", Object.values(users).map((user) => user.username));
}

// === Socket.IO Connection ===
io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  // Register username
  socket.on("register", (username) => {
    const cleanName = cleanUserName(username);
    const key = userKey(cleanName);
    if (!key) return;

    users[key] = { socketId: socket.id, username: cleanName };
    emitOnlineUsers();
    console.log(`👤 ${username} logged in as ${socket.id}`);
  });

  // Private Message
  socket.on("privateMessage", async ({ sender, receiver, message, type = "text", audio, mimeType }) => {
    const senderUser = getOnlineUser(sender);
    if (!senderUser || senderUser.socketId !== socket.id) return;

    const receiverUser = getOnlineUser(receiver);
    const receiverName = receiverUser?.username || cleanUserName(receiver);
    const receiverId = receiverUser?.socketId;
    const isVoice = type === "voice";

    if (!receiverName) return;
    if (isVoice && (!audio || !mimeType)) return;
    if (!isVoice && !message) return;

    const msg = new Message({
      sender: senderUser.username,
      receiver: receiverName,
      message: isVoice ? "" : message,
      type: isVoice ? "voice" : "text",
      audio: isVoice ? audio : undefined,
      mimeType: isVoice ? mimeType : undefined,
    });
    await msg.save();

    if (receiverId) {
      io.to(receiverId).emit("privateMessage", {
        sender: senderUser.username,
        message: msg.message,
        type: msg.type,
        audio: msg.audio,
        mimeType: msg.mimeType,
        timestamp: msg.timestamp,
      });
    } else {
      socket.emit("privateMessage", {
        sender: "System",
        message: `${receiverName} is offline.`,
        timestamp: Date.now(),
      });
    }
  });

  // Fetch history
  socket.on("getMessages", async ({ sender, receiver }) => {
    const senderQuery = exactNameQuery(sender);
    const receiverQuery = exactNameQuery(receiver);

    const history = await Message.find({
      $or: [
        { sender: senderQuery, receiver: receiverQuery },
        { sender: receiverQuery, receiver: senderQuery },
      ],
    }).sort({ timestamp: 1 });

    socket.emit("messageHistory", history);
  });

  // Remove conversation from the sender's UI only. MongoDB history stays saved.
  socket.on("deleteChat", ({ sender, receiver }) => {
    const senderUser = getOnlineUser(sender);
    if (!sender || !receiver || !senderUser || senderUser.socketId !== socket.id) return;

    socket.emit("chatDeleted", { contact: receiver });
  });

  // Permanently delete conversation from MongoDB for both users.
  socket.on("deleteChatForever", async ({ sender, receiver }) => {
    const senderUser = getOnlineUser(sender);
    if (!sender || !receiver || !senderUser || senderUser.socketId !== socket.id) return;

    const receiverUser = getOnlineUser(receiver);
    const receiverName = receiverUser?.username || cleanUserName(receiver);
    if (!receiverName) return;

    try {
      const senderQuery = exactNameQuery(senderUser.username);
      const receiverQuery = exactNameQuery(receiverName);

      await Message.deleteMany({
        $or: [
          { sender: senderQuery, receiver: receiverQuery },
          { sender: receiverQuery, receiver: senderQuery },
        ],
      });

      socket.emit("chatPermanentlyDeleted", { contact: receiverName });

      const receiverId = receiverUser?.socketId;
      if (receiverId) {
        io.to(receiverId).emit("chatPermanentlyDeleted", { contact: senderUser.username });
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
    const senderUser = getOnlineUser(sender);
    const receiverUser = getOnlineUser(receiver);
    if (receiverUser) {
      io.to(receiverUser.socketId).emit("typing", {
        sender: senderUser?.username || cleanUserName(sender),
      });
    }
  });

  socket.on("stopTyping", ({ sender, receiver }) => {
    const senderUser = getOnlineUser(sender);
    const receiverUser = getOnlineUser(receiver);
    if (receiverUser) {
      io.to(receiverUser.socketId).emit("stopTyping", {
        sender: senderUser?.username || cleanUserName(sender),
      });
    }
  });

  // Cleanup on Disconnect
  socket.on("disconnect", () => {
    for (let name in users) {
      if (users[name].socketId === socket.id) {
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

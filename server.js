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
let users = {}; // exact username: socketId

function cleanUserName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function emitOnlineUsers() {
  io.emit("onlineUsers", Object.keys(users));
}

// === Socket.IO Connection ===
io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  // Register username
  socket.on("register", (username, done = () => {}) => {
    const cleanName = cleanUserName(username);
    if (!cleanName) {
      done({ ok: false, message: "Please enter a name." });
      return;
    }

    const existingSocketId = users[cleanName];
    const isNameTaken = existingSocketId
      && existingSocketId !== socket.id
      && io.sockets.sockets.has(existingSocketId);

    if (isNameTaken) {
      done({ ok: false, message: `${cleanName} is already in use.` });
      return;
    }

    users[cleanName] = socket.id;
    emitOnlineUsers();
    done({ ok: true, username: cleanName });
    console.log(`👤 ${username} logged in as ${socket.id}`);
  });

  // Private Message
  socket.on("privateMessage", async ({ sender, receiver, message, type = "text", audio, mimeType }) => {
    const senderName = cleanUserName(sender);
    if (users[senderName] !== socket.id) return;

    const receiverName = cleanUserName(receiver);
    const receiverId = users[receiverName];
    const isVoice = type === "voice";

    if (!receiverName) return;
    if (isVoice && (!audio || !mimeType)) return;
    if (!isVoice && !message) return;

    const msg = new Message({
      sender: senderName,
      receiver: receiverName,
      message: isVoice ? "" : message,
      type: isVoice ? "voice" : "text",
      audio: isVoice ? audio : undefined,
      mimeType: isVoice ? mimeType : undefined,
    });
    await msg.save();

    if (receiverId) {
      io.to(receiverId).emit("privateMessage", {
        sender: senderName,
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
    const cleanSender = cleanUserName(sender);
    const cleanReceiver = cleanUserName(receiver);

    const history = await Message.find({
      $or: [
        { sender: cleanSender, receiver: cleanReceiver },
        { sender: cleanReceiver, receiver: cleanSender },
      ],
    }).sort({ timestamp: 1 });

    socket.emit("messageHistory", history);
  });

  // Remove conversation from the sender's UI only. MongoDB history stays saved.
  socket.on("deleteChat", ({ sender, receiver }) => {
    const cleanSender = cleanUserName(sender);
    if (!sender || !receiver || users[cleanSender] !== socket.id) return;

    socket.emit("chatDeleted", { contact: receiver });
  });

  // Permanently delete conversation from MongoDB for both users.
  socket.on("deleteChatForever", async ({ sender, receiver }) => {
    const cleanSender = cleanUserName(sender);
    if (!sender || !receiver || users[cleanSender] !== socket.id) return;

    const receiverName = cleanUserName(receiver);
    if (!receiverName) return;

    try {
      await Message.deleteMany({
        $or: [
          { sender: cleanSender, receiver: receiverName },
          { sender: receiverName, receiver: cleanSender },
        ],
      });

      socket.emit("chatPermanentlyDeleted", { contact: receiverName });

      const receiverId = users[receiverName];
      if (receiverId) {
        io.to(receiverId).emit("chatPermanentlyDeleted", { contact: cleanSender });
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
    const cleanSender = cleanUserName(sender);
    const receiverId = users[cleanUserName(receiver)];
    if (receiverId) io.to(receiverId).emit("typing", { sender: cleanSender });
  });

  socket.on("stopTyping", ({ sender, receiver }) => {
    const cleanSender = cleanUserName(sender);
    const receiverId = users[cleanUserName(receiver)];
    if (receiverId) io.to(receiverId).emit("stopTyping", { sender: cleanSender });
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

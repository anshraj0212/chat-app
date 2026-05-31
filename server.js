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
  maxHttpBufferSize: 12e6,
});

const MAX_PHOTO_DATA_URL_LENGTH = 10_000_000;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
  type: { type: String, enum: ["text", "voice", "photo"], default: "text" },
  audio: String,
  image: String,
  fileName: String,
  mimeType: String,
  photoDownloadedAt: Date,
  timestamp: { type: Date, default: Date.now },
});

const Message = mongoose.model("Message", messageSchema);

// === Active Users Map ===
let users = {}; // exact username: socketId

function cleanUserName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function isAllowedPhoto(image, mimeType) {
  return ALLOWED_PHOTO_TYPES.has(mimeType)
    && typeof image === "string"
    && image.length <= MAX_PHOTO_DATA_URL_LENGTH
    && image.startsWith(`data:${mimeType};base64,`);
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
  socket.on("privateMessage", async ({ sender, receiver, message, type = "text", audio, image, fileName, mimeType }) => {
    const senderName = cleanUserName(sender);
    if (users[senderName] !== socket.id) return;

    const receiverName = cleanUserName(receiver);
    const receiverId = users[receiverName];
    const isVoice = type === "voice";
    const isPhoto = type === "photo";

    if (!receiverName) return;
    if (isVoice && (!audio || !mimeType)) return;
    if (isPhoto && !isAllowedPhoto(image, mimeType)) return;
    if (!isVoice && !isPhoto && !message) return;

    const msg = new Message({
      sender: senderName,
      receiver: receiverName,
      message: isVoice || isPhoto ? "" : message,
      type: isVoice ? "voice" : isPhoto ? "photo" : "text",
      audio: isVoice ? audio : undefined,
      image: isPhoto ? image : undefined,
      fileName: isPhoto ? cleanUserName(fileName).slice(0, 80) || "talksy-photo" : undefined,
      mimeType: isVoice || isPhoto ? mimeType : undefined,
    });
    await msg.save();

    if (receiverId) {
      io.to(receiverId).emit("privateMessage", {
        id: msg._id.toString(),
        sender: senderName,
        message: msg.message,
        type: msg.type,
        audio: msg.audio,
        image: msg.image,
        fileName: msg.fileName,
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

  // Clear photo data after the receiver downloads it.
  socket.on("photoDownloaded", async ({ messageId, receiver }, done = () => {}) => {
    const cleanReceiver = cleanUserName(receiver);
    if (users[cleanReceiver] !== socket.id || !mongoose.Types.ObjectId.isValid(messageId)) {
      done({ ok: false, message: "Could not verify this download." });
      return;
    }

    try {
      const msg = await Message.findOne({
        _id: messageId,
        receiver: cleanReceiver,
        type: "photo",
      });

      if (!msg || !msg.image) {
        done({ ok: false, message: "This photo is no longer stored." });
        return;
      }

      await Message.updateOne(
        { _id: msg._id },
        {
          $unset: { image: "" },
          $set: { photoDownloadedAt: new Date() },
        }
      );

      const payload = { messageId: msg._id.toString() };
      socket.emit("photoCleared", payload);
      done({ ok: true });

      const senderId = users[msg.sender];
      if (senderId) {
        io.to(senderId).emit("photoCleared", payload);
      }
    } catch (err) {
      console.log("Photo cleanup error:", err);
      done({ ok: false, message: "Could not clear this photo from storage." });
    }
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

// === Import Required Modules ===
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const mongoose = require("mongoose");

// === Initialize Express App and Server ===
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// === Serve Static Files (Frontend) ===
app.use(express.static(path.join(__dirname, "public")));

// === Connect to MongoDB ===
// Replace this with your own MongoDB Atlas connection string
mongoose
  .connect("mongodb+srv://rajansh2004:anshraj02122004@cluster0.kczmgcv.mongodb.net/?appName=Cluster0")
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.log("❌ MongoDB connection error:", err));

// === Define Message Schema ===
const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  message: String,
  timestamp: { type: Date, default: Date.now },
});

const Message = mongoose.model("Message", messageSchema);

// === Store Active Users ===
let users = {}; // username: socket.id

// === Socket.io Connection Handling ===
io.on("connection", (socket) => {
  console.log("🟢 A user connected:", socket.id);

  socket.on("register", (username) => {
    users[username] = socket.id;
    console.log(`👤 ${username} connected with ID: ${socket.id}`);
    io.emit("onlineUsers", Object.keys(users));
  });

  socket.on("privateMessage", async ({ sender, receiver, message }) => {
    const receiverId = users[receiver];
    const msg = new Message({ sender, receiver, message });
    await msg.save();

    if (receiverId) {
      io.to(receiverId).emit("privateMessage", { sender, message });
    } else {
      socket.emit("privateMessage", {
        sender: "System",
        message: `${receiver} is offline.`,
      });
    }
  });

  socket.on("getMessages", async ({ sender, receiver }) => {
    const history = await Message.find({
      $or: [
        { sender, receiver },
        { sender: receiver, receiver: sender },
      ],
    }).sort({ timestamp: 1 });
    socket.emit("messageHistory", history);
  });

  socket.on("disconnect", () => {
    for (let username in users) {
      if (users[username] === socket.id) {
        delete users[username];
        break;
      }
    }
    io.emit("onlineUsers", Object.keys(users));
    console.log("🔴 A user disconnected:", socket.id);
  });
});

// === Start the Server ===
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

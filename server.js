const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const mongoose = require("mongoose");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// MongoDB
mongoose
  .connect(process.env.MONGODB_URI || "YOUR_MONGODB_URI")
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB error:", err));

// Message Schema
const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  message: String,
  timestamp: { type: Date, default: Date.now },
});

const Message = mongoose.model("Message", messageSchema);

// Online users map
let users = {}; // username -> socket.id

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Register user
  socket.on("register", (username) => {
    socket.username = username;
    users[username] = socket.id;

    console.log(`${username} is online`);
    io.emit("onlineUsers", Object.keys(users));
  });

  // Private message
  socket.on("privateMessage", async ({ sender, receiver, message }) => {
    const msg = await Message.create({ sender, receiver, message });

    const receiverId = users[receiver];

    // Send to receiver
    if (receiverId) {
      io.to(receiverId).emit("privateMessage", msg);
    }

    // Also send back to sender (sync UI)
    socket.emit("privateMessage", msg);
  });

  // Get chat history
  socket.on("getMessages", async ({ sender, receiver }) => {
    const history = await Message.find({
      $or: [
        { sender, receiver },
        { sender: receiver, receiver: sender },
      ],
    }).sort({ timestamp: 1 });

    socket.emit("messageHistory", history);
  });

  // Disconnect
  socket.on("disconnect", () => {
    if (socket.username) {
      delete users[socket.username];
      console.log(`${socket.username} disconnected`);
    }
    io.emit("onlineUsers", Object.keys(users));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));

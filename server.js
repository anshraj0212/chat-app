const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const mongoose = require("mongoose");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// MongoDB
mongoose.connect(process.env.MONGODB_URI || "YOUR_MONGODB_URI")
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err));

// Message Schema
const MessageSchema = new mongoose.Schema({
  sender:String,
  receiver:String,
  message:String,
  time:{type:Date,default:Date.now}
});
const Message = mongoose.model("Message",MessageSchema);

// Online users
let users = {};

// Socket logic
io.on("connection",(socket)=>{

  socket.on("register", async (username)=>{
    users[username] = socket.id;

    // Send chat history
    const history = await Message.find({
      $or:[
        {sender:username},
        {receiver:username}
      ]
    }).sort({time:1});

    socket.emit("history", history);
  });

  socket.on("sendMessage", async ({sender,receiver,message})=>{

    const msg = await Message.create({sender,receiver,message});

    // Send to receiver if online
    if(users[receiver]){
      io.to(users[receiver]).emit("newMessage", msg);
    }

    // Send back to sender
    socket.emit("newMessage", msg);
  });

  socket.on("disconnect", ()=>{
    for(let u in users){
      if(users[u] === socket.id){
        delete users[u];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT,()=>console.log("Server running on",PORT));

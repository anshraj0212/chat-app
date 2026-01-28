const socket = io();

let user="";

function join(){
  user = document.getElementById("username").value.trim();
  if(!user) return;

  localStorage.setItem("username",user);

  socket.emit("register",user);

  document.getElementById("loginBox").classList.add("hidden");
  document.getElementById("chatBox").classList.remove("hidden");
}

// Auto login
const saved = localStorage.getItem("username");
if(saved){
  user=saved;
  socket.emit("register",user);
  document.getElementById("loginBox").classList.add("hidden");
  document.getElementById("chatBox").classList.remove("hidden");
}

// Load history
socket.on("history", msgs=>{
  document.getElementById("messages").innerHTML="";
  msgs.forEach(m=>add(m));
});

// New message
socket.on("newMessage", add);

function send(){
  const receiver=document.getElementById("receiver").value.trim();
  const message=document.getElementById("msg").value.trim();

  if(!receiver || !message) return;

  socket.emit("sendMessage",{sender:user,receiver,message});
  document.getElementById("msg").value="";
}

function add(m){
  const div=document.createElement("div");
  div.className="msg";
  div.innerText=`${m.sender}: ${m.message}`;
  document.getElementById("messages").appendChild(div);
}

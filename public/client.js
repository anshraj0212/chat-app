const socket = io();

const joinScreen = document.getElementById("joinScreen");
const chatScreen = document.getElementById("chatScreen");

const joinBtn = document.getElementById("joinBtn");
const sendBtn = document.getElementById("sendBtn");
const nextBtn = document.getElementById("nextBtn");

const chatWindow = document.getElementById("chatWindow");

let username = "";

joinBtn.onclick = () => {
  username = document.getElementById("username").value.trim();
  if(username){
    socket.emit("register", username);
    joinScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
  }
};

sendBtn.onclick = sendMessage;
document.getElementById("message").addEventListener("keypress", e=>{
  if(e.key==="Enter") sendMessage();
});

function sendMessage(){
  const msg = document.getElementById("message").value.trim();
  if(msg){
    socket.emit("message", msg);
    addMessage(msg,"you");
    document.getElementById("message").value="";
  }
}

socket.on("message", msg=>{
  addMessage(msg,"stranger");
});

socket.on("connected", text=>{
  addMessage(text,"stranger");
});

socket.on("waiting", text=>{
  addMessage(text,"stranger");
});

nextBtn.onclick = ()=>{
  location.reload();
}

function addMessage(text,type){
  const div=document.createElement("div");
  div.className=`message ${type}`;
  div.innerText=text;
  chatWindow.appendChild(div);
  chatWindow.scrollTop=chatWindow.scrollHeight;
}

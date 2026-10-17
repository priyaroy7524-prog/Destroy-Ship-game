
const socket = io();

Game.setShootHandler(position => {
  socket.emit("shoot", position)
});

const waitingRoom = document.getElementById("waiting-room");
const gameSection = document.getElementById("game");
const disconnectedAlert = document.getElementById("disconnected");
const connectionStatus = document.getElementById("connection-status");
const messagesList = document.getElementById("messages-list");

function addMessage(name, text, isSystem = false) {
  const item = document.createElement("li");

  if (isSystem) {
    item.className = "system-message";
    item.textContent = text;
  } else {
    const author = document.createElement("strong");
    author.textContent = `${name}: `;

    const message = document.createElement("span");
    message.textContent = text;

    item.append(author, message);
  }

  messagesList.appendChild(item);
  messagesList.scrollTop = messagesList.scrollHeight;
}

socket.on("connect", () => {
  disconnectedAlert.hidden = true;
  connectionStatus.textContent = "CONNECTED · SEARCHING";
});

socket.on("waiting", data => {
  waitingRoom.hidden = false;
  gameSection.hidden = true;
  connectionStatus.textContent = "SEARCHING FOR OPPONENT";
  addMessage("SYSTEM", data.message, true);
});

socket.on("matchFound", data => {
  waitingRoom.hidden = true;
  disconnectedAlert.hidden = true;
  gameSection.hidden = false;

  document.getElementById("game-number").textContent =
    `MATCH #${data.gameId}`;

  connectionStatus.textContent = "MATCH IN PROGRESS";

  messagesList.replaceChildren();
  addMessage("SYSTEM", data.message, true);
});

socket.on("gameState", state => {
  waitingRoom.hidden = true;
  gameSection.hidden = false;
  connectionStatus.textContent = "BATTLE ACTIVE";
  
  Game.setState(state);
});

socket.on("shotResult", result => {
  if (result.result === "hit") {
    addMessage("SYSTEM", `Direct hit at ${String.fromCharCode(65 + result.x)}${result.y + 1}!`, true);
  } else {
    addMessage("SYSTEM", `Miss at ${String.fromCharCode(65 + result.x)}${result.y + 1}.`, true);
  }
});

socket.on("gameOver", result => {
  Game.finish();

  const status = document.getElementById("turn-status");
  status.className = `turn-status ${result.winner ? "winner" : "loser"}`;
  status.textContent = result.winner ? "VICTORY!" : "DEFEAT";

  connectionStatus.textContent = "MATCH FINISHED";
  addMessage("SYSTEM", result.message, true);
});

socket.on("opponentLeft", data => {
  Game.finish();
  gameSection.hidden = true;
  waitingRoom.hidden = false;

  waitingRoom.querySelector("h2").textContent = "OPPONENT DISCONNECTED";
  waitingRoom.querySelector("p").textContent =
    `${data.message} Refresh the page to search for another match.`;

  connectionStatus.textContent = "MATCH ENDED";
  addMessage("SYSTEM", data.message, true);
});

socket.on("chatMessage", data => {
  addMessage(data.name, data.text);
});

socket.on("disconnect", () => {
  Game.finish();
  disconnectedAlert.hidden = false;
  connectionStatus.textContent = "SERVER DISCONNECTED";
});

socket.on("connect_error", () => {
  disconnectedAlert.hidden = false;
  connectionStatus.textContent = "CONNECTION FAILED";
});

document.getElementById("message-form").addEventListener("submit", event => {
  event.preventDefault();

  const input = document.getElementById("message");
  const text = input.value.trim();

  if (!text) return;

  socket.emit("chatMessage", text);
  input.value = "";
  input.focus();
});
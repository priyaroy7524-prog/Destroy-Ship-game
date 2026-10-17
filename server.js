
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 8900;
const GRID_SIZE = 10;
const SHIP_SIZES = [5, 4, 3, 3, 2];

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ success: true, message: "Destroy Ship server is running!" });
});

let waitingPlayer = null;
let nextGameId = 1;

const games = new Map();

function createBoard() {
  return {
    ships: [],
    shotsReceived: new Map()
  };
}

function placeShips() {
  const occupied = new Set();
  const ships = [];

  for (const size of SHIP_SIZES) {
    let placed = false;

    for (let attempt = 0; attempt < 1000 && !placed; attempt++) {
      const horizontal = Math.random() < 0.5;
      const x = Math.floor(Math.random() * GRID_SIZE);
      const y = Math.floor(Math.random() * GRID_SIZE);

      if (horizontal && x + size > GRID_SIZE) continue;
      if (!horizontal && y + size > GRID_SIZE) continue;

      const cells = [];

      for (let i = 0; i < size; i++) {
        cells.push({
          x: x + (horizontal ? i : 0),
          y: y + (horizontal ? 0 : i)
        });
      }

      if (cells.some(cell => occupied.has(`${cell.x},${cell.y}`))) {
        continue;
      }

      cells.forEach(cell => occupied.add(`${cell.x},${cell.y}`));

      ships.push({
        size,
        cells,
        hits: new Set()
      });

      placed = true;
    }

    if (!placed) {
      throw new Error("Unable to place ships on the board.");
    }
  }

  return ships;
}

function createPlayer(socket) {
  return {
    id: socket.id,
    socket,
    board: {
      ships: placeShips(),
      shotsReceived: new Map()
    },
    shotsFired: new Map()
  };
}

function allShipsSunk(player) {
  return player.board.ships.every(ship => ship.hits.size >= ship.size);
}

function getShipsLeft(player) {
  return player.board.ships.filter(
    ship => ship.hits.size < ship.size
  ).length;
}

function getPublicBoard(player, showShips) {
  const cells = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const key = `${x},${y}`;
      const shot = player.board.shotsReceived.get(key);
      const hasShip = player.board.ships.some(ship =>
        ship.cells.some(cell => cell.x === x && cell.y === y)
      );

      cells.push({
        x,
        y,
        ship: showShips && hasShip,
        shot: shot || null
      });
    }
  }

  return cells;
}

function sendGameState(game) {
  for (const player of game.players) {
    const opponent = game.players.find(item => item.id !== player.id);

    player.socket.emit("gameState", {
      gameId: game.id,
      yourTurn: game.currentTurn === player.id,
      ownBoard: getPublicBoard(player, true),
      enemyBoard: getEnemyBoard(player),
      yourShipsLeft: getShipsLeft(player),
      enemyShipsLeft: getShipsLeft(opponent)
    });
  }
}

function getEnemyBoard(player) {
  const cells = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const shot = player.shotsFired.get(`${x},${y}`);

      cells.push({
        x,
        y,
        ship: false,
        shot: shot || null
      });
    }
  }

  return cells;
}

function startGame(socketA, socketB) {
  const playerA = createPlayer(socketA);
  const playerB = createPlayer(socketB);
  const gameId = nextGameId++;

  const game = {
    id: gameId,
    players: [playerA, playerB],
    currentTurn: Math.random() < 0.5 ? playerA.id : playerB.id,
    finished: false
  };

  games.set(gameId, game);

  socketA.data.gameId = gameId;
  socketB.data.gameId = gameId;

  socketA.emit("matchFound", {
    gameId,
    playerNumber: 1,
    message: "Opponent found. Battle begins!"
  });

  socketB.emit("matchFound", {
    gameId,
    playerNumber: 2,
    message: "Opponent found. Battle begins!"
  });

  sendGameState(game);
}

function getActiveGame(socket) {
  const gameId = socket.data.gameId;
  if (!gameId) return null;

  const game = games.get(gameId);
  if (!game || game.finished) return null;

  const player = game.players.find(item => item.id === socket.id);
  if (!player) return null;

  return { game, player };
}

io.on("connection", socket => {
  console.log("Player connected:", socket.id);

  socket.emit("waiting", {
    message: "Connected. Searching for an opponent..."
  });

  if (waitingPlayer && waitingPlayer.connected) {
    const opponent = waitingPlayer;
    waitingPlayer = null;
    startGame(opponent, socket);
  } else {
    waitingPlayer = socket;
  }

  socket.on("shoot", position => {
    const active = getActiveGame(socket);
    if (!active) return;

    const { game, player } = active;

    if (game.currentTurn !== socket.id) return;
    if (!position || !Number.isInteger(position.x) || !Number.isInteger(position.y)) return;
    if (
      position.x < 0 || position.x >= GRID_SIZE ||
      position.y < 0 || position.y >= GRID_SIZE
    ) return;

    const opponent = game.players.find(item => item.id !== socket.id);
    const key = `${position.x},${position.y}`;

    if (player.shotsFired.has(key)) return;

    const hitShip = opponent.board.ships.find(ship =>
      ship.cells.some(cell => cell.x === position.x && cell.y === position.y)
    );

    const result = hitShip ? "hit" : "miss";

    player.shotsFired.set(key, result);
    opponent.board.shotsReceived.set(key, result);

    if (hitShip) {
      hitShip.hits.add(key);
    }

    socket.emit("shotResult", {
      x: position.x,
      y: position.y,
      result
    });

    opponent.socket.emit("incomingShot", {
      x: position.x,
      y: position.y,
      result
    });

    if (allShipsSunk(opponent)) {
      game.finished = true;

      for (const participant of game.players) {
        participant.socket.emit("gameOver", {
          winner: participant.id === socket.id,
          message: participant.id === socket.id
            ? "Victory! You destroyed the entire enemy fleet."
            : "Defeat! Your fleet has been destroyed."
        });

        delete participant.socket.data.gameId;
      }

      games.delete(game.id);
      return;
    }

    // A hit gives the same player another shot; a miss changes turns.
    if (result === "miss") {
      game.currentTurn = opponent.id;
    }

    sendGameState(game);
  });

  socket.on("chatMessage", text => {
    const active = getActiveGame(socket);
    if (!active || typeof text !== "string") return;

    const message = text.trim().slice(0, 250);
    if (!message) return;

    active.game.players.forEach(player => {
      player.socket.emit("chatMessage", {
        name: player.id === socket.id ? "YOU" : "OPPONENT",
        text: message
      });
    });
  });

  socket.on("newGame", () => {
    const active = getActiveGame(socket);
    if (!active) return;

    const { game } = active;

    game.players.forEach(player => {
      player.socket.emit("opponentLeft", {
        message: "The match has ended. Refresh to find a new opponent."
      });

      delete player.socket.data.gameId;
    });

    games.delete(game.id);
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);

    if (waitingPlayer && waitingPlayer.id === socket.id) {
      waitingPlayer = null;
    }

    const active = getActiveGame(socket);
    if (active) {
      const { game } = active;

      game.finished = true;

      const opponent = game.players.find(player => player.id !== socket.id);
      if (opponent) {
        opponent.socket.emit("opponentLeft", {
          message: "Your opponent disconnected."
        });

        delete opponent.socket.data.gameId;
      }

      games.delete(game.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Destroy Ship running at http://localhost:${PORT}`);
});
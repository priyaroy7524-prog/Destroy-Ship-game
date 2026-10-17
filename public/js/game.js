const hitAudio = new Audio('/assets/shot.mp3');
hitAudio.volume = 0.7;

let resultShown = false;
// =========================


function showResult(won) {
  if (resultShown) return;

  const modal = document.getElementById("game-result-modal");
  const card = document.getElementById("result-card");

  if (!modal || !card) {
    console.error("Game result modal elements are missing.");
    return;
  }

  resultShown = true;

  card.classList.toggle("is-defeat", !won);

  const resultSymbol = document.getElementById("result-symbol");

resultSymbol.textContent = won ? "\u{1F3C6}" : "\u2715";
resultSymbol.style.display = "inline-block";
resultSymbol.style.visibility = "visible";
resultSymbol.style.opacity = "1";

  document.getElementById("result-eyebrow").textContent =
    won ? "OPERATION SUCCESSFUL" : "MISSION COMPROMISED";

  document.getElementById("result-title").innerHTML =
    won ? "VICTORY<span>!</span>" : "DEFEAT<span>!</span>";

  document.getElementById("result-message").textContent =
    won
      ? "Enemy fleet neutralized. The ocean is yours."
      : "Your fleet has been destroyed. Regroup and fight again.";

  document.getElementById("result-status-text").textContent =
    won ? "SURVIVED" : "DESTROYED";

  document.getElementById("result-restart-btn").onclick = () => {
    window.location.reload();
  };

  document.getElementById("result-close-btn").onclick = () => {
    modal.hidden = true;
  };

  modal.hidden = false;

  if (won) {
    card.classList.add("victory-celebration");
  } else {
    card.classList.remove("victory-celebration");
  }
}


// ===========================

const Game = (() => {
  const SIZE = 10;
  const CELL = 36.1;
  let ownBoard = [];
  let enemyBoard = [];
  let yourTurn = false;
  let gameActive = false;
  let shootHandler = null;

  function drawGrid(canvasId, cells, isEnemy) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const cellW = width / SIZE;
    const cellH = height / SIZE;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#082238";
    ctx.fillRect(0, 0, width, height);

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const cell = cells.find(item => item.x === x && item.y === y);

        ctx.fillStyle = (x + y) % 2 === 0 ? "#0b2d45" : "#0a273d";
        ctx.fillRect(x * cellW, y * cellH, cellW, cellH);

        if (cell && cell.ship) {
          ctx.fillStyle = "#247eaa";
          ctx.fillRect(
            x * cellW + 3,
            y * cellH + 3,
            cellW - 6,
            cellH - 6
          );

          ctx.strokeStyle = "#68eaff";
          ctx.lineWidth = 1;
          ctx.strokeRect(
            x * cellW + 4,
            y * cellH + 4,
            cellW - 8,
            cellH - 8
          );

          ctx.fillStyle = "rgba(225, 251, 255, 0.18)";
          ctx.fillRect(
            x * cellW + 6,
            y * cellH + 6,
            cellW - 12,
            3
          );
        }

        if (cell && cell.shot === "miss") {
          ctx.fillStyle = "#b5d3e4";
          ctx.beginPath();
          ctx.arc(
            x * cellW + cellW / 2,
            y * cellH + cellH / 2,
            Math.max(2.5, cellW * 0.075),
            0,
            Math.PI * 2
          );
          ctx.fill();
        }

        if (cell && cell.shot === "hit") {

          const cx = x * cellW + cellW / 2;
          const cy = y * cellH + cellH / 2;

          ctx.strokeStyle = "#ff536d";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx - 6, cy - 6);
          ctx.lineTo(cx + 6, cy + 6);
          ctx.moveTo(cx + 6, cy - 6);
          ctx.lineTo(cx - 6, cy + 6);
          ctx.stroke();

          ctx.fillStyle = "rgba(255, 83, 109, 0.18)";
          ctx.beginPath();
          ctx.arc(cx, cy, cellW * 0.38, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.strokeStyle = "rgba(85, 190, 224, 0.3)";
        ctx.lineWidth = 0.7;
        ctx.strokeRect(x * cellW, y * cellH, cellW, cellH);
      }
    }

    if (isEnemy && yourTurn && gameActive) {
      canvas.style.cursor = "crosshair";
    } else {
      canvas.style.cursor = "default";
    }
  }

  function render() {
    drawGrid("canvas-grid1", ownBoard, false);
    drawGrid("canvas-grid2", enemyBoard, true);
  }

 
function setState(state) {
  const previousOwnBoard = ownBoard;

  ownBoard = state.ownBoard || [];
  enemyBoard = state.enemyBoard || [];
  yourTurn = Boolean(state.yourTurn);
  gameActive = true;

  // Play sound when the opponent hits your ship
  const opponentHit = ownBoard.some(cell => {
    const previousCell = previousOwnBoard.find(
      oldCell => oldCell.x === cell.x && oldCell.y === cell.y
    );

    return (
      cell.ship &&
      cell.shot === "hit" &&
      previousCell &&
      previousCell.shot !== "hit"
    );
  });

  if (opponentHit) {
    hitAudio.currentTime = 0;
    hitAudio.play().catch(error => {
      console.warn("Could not play hit sound:", error);
    });
  }

  render();

  const turnStatus = document.getElementById("turn-status");
  turnStatus.className = "turn-status";

  if (yourTurn) {
    turnStatus.textContent = "YOUR TURN — FIRE!";
    turnStatus.classList.add("your-turn");
  } else {
    turnStatus.textContent = "ENEMY TURN — STANDBY";
    turnStatus.classList.add("opponent-turn");
  }

  document.getElementById("your-ships-left").textContent =
    state.yourShipsLeft;
  document.getElementById("enemy-ships-left").textContent =
    state.enemyShipsLeft;

  document.getElementById("your-status").textContent =
    state.yourShipsLeft > 0 ? "OPERATIONAL" : "DESTROYED";
  document.getElementById("enemy-status").textContent =
    state.enemyShipsLeft > 0 ? "IN COMBAT" : "DESTROYED";

  updateFleetHealth();
  if (
  Number(state.enemyShipsLeft) <= 0 &&
  Number(state.yourShipsLeft) > 0
) {
  showResult(true);
} else if (Number(state.yourShipsLeft) <= 0) {
  showResult(false);
}
}

  function updateFleetHealth() {
    const ships = [
      { name: "Carrier", size: 5 },
      { name: "Battleship", size: 4 },
      { name: "Destroyer", size: 3 },
      { name: "Submarine", size: 3 },
      { name: "Patrol Boat", size: 2 }
    ];

    const container = document.getElementById("fleet-health-list");
    container.replaceChildren();

    let remainingHits = ownBoard.reduce((total, cell) => {
      return total + (cell.ship && cell.shot === "hit" ? 1 : 0);
    }, 0);

    ships.forEach(ship => {
      const damaged = Math.min(ship.size, remainingHits);
      remainingHits -= damaged;
      const health = Math.round(((ship.size - damaged) / ship.size) * 100);

      const row = document.createElement("div");
      row.className = "health-item";

      const name = document.createElement("span");
      name.textContent = ship.name;

      const track = document.createElement("div");
      track.className = "health-track";

      const bar = document.createElement("i");
      bar.style.width = `${health}%`;
      if (health === 0) bar.style.background = "#ff536d";

      track.appendChild(bar);

      const count = document.createElement("b");
      count.textContent = `${ship.size - damaged}/${ship.size}`;

      row.append(name, track, count);
      container.appendChild(row);
    });
  }

  function init() {
    const canvas = document.getElementById("canvas-grid2");

    canvas.addEventListener("click", event => {
      if (!yourTurn || !gameActive || !shootHandler) return;

      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(((event.clientX - rect.left) / rect.width) * SIZE);
      const y = Math.floor(((event.clientY - rect.top) / rect.height) * SIZE);

      if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;

      const cell = enemyBoard.find(item => item.x === x && item.y === y);
      if (cell && cell.shot) return;

      shootHandler({ x, y });
    });

    document.getElementById("new-game-btn").addEventListener("click", () => {
      window.location.reload();
    });
  }

  function setShootHandler(handler) {
    shootHandler = handler;
  }

  function finish() {
    gameActive = false;
    yourTurn = false;
    render();
  }

  return { init, setState, setShootHandler, finish };
})();

Game.init();
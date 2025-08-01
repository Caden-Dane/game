/*
 * Simple multiplayer game server for the fruit‑eating grid game.
 *
 * This server uses Express to serve static files and Socket.IO to handle
 * real‑time bidirectional communication with connected clients.  The game
 * world consists of a grid of configurable size.  Each player controls a
 * circle that moves around the grid.  Circles grow in size as they eat
 * randomly spawned fruit.  Larger players can eat smaller players when
 * colliding.  Game state is updated on a fixed interval and broadcast to
 * all connected clients.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Configuration constants
const TICK_RATE = 30; // updates per second
const WORLD_WIDTH = 60; // number of grid cells horizontally
const WORLD_HEIGHT = 60; // number of grid cells vertically
const CELL_SIZE = 50; // pixel size of a single grid cell (used by clients only)
const FRUIT_SPAWN_INTERVAL = 3000; // milliseconds between fruit spawns
const MAX_FRUIT_COUNT = 50;

// Game state containers
const players = new Map(); // id => player object
const fruits = new Map(); // id => fruit object

// Utility to generate unique identifiers
function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

// Player class to encapsulate player logic
class Player {
  constructor(id, name) {
    this.id = id;
    this.name = name || `Player-${id.slice(0, 4)}`;
    this.x = Math.random() * WORLD_WIDTH;
    this.y = Math.random() * WORLD_HEIGHT;
    this.radius = 0.8; // measured in grid units
    this.speed = 5 / TICK_RATE; // grid units per tick
    this.dirX = 0;
    this.dirY = 0;
    this.score = 0;
    this.color = Player.randomColor();
    this.lastInput = Date.now();
  }

  static randomColor() {
    // Generate a pastel color for easier distinction
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 60%)`;
  }

  update() {
    // Basic movement integration.  We multiply the direction vector by
    // speed per tick.  Normalise direction to avoid faster diagonal
    // movement.
    const len = Math.hypot(this.dirX, this.dirY);
    if (len > 0) {
      const dx = (this.dirX / len) * this.speed;
      const dy = (this.dirY / len) * this.speed;
      this.x += dx;
      this.y += dy;
      // Clamp to world boundaries considering radius
      this.x = Math.max(this.radius, Math.min(WORLD_WIDTH - this.radius, this.x));
      this.y = Math.max(this.radius, Math.min(WORLD_HEIGHT - this.radius, this.y));
    }
  }
}

// Fruit class representing edible objects on the map
class Fruit {
  constructor(id) {
    this.id = id;
    this.level = Math.floor(Math.random() * 3) + 1; // 1..3
    this.radius = this.level * 0.2; // radius in grid units
    // spawn at a random cell but offset by radius to avoid clipping boundaries
    this.x = Math.random() * (WORLD_WIDTH - 2 * this.radius) + this.radius;
    this.y = Math.random() * (WORLD_HEIGHT - 2 * this.radius) + this.radius;
    // assign colours per level
    const colours = {1: '#6FCF97', 2: '#F2C94C', 3: '#EB5757'};
    this.color = colours[this.level] || '#888888';
  }
}

// Create the HTTP and Socket.IO servers
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // handle CORS when testing locally
  cors: {
    origin: '*',
  },
});

// Serve static files from the public directory
app.use(express.static('public'));

// Handle new connections
io.on('connection', (socket) => {
  console.log('Client connected', socket.id);

  // When a client sends a new player introduction
  socket.on('join', (name) => {
    const id = socket.id;
    const player = new Player(id, name);
    players.set(id, player);
    console.log(`Player joined: ${player.name}`);
    // Send initial state to the client
    socket.emit('init', {
      id,
      world: { width: WORLD_WIDTH, height: WORLD_HEIGHT, cellSize: CELL_SIZE },
    });
  });

  // Handle player input (direction vector)
  socket.on('input', (data) => {
    const player = players.get(socket.id);
    if (player) {
      player.dirX = data.x;
      player.dirY = data.y;
      player.lastInput = Date.now();
    }
  });

  // Remove the player on disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
    players.delete(socket.id);
  });
});

// Periodically spawn fruit
function spawnFruit() {
  if (fruits.size >= MAX_FRUIT_COUNT) return;
  const id = generateId();
  const fruit = new Fruit(id);
  fruits.set(id, fruit);
}

setInterval(spawnFruit, FRUIT_SPAWN_INTERVAL);

// Main game loop
setInterval(() => {
  // Update players
  for (const player of players.values()) {
    player.update();
  }
  // Handle player–fruit collisions
  for (const [fid, fruit] of fruits) {
    for (const player of players.values()) {
      const dist = Math.hypot(player.x - fruit.x, player.y - fruit.y);
      if (dist < player.radius + fruit.radius) {
        // Player eats the fruit
        fruits.delete(fid);
        // Increase player size and score based on fruit level
        player.radius += fruit.level * 0.1;
        player.score += fruit.level;
        break;
      }
    }
  }
  // Handle player–player collisions (bigger eats smaller)
  const playerEntries = Array.from(players.entries());
  for (let i = 0; i < playerEntries.length; i++) {
    const [idA, a] = playerEntries[i];
    for (let j = i + 1; j < playerEntries.length; j++) {
      const [idB, b] = playerEntries[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist < a.radius + b.radius) {
        // Determine the bigger one
        let bigger, smaller, biggerId;
        if (a.radius > b.radius * 1.05) {
          bigger = a;
          smaller = b;
          biggerId = idA;
        } else if (b.radius > a.radius * 1.05) {
          bigger = b;
          smaller = a;
          biggerId = idB;
        } else {
          // If they are similar size, do nothing
          continue;
        }
        // Eat the smaller player
        bigger.radius += smaller.radius * 0.8;
        bigger.score += Math.ceil(smaller.score / 2);
        // Remove smaller player
        players.delete(smaller.id);
        io.to(smaller.id).emit('dead');
        io.sockets.sockets.get(smaller.id)?.disconnect(true);
      }
    }
  }
  // Broadcast the entire game state
  const state = {
    players: Array.from(players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      radius: p.radius,
      color: p.color,
      score: p.score,
    })),
    fruits: Array.from(fruits.values()),
  };
  io.emit('state', state);
}, 1000 / TICK_RATE);

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
# Multiplayer Fruit Growing Game

This repository contains a simple multiplayer browser game where players
control coloured circles on a large grid and grow by eating fruit.  The
game is designed to run entirely in the browser (client side) and uses
Node.js with Socket.IO on the server to synchronise game state between
players.

Players move their circles using the keyboard (WASD/arrow keys) or by
dragging on mobile devices.  Randomly spawned fruit of varying levels
provide points and increase a player's size when eaten.  Larger players
can absorb smaller players on collision.  A leaderboard shows the top
players by score.

## Features

* **Grid‑like map** – The world is a large rectangular grid.  Grid lines
  are rendered so players can orient themselves.  Positions are stored
  in grid units on the server and converted to pixels on the client.
* **Multiplayer** – Real‑time synchronisation is achieved using
  Socket.IO.  Each client sends its direction to the server, which
  updates all player positions and broadcasts the global game state on
  every tick.  This approach is recommended for realtime games
  because it supports bi‑directional communication between the client
  and server【824252629477775†L174-L188】.
* **HTML5 canvas** – The client uses the `<canvas>` element to draw
  players, fruit, and grid lines.  HTML5 and modern JavaScript engines
  provide cross‑platform performance across desktop and mobile browsers
  without requiring additional plugins【27436902493798†L106-L124】.
* **Mobile friendly** – The canvas resizes automatically to fill the
  browser window and supports touch input.  Dragging on the canvas
  sets the movement direction.
* **Customisable world** – The world size, grid cell size, fruit
  spawn rate and other constants can be adjusted in `server.js`.

## Getting Started

### Requirements

* **Node.js** v14 or higher
* **npm** (comes with Node.js)

### Installation

1. Clone this repository or copy its contents into a directory:

```bash
git clone https://github.com/yourusername/multiplayer-fruit-game.git
cd multiplayer-fruit-game
```

2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
npm start
```

4. Open the game in a browser at `http://localhost:8080/`.  Enter a
   name and click **Start** to join the game.

### Deployment

The `public` directory contains all client‑side assets.  You can host
these files on GitHub Pages or any static hosting provider.  The
`server.js` file must run on a Node.js server because it uses
Socket.IO.  To deploy the backend, you can use services such as
Heroku, Fly.io, Railway, or a VPS.  Update the client’s connection
URL (in `game.js`) to point to the hosted server if it is not on the
same origin.

## Game Mechanics

* **Movement** – Press arrow keys or W/A/S/D to move.  On touch
  devices, drag anywhere on the screen to choose a direction.  The
  server normalises input so diagonal movement isn’t faster.
* **Fruit** – Fruit spawn at random positions.  Each fruit has a
  `level` (1–3) determining its size and colour.  Eating fruit adds
  points to your score and increases your radius.
* **Player collisions** – When two players collide, the larger one
  absorbs the smaller if its radius is at least 5% bigger.  The
  absorbed player is removed from the game, and half of their score
  transfers to the victor.
* **Leaderboard** – The top players and their scores are displayed in
  the UI.  Your own entry is highlighted in bold.

## Customisation

Game constants such as world size (`WORLD_WIDTH`, `WORLD_HEIGHT`),
fruit spawn interval (`FRUIT_SPAWN_INTERVAL`), and maximum fruit count
(`MAX_FRUIT_COUNT`) are defined at the top of `server.js`.  Feel free
to adjust these values to tailor the experience.

## Limitations and Future Work

This project is meant as a learning example and does not include
advanced features such as accounts, persistent scores, or lag
compensation.  In a production environment you might add:

* **Authentication and rooms** – Let players create or join private
  rooms instead of sharing a single global lobby.
* **Spectator mode** – Allow removed players to watch the ongoing game.
* **Optimised rendering** – Only redraw the visible portion of the
  world for improved performance on mobile.
* **Deployment automation** – Use GitHub Actions or other CI/CD to
  automatically deploy the frontend to GitHub Pages and the backend to
  a cloud provider.

Have fun eating fruit and growing your blob!
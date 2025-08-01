# Single‑Player Fruit Growing Game

This directory contains a simplified, single‑player version of the
fruit‑eating grid game.  Unlike the multiplayer variant, this game
runs entirely in the browser without any backend.  You can host it
directly on GitHub Pages or any static website service.

## How It Works

* **Grid‑based world** – A large rectangular grid provides the play
  area.  The player moves smoothly between cells but can use the
  grid lines to orient themselves.
* **Fruit with levels** – Fruit spawn at random positions on the
  map.  Each fruit has a level (1–3) that determines its size and
  colour.  Eating fruit increases your blob’s radius and adds points
  to your score.
* **Growing player** – Your circle grows gradually as you eat more
  fruit.  There are no other players in this mode.
* **Touch and keyboard controls** – Use the arrow keys or W/A/S/D on
  desktop, or drag your finger on mobile, to control the direction.

Modern browsers allow games to be created using just HTML5 and
JavaScript.  The canvas element provides a drawing surface, and
JavaScript engines deliver sufficient performance across desktop and
mobile devices【27436902493798†L106-L124】.  Since there is no backend,
all state (player position, fruit, score) is maintained locally in the
client.

## Running the Game

1. Copy the contents of this `singleplayer-fruit-game` folder to the
   root of a GitHub Pages branch or any static hosting service.
2. Navigate to the hosted `index.html` in your browser.
3. Enter your name and press **Start** to begin playing.  Your
   current score is displayed at the top left.  Eat fruit to grow and
   see how large you can get!

There is no need to install Node.js or run a server for this version;
everything is contained within the HTML, CSS and JavaScript files.

## Customisation

Game parameters such as the world size, fruit spawn rate, and maximum
fruit count are defined at the top of `game.js`.  You can tweak these
values to change the difficulty or pacing.  Additional features such
as obstacles, power‑ups or multiple levels could be implemented using
the same patterns.
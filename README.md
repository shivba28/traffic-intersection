# Traffic Intersection Simulation

Four-way intersection simulation: vanilla JS, Canvas, and Vite for local development.

## Running it

```bash
npm install && npm run dev
```

## Architecture (preview)

The simulation loop lives in `src/main.js`. `simulation.js` will own mutable state; `renderer.js` reads that state and must not mutate it. Collision safety is structural (phases and lane queues), not physics-based.

## File map

| File | Role |
|------|------|
| `src/main.js` | Entry, rAF loop, pause/delta handling |
| `src/constants.js` | All numeric configuration |
| `src/geometry.js` | Lane layout, waypoints, static drawing helpers |
| `src/simulation.js` | Mutable simulation state |
| `src/trafficController.js` | Phase table and lights (stub in early steps) |
| `src/carManager.js` | Movement + `canEnterIntersection()` |
| `src/sensorSystem.js` | Queue-based demand |
| `src/renderer.js` | DPR-aware dual canvas, drawing |
| `src/utils.js` | Seeded RNG |

## Current step

Steps 1–2: Vite scaffold, constants, DPR-aware background/foreground canvases, static intersection art.

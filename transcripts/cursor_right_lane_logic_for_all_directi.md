# Right lane logic for all directions
_Exported on 5/15/2026 at 16:05:35 PDT from Cursor (3.3.22)_

---

**User**

Straight lanes were warping because they shared the right-turn path blend and were pulled onto the crossing curve while still on the inbound leg—often before the stop line, so they snapped sideways or forward onto the path.

Changes (straight only):

No path blending — Blend-on-crossing applies only to laneType === 'right'. Straight cars lock to the path immediately once they’re on it.

Inbound leg first — While in crossing but still before the stop line, straight cars keep moving on the lane centerline (same as normal approach). They only follow the intersection path after they reach the line.

Could you reimplement this for straight lanes only

---

**Cursor**

Checking the current implementation and restoring straight-lane-only behavior.


Reimplementing straight-lane-only path behavior: no blending on straight lanes, and inbound centerline movement until the stop line.


Reimplemented the straight-lane-only crossing behavior in `carManager.js`.

### Straight only — no path blend
- `usesPathBlendOnCrossing` is true only when `laneType === 'right'`.
- Straight cars always get `pathBlendFactor === 1` in `applyPathPosition`, so they snap to the path with no lateral pull from the right-turn blend.

### Straight only — inbound leg until stop line
- `usesStraightInboundCenterline` is true only when `laneType === 'straight'`.
- While `crossing` and still before the stop line (`distCenterToStop > STOP_SETTLE_EPSILON`), `advanceStraightInboundCenterline` runs `moveAlongApproach` on the lane centerline (same as approach), respects platoon gap, and only syncs `pathT` for bookkeeping.
- After the stop line, `advanceCrossingPlatoon` follows the intersection path normally via `applyPathPosition`.

### Entry readiness
- Straight cars can enter crossing when they reach the stop line on the centerline (no path-distance alignment check).
- Left/right still require alignment with the path before `beginCrossing`.

Right turns keep the gradual blend onto the curve; left turns are unchanged. Build succeeds.
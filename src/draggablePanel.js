/**
 * Drag a floating panel within the viewport rectangle of a bounds element (#canvas-container).
 * Panel must use `position: fixed`; coordinates are viewport pixels (`left` / `top`).
 * @param {HTMLElement} panel
 * @param {HTMLElement} handle
 * @param {HTMLElement} boundsEl
 * @param {{ onUserCommittedDrag?: () => void }} [opts]
 */
export function initDraggablePanel(panel, handle, boundsEl, opts = undefined) {
  const onUserCommittedDrag = opts?.onUserCommittedDrag;

  /** Pixels moved from pointer-down before we treat the gesture as repositioning vs. clicking. */
  const DRAG_SLOP_PX = 4;

  let dragging = false;
  /** True once the pointer moves past slop during the active drag (for optional callbacks). */
  let draggedPastSlop = false;
  /** @type {number | null} */
  let ptrId = null;
  let originClientX = 0;
  let originClientY = 0;
  let baseLeft = 0;
  let baseTop = 0;

  /**
   * @param {number} leftViewport
   * @param {number} topViewport
   */
  function clampPos(leftViewport, topViewport) {
    const pad = 8;
    const br = boundsEl.getBoundingClientRect();
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    const minL = br.left + pad;
    const minT = br.top + pad;
    const maxL = br.right - pw - pad;
    const maxT = br.bottom - ph - pad;
    return {
      left: Math.min(maxL, Math.max(minL, leftViewport)),
      top: Math.min(maxT, Math.max(minT, topViewport)),
    };
  }

  /**
   * @param {number} leftViewport
   * @param {number} topViewport
   */
  function applyPosition(leftViewport, topViewport) {
    const c = clampPos(leftViewport, topViewport);
    panel.style.left = `${Math.round(c.left)}px`;
    panel.style.top = `${Math.round(c.top)}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const target = e.target;
    if (target instanceof Element && target.closest('button, input, select, textarea')) return;

    dragging = true;
    draggedPastSlop = false;
    ptrId = e.pointerId;
    handle.setPointerCapture(e.pointerId);

    const pr = panel.getBoundingClientRect();
    originClientX = e.clientX;
    originClientY = e.clientY;
    baseLeft = pr.left;
    baseTop = pr.top;

    e.preventDefault();
    handle.style.cursor = 'grabbing';
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== ptrId) return;
    if (
      !draggedPastSlop &&
      Math.hypot(e.clientX - originClientX, e.clientY - originClientY) > DRAG_SLOP_PX
    ) {
      draggedPastSlop = true;
    }
    const left = baseLeft + (e.clientX - originClientX);
    const top = baseTop + (e.clientY - originClientY);
    applyPosition(left, top);
    e.preventDefault();
  });

  function endDrag(e) {
    if (!dragging || e.pointerId !== ptrId) return;
    dragging = false;
    ptrId = null;
    if (draggedPastSlop && onUserCommittedDrag) onUserCommittedDrag();
    draggedPastSlop = false;
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    handle.style.cursor = '';
  }

  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', () => {
    const pr = panel.getBoundingClientRect();
    applyPosition(pr.left, pr.top);
  });
}

/**
 * Drag a floating panel within a bounding container.
 * @param {HTMLElement} panel
 * @param {HTMLElement} handle
 * @param {HTMLElement} boundsEl
 */
export function initDraggablePanel(panel, handle, boundsEl) {
  let dragging = false;
  /** @type {number | null} */
  let ptrId = null;
  let originClientX = 0;
  let originClientY = 0;
  let baseLeft = 0;
  let baseTop = 0;

  function clampPos(left, top) {
    const pad = 8;
    const bw = boundsEl.clientWidth;
    const bh = boundsEl.clientHeight;
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    const maxL = Math.max(pad, bw - pw - pad);
    const maxT = Math.max(pad, bh - ph - pad);
    return {
      left: Math.min(maxL, Math.max(pad, left)),
      top: Math.min(maxT, Math.max(pad, top)),
    };
  }

  function applyPosition(left, top) {
    const c = clampPos(left, top);
    panel.style.left = `${c.left}px`;
    panel.style.top = `${c.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const target = e.target;
    if (target instanceof Element && target.closest('button, input, select, textarea')) return;

    dragging = true;
    ptrId = e.pointerId;
    handle.setPointerCapture(e.pointerId);

    const br = boundsEl.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    originClientX = e.clientX;
    originClientY = e.clientY;
    baseLeft = pr.left - br.left + boundsEl.scrollLeft;
    baseTop = pr.top - br.top + boundsEl.scrollTop;

    e.preventDefault();
    handle.style.cursor = 'grabbing';
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== ptrId) return;
    const left = baseLeft + (e.clientX - originClientX);
    const top = baseTop + (e.clientY - originClientY);
    applyPosition(left, top);
    e.preventDefault();
  });

  function endDrag(e) {
    if (!dragging || e.pointerId !== ptrId) return;
    dragging = false;
    ptrId = null;
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
    const br = boundsEl.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    const left = pr.left - br.left + boundsEl.scrollLeft;
    const top = pr.top - br.top + boundsEl.scrollTop;
    applyPosition(left, top);
  });
}

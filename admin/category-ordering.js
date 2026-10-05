// Keep the rendered order as a preview until a completed drop publishes it.
export function setupCategoryOrdering(list, isBusy, save) {
  if (!document.getElementById('staff-category-order-message')) {
    const help = document.createElement('p');
    help.className = 'category-order-help';
    help.textContent = 'Drag to reorder. Saves automatically. Keyboard: Alt + ↑ / ↓.';
    const status = document.createElement('p');
    status.id = 'staff-category-order-message'; status.className = 'account-message'; status.setAttribute('role', 'status');
    list.before(help, status);
  }
  const rows = [...list.children];
  const order = () => [...list.children].map(row => row.dataset.slug);
  let dragged = null;
  function preview(target, after) {
    if (!dragged || target === dragged) return;
    list.insertBefore(dragged, after ? target.nextSibling : target);
  }
  function reset() {dragged?.classList.remove('category-dragging'); dragged = null;}
  for (const row of rows) {
    row.draggable = !isBusy();
    row.title = 'Drag to reorder; Alt + Up or Down to move';
    const handle = document.createElement('span'); handle.className = 'category-drag-handle'; handle.textContent = '⠿'; handle.setAttribute('aria-hidden', 'true');
    row.prepend(handle);
    row.querySelector('img').draggable = false;
    row.addEventListener('keydown', event => {
      if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || isBusy()) return;
      event.preventDefault();
      const next = order(), index = next.indexOf(row.dataset.slug), to = index + (event.key === 'ArrowUp' ? -1 : 1);
      if (to < 0 || to >= next.length) return;
      [next[index], next[to]] = [next[to], next[index]];
      save(next, row.dataset.slug);
    });
    row.addEventListener('dragstart', event => {
      if (isBusy()) {event.preventDefault(); return;}
      dragged = row; row.classList.add('category-dragging');
      event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', row.dataset.slug);
    });
    row.addEventListener('dragover', event => {
      if (!dragged) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect(); preview(row, event.clientY > rect.top + rect.height / 2);
    });
    row.addEventListener('drop', event => {
      if (!dragged) return;
      event.preventDefault(); const slug = dragged.dataset.slug, next = order(); reset(); save(next, slug);
    });
    row.addEventListener('dragend', () => {if (dragged) {reset(); list.replaceChildren(...rows);}});
    // Pointer capture keeps the handle usable on touch screens without blocking page scrolling elsewhere.
    handle.addEventListener('pointerdown', event => {
      if (isBusy() || event.button !== 0) return;
      event.preventDefault(); dragged = row; row.classList.add('category-dragging'); handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      if (event.clientY < 70) window.scrollBy(0, -18);
      else if (event.clientY > innerHeight - 70) window.scrollBy(0, 18);
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('#staff-categories > button');
      if (target) {
        const rect = target.getBoundingClientRect(); preview(target, event.clientY > rect.top + rect.height / 2);
        // Moving the captured element in the DOM can release its pointer capture.
        handle.setPointerCapture(event.pointerId);
      }
    });
    handle.addEventListener('pointerup', event => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      handle.releasePointerCapture(event.pointerId); const next = order(); reset(); save(next, row.dataset.slug);
    });
    handle.addEventListener('pointercancel', () => {reset(); list.replaceChildren(...rows);});
    handle.addEventListener('click', event => event.stopPropagation());
  }
}

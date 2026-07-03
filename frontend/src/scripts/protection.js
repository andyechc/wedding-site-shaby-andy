document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('[data-protected]')) {
      e.preventDefault();
    }
  });

  document.addEventListener('dragstart', (e) => {
    if (e.target.closest('[data-protected]')) {
      e.preventDefault();
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'u')) {
      if (e.target.closest('[data-protected]')) {
        e.preventDefault();
      }
    }
  });
});

function mount(root) {
  root.innerHTML =
    '<main style="font-family: system-ui, sans-serif; padding: 2rem;">' +
    '<h1>Bellows Generator</h1>' +
    '<p>Parametric camera bellows generator — scaffold live. Controls coming soon.</p>' +
    '</main>';
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('#app');
  if (root) {
    mount(root);
  }
}

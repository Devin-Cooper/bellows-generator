import "./style.css";
import { initApp } from './ui/state.js';

if (typeof document !== 'undefined') {
  const root = document.querySelector('#app');
  if (root) {
    initApp(root);
  }
}

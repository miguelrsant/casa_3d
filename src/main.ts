import './styles/tokens.css';
import './styles/ui.css';
import { startApp } from './app';

startApp().catch((err) => {
  console.error(err);
  const label = document.getElementById('loader-label');
  if (label) label.textContent = 'ERRO AO CARREGAR A CENA';
});

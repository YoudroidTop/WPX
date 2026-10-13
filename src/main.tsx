import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import DesktopHost from './components/DesktopHost';
import './styles.css';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DesktopHost>
      <App />
    </DesktopHost>
  </StrictMode>,
);

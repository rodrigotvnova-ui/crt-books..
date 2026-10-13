import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {registerCrtServiceWorker} from './hooks/usePWAInstall.ts';
import './index.css';

registerCrtServiceWorker();

createRoot(document.getElementById('root')!).render(<App />);

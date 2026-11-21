import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initPwaInstall} from './lib/pwaInstall';

initPwaInstall();

createRoot(document.getElementById('root')!).render(<App />);

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initPwaInstall} from './lib/pwaInstall';
import {initRegistrationStatusStore} from './lib/registrationStatusStore';

initPwaInstall();
initRegistrationStatusStore();

createRoot(document.getElementById('root')!).render(<App />);

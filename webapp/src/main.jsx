import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { TelegramProvider } from './telegram.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TelegramProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </TelegramProvider>
  </React.StrictMode>
);

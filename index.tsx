import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/app.css';
import App from './App';
import { AppProvider } from './src/context/GlobalAppContext';
import { installSafeFetch } from './src/services/safeFetch';

// Instalar safeFetch como override global ANTES do render
// Resolve TLS issues em WebKitGTK (AppImage no Oracle Linux)
installSafeFetch();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initializeTheme, initializePreferences, usePreferencesStore } from './lib/store';
import './index.css';

// Initialize theme and preferences before rendering
initializeTheme();
initializePreferences();

// Listen for preference changes from main process
window.electronAPI.on('preferences:changed', (prefs: unknown) => {
  usePreferencesStore.getState().loadFromPreferences(prefs as Record<string, unknown>);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

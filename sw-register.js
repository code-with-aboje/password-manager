// sw-register.js - include this near the end of your index.html or entry JS
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/service-worker.js');
      console.log('ServiceWorker registered:', reg);

      // Optional: check for updates and notify user
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // A new SW is installed and waiting -> notify user to refresh
              // You can dispatch a custom event or show a toast asking user to reload
              console.log('New content available; please refresh.');
            } else {
              console.log('Content cached for offline use.');
            }
          }
        });
      });

      // Optional helper to activate newly installed SW immediately
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('Controller changed (new SW took control).');
      });

    } catch (err) {
      console.error('ServiceWorker registration failed:', err);
    }
  });
}
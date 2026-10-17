import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const server = await createServer({ configFile: false, plugins: [react(), tailwindcss()], server: {host: '127.0.0.1', port: 5174, strictPort: true} });
await server.listen();
console.log('Campaign UI preview (sample data): http://127.0.0.1:5174/tests/Fixtures/campaign-preview.html');

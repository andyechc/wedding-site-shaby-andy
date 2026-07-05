import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel';

export default defineConfig({
  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  output: 'server',
  adapter: vercel(),
  site: 'https://shaby-and-andy-wedding.vercel.app',
  env: {
    PUBLIC_WORKER_ORIGIN: import.meta.env.PROD ? undefined : 'http://localhost:8080'
  }
});

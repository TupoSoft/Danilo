import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig as definisiKonfiguraciju } from 'vite'

export default definisiKonfiguraciju({ plugins: [cloudflare()] })

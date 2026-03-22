import { createRequire } from 'node:module'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const require = createRequire(import.meta.url)
const { version } = require('./package.json')
const buildId = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local'

export default defineConfig({
    define: {
        __APP_BUILD__: JSON.stringify(buildId),
        __APP_VERSION__: JSON.stringify(version)
    },
    plugins: [
        VitePWA({
            injectRegister: false,
            registerType: 'prompt',
            includeAssets: ['icon-192.png', 'icon-512.png'],
            workbox: {
                cleanupOutdatedCaches: true
            },
            manifest: {
                name: 'OneList - Productivity Editor',
                short_name: 'OneList',
                description: 'A never-ending productivity text file',
                theme_color: '#e9d4ab',
                background_color: '#f8f2e7',
                display: 'standalone',
                orientation: 'portrait',
                start_url: '/',
                scope: '/',
                id: '/',
                icons: [
                    {
                        src: 'icon-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any maskable'
                    },
                    {
                        src: 'icon-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    }
                ]
            }
        })
    ]
})

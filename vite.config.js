import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    server: {
        proxy: {
            '/api': 'http://localhost:3000'
        }
    },
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon-192.svg', 'icon-512.svg'],
            manifest: {
                name: 'OneList - Productivity Editor',
                short_name: 'OneList',
                description: 'A never-ending productivity text file',
                theme_color: '#0a0a0a',
                background_color: '#0a0a0a',
                display: 'standalone',
                orientation: 'portrait',
                start_url: '/',
                scope: '/',
                id: '/',
                icons: [
                    {
                        src: 'icon-192.svg',
                        sizes: '192x192',
                        type: 'image/svg+xml',
                        purpose: 'any maskable'
                    },
                    {
                        src: 'icon-512.svg',
                        sizes: '512x512',
                        type: 'image/svg+xml',
                        purpose: 'any maskable'
                    }
                ]
            }
        })
    ]
})

import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon-192.png', 'icon-512.png'],
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

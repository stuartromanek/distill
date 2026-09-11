// https://nuxt.com/docs/api/configuration/nuxt-config

import basicSsl from '@vitejs/plugin-basic-ssl'

const siteDescription = 'Turn text and images into a playlist on Tidal or Spotify.'
const httpsDev = ['1', 'true', 'yes'].includes((process.env.DST_HTTPS ?? '').toLowerCase())

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: [
    '~/assets/css/webtui.css',
    '~/assets/css/app.css',
  ],
  devServer: httpsDev ? { https: true } : undefined,
  vite: httpsDev ? { plugins: [basicSsl()] } : undefined,
  app: {
    head: {
      title: 'Distill',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'description', content: siteDescription },
        { name: 'application-name', content: 'Distill' },
        { name: 'theme-color', content: '#0b0c0f' },
        { name: 'color-scheme', content: 'dark' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Distill' },
        { property: 'og:title', content: 'Distill' },
        { property: 'og:description', content: siteDescription },
        { property: 'og:locale', content: 'en_US' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: 'Distill' },
        { name: 'twitter:description', content: siteDescription },
      ],
    },
  },
})

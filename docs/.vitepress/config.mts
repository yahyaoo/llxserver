import { defineConfig } from 'vitepress'

export default defineConfig({
  base: "/llxserver/",
  head: [
    ['link', { rel: 'icon', href: '/llxserver/icon.svg' }]
  ],
  themeConfig: {
    logo: '/icon.svg',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/yahyaoo/llxserver' }
    ],
    search: {
      provider: 'local'
    }
  },
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      title: "洛洛雪音乐",
      description: "洛洛雪音乐客户端、音乐同步与多平台服务",
      themeConfig: {
        nav: [
          { text: '首页', link: '/' },
          { text: '用户指南', link: '/guide/getting-started' },
          { text: '配置指南', link: '/guide/configuration' },
          { text: 'API 文档', link: '/api/reference' },
          { text: '关于', link: '/about' }
        ],
        sidebar: [
          {
            text: '用户指南',
            items: [
              { text: '快速开始', link: '/guide/getting-started' }
            ]
          },
          {
            text: '核心功能',
            items: [
              { text: '同步服务器设置', link: '/guide/sync-server' },
              { text: 'Web 播放器指南', link: '/guide/web-player' }
            ]
          },
          {
            text: '配置指南',
            items: [
              { text: '配置文件及环境变量', link: '/guide/configuration' }
            ]
          },
          {
            text: 'API 文档',
            items: [
              { text: '服务端 API 参考', link: '/api/reference' }
            ]
          }
        ],
        footer: {
          message: 'Released under the Apache-2.0 License.',
          copyright: 'Copyright © 2026 xcq0607 & Contributors'
        }
      }
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      title: "洛洛雪音乐",
      description: "llxserver web music client and synchronization service",
      themeConfig: {
        nav: [
          { text: 'Home', link: '/en/' },
          { text: 'Usage Guide', link: '/en/guide/getting-started' },
          { text: 'Config Guide', link: '/en/guide/configuration' },
          { text: 'API Docs', link: '/en/api/reference' },
          { text: 'About', link: '/en/about' }
        ],
        sidebar: [
          {
            text: 'Usage Guide',
            items: [
              { text: 'Getting Started', link: '/en/guide/getting-started' }
            ]
          },
          {
            text: 'Core Features',
            items: [
              { text: 'Sync Server Settings', link: '/en/guide/sync-server' },
              { text: 'Web Player Guide', link: '/en/guide/web-player' }
            ]
          },
          {
            text: 'Config Guide',
            items: [
              { text: 'Config & Env Vars', link: '/en/guide/configuration' }
            ]
          },
          {
            text: 'API Docs',
            items: [
              { text: 'Server API Ref', link: '/en/api/reference' }
            ]
          }
        ],
        footer: {
          message: 'Released under the Apache-2.0 License.',
          copyright: 'Copyright © 2026 xcq0607 & Contributors'
        }
      }
    }
  }
})

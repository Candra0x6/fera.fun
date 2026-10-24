import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#080b14',
        panel: 'rgba(13,18,32,0.84)',
        'panel-border': 'rgba(148,163,184,0.18)'
      },
      fontFamily: {
        display: ['Cinzel', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      },
      keyframes: {
        floatUpFade: {
          '0%': { opacity: '0', transform: 'translate(-50%, -10%) scale(0.75)' },
          '20%': { opacity: '1', transform: 'translate(-50%, -60%) scale(1.08)' },
          '100%': { opacity: '0', transform: 'translate(-50%, -170%) scale(0.92)' }
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        'float-up-fade': 'floatUpFade 0.85s cubic-bezier(0.16,1,0.3,1) forwards',
        'float-up-fade-slow': 'floatUpFade 1.3s cubic-bezier(0.16,1,0.3,1) forwards',
        'fade-in': 'fadeIn 0.25s cubic-bezier(0.16,1,0.3,1)'
      }
    }
  }
}

export default config

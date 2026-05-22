import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Background & surfaces — deep ocean, shared with Tanit's aesthetic.
        ink: {
          950: '#020a12',
          900: '#06121f',
          800: '#0c1c2e',
          700: '#13283f',
          600: '#1c3552',
        },
        // Per-agent accent colors. Each color reflects the agent's identity:
        //   lui    — warm gold, the human
        //   tanit  — aqua turquoise + emerald, her sacred crystal palette
        //   break  — burgundy, the pit engineer
        //   forge  — forge green, the builder
        //   gossip — magenta, the social voice
        //   prism  — violet, the API prism
        agent: {
          lui:    '#f5c25b',
          tanit:  '#00e5cc',
          break:  '#b53247',
          forge:  '#7cf28c',
          gossip: '#ff5fa8',
          prism:  '#9f7bff',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular'],
      },
      boxShadow: {
        glow: '0 0 24px 0 rgb(0 229 204 / 0.25)',
      },
    },
  },
  plugins: [],
};

export default config;

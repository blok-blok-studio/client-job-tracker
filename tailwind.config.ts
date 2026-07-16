import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bb: {
          black: '#0A0A0A',
          surface: '#141414',
          elevated: '#1E1E1E',
          border: '#2A2A2A',
          orange: '#FF6B00',
          'orange-light': '#FF8C33',
          muted: '#A0A0A0',
          // 4.6:1 on bb-surface — #666 failed WCAG for the small text it labels
          dim: '#8A8A8A',
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.4)',
        'card-hover': '0 6px 16px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,107,0,0.15)',
        'modal': '0 4px 20px rgba(0,0,0,0.6)',
      },
      keyframes: {
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.3s ease-out both',
        shimmer: 'shimmer 1.8s linear infinite',
      },
    },
  },
  plugins: [],
};
export default config;

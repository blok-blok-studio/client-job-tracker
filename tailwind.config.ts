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
          dim: '#666666',
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
        'modal': '0 4px 20px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
};
export default config;

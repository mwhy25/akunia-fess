import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0708',
        panel: '#140a0c',
        line: '#2a1417',
        red: { DEFAULT: '#e10a1f', deep: '#7a0612' },
        ink: '#f4efe9',
        mute: '#a89a98',
        acid: '#ffe600',
      },
      fontFamily: {
        display: ['Impact', '"Arial Narrow Bold"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        sans: ['"Helvetica Neue"', 'Helvetica', 'Arial', '"Segoe UI"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;

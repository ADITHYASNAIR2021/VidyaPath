/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        saffron: {
          50:  '#FFF5EE',
          100: '#FFE8D5',
          200: '#FFCBA8',
          300: '#FFA470',
          400: '#FF7A3D',
          500: '#E8511A',
          600: '#D4410F',
          700: '#B03308',
          800: '#8C280A',
          900: '#72230C',
        },
        navy: {
          50:  '#EEF2FF',
          100: '#D8E0FF',
          200: '#BAC8FF',
          300: '#91A7FF',
          400: '#5C7CFA',
          500: '#3B5BDB',
          600: '#2D3F6B',
          700: '#1A2744',
          800: '#111C35',
          900: '#0A1220',
        },
      },
      fontFamily: {
        fraunces: ['var(--font-fraunces)', 'Georgia', 'serif'],
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      backgroundImage: {
        'warm-gradient': 'linear-gradient(135deg, #FFF5EE 0%, #FDFAF6 50%, #EEF2FF 100%)',
      },
    },
  },
  plugins: [],
};

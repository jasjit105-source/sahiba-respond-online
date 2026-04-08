/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        fb: { DEFAULT: '#1877f2', dark: '#166fe5' },
        scale: '#137333',
        monitor: '#b06000',
        fix: '#c5221f',
        pause: '#5f6368'
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', '-apple-system', 'sans-serif']
      }
    }
  },
  plugins: []
};

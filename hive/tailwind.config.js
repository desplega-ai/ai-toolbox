/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          850: '#1a1d23',
          950: '#0d0f12',
        }
      }
    },
  },
  plugins: [],
}


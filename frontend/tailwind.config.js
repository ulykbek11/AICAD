/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: { 
        lime: { 
          DEFAULT: '#BBFC3A', 
          dim: '#9FD82A', 
        }, 
        bg: { 
          0: '#0D0F0D', 
          1: '#131613', 
          2: '#181C18', 
          3: '#1F251F', 
        } 
      }
    },
  },
  plugins: [],
}
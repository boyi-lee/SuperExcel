/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 莫蘭迪灰鼠尾草
        brand: {
          50: "#f4f6f4", 100: "#e6ebe6", 200: "#ccd6cc", 300: "#a9b9a9",
          400: "#84987f", 500: "#6b7f68", 600: "#5D6B5D", 700: "#4a554a",
          800: "#3c453c", 900: "#333a33",
        },
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        court: {
          orange: "#ea580c",
          dark: "#1e293b",
        },
      },
    },
  },
  plugins: [],
};

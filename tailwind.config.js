/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dashboard indigo (#5B6EE8) as a full scale, used instead of Tailwind blue.
        brand: {
          50: '#EEF0FD',
          100: '#DFE3FC',
          200: '#C7CDFB',
          300: '#A5B0F8',
          400: '#7B8CF7',
          500: '#5B6EE8',
          600: '#4B5DD8',
          700: '#3B4DC8',
          800: '#2F3EA3',
          900: '#27347F',
        },
      },
    },
  },
  plugins: [],
};

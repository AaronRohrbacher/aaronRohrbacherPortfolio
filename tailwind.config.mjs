/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './node_modules/@codinix/device-mockup/dist/**/*.js',
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;

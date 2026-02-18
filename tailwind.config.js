/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: [
        './index.html',
        './*.js',
        './ui/**/*.js',
    ],
    theme: {
        extend: {
            fontFamily: { sans: ['Outfit', 'Noto Sans JP', 'sans-serif'] },
            colors: {
                base: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 800: '#1e293b', 900: '#0f172a' },
                brand: { light: '#818cf8', DEFAULT: '#4f46e5', dark: '#3730a3' },
            }
        }
    },
    plugins: [],
}

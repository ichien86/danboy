import type { Config } from 'tailwindcss';

const warna = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        latar: warna('latar'),
        permukaan: warna('permukaan'),
        garis: warna('garis'),
        teks: warna('teks'),
        redup: warna('redup'),
        utama: { DEFAULT: warna('utama'), teks: warna('utama-teks'), lembut: warna('utama-lembut') },
        aman: { DEFAULT: warna('aman'), lembut: warna('aman-lembut') },
        waspada: { DEFAULT: warna('waspada'), lembut: warna('waspada-lembut') },
        bahaya: { DEFAULT: warna('bahaya'), lembut: warna('bahaya-lembut') },
        info: { DEFAULT: warna('info'), lembut: warna('info-lembut') },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;

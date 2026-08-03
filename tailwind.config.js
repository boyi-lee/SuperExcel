/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 品牌色票。跟同系列的其他工具共用同一組，換色請一起換。
        bg: "#131313",
        panel: "#1c1c1c",
        "panel-2": "#232323",
        line: "#2f2f2f",
        ink: "#ededed",
        "ink-2": "#9d9d9d",
        "ink-3": "#8e8e8e",
        acid: "#dcfd50",
        "acid-dim": "#8fa832",
        ok: "#7be495",
        // 提醒與警告。bad 是「這樣賣是虧的」那種紅，warn 是「你少填了東西」那種黃。
        warn: "#f2c94c",
        bad: "#ff7a7a",
      },
      fontFamily: {
        // 🚫 不引入 Google Fonts：那會讓每個訪客的 IP 送到第三方，
        //    跟這個工具「資料不離開你的瀏覽器」的前提互相矛盾。用系統字。
        sans: [
          "Inter",
          "Noto Sans TC",
          "PingFang TC",
          "Microsoft JhengHei",
          "system-ui",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

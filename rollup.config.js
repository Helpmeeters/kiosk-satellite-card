import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/kiosk-satellite-card.ts",
  output: {
    file: "dist/kiosk-satellite-card.js",
    format: "es",
  },
  plugins: [
    typescript({
      tsconfig: "./tsconfig.json",
      compilerOptions: {
        declaration: false,
        declarationMap: false,
        sourceMap: false,
      },
    }),
  ],
};

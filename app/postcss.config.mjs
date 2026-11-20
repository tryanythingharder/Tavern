// 自定义 PostCSS：保留 Next 默认插件，并加深色模式改写（scripts/postcss-dark.cjs）。
// light-dark() 交给浏览器原生处理（此版本 preset-env 不认识它，不会降级）。
const config = {
  plugins: [
    './scripts/postcss-select.cjs',
    './scripts/postcss-dark.cjs',
    'next/dist/compiled/postcss-flexbugs-fixes',
    [
      'next/dist/compiled/postcss-preset-env',
      {
        browsers: ['defaults'],
        autoprefixer: { flexbox: 'no-2009' },
        stage: 3,
        features: { 'custom-properties': false },
      },
    ],
  ],
};
export default config;

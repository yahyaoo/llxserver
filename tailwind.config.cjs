/** 与诊断运行时保持相同主题变量和桌面断点。 */
module.exports = {
  content: ['./client/music/index.html', './client/music/app.js', './client/music/js/**/*.js', './client/music/components/**/*.js', './client/music/views/**/*.js'],
  darkMode: 'class',
  theme: { extend: {
    screens: { md: '1025px', lg: '1280px', xl: '1440px', '2xl': '1536px' },
    colors: { emerald: Object.fromEntries([50,100,200,300,400,500,600,700,800,900,950].map(level => [level, `var(--c-${level})`])) }
  } },
  // 模板以完整字面量切换类名；新增片段拼接必须先审计再有限枚举。
  safelist: []
};

/** 解析期间选择一个样式来源；tw=cdn 仅用于本地运行时诊断。 */
(() => {
    const diagnostic = new URLSearchParams(location.search).get('tw') === 'cdn';
    document.write(diagnostic
        ? '<script src="assets/tailwindcss.js"><\/script><script src="js/tailwind_setup.js"><\/script>'
        : '<link rel="stylesheet" href="css/tailwind.generated.css">');
})();

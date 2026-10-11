/** 顶部和设置页面共用主题选择组件。中国色色值来自 zhongguose.com。 @author jingyh @date 2026-10-10 */
(() => {
    const colors = [
        ['pink', '樱花粉', '#ec4899'], ['emerald', '森之韵', '#10b981'], ['blue', '深海谧', '#3b82f6'],
        ['amber', '暖阳愿', '#f59e0b'], ['violet', '紫微星', '#8b5cf6'], ['rose', '绯红月', '#f43f5e'],
        ['zhulv', '竹绿', '#1ba784'], ['jiqing', '霁青', '#63bbd0'], ['xinghuang', '杏黄', '#f28e16'],
        ['zhuhong', '朱红', '#ed5126'], ['shizhuhong', '石竹红', '#ee4863'],
        ['white', '纯白', '#ffffff'], ['black', '黑色', '#000000'],
    ];
    window.ThemeControls = {
        colors,
        mount(container) {
            container.innerHTML = `<h3>外观设置</h3><div class="appearance-choices">${[['light', 'fa-sun', '明亮'], ['dark', 'fa-moon', '暗黑'], ['pure-white', 'fa-circle', '纯白'], ['pure-black', 'fa-adjust', '纯黑'], ['system', 'fa-desktop', '跟随系统']].map(([mode, icon, title]) => `<button class="appearance-option" data-appearance="${mode}" onclick="setAppearance('${mode}')"><i class="fas ${icon}"></i>${title}</button>`).join('')}</div>
                <h3>主题风格</h3><div class="theme-swatches">${colors.map(([id, name, color]) => `<button class="theme-option" data-theme="${id}" onclick="setTheme('${id}')"><span class="theme-dot" style="background:${color}"></span><span>${name}</span><i class="fas fa-check"></i></button>`).join('')}</div>
                <button class="theme-option custom-theme-option" data-theme="custom" onclick="setTheme('custom')"><i class="fas fa-sliders-h"></i>自定义主题</button>`;
            window.SettingsCards?.apply(container.closest('#view-settings'));
        },
    };
})();

/**
 * 管理主题色与明暗模式；首次访问使用粉色，已保存的用户选择优先。
 * @author yahyaoo
 */

// Available Themes
const THEMES = ['pink', 'emerald', 'blue', 'amber', 'violet', 'rose', 'white', 'black', 'custom', 'zhulv', 'jiqing', 'xinghuang', 'zhuhong', 'shizhuhong'];

// Initialize Theme & Appearance
function initTheme() {
    const savedTheme = localStorage.getItem('lx_theme') || 'pink';
    const savedAppearance = localStorage.getItem('lx_appearance') || 'system';

    setTheme(savedTheme, false);
    setAppearance(savedAppearance, false);
}

// Set Theme (Colors)
function setTheme(themeName, save = true) {
    if (!THEMES.includes(themeName)) return;

    // Apply to Body
    document.documentElement.setAttribute('data-theme', themeName);

    // Save Preference
    if (save) {
        localStorage.setItem('lx_theme', themeName);
        window.MusicExperience?.change({ theme: themeName });
        console.log(`[Theme] Color scheme applied: ${themeName}`);
    }

    // 更新可视化颜色 (如果加载了可视化脚本)
    if (window.musicVisualizer && typeof window.musicVisualizer.applySettings === 'function') {
        window.musicVisualizer.applySettings();
    }

    // Update UI (Checkmarks and Highlights)
    updateThemeSelectionUI(themeName);
}

function setAppearance(mode, save = true) {
    const validModes = ['light', 'dark', 'pure-white', 'pure-black', 'system'];
    if (!validModes.includes(mode)) return;

    // 纯色外观复用现有明暗适配，独立记录模式供背景覆盖与两个入口同步使用。作者：jingyh
    document.documentElement.setAttribute('data-appearance-mode', mode);
    const baseMode = mode === 'pure-white' ? 'light' : mode === 'pure-black' ? 'dark' : mode;
    // Apply to Root
    if (mode === 'system') {
        document.documentElement.removeAttribute('data-appearance');
        // Apply class based on matchMedia
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    } else {
        document.documentElement.setAttribute('data-appearance', baseMode);
        if (baseMode === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    // Save Preference
    if (save) {
        localStorage.setItem('lx_appearance', mode);
        window.MusicExperience?.change({ appearance: mode });
        console.log(`[Theme] Appearance mode applied: ${mode}`);
    }

    // Update UI in settings
    updateAppearanceUI(mode);
}

function updateThemeSelectionUI(activeTheme) {
    const names = { pink: '樱花粉', emerald: '森之韵', blue: '深海谧', amber: '暖阳愿', violet: '紫微星', rose: '绯红月', white: '纯白', black: '黑色' };
    const label = document.getElementById('header-theme-label');
    if (label) label.textContent = window.ThemeControls?.colors.find(item => item[0] === activeTheme)?.[1] || (activeTheme === 'custom' ? '自定义' : names[activeTheme] || names.pink);
    document.querySelectorAll('.theme-option').forEach(btn => {
        const theme = btn.getAttribute('data-theme');
        btn.setAttribute('aria-pressed', String(theme === activeTheme));
        if (theme === activeTheme) {
            btn.setAttribute('data-active', 'true');
        } else {
            btn.setAttribute('data-active', 'false');
        }
    });
}

function updateAppearanceUI(activeMode) {
    document.querySelectorAll('.appearance-option').forEach(btn => {
        const mode = btn.getAttribute('data-appearance');
        btn.setAttribute('data-active', String(mode === activeMode));
        btn.setAttribute('aria-pressed', String(mode === activeMode));
        if (mode === activeMode) {
            btn.classList.add('ring-emerald-500', 'border-emerald-500', 'text-emerald-600');
            btn.classList.remove('t-border-main', 't-text-muted');
        } else {
            btn.classList.remove('ring-emerald-500', 'border-emerald-500', 'text-emerald-600');
            btn.classList.add('t-border-main', 't-text-muted');
        }
    });
}

// Watch for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    const currentAppearance = window.MusicExperience?.value.appearance || localStorage.getItem('lx_appearance') || 'system';
    if (currentAppearance === 'system') {
        if (e.matches) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        console.log(`[Theme] System color scheme changed to ${e.matches ? 'dark' : 'light'}`);
    }
});

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
});

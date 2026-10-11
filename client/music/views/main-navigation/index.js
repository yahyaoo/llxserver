/** 桌面导航收起后保留图标、选中态和提示，不改变手机抽屉状态。 */
function toggleMainNavigation() {
    const sidebar = document.getElementById('main-sidebar');
    const button = document.getElementById('main-navigation-collapse');
    if (!sidebar || !button || window.innerWidth < 1025) return;
    const collapsed = sidebar.classList.toggle('navigation-collapsed');
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', collapsed ? '展开主导航' : '收起主导航');
    button.title = collapsed ? '展开主导航' : '收起主导航';
    button.querySelector('span').textContent = collapsed ? '展开' : '收起';
}


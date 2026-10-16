/** 手机底部封面缓慢旋转、暂停保留角度及继续播放回归。 @author jingyh */
async page => {
    const results = [];
    const check = (ok, name) => { if (!ok) throw new Error(name); results.push(name); };
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => { localStorage.setItem('lx_agreement_accepted', 'true'); localStorage.removeItem('lx_playback_state'); });
    await page.reload();
    await page.waitForFunction(() => window.MobileShell);
    await page.evaluate(() => MobileShell.open('mobile-library'));
    const cover = page.locator('#mobile-nav-cover');
    const state = () => cover.evaluate(n => { const s = getComputedStyle(n); return { transform: s.transform, duration: s.animationDuration, play: s.animationPlayState, name: s.animationName }; });
    let url;
    try {
        const initial = await state();
        check(initial.name === 'mobile-cover-spin' && initial.play === 'paused', '未播放时唱片保持静止');
        check(parseFloat(initial.duration) >= 20 && parseFloat(initial.duration) <= 30, '唱片速度缓慢，约 24 秒一圈');
        url = await page.evaluate(async () => {
            const rate = 8000, length = rate * 8, buffer = new ArrayBuffer(44 + length * 2), data = new DataView(buffer);
            const text = (offset, value) => [...value].forEach((char, index) => data.setUint8(offset + index, char.charCodeAt(0)));
            text(0, 'RIFF'); data.setUint32(4, 36 + length * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
            data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
            data.setUint32(24, rate, true); data.setUint32(28, rate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true);
            text(36, 'data'); data.setUint32(40, length * 2, true);
            const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
            const audio = document.getElementById('audio-player'); audio.src = url; audio.muted = true; await audio.play(); return url;
        });
        const start = await state(); await page.waitForTimeout(600); const rotating = await state();
        check(rotating.play === 'running' && rotating.transform !== start.transform, '真实播放事件驱动封面持续旋转');
        check(await page.locator('.mobile-playing-indicator').isVisible(), '播放状态圆点仍正常显示');
        await page.evaluate(() => document.getElementById('audio-player').pause());
        await page.waitForTimeout(80); const paused = await state(); await page.waitForTimeout(350); const stopped = await state();
        check(stopped.play === 'paused' && stopped.transform === paused.transform, '暂停保持当前角度，不复位');
        await page.evaluate(() => document.getElementById('audio-player').play()); await page.waitForTimeout(300);
        const resumed = await state(); check(resumed.play === 'running' && resumed.transform !== stopped.transform, '恢复播放从暂停角度继续旋转');
        check(await page.locator('.mobile-now-playing').evaluate(n => getComputedStyle(n).transform === 'none'), '外框与圆点不随封面旋转');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        check((await state()).name === 'none', '系统减少动态效果时停止旋转');
        return { passed: results.length, results };
    } finally {
        await page.evaluate(url => { document.getElementById('audio-player').pause(); if (url) URL.revokeObjectURL(url); localStorage.removeItem('lx_playback_state'); }, url);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
}

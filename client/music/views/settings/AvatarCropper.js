/** 头像裁剪：拖动、缩放及键盘定位，确认后输出正方形 PNG。 */
(() => {
    const SIZE = 320;
    /** 根据图片尺寸和缩放限制偏移，确保裁剪区域始终被图片覆盖。 */
    const bounds = (width, height, zoom, x, y) => {
        const scale = Math.max(SIZE / width, SIZE / height) * zoom;
        const drawnWidth = width * scale, drawnHeight = height * scale;
        return { scale, x: Math.min(0, Math.max(SIZE - drawnWidth, x)), y: Math.min(0, Math.max(SIZE - drawnHeight, y)) };
    };
    window.AvatarCropper = {
        bounds,
        /** 返回裁剪图；取消返回空值，不发起上传。 */
        async edit(file) {
            const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
            const dialog = document.createElement('dialog');
            dialog.className = 'avatar-crop-dialog';
            dialog.setAttribute('aria-labelledby', 'avatar-crop-title');
            dialog.innerHTML = '<h2 id="avatar-crop-title">调整头像</h2><p>拖动图片调整位置，或使用方向键微调。</p><div class="avatar-crop-stage"><canvas width="320" height="320" tabindex="0" aria-label="头像裁剪区域，使用方向键移动图片"></canvas></div><label><i class="fas fa-search-plus" aria-hidden="true"></i>缩放<input type="range" min="1" max="4" step="0.01" value="1" aria-label="头像缩放"></label><p role="status"></p><div class="avatar-crop-actions"><button type="button" class="settings-action avatar-crop-cancel">取消</button><button type="button" class="settings-action avatar-crop-save">保存头像</button></div>';
            document.body.append(dialog);
            const canvas = dialog.querySelector('canvas'), context = canvas.getContext('2d'), slider = dialog.querySelector('input');
            let state = bounds(bitmap.width, bitmap.height, 1, -Infinity, -Infinity);
            state = bounds(bitmap.width, bitmap.height, 1, (SIZE - bitmap.width * state.scale) / 2, (SIZE - bitmap.height * state.scale) / 2);
            let zoom = 1, drag;
            const render = () => { context.clearRect(0, 0, SIZE, SIZE); context.drawImage(bitmap, state.x, state.y, bitmap.width * state.scale, bitmap.height * state.scale); };
            canvas.addEventListener('pointerdown', event => { drag = { x: event.clientX, y: event.clientY, left: state.x, top: state.y }; canvas.setPointerCapture(event.pointerId); });
            canvas.addEventListener('pointermove', event => {
                if (!drag) return;
                const factor = SIZE / canvas.getBoundingClientRect().width;
                state = bounds(bitmap.width, bitmap.height, zoom, drag.left + (event.clientX - drag.x) * factor, drag.top + (event.clientY - drag.y) * factor); render();
            });
            const endDrag = () => { drag = undefined; };
            canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
            canvas.addEventListener('keydown', event => {
                const movement = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
                if (!movement) return;
                event.preventDefault(); const step = event.shiftKey ? 20 : 5;
                state = bounds(bitmap.width, bitmap.height, zoom, state.x + movement[0] * step, state.y + movement[1] * step); render();
            });
            slider.addEventListener('input', () => {
                const next = Number(slider.value), ratio = next / zoom;
                state = bounds(bitmap.width, bitmap.height, next, SIZE / 2 + (state.x - SIZE / 2) * ratio, SIZE / 2 + (state.y - SIZE / 2) * ratio);
                zoom = next; render();
            });
            render(); dialog.showModal();
            return new Promise(resolve => {
                const finish = result => { dialog.close(); dialog.remove(); bitmap.close(); resolve(result); };
                dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
                dialog.querySelector('.avatar-crop-cancel').onclick = () => finish(null);
                dialog.querySelector('.avatar-crop-save').onclick = () => {
                    canvas.toBlob(blob => { if (blob) finish(blob); else dialog.querySelector('[role="status"]').textContent = '图片处理失败，请重试'; }, 'image/png');
                };
            });
        },
    };
})();

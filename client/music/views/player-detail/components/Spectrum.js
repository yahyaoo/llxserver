/** 播放页底部频谱绘制，复用原 Wave 分析器及动画调度。 @author jingyh @date 2026-10-10 */
(function () {
    class PlayerDetailSpectrum {
        constructor(options) { this.color = options.fillColor; this.gap = options.gap ?? 2; }

        /** 将原分析器提供的频率数据绘制成铺满画布底部的柱形。 */
        draw(data, context) {
            const { width, height } = context.canvas;
            if (!width || !height || !data.length) return;
            const count = Math.min(120, data.length, Math.max(1, Math.floor(width / 8)));
            const step = width / count;
            context.fillStyle = this.color;
            for (let index = 0; index < count; index++) {
                const frequency = Math.floor(index / count * data.length * 0.65);
                const barHeight = data[frequency] / 255 * height;
                context.fillRect(index * step, height - barHeight, Math.max(1, step - this.gap), barHeight);
            }
        }
    }
    window.PlayerDetailSpectrum = PlayerDetailSpectrum;
})();

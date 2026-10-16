/**
 * System Log Viewer
 * Captures console output for display in Settings > Logs
 */

(function () {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    // Store logs in memory
    window.systemLogs = [];
    const MAX_LOGS = 1000;

    const MAX_MESSAGE = 4000, MAX_NODES = 300, MAX_DEPTH = 4, MAX_ITEMS = 30;

    /** 有界预览：只遍历有限节点，避免 console.log 大对象（歌单、列表响应）时整体序列化阻塞主线程。 */
    function preview(value, budget, depth, seen) {
        if (typeof value === 'function') return '[Function]';
        if (typeof value === 'bigint') return value + 'n';
        if (typeof value === 'string') return value.length > 300 ? value.slice(0, 300) + '…' : value;
        if (value === null || typeof value !== 'object') return value;
        if (seen.has(value)) return '[Circular]';
        if (depth >= MAX_DEPTH || budget.nodes <= 0) return Array.isArray(value) ? '[Array(' + value.length + ')]' : '[Object]';
        seen.add(value);
        let result;
        if (Array.isArray(value)) {
            result = [];
            for (let index = 0; index < value.length && index < MAX_ITEMS && budget.nodes > 0; index++) { budget.nodes--; result.push(preview(value[index], budget, depth + 1, seen)); }
            if (value.length > result.length) result.push('…共 ' + value.length + ' 项');
        } else {
            result = {};
            let count = 0;
            for (const key in value) {
                if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
                if (count++ >= MAX_ITEMS || budget.nodes <= 0) { result['…'] = '已省略其余字段'; break; }
                budget.nodes--;
                try { result[key] = preview(value[key], budget, depth + 1, seen); } catch { result[key] = '[Unreadable]'; }
            }
        }
        seen.delete(value);
        return result;
    }

    function captureLog(type, args) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString() + '.' + String(now.getMilliseconds()).padStart(3, '0');

        let message = '';
        try {
            message = args.map(arg => {
                if (arg instanceof Error) {
                    return arg.toString() + '\n' + (arg.stack || '');
                }
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(preview(arg, { nodes: MAX_NODES }, 0, new WeakSet()), null, 2);
                    } catch (e) {
                        return '[Circular/Object]';
                    }
                }
                return String(arg);
            }).join(' ');
            if (message.length > MAX_MESSAGE) message = message.slice(0, MAX_MESSAGE) + '…（已截断）';
        } catch (e) {
            message = '[Error processing log arguments]';
        }

        const logEntry = {
            id: Date.now() + Math.random(),
            time: timeStr,
            type: type,
            message: message
        };

        window.systemLogs.push(logEntry);
        if (window.systemLogs.length > MAX_LOGS) {
            window.systemLogs.shift();
        }

        // Real-time update if view is active
        const container = document.getElementById('system-log-container');
        if (container && container.offsetParent !== null) { // minimal check for visibility
            appendLogToView(container, logEntry);
            if (window.autoScrollLogs) {
                container.scrollTop = container.scrollHeight;
            }
        }
    }

    // Override Console Methods
    console.log = function (...args) {
        originalLog.apply(console, args);
        captureLog('info', args);
    };

    console.warn = function (...args) {
        originalWarn.apply(console, args);
        captureLog('warn', args);
    };

    console.error = function (...args) {
        originalError.apply(console, args);
        captureLog('error', args);
    };

    // Helper: Escape HTML
    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Helper: Append single log
    function appendLogToView(container, log) {
        const div = document.createElement('div');
        div.className = `font-mono text-xs py-1.5 px-2 rounded border-b t-border-main last:border-0 hover:t-bg-item-hover transition-colors ${log.type === 'error' ? 'text-red-500 dark:text-red-400 bg-red-500/10' :
            log.type === 'warn' ? 'text-amber-500 dark:text-amber-400 bg-amber-500/10' :
                't-text-main'
            }`;

        // Colorize time
        const timeHtml = `<span class="t-text-muted opacity-70 select-none mr-2 font-semibold">[${log.time}]</span>`;
        // Message with preserved whitespace
        const msgHtml = `<span class="whitespace-pre-wrap break-words">${escapeHtml(log.message)}</span>`;

        div.innerHTML = timeHtml + msgHtml;
        container.appendChild(div);
    }

    // Global function to render all logs (called when tab switches)
    window.renderSystemLogs = function () {
        const container = document.getElementById('system-log-container');
        if (!container) return;

        container.innerHTML = '';
        window.systemLogs.forEach(log => appendLogToView(container, log));

        // Scroll to bottom initially
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
            window.autoScrollLogs = true; // Enable auto-scroll by default on open
        }, 0);
    };

    // Global function to clear logs
    window.clearSystemLogs = function () {
        window.systemLogs = [];
        const container = document.getElementById('system-log-container');
        if (container) container.innerHTML = '';
        console.log('[System] Logs cleared by user');
    };

})();

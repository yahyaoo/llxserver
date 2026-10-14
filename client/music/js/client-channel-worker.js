/** 共用长连接与网络发送线程，界面线程只负责入队和缓存。 @author jingyh @date 2026-10-12 */
let socket, configuration, reconnectTimer, ready = false, failures = 0;
const waiting = new Map();
const emit = message => self.postMessage(message);
function connect() {
    if (!configuration || socket && [0, 1].includes(socket.readyState)) return;
    socket = new WebSocket(configuration.ws);
    socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', token: configuration.token, device: configuration.device, versions: configuration.versions,
        lastNotifySeq: configuration.lastNotifySeq, serverEpoch: configuration.serverEpoch }));
    socket.onmessage = event => {
        let message;
        try { message = JSON.parse(event.data) } catch { return }
        if (message.type === 'ready') {
            ready = true; failures = 0;
            for (const topic of configuration.topics || []) socket.send(JSON.stringify({ type: 'subscribe', topic, enabled: true }));
        }
        if (message.type === 'ack') { const item = waiting.get(message.id); if (item) { clearTimeout(item.timer); waiting.delete(message.id); item.resolve(message) } }
        else emit(message);
    };
    socket.onerror = () => {};
    socket.onclose = event => {
        ready = false;
        emit({ type: 'disconnected', data: { code: event.code } });
        for (const item of waiting.values()) { clearTimeout(item.timer); item.reject(new Error('长连接已断开')) } waiting.clear();
        if (event.code === 4401) { emit({ type: 'expired' }); return }
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, Math.min(60000, 2000 * 2 ** failures++));
    };
}
async function report(message) {
    if (configuration.mode !== 'http' && ready && socket?.readyState === 1) {
        try {
            return await new Promise((resolve, reject) => {
                const timer = setTimeout(() => { waiting.delete(message.id); reject(new Error('长连接确认超时')) }, 10000);
                waiting.set(message.id, { resolve, reject, timer }); socket.send(JSON.stringify(message));
            });
        } catch {}
    }
    // WS 不可用时只回退同一批量接口，绝不启动数据读取轮询。
    const response = await fetch(configuration.http, { method: 'POST', headers: { 'Content-Type': 'application/json', ...configuration.headers }, body: JSON.stringify(message), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('批次上报失败：HTTP ' + response.status);
    return response.json();
}
self.onmessage = async event => {
    const message = event.data;
    if (message.type === 'configure') { configuration = message; connect() }
    else if (message.type === 'cache-saved') configuration.versions = { ...configuration.versions, ...message.versions };
    else if (message.type === 'cursor-saved') { configuration.lastNotifySeq = message.seq; configuration.serverEpoch = message.serverEpoch; }
    else if (message.type === 'mode') configuration.mode = message.mode;
    else if (message.type === 'subscribe') {
        configuration.topics = (configuration.topics || []).filter(topic => topic !== message.topic);
        if (message.enabled) configuration.topics.push(message.topic);
        if (ready) socket.send(JSON.stringify(message));
    } else if (message.type === 'report') {
        try { emit(await report(message)) } catch (error) { emit({ type: 'failed', id: message.id, message: error.message }) }
    }
};

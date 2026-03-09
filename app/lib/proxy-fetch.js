/**
 * 带代理支持的 fetch 封装
 * Node.js Runtime 下，如果指定了 proxyUrl，使用 undici 的 ProxyAgent
 */
export async function proxyFetch(url, options = {}, proxyUrl) {
    if (proxyUrl) {
        try {
            const { ProxyAgent } = await import('undici');
            const agent = new ProxyAgent(proxyUrl);
            return fetch(url, { ...options, dispatcher: agent });
        } catch (e) {
            console.warn('[proxy-fetch] ProxyAgent 创建失败，回退到直连:', e.message);
            return fetch(url, options);
        }
    }
    return fetch(url, options);
}

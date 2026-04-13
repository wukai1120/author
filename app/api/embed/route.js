// Gemini 原生 API & OpenAI 兼容 API — 文本向量化 (Text Embeddings)

export const runtime = 'nodejs';

import { proxyFetch } from '../../lib/proxy-fetch';
import { rotateKey } from '../../lib/keyRotator';

export async function POST(request) {
    try {
        const { text } = await request.json();
        const proxyUrl = process.env.AI_PROXY_URL || '';

        if (!text || typeof text !== 'string') {
            return new Response(JSON.stringify({ error: '无效的文本输入' }), { status: 400 });
        }

        const provider = (process.env.EMBED_PROVIDER || process.env.AI_PROVIDER || 'openai').trim().toLowerCase();
        let embeddings = [];

        if (provider === 'gemini' || provider === 'google' || provider === 'google-gemini') {
            const apiKey = rotateKey(process.env.GEMINI_API_KEY);
            if (!apiKey) {
                return new Response(JSON.stringify({ error: '服务端未配置 GEMINI_API_KEY，请联系管理员在 .env.local 中配置' }), { status: 400 });
            }

            const baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
            const geminiModel = process.env.EMBED_MODEL || 'text-embedding-004';
            const url = `${baseUrl}/models/${geminiModel}:embedContent?key=${apiKey}`;
            const res = await proxyFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: `models/${geminiModel}`,
                    content: { parts: [{ text }] }
                })
            }, proxyUrl);

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Gemini Embedding Error: ${errText}`);
            }
            const data = await res.json();
            embeddings = data.embedding?.values || [];
        } else {
            const apiKey = rotateKey(process.env.API_KEY || process.env.ZHIPU_API_KEY || process.env.OPENAI_API_KEY);
            if (!apiKey) {
                return new Response(JSON.stringify({ error: '服务端未配置 Embedding API Key，请联系管理员在 .env.local 中配置' }), { status: 400 });
            }

            const baseUrl = (process.env.EMBED_BASE_URL || process.env.API_BASE_URL || process.env.OPENAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '');
            const embedModelName = process.env.EMBED_MODEL || 'embedding-3';
            const url = `${baseUrl}/embeddings`;

            const res = await proxyFetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    input: text,
                    model: embedModelName
                })
            }, proxyUrl);

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Embedding API Error: ${errText}`);
            }
            const data = await res.json();
            embeddings = data.data?.[0]?.embedding || [];
        }

        return new Response(JSON.stringify({ embedding: embeddings }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        console.error('Embedding API Error:', err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}

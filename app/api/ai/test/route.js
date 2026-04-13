import { NextResponse } from 'next/server';
import { proxyFetch } from '../../../lib/proxy-fetch';
import { rotateKey } from '../../../lib/keyRotator';

// 测试 API 连接（服务端 .env 配置）
export async function POST() {
    try {
        const provider = (process.env.AI_PROVIDER || '').trim().toLowerCase();
        const proxyUrl = process.env.AI_PROXY_URL || '';

        if (provider === 'gemini' || provider === 'google' || provider === 'google-gemini') {
            return await testGeminiNative(
                process.env.GEMINI_API_KEY,
                process.env.GEMINI_BASE_URL,
                process.env.GEMINI_MODEL,
                proxyUrl,
            );
        }

        if (provider === 'responses' || provider === 'openai-responses') {
            return await testResponsesAPI(
                process.env.OPENAI_API_KEY,
                process.env.OPENAI_BASE_URL,
                process.env.OPENAI_MODEL,
                proxyUrl,
            );
        }

        if (provider === 'claude' || provider === 'anthropic') {
            return await testClaude(
                process.env.CLAUDE_API_KEY,
                process.env.CLAUDE_BASE_URL,
                process.env.CLAUDE_MODEL,
                proxyUrl,
            );
        }

        return await testOpenAICompat(
            process.env.API_KEY || process.env.ZHIPU_API_KEY,
            process.env.API_BASE_URL,
            process.env.API_MODEL,
            proxyUrl,
        );
    } catch (error) {
        console.error('API测试错误:', error);
        return NextResponse.json(
            { success: false, error: '网络连接失败，请检查服务端 AI 环境变量配置' },
            { status: 500 }
        );
    }
}

async function testGeminiNative(apiKey, baseUrl, model, proxyUrl) {
    apiKey = rotateKey(apiKey);
    if (!apiKey) {
        return NextResponse.json({ success: false, error: '服务端未配置 GEMINI_API_KEY' }, { status: 400 });
    }

    const base = (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const m = model || 'gemini-2.0-flash';
    const url = `${base}/models/${m}:generateContent?key=${apiKey}`;

    const response = await proxyFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: '说"连接成功"' }] }],
            generationConfig: { maxOutputTokens: 20 },
        }),
    }, proxyUrl);

    if (!response.ok) {
        const errText = await response.text();
        let errMsg = `连接失败(${response.status})`;
        try {
            const errObj = JSON.parse(errText);
            errMsg = errObj?.error?.message || errMsg;
        } catch { /* ignore parse error */ }
        return NextResponse.json({ success: false, error: errMsg });
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return NextResponse.json({
        success: true,
        message: '✅ Gemini 原生 API 连接成功！',
        model: m,
        reply: reply.trim(),
    });
}

async function testOpenAICompat(apiKey, baseUrl, model, proxyUrl) {
    apiKey = rotateKey(apiKey);
    if (!apiKey) {
        return NextResponse.json({ success: false, error: '服务端未配置 API_KEY（或 ZHIPU_API_KEY）' }, { status: 400 });
    }

    const base = (baseUrl || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '');
    const m = model || 'glm-4-flash';
    const url = `${base}/chat/completions`;

    const response = await proxyFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: m,
            messages: [{ role: 'user', content: '说"连接成功"' }],
            max_tokens: 20,
        }),
    }, proxyUrl);

    if (!response.ok) {
        const errText = await response.text();
        let errMsg = `连接失败(${response.status})`;
        try {
            const errObj = JSON.parse(errText);
            errMsg = errObj?.error?.message || errMsg;
        } catch { /* ignore parse error */ }
        return NextResponse.json({ success: false, error: errMsg });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';

    return NextResponse.json({
        success: true,
        message: '✅ API 连接成功！',
        model: m,
        reply: reply.trim(),
    });
}

async function testResponsesAPI(apiKey, baseUrl, model, proxyUrl) {
    apiKey = rotateKey(apiKey);
    if (!apiKey) {
        return NextResponse.json({ success: false, error: '服务端未配置 OPENAI_API_KEY' }, { status: 400 });
    }

    const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const m = model || 'gpt-4o-mini';
    const url = `${base}/responses`;

    const response = await proxyFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: m,
            input: '说"连接成功"',
            max_output_tokens: 20,
        }),
    }, proxyUrl);

    if (!response.ok) {
        const errText = await response.text();
        let errMsg = `连接失败(${response.status})`;
        try {
            const errObj = JSON.parse(errText);
            errMsg = errObj?.error?.message || errMsg;
        } catch { /* ignore parse error */ }
        return NextResponse.json({ success: false, error: errMsg });
    }

    const data = await response.json();
    const reply = data.output?.[0]?.content?.[0]?.text
        || data.output_text
        || '';

    return NextResponse.json({
        success: true,
        message: '✅ Responses API 连接成功！',
        model: m,
        reply: reply.trim(),
    });
}

async function testClaude(apiKey, baseUrl, model, proxyUrl) {
    apiKey = rotateKey(apiKey);
    if (!apiKey) {
        return NextResponse.json({ success: false, error: '服务端未配置 CLAUDE_API_KEY' }, { status: 400 });
    }

    const base = (baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
    const m = model || 'claude-sonnet-4-20250514';
    const url = `${base}/v1/messages`;

    const response = await proxyFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: m,
            max_tokens: 20,
            messages: [{ role: 'user', content: '说"连接成功"' }],
        }),
    }, proxyUrl);

    if (!response.ok) {
        const errText = await response.text();
        let errMsg = `连接失败(${response.status})`;
        try {
            const errObj = JSON.parse(errText);
            errMsg = errObj?.error?.message || errMsg;
        } catch { /* ignore parse error */ }
        return NextResponse.json({ success: false, error: errMsg });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || '';

    return NextResponse.json({
        success: true,
        message: '✅ Claude API 连接成功！',
        model: m,
        reply: reply.trim(),
    });
}

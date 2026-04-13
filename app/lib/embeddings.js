// 文本向量化与余弦相似度计算库

// 错误退避缓存：API 连续失败时暂停重试 60 秒
let _embedErrorUntil = 0;
const EMBED_BACKOFF_MS = 60000;

/**
 * 获取文本的向量化表示 (Embeddings)
 * @param {string} text 要向量化的文本
 * @returns {Promise<number[]|null>} 浮点数数组形式的向量
 */
export async function getEmbedding(text) {
    if (!text || text.trim() === '') return null;
    // 如果上次失败的退避期还没过，直接跳过
    if (Date.now() < _embedErrorUntil) return null;

    try {
        const res = await fetch('/api/embed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        if (!res.ok) {
            console.error('getEmbedding HTTP error:', await res.text());
            _embedErrorUntil = Date.now() + EMBED_BACKOFF_MS;
            return null;
        }

        const data = await res.json();
        if (data.error) {
            console.error('getEmbedding API error:', data.error);
            return null;
        }

        return data.embedding;
    } catch (err) {
        console.error('getEmbedding fetch error:', err);
        _embedErrorUntil = Date.now() + EMBED_BACKOFF_MS;
        return null;
    }
}

/**
 * 计算两个向量之间的余弦相似度
 * @param {number[]} vecA 向量 A
 * @param {number[]} vecB 向量 B
 * @returns {number} 相似度得分 (-1.0 到 1.0)
 */
export function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

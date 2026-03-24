'use client';

// ==================== Firebase 初始化 ====================
// 使用环境变量配置，支持 Next.js NEXT_PUBLIC_ 前缀
// 预留 Vertex AI / Analytics / FCM 等升级接口

import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
// ⬇️ 阶段4（生态）升级预留：内置 AI
// import { getVertexAI } from 'firebase/vertexai';
// ⬇️ 阶段4（生态）升级预留：分析
// import { getAnalytics } from 'firebase/analytics';
// ⬇️ 阶段3（移动端）升级预留：推送
// import { getMessaging } from 'firebase/messaging';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// 防止热更新时重复初始化
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Firebase 是否已配置（用户/开发者是否填好了环境变量）
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const auth = isFirebaseConfigured ? getAuth(app) : null;
export const db = isFirebaseConfigured ? getFirestore(app) : null;

// ⬇️ 阶段4（生态）升级预留
// export const vertexAI = isFirebaseConfigured ? getVertexAI(app) : null;
// export const analytics = isFirebaseConfigured ? getAnalytics(app) : null;

export default app;

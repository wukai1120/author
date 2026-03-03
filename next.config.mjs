/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  devIndicators: false,
  // pdf-parse / word-extractor 仅在服务端 API 路由中使用，标记为外部包避免打包解析
  serverExternalPackages: ['pdf-parse', 'word-extractor'],
};

export default nextConfig;

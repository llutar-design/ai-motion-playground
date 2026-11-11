import { defineConfig } from 'vite';

// 빌드 결과물에 CSP를 넣어, 앱이 자기 출처 외의 곳으로 데이터를 보낼 수 없게 브라우저가 강제한다.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export default defineConfig({
  // GitHub Pages는 /저장소이름/ 아래에서 서비스되므로 배포 스크립트가 BASE_PATH를 지정한다.
  base: process.env.BASE_PATH ?? '/',
  plugins: [{
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml: () => [{
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
      injectTo: 'head-prepend',
    }],
  }],
  // 글꼴을 data URI로 인라인하면 font-src 'self' 정책에 막히므로 파일로 내보낸다.
  build: { target: 'es2022', chunkSizeWarningLimit: 900, assetsInlineLimit: 0 },
  server: { host: 'localhost' },
});

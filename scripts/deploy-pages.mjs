// GitHub Pages 배포: 하위 경로에 맞춰 빌드한 뒤 dist를 gh-pages 브랜치로 올린다.
// 사용법: npm run deploy:pages
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim();

const remote = out('git', ['remote', 'get-url', 'origin']);
const repo = remote.replace(/\.git$/, '').split('/').pop();
const base = `/${repo}/`;
const name = out('git', ['config', 'user.name']);
const email = out('git', ['config', 'user.email']);
const commit = out('git', ['rev-parse', '--short', 'HEAD']);

console.log(`빌드 경로: ${base}`);
execFileSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build'], { stdio: 'inherit', cwd: root, env: { ...process.env, BASE_PATH: base } });
writeFileSync(resolve(root, 'dist/.nojekyll'), '');

const dist = resolve(root, 'dist');
const git = (...args) => run('git', args, { cwd: dist });
git('init', '-q', '-b', 'gh-pages');
git('-c', `user.name=${name}`, '-c', `user.email=${email}`, 'add', '-A');
git('-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-q', '-m', `Deploy ${commit}`);
git('push', '-f', remote, 'gh-pages');
console.log(`배포 완료: https://${remote.split('/').at(-2)}.github.io${base}`);

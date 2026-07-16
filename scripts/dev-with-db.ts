import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const nodeCommand = process.execPath;
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const children = [
  spawn(nodeCommand, [tsxCli, 'scripts/dev-db-server.ts'], { stdio: 'inherit', shell: false }),
  spawn(nodeCommand, [viteCli, '--port=3000', '--host=0.0.0.0'], { stdio: 'inherit', shell: false })
];

const stopAll = () => {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
};

process.on('SIGINT', () => {
  stopAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopAll();
  process.exit(0);
});

for (const child of children) {
  child.on('exit', code => {
    if (code && code !== 0) {
      stopAll();
      process.exit(code);
    }
  });
}

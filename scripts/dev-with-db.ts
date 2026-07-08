import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const tsxCommand = isWindows ? 'npx.cmd' : 'npx';

const children = [
  spawn(tsxCommand, ['tsx', 'scripts/dev-db-server.ts'], { stdio: 'inherit', shell: false }),
  spawn(npmCommand, ['run', 'dev'], { stdio: 'inherit', shell: false })
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

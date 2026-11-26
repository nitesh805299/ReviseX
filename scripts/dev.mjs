import { spawn } from 'node:child_process';

const services = [
  { name: 'WORKER', cmd: 'npm', args: ['--prefix', 'worker', 'run', 'dev'], color: '\x1b[36m' },
  { name: 'BACKEND', cmd: 'npm', args: ['--prefix', 'backend', 'run', 'dev'], color: '\x1b[32m' },
  { name: 'FRONTEND', cmd: 'npm', args: ['--prefix', 'frontend', 'run', 'dev'], color: '\x1b[35m' },
];

const children = [];
const reset = '\x1b[0m';

for (const svc of services) {
  const proc = spawn(svc.cmd, svc.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    env: process.env,
  });

  proc.stdout.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) console.log(`${svc.color}[${svc.name}]${reset} ${line}`);
    }
  });

  proc.stderr.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) console.error(`${svc.color}[${svc.name}]${reset} ${line}`);
    }
  });

  children.push(proc);
}

function shutdown() {
  for (const child of children) {
    child.kill('SIGINT');
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

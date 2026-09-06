#!/usr/bin/env node

import { spawn } from 'child_process';
import os from 'os';
import path from 'path';

const REAL_AGY_BIN = `${os.homedir()}/.gemini/bin/agy`;
const rawArgs = process.argv.slice(2);

// Extract port requested by client (e.g. --hub-port=8090)
let clientPort = 8090;
const portArg = rawArgs.find(a => a.startsWith('--hub-port='));
if (portArg) {
  clientPort = parseInt(portArg.split('=')[1], 10);
}

const realDaemonPort = clientPort + 100;
const logDir = path.join(os.homedir(), 'agy_cli_hub');

// Replace --hub-port in args for real agy daemon
const daemonArgs = rawArgs.map(a => a.startsWith('--hub-port=') ? `--hub-port=${realDaemonPort}` : a);

console.log(`\x1b[1;36m[AGY Wrapper]\x1b[0m Intercepting client on port ${clientPort} -> Real Daemon on port ${realDaemonPort}`);

// 1. Spawn real agy daemon
const daemonProc = spawn(REAL_AGY_BIN, daemonArgs, {
  stdio: 'inherit',
  env: process.env
});

// 2. Spawn proxy logger
const proxyEnv = {
  ...process.env,
  LISTEN_PORT: String(clientPort),
  TARGET_PORT: String(realDaemonPort),
  LOG_FILE: path.join(logDir, 'recorded_traffic.jsonl'),
  PRETTY_LOG_FILE: path.join(logDir, 'recorded_traffic.log')
};

const proxyProc = spawn(process.execPath, [path.join(logDir, 'proxy.js')], {
  stdio: 'inherit',
  env: proxyEnv
});

process.on('SIGINT', () => {
  daemonProc.kill();
  proxyProc.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  daemonProc.kill();
  proxyProc.kill();
  process.exit(0);
});

daemonProc.on('exit', (code) => {
  proxyProc.kill();
  process.exit(code || 0);
});

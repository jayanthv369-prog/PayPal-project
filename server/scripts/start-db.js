import net from 'net';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const serverDir = path.resolve(__dirname, '..');

const dbPath = path.resolve(serverDir, 'data', 'mongodb_data');
if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
}

function checkPort(port = 27017, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

function findMongodBinary() {
  const candidates = [
    path.resolve(rootDir, 'node_modules', '.cache', 'mongodb-memory-server', 'mongod-x64-win32-8.2.6.exe'),
    path.resolve(serverDir, 'node_modules', '.cache', 'mongodb-memory-server', 'mongod-x64-win32-8.2.6.exe'),
    'C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe',
    'C:\\Program Files\\MongoDB\\Server\\6.0\\bin\\mongod.exe',
    'mongod',
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return 'mongod';
}

export async function ensureMongoDBRunning() {
  const isRunning = await checkPort(27017);
  if (isRunning) {
    console.log('✅ MongoDB is active and accepting connections on port 27017.');
    return;
  }

  const mongodBin = findMongodBinary();
  console.log(`🚀 Starting persistent MongoDB daemon on 127.0.0.1:27017...`);
  console.log(`📁 Data directory: ${dbPath}`);
  console.log(`⚙️  Binary: ${mongodBin}`);

  const child = spawn(
    mongodBin,
    ['--dbpath', dbPath, '--port', '27017', '--bind_ip', '127.0.0.1'],
    {
      detached: true,
      stdio: 'ignore',
    }
  );

  child.unref();

  // Poll until ready
  let attempts = 0;
  while (attempts < 20) {
    await new Promise((r) => setTimeout(r, 500));
    const ready = await checkPort(27017);
    if (ready) {
      console.log('✅ MongoDB daemon successfully started and listening on 127.0.0.1:27017.');
      return;
    }
    attempts++;
  }

  throw new Error('Timed out waiting for MongoDB to start on port 27017.');
}

if (process.argv[1] && process.argv[1].endsWith('start-db.js')) {
  ensureMongoDBRunning()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Failed to start MongoDB:', err.message);
      process.exit(1);
    });
}

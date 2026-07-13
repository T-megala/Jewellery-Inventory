import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_ROOT = path.resolve(__dirname, '../../logs');

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const formatMeta = (meta) => {
  if (meta === undefined) {
    return '';
  }

  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ` ${String(meta)}`;
  }
};

/**
 * Append-only logger that writes one file per day under logs/<namespace>/YYYY-MM-DD.log
 * @param {string} namespace
 */
export const createFileLogger = (namespace) => {
  const logDir = path.join(LOG_ROOT, namespace);

  const getLogPath = () => {
    const date = new Date().toISOString().slice(0, 10);
    return path.join(logDir, `${date}.log`);
  };

  const write = (level, message, meta) => {
    ensureDir(logDir);
    const line = `[${new Date().toISOString()}] [${level}] ${message}${formatMeta(meta)}\n`;
    fs.appendFileSync(getLogPath(), line, 'utf8');
  };

  return {
    info: (message, meta) => write('INFO', message, meta),
    warn: (message, meta) => write('WARN', message, meta),
    error: (message, meta) => write('ERROR', message, meta),
    getLogDir: () => logDir,
  };
};

export default createFileLogger;

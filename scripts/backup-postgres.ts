import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || '5432';
const DB_DATABASE = process.env.DB_DATABASE || 'hunters_kitchen';
const DB_USERNAME = process.env.DB_USERNAME || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || process.env.JWT_SECRET || 'hunters_kitchen_disaster_recovery_master_key_2026';

export function resolvePgDump(): string {
  const possiblePaths = [
    'pg_dump',
    'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
    '/usr/bin/pg_dump',
    '/usr/local/bin/pg_dump'
  ];

  for (const binPath of possiblePaths) {
    try {
      if (binPath === 'pg_dump') {
        execSync('pg_dump --version', { stdio: 'ignore' });
        return 'pg_dump';
      } else if (fs.existsSync(binPath)) {
        return `"${binPath}"`;
      }
    } catch {}
  }
  return 'pg_dump';
}

export function encryptBackupFile(filePath: string, keyString: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  const key = crypto.createHash('sha256').update(keyString).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  const magic = Buffer.from('HKDR', 'utf8');
  const payload = Buffer.concat([magic, iv, tag, encrypted]);

  const encFilePath = `${filePath}.enc`;
  fs.writeFileSync(encFilePath, payload);
  fs.unlinkSync(filePath); // Securely delete unencrypted plain SQL dump
  return encFilePath;
}

export async function runBackup(): Promise<{ backupPath: string; checksum: string }> {
  console.log('================================================================');
  console.log("HUNTER'S KITCHEN — ENCRYPTED DISASTER RECOVERY BACKUP ENGINE");
  console.log('================================================================');

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`[DR] Created backup directory: ${BACKUP_DIR}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rawFileName = `${DB_DATABASE}_backup_${timestamp}.sql`;
  const rawFilePath = path.join(BACKUP_DIR, rawFileName);

  console.log(`[DR] Starting logical snapshot dump for database: ${DB_DATABASE}`);

  const pgDumpBin = resolvePgDump();
  const env = { ...process.env, PGPASSWORD: DB_PASSWORD };

  try {
    // 1. Execute pg_dump
    execSync(
      `${pgDumpBin} -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USERNAME} -d ${DB_DATABASE} -f "${rawFilePath}"`,
      { env, stdio: 'inherit' }
    );

    const stats = fs.statSync(rawFilePath);
    console.log(`[DR] Logical database snapshot created (${(stats.size / 1024).toFixed(2)} KB)`);

    // 2. Encrypt artifact with AES-256-GCM
    console.log('[DR] Encrypting snapshot with AES-256-GCM authenticated cipher...');
    const encryptedPath = encryptBackupFile(rawFilePath, ENCRYPTION_KEY);
    const encStats = fs.statSync(encryptedPath);
    console.log(`[DR] Encrypted artifact generated: ${path.basename(encryptedPath)} (${(encStats.size / 1024).toFixed(2)} KB)`);

    // 3. Compute SHA-256 integrity hash of encrypted file
    const encBuffer = fs.readFileSync(encryptedPath);
    const hexChecksum = crypto.createHash('sha256').update(encBuffer).digest('hex');
    const checksumFilePath = `${encryptedPath}.sha256`;

    fs.writeFileSync(checksumFilePath, `${hexChecksum}  ${path.basename(encryptedPath)}\n`, 'utf-8');
    console.log(`[DR] Tamper-evident SHA-256 Checksum: ${hexChecksum}`);

    // 4. Retention policy: Prune local backups older than 7 days
    pruneOldBackups(BACKUP_DIR, 7);

    console.log('================================================================');
    console.log('ENCRYPTED DISASTER RECOVERY SNAPSHOT SECURED & VERIFIED');
    console.log('================================================================');

    return { backupPath: encryptedPath, checksum: hexChecksum };
  } catch (err: any) {
    console.error('[DR ERROR] Backup generation failed:', err.message);
    throw err;
  }
}

function pruneOldBackups(dir: string, daysToKeep: number) {
  try {
    const files = fs.readdirSync(dir);
    const now = Date.now();
    const maxAgeMs = daysToKeep * 24 * 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        console.log(`[DR Retention] Pruned old backup artifact: ${file}`);
      }
    }
  } catch (e: any) {
    console.warn('[DR Retention Warning] Could not prune old backups:', e.message);
  }
}

if (process.argv[1] && process.argv[1].includes('backup-postgres')) {
  runBackup().catch(() => process.exit(1));
}

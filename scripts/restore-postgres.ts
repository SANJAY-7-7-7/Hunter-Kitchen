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

export function resolvePsql(): string {
  const possiblePaths = [
    'psql',
    'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe',
    '/usr/bin/psql',
    '/usr/local/bin/psql'
  ];

  for (const binPath of possiblePaths) {
    try {
      if (binPath === 'psql') {
        execSync('psql --version', { stdio: 'ignore' });
        return 'psql';
      } else if (fs.existsSync(binPath)) {
        return `"${binPath}"`;
      }
    } catch {}
  }
  return 'psql';
}

export function decryptBackupFile(encFilePath: string, keyString: string): string {
  const encBuffer = fs.readFileSync(encFilePath);
  const magic = encBuffer.subarray(0, 4).toString('utf8');
  if (magic !== 'HKDR') {
    throw new Error('Invalid encrypted backup file header: missing HKDR magic identifier');
  }
  const iv = encBuffer.subarray(4, 16);
  const tag = encBuffer.subarray(16, 32);
  const ciphertext = encBuffer.subarray(32);
  const key = crypto.createHash('sha256').update(keyString).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  const plainFilePath = encFilePath.replace(/\.enc$/, '.dec.tmp.sql');
  fs.writeFileSync(plainFilePath, decrypted, { mode: 0o600 });
  return plainFilePath;
}

export async function runRestore(targetBackupFile?: string): Promise<void> {
  console.log('================================================================');
  console.log("HUNTER'S KITCHEN — DISASTER RECOVERY RESTORATION ENGINE");
  console.log('================================================================');

  if (!fs.existsSync(BACKUP_DIR)) {
    console.error(`[DR ERROR] Backup directory does not exist: ${BACKUP_DIR}`);
    throw new Error(`Backup directory not found: ${BACKUP_DIR}`);
  }

  let selectedFile = targetBackupFile;
  if (!selectedFile) {
    // Find latest backup file (supports both .sql.enc and .sql)
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.sql.enc') || (f.endsWith('.sql') && !f.includes('.dec.tmp')));
    if (files.length === 0) {
      console.error('[DR ERROR] No backup artifacts found in backup directory.');
      throw new Error('No backup artifacts found.');
    }

    files.sort((a, b) => {
      const statA = fs.statSync(path.join(BACKUP_DIR, a));
      const statB = fs.statSync(path.join(BACKUP_DIR, b));
      return statB.mtimeMs - statA.mtimeMs;
    });

    selectedFile = files[0];
  }

  const backupFilePath = path.isAbsolute(selectedFile) ? selectedFile : path.join(BACKUP_DIR, selectedFile);
  const checksumFilePath = `${backupFilePath}.sha256`;

  console.log(`[DR] Selected backup artifact: ${path.basename(backupFilePath)}`);

  // 1. SHA-256 Integrity Check
  if (fs.existsSync(checksumFilePath)) {
    const expectedChecksum = fs.readFileSync(checksumFilePath, 'utf-8').trim().split(/\s+/)[0];
    const fileBuffer = fs.readFileSync(backupFilePath);
    const actualChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    if (expectedChecksum.toLowerCase() !== actualChecksum.toLowerCase()) {
      console.error(`[DR SECURITY ALERT] Tamper check failed! Checksum mismatch.`);
      console.error(`Expected: ${expectedChecksum}, Calculated: ${actualChecksum}`);
      throw new Error('Integrity checksum verification failed.');
    }
    console.log('[DR Integrity] Tamper-evident SHA-256 checksum verified 100%.');
  } else {
    console.warn('[DR Warning] Checksum file not found; proceeding with caution.');
  }

  // 2. Decrypt if encrypted artifact
  let fileToRestore = backupFilePath;
  let isTempDecrypted = false;

  if (backupFilePath.endsWith('.enc')) {
    console.log('[DR] Decrypting AES-256-GCM authenticated ciphertext...');
    fileToRestore = decryptBackupFile(backupFilePath, ENCRYPTION_KEY);
    isTempDecrypted = true;
    console.log('[DR] Decryption & authentication tag verified successfully.');
  }

  const psqlBin = resolvePsql();
  const env = { ...process.env, PGPASSWORD: DB_PASSWORD };

  try {
    console.log(`[DR] Executing restoration into database ${DB_DATABASE}...`);
    execSync(`${psqlBin} -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USERNAME} -d ${DB_DATABASE} -f "${fileToRestore}"`, {
      env,
      stdio: 'inherit'
    });

    console.log('================================================================');
    console.log('DISASTER RECOVERY RESTORATION COMPLETED SUCCESSFULLY');
    console.log('================================================================');
  } catch (err: any) {
    console.error('[DR ERROR] Restoration execution failed:', err.message);
    throw err;
  } finally {
    if (isTempDecrypted && fs.existsSync(fileToRestore)) {
      fs.unlinkSync(fileToRestore);
      console.log('[DR Security] Plaintext decrypted temporary file purged.');
    }
  }
}

if (process.argv[1] && process.argv[1].includes('restore-postgres')) {
  runRestore().catch(() => process.exit(1));
}

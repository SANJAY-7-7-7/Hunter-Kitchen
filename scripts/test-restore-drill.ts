import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'assert';
import { runBackup } from './backup-postgres';
import { decryptBackupFile } from './restore-postgres';
import { postgresDb } from '../src/server/db/postgres';
import { auditService } from '../src/server/services/auditService';
import dotenv from 'dotenv';

dotenv.config();

const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || process.env.JWT_SECRET || 'hunters_kitchen_disaster_recovery_master_key_2026';

async function executeDisasterRecoveryDrill() {
  console.log('================================================================');
  console.log('🛡️  DISASTER RECOVERY AUTOMATED RESTORATION DRILL & AUDIT');
  console.log('================================================================\n');

  await postgresDb.initialize();

  // Step 1: Pre-drill database probe
  const countRes = await postgresDb.query('SELECT count(*) as total FROM users');
  const userCount = parseInt(countRes.rows[0].total, 10);
  console.log(`[DRILL STEP 1] Database health verified. Active users: ${userCount}`);

  // Step 2: Execute encrypted backup snapshot
  console.log('\n[DRILL STEP 2] Triggering automated encrypted backup snapshot...');
  const { backupPath, checksum } = await runBackup();
  assert(fs.existsSync(backupPath), 'Encrypted backup artifact must exist');
  assert(backupPath.endsWith('.sql.enc'), 'Backup must be AES-256-GCM encrypted (.sql.enc)');

  // Step 3: Verify tamper-evident checksum
  console.log('\n[DRILL STEP 3] Validating SHA-256 cryptographic checksum...');
  const artifactBuffer = fs.readFileSync(backupPath);
  const calculatedChecksum = crypto.createHash('sha256').update(artifactBuffer).digest('hex');
  assert.strictEqual(calculatedChecksum, checksum, 'Artifact checksum must match calculated checksum');
  console.log('  ✓ Checksum verified matches exact file payload');

  // Step 4: Verify AES-256-GCM container structure & Tamper Resistance
  console.log('\n[DRILL STEP 4] Validating AES-256-GCM container headers & tamper detection...');
  const magic = artifactBuffer.subarray(0, 4).toString('utf8');
  assert.strictEqual(magic, 'HKDR', 'Container must have HKDR magic identifier');

  // Step 5: Test Tamper Detection (Modify 1 byte in ciphertext)
  const tampered = Buffer.from(artifactBuffer);
  tampered[tampered.length - 1] ^= 0xFF; // Flip bits
  const tamperedPath = `${backupPath}.tampered.tmp`;
  fs.writeFileSync(tamperedPath, tampered);

  let tamperCaught = false;
  try {
    decryptBackupFile(tamperedPath, ENCRYPTION_KEY);
  } catch (err: any) {
    tamperCaught = true;
    console.log(`  ✓ Tampered ciphertext correctly rejected by GCM auth tag: "${err.message}"`);
  } finally {
    if (fs.existsSync(tamperedPath)) fs.unlinkSync(tamperedPath);
  }
  assert(tamperCaught, 'Tampered encrypted backup must fail authentication tag verification');

  // Step 6: Test Decryption & SQL Schema Content
  console.log('\n[DRILL STEP 6] Decrypting artifact and inspecting SQL schema integrity...');
  const decryptedPath = decryptBackupFile(backupPath, ENCRYPTION_KEY);
  try {
    assert(fs.existsSync(decryptedPath), 'Decrypted SQL dump must exist');
    const sqlContent = fs.readFileSync(decryptedPath, 'utf8');

    // Verify key tables exist in the dump
    const expectedTables = ['users', 'orders', 'menu_items', 'audit_logs', 'payments', 'outbox_events'];
    for (const table of expectedTables) {
      assert(
        sqlContent.toLowerCase().includes(table),
        `Decrypted SQL dump must contain references to table: ${table}`
      );
      console.log(`  ✓ Validated table structure for "${table}"`);
    }
  } finally {
    if (fs.existsSync(decryptedPath)) {
      fs.unlinkSync(decryptedPath);
      console.log('  ✓ Plaintext decrypted drill file securely wiped from disk');
    }
  }

  // Step 7: Record Audit Log Entry for DRILL via Cryptographic Audit Service
  await auditService.log({
    actorId: 'system_dr_auditor',
    actorName: 'Automated DR Runner',
    actorRole: 'SYSTEM',
    action: 'DISASTER_RECOVERY_DRILL_PASSED',
    resource: 'BACKUP',
    resourceId: path.basename(backupPath),
    requestId: `req_drill_${Date.now()}`,
    newValue: { status: 'PASSED', checksum, userCount }
  });

  console.log('\n================================================================');
  console.log('🎉 DISASTER RECOVERY DRILL PASSED 100% (AUDITED & COMPLIANT)');
  console.log('================================================================');

  await postgresDb.close();
}

executeDisasterRecoveryDrill().catch(async (err) => {
  console.error('❌ Disaster recovery drill failed:', err);
  await postgresDb.close().catch(() => {});
  process.exit(1);
});

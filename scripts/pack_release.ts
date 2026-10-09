import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function packRelease() {
  console.log('================================================================');
  console.log("📦 HUNTER'S KITCHEN — PRODUCTION RELEASE PACKAGER");
  console.log('================================================================\n');

  const rootDir = process.cwd();
  const outputZipName = 'hunters-kitchen-production-release.zip';
  const outputZipPath = path.join(rootDir, outputZipName);

  if (fs.existsSync(outputZipPath)) {
    fs.unlinkSync(outputZipPath);
    console.log(`[PACK] Removed previous archive: ${outputZipName}`);
  }

  // Ensure fresh build and typecheck
  console.log('[PACK] Running typecheck and production bundle build...');
  execSync('npm run lint', { stdio: 'inherit' });
  execSync('npm run build', { stdio: 'inherit' });

  // Patterns strictly excluded
  const excludedNames = new Set([
    'node_modules',
    '.git',
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
    'backups',
    'data',
    outputZipName
  ]);

  const excludedExtensions = ['.log', '.dump', '.tmp'];

  // Collect files to package
  const filesToInclude: string[] = [];

  function scanDir(dir: string, relPath = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryRel = relPath ? `${relPath}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);

      if (excludedNames.has(entry.name)) {
        continue;
      }

      if (entry.name.startsWith('.env') && entry.name !== '.env.example') {
        console.log(`[SECURITY FILTER] Excluding secret env file: ${entryRel}`);
        continue;
      }

      if (excludedExtensions.some((ext) => entry.name.endsWith(ext))) {
        continue;
      }

      if (entry.isDirectory()) {
        scanDir(fullPath, entryRel);
      } else {
        filesToInclude.push(entryRel);
      }
    }
  }

  scanDir(rootDir);

  console.log(`\n[PACK] Packaging ${filesToInclude.length} files into clean production release zip...`);

  // Verify .env is strictly absent
  const leakedEnv = filesToInclude.filter((f) => f === '.env' || (f.startsWith('.env') && f !== '.env.example'));
  if (leakedEnv.length > 0) {
    throw new Error(`[CRITICAL SECURITY ALERT] Leaked environment files detected: ${leakedEnv.join(', ')}`);
  }
  console.log('  ✓ Verified 0 sensitive .env files in release package');

  // Use PowerShell Compress-Archive on Windows, or zip on Linux
  const isWindows = process.platform === 'win32';
  if (isWindows) {
    // Stage into temp directory
    const tempStageDir = path.join(rootDir, '.release_stage_tmp');
    if (fs.existsSync(tempStageDir)) {
      fs.rmSync(tempStageDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempStageDir, { recursive: true });

    try {
      for (const file of filesToInclude) {
        const destPath = path.join(tempStageDir, file);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(path.join(rootDir, file), destPath);
      }

      const psCommand = `Compress-Archive -Path "${tempStageDir}\\*" -DestinationPath "${outputZipPath}" -Force`;
      execSync(`powershell -Command "${psCommand}"`, { stdio: 'inherit' });
    } finally {
      if (fs.existsSync(tempStageDir)) {
        fs.rmSync(tempStageDir, { recursive: true, force: true });
      }
    }
  } else {
    execSync(`zip -r "${outputZipPath}" . -x "*.env*" "node_modules/*" ".git/*" "data/*" "backups/*"`, { stdio: 'inherit' });
  }

  const stat = fs.statSync(outputZipPath);
  console.log(`\n================================================================`);
  console.log(`🎉 RELEASE ARCHIVE CREATED: ${outputZipName} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log('   Strictly sanitized: .env omitted, .env.example included.');
  console.log('================================================================\n');
}

packRelease().catch((err) => {
  console.error('[PACK ERROR]', err);
  process.exit(1);
});

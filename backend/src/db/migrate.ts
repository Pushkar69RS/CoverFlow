import fs from 'fs';
import path from 'path';
import { db } from './connection';

export async function runMigrations() {
  console.log('🚀 Running database migrations...');
  const possiblePaths = [
    path.resolve(__dirname, 'migrations'),
    path.resolve(__dirname, '../../src/db/migrations'),
    path.resolve(__dirname, '../../../src/db/migrations'),
    path.resolve(__dirname, '../../../../src/db/migrations'),
    path.resolve(process.cwd(), 'src/db/migrations'),
    path.resolve(process.cwd(), 'backend/src/db/migrations')
  ];
  const migrationsDir = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[0];
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    console.log(`📄 Applying migration: ${file}`);
    const sql = fs.readFileSync(filePath, 'utf8');

    // Execute queries
    try {
      await db.exec(sql);
      console.log(`✅ Applied ${file} successfully.`);
    } catch (err: any) {
      console.error(`❌ Error in migration ${file}:`, err.message);
      throw err;
    }
  }

  console.log('🎉 All migrations applied successfully!');
}

if (require.main === module) {
  runMigrations()
    .then(async () => {
      await db.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Fatal migration failure:', err);
      await db.close();
      process.exit(1);
    });
}

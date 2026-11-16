import { app } from './app';
import { db } from './db/connection';
import { runMigrations } from './db/migrate';
import { backgroundWorkers } from './workers/workerRunner';

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  try {
    console.log('🔄 Initializing CoverFlow Backend Engine...');
    await db.init();
    await runMigrations();

    const server = app.listen(PORT, () => {
      console.log(`🚀 CoverFlow Enterprise Server running on http://localhost:${PORT}`);
      console.log(`📡 API Endpoints available at http://localhost:${PORT}/api`);
    });

    // Start background SLA & renewal timers
    backgroundWorkers.start(30000);

    const shutdown = async () => {
      console.log('Stopping server...');
      backgroundWorkers.stop();
      server.close(async () => {
        await db.close();
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err: any) {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  }
}

bootstrap();

import { createApplication } from './server/app.mjs';
const runtime = await createApplication();
const server = runtime.app.listen(
  Number(process.env.PORT || 8080),
  process.env.HOST || '127.0.0.1',
  () => console.log(JSON.stringify({ event: 'server_started', mode: runtime.config.mode })),
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    runtime.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

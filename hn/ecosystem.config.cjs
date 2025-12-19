module.exports = {
  apps: [
    {
      name: 'hn-web',
      script: 'bun',
      args: 'run src/index.ts',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      log_file: './logs/web-combined.log',
      time: true,
    },
    {
      name: 'hn-sync',
      script: 'bun',
      args: 'run src/sync-worker.ts',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/sync-error.log',
      out_file: './logs/sync-out.log',
      log_file: './logs/sync-combined.log',
      time: true,
    },
  ],
};

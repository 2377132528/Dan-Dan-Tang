// PM2 process file for 宝塔 / Linux deployment.
// Keep instances at 1: online rooms live in process memory, so multiple
// instances would put players into different room maps.
module.exports = {
  apps: [
    {
      name: 'dandantang',
      cwd: __dirname,
      script: 'server.mjs',
      args: '--prod',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 12,
      restart_delay: 3000,
      max_memory_restart: '350M',
      kill_timeout: 5000,
      time: true,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Only Nginx on the same machine should reach the Node process.
        HOST: '127.0.0.1',
      },
    },
  ],
};

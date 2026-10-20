// pm2 process config for the 1section backend.
// nvm's bin dir is set explicitly in PATH so `npx hyperframes` / ffmpeg resolve
// even when pm2 is resurrected from systemd (no interactive shell / no nvm).
const NVM_BIN = "/root/.nvm/versions/node/v24.22.0/bin";

module.exports = {
  apps: [
    {
      name: "1section",
      script: "server.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "20s",
      max_memory_restart: "1G",
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: 8000,
        PATH: `${NVM_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
      },
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      merge_logs: true,
    },
  ],
};

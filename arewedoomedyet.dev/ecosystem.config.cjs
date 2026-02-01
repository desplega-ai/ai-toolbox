module.exports = {
  apps: [
    {
      name: "arewedoomedyet",
      script: "index.ts",
      interpreter: "bun",
      env: {
        PORT: 5294,
      },
      watch: false,
      instances: 1,
      autorestart: true,
    },
  ],
};

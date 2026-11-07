module.exports = {
  BOT_NAME: "WEB2APK BY DANZXVYZ",
  BOT_VERSION: "1.0",
  BOT_TOKEN: process.env.BOT_TOKEN || "8801917778:AAEHBzlP-XdGRb18EzJ1d1pVwOWiFAFlt14",
  ADMIN_IDS: (process.env.ADMIN_IDS || "8824756103").split(",").map(Number).filter(Boolean),

  // --- TAMBAHAN TOKEN GITHUB LO DI SINI ---
  GITHUB_TOKEN: "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",

  // --- 2 CHANNEL WAJIB JOIN ---
  CHANNEL_USERNAME: process.env.CHANNEL_USERNAME || "@infobuilderzxv",
  CHANNEL_USERNAME2: process.env.CHANNEL_USERNAME2 || "@aboutdanzxvyz",
  // Channel ke-3 udah gw hapus sesuai request lo

  OWNER_ID: parseInt(process.env.OWNER_ID || "8824756103"),

  WELCOME_PHOTO: process.env.WELCOME_PHOTO || "https://files.catbox.moe/xnphqy.jpg",
  NEW_USER: process.env.NEW_USER || "https://files.catbox.moe/xnphqy.jpg",
  TMP_DIR: "./tmp",

  BUILD_TIMEOUT_MS: 30 * 60 * 1000,
  POLL_INTERVAL_MS: 7000,       
  WEB2APK_MAINTENANCE: false,
};
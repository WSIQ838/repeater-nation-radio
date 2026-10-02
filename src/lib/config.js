export const config = {
  appUrl: import.meta.env.VITE_REPEATER_NATION_APP_URL || "https://repeaternation.com",
  base44AppId: import.meta.env.VITE_BASE44_APP_ID || "6a6d787f8e808727b935dd09",
  base44AppBaseUrl: import.meta.env.VITE_BASE44_APP_BASE_URL || "",
  base44FunctionsVersion: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION || "",
  livekitUrl: import.meta.env.VITE_LIVEKIT_URL || "wss://voice.repeaternation.com",
  defaultChannelId: import.meta.env.VITE_RADIO_CHANNEL_ID || "6ab6210ed1f4b9c2908596e9",
  defaultChannelName: import.meta.env.VITE_RADIO_CHANNEL_NAME || "Nation Wide",
};
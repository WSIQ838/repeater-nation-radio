export const config = {
  appUrl: import.meta.env.VITE_REPEATER_NATION_APP_URL || "https://repeaternation.com",
  authUrl: import.meta.env.VITE_REPEATER_NATION_AUTH_URL || "",
  sessionUrl: import.meta.env.VITE_REPEATER_NATION_SESSION_URL || "",
  livekitUrl: import.meta.env.VITE_LIVEKIT_URL || "wss://voice.repeaternation.com",
  radioRoom: import.meta.env.VITE_LIVEKIT_RADIO_ROOM || "nation-wide",
};

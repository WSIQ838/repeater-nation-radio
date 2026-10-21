// Official Discord server widget embed. Requires Server Widget to be turned
// on in that server's Settings -> Widget (it is, for this guild id).
export default function DiscordWidget({ guildId, className = '' }) {
  if (!guildId) return null;

  return (
    <div className={`rounded-2xl overflow-hidden ${className}`}>
      <iframe
        title="Discord server widget"
        src={`https://discord.com/widget?id=${guildId}&theme=dark`}
        width="100%"
        height="500"
        frameBorder="0"
        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
      />
    </div>
  );
}

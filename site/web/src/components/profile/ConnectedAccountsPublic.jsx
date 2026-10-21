import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import DiscordIcon from "@/components/DiscordIcon";
import FacebookIcon from "@/components/FacebookIcon";
import TwitchIcon from "@/components/TwitchIcon";
import { Twitter, Youtube, Instagram, BadgeCheck } from "lucide-react";

const PLATFORM_META = {
  discord: { label: "Discord", icon: DiscordIcon, color: "#5865F2" },
  facebook: { label: "Facebook", icon: FacebookIcon, color: "#1877F2" },
  youtube: { label: "YouTube", icon: Youtube, color: "#FF0000" },
  twitch: { label: "Twitch", icon: TwitchIcon, color: "#9146FF" },
  instagram: { label: "Instagram", icon: Instagram, color: "#E4405F" },
  x: { label: "X", icon: Twitter, color: "#000000" },
};

export default function ConnectedAccountsPublic({ userId }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    base44.entities.ConnectedAccount.filter({ user_id: userId, is_public: true })
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.items || [];
        setAccounts(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading || !accounts.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {accounts.map((acc) => {
        const meta = PLATFORM_META[acc.platform];
        if (!meta) return null;
        const Icon = meta.icon;
        const content = (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card text-sm font-medium hover:bg-accent transition-colors">
            <Icon className="w-4 h-4" style={{ color: meta.color }} />
            <span className="truncate max-w-[120px]">{acc.username || acc.display_name}</span>
            <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />
          </span>
        );
        return acc.profile_url ? (
          <a key={acc.id} href={acc.profile_url} target="_blank" rel="noopener noreferrer">{content}</a>
        ) : (
          <span key={acc.id}>{content}</span>
        );
      })}
    </div>
  );
}
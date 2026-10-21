import { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BadgeCheck, Loader2, Link2, Unlink, Eye, EyeOff, ExternalLink, AlertCircle } from "lucide-react";
import DiscordIcon from "@/components/DiscordIcon";
import FacebookIcon from "@/components/FacebookIcon";
import TwitchIcon from "@/components/TwitchIcon";
import { Twitter, Youtube, Instagram } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

const PLATFORMS = [
  { id: "discord", label: "Discord", icon: DiscordIcon, color: "#5865F2" },
  { id: "facebook", label: "Facebook", icon: FacebookIcon, color: "#1877F2" },
  { id: "youtube", label: "YouTube", icon: Youtube, color: "#FF0000" },
  { id: "twitch", label: "Twitch", icon: TwitchIcon, color: "#9146FF" },
  { id: "instagram", label: "Instagram", icon: Instagram, color: "#E4405F" },
  { id: "x", label: "X (Twitter)", icon: Twitter, color: "#000000" },
];

export default function ConnectedAccounts({ user }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(null);
  const [disconnecting, setDisconnecting] = useState(null);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await base44.entities.ConnectedAccount.filter({ user_id: user.id });
      const list = Array.isArray(res) ? res : res?.items || [];
      setAccounts(list);
    } catch (err) {
      console.error("Failed to load connected accounts", err);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) loadAccounts();
  }, [user?.id, loadAccounts]);

  const handleConnect = async (platformId) => {
    setConnecting(platformId);
    try {
      const res = await base44.functions.invoke("social-connect-init", { platform: platformId });
      if (res.data?.not_configured) {
        toast({
          title: "Not available yet",
          description: `The site admin needs to add ${res.data.missing.join(" and ")} in Secrets before this platform can be connected.`,
          variant: "destructive",
        });
      } else if (res.data?.authUrl) {
        window.location.href = res.data.authUrl;
      } else if (res.data?.error) {
        toast({ title: "Connection failed", description: res.data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
    }
    setConnecting(null);
  };

  const handleDisconnect = async (account) => {
    setDisconnecting(account.id);
    try {
      await base44.entities.ConnectedAccount.delete(account.id);
      setAccounts((prev) => prev.filter((a) => a.id !== account.id));
      toast({ title: "Account disconnected", description: `${account.platform} has been unlinked.` });
    } catch (err) {
      toast({ title: "Failed to disconnect", description: err.message, variant: "destructive" });
    }
    setDisconnecting(null);
  };

  const toggleVisibility = async (account, value) => {
    try {
      await base44.entities.ConnectedAccount.update(account.id, { is_public: value });
      setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, is_public: value } : a)));
    } catch (err) {
      toast({ title: "Failed to update visibility", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center"><Link2 className="w-5 h-5" /></div>
          <div><h2 className="font-heading font-semibold text-lg">Connected Accounts</h2><p className="text-sm text-muted-foreground">Link your social media accounts via official OAuth.</p></div>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center"><Link2 className="w-5 h-5" /></div>
        <div>
          <h2 className="font-heading font-semibold text-lg">Connected Accounts</h2>
          <p className="text-sm text-muted-foreground">Link your social media accounts with official authorization. Your password is never requested.</p>
        </div>
      </div>

      <div className="space-y-3">
        {PLATFORMS.map((p) => {
          const account = accounts.find((a) => a.platform === p.id);
          const Icon = p.icon;
          return (
            <div key={p.id} className="rounded-xl border border-border p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-lg grid place-items-center shrink-0" style={{ backgroundColor: `${p.color}15` }}>
                  <Icon className="w-5 h-5" style={{ color: p.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{p.label}</span>
                    {account && <BadgeCheck className="w-4 h-4 text-primary shrink-0" />}
                  </div>
                  {account ? (
                    <div className="flex items-center gap-2 mt-0.5 min-w-0">
                      {account.avatar_url && <img src={account.avatar_url} alt="" className="w-5 h-5 rounded-full shrink-0" />}
                      <span className="text-sm text-muted-foreground truncate">{account.username || account.display_name}</span>
                      {account.profile_url && (
                        <a href={account.profile_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">Not connected</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {account ? (
                  <>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      {account.is_public ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">{account.is_public ? "Public" : "Private"}</span>
                      <Switch checked={account.is_public} onCheckedChange={(v) => toggleVisibility(account, v)} />
                    </label>
                    <Button variant="outline" size="sm" onClick={() => handleDisconnect(account)} disabled={disconnecting === account.id}>
                      {disconnecting === account.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline ml-1.5">Disconnect</span>
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => handleConnect(p.id)} disabled={connecting === p.id}>
                    {connecting === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                    <span className="ml-1.5">Connect</span>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Connected accounts are verified through each platform's official OAuth. Only accounts you mark as Public appear on your public profile. You can disconnect or change visibility at any time.</span>
      </div>
    </Card>
  );
}
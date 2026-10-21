import React from "react";
import { MailQuestion } from "lucide-react";

// The "Can't find the email?" box shown under the email-code entry on both the
// sign-up and log-in pages. onBack, when given, adds a "Go back and fix it" item
// for people who typed the wrong address.
export default function VerifyEmailHelp({ onBack }) {
  return (
    <div className="mt-5 rounded-lg border border-border bg-muted/40 p-4 text-sm" data-verify-help="">
      <div className="font-medium flex items-center gap-2"><MailQuestion className="w-4 h-4 text-primary" /> Can't find the email?</div>
      <ul className="mt-2 list-disc pl-5 space-y-1.5 text-muted-foreground">
        <li>It comes from <span className="font-medium text-foreground whitespace-nowrap">no-reply@repeaternation.com</span> with the subject <span className="font-medium text-foreground">"Verify your email for Repeater Nation"</span>.</li>
        <li>Check your <span className="font-medium text-foreground">Spam</span> or <span className="font-medium text-foreground">Junk</span> folder (and <span className="font-medium text-foreground">Promotions</span> in Gmail). It can take a couple of minutes to arrive.</li>
        <li>The code expires after <span className="font-medium text-foreground">10 minutes</span>. If it's been longer, press Resend code and use the code from the newest email.</li>
        {onBack && <li>Wrong email address? <button type="button" onClick={onBack} className="text-primary font-medium hover:underline">Go back and fix it</button>.</li>}
      </ul>
    </div>
  );
}

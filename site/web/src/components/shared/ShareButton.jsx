import React, { useState } from 'react';
import { Share2, Link as LinkIcon, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';

/**
 * Reusable share button. Uses the native Web Share API when available
 * (mobile / supporting desktop browsers), and falls back to a dropdown
 * with copy-link + social targets otherwise.
 *
 * Props:
 *  - url: absolute URL to share (defaults to current page)
 *  - title: share title (used by native share + social prefills)
 *  - text: optional share text / description
 *  - size: Button size (default 'sm')
 *  - variant: Button variant (default 'outline')
 *  - className: extra classes
 */
export default function ShareButton({
  url,
  title,
  text,
  size = 'sm',
  variant = 'outline',
  className = '',
}) {
  const [copied, setCopied] = useState(false);

  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  const shareTitle = title || 'Check this out on Repeater Nation';
  const shareText = text || '';

  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(shareTitle);
  const encodedText = encodeURIComponent(shareText);

  const socialTargets = [
    {
      label: 'X / Twitter',
      href: `https://twitter.com/intent/tweet?text=${encodedTitle}${shareText ? `%20${encodedText}` : ''}&url=${encodedUrl}`,
    },
    {
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedTitle}`,
    },
    {
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
    {
      label: 'Reddit',
      href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
    },
    {
      label: 'Email',
      href: `mailto:?subject=${encodedTitle}&body=${shareText ? `${encodedText}%0A%0A` : ''}${encodedUrl}`,
    },
  ];

  const handleNativeShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
      } else {
        await copyLink();
      }
    } catch (e) {
      // user cancelled — ignore
      if (e && e.name !== 'AbortError') {
        // fall back to copy
        copyLink();
      }
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: 'Link copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast({ title: 'Could not copy link', variant: 'destructive' });
    }
  };

  const hasNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  if (hasNativeShare) {
    return (
      <Button size={size} variant={variant} className={className} onClick={handleNativeShare}>
        <Share2 className="w-4 h-4 mr-1.5" /> Share
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant={variant} className={className}>
          <Share2 className="w-4 h-4 mr-1.5" /> Share
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Share this</DropdownMenuLabel>
        <DropdownMenuItem onClick={copyLink}>
          {copied ? <Check className="w-4 h-4 mr-2 text-success" /> : <LinkIcon className="w-4 h-4 mr-2" />}
          {copied ? 'Copied!' : 'Copy link'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {socialTargets.map((t) => (
          <DropdownMenuItem key={t.label} asChild>
            <a href={t.href} target="_blank" rel="noopener noreferrer" className="flex items-center w-full">
              {t.label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
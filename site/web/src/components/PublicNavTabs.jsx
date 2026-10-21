import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useMerchSettings } from '@/lib/merch';

const ABOUT_TABS = [
  { to: '/about', label: 'About Us' },
  { to: '/about-gmrs', label: 'About GMRS' },
  { to: '/about-ham', label: 'About HAM' },
  { to: '/partners', label: 'Partner With Us' },
];

const baseTabs = [
  { to: '/', label: 'Home' },
  { to: '/get-licensed', label: 'Get Licensed' },
  { to: '/features', label: 'Features' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
];

export default function PublicNavTabs() {
  const { pathname } = useLocation();
  const merch = useMerchSettings();
  const tabs = merch?.enabled ? [...baseTabs.slice(0, -1), { to: '/merch', label: 'Merch' }, baseTabs[baseTabs.length - 1]] : baseTabs;
  const [open, setOpen] = useState(false);
  const aboutActive = ABOUT_TABS.some((t) => t.to === pathname);

  return (
    <>
      <nav className="hidden xl:flex items-center gap-6 text-sm font-medium text-muted-foreground">
        <Link to={tabs[0].to} className={`hover:text-foreground transition-colors ${pathname === tabs[0].to ? 'text-foreground' : ''}`}>
          {tabs[0].label}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger className={`flex items-center gap-1 hover:text-foreground transition-colors outline-none ${aboutActive ? 'text-foreground' : ''}`}>
            About <ChevronDown className="w-3.5 h-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {ABOUT_TABS.map((t) => (
              <DropdownMenuItem key={t.to} asChild>
                <Link to={t.to} className={pathname === t.to ? 'text-foreground font-medium' : ''}>{t.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {tabs.slice(1).map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className={`hover:text-foreground transition-colors ${pathname === t.to ? 'text-foreground' : ''}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <Button
        variant="ghost"
        size="icon"
        className="xl:hidden"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
      >
        <Menu className="w-5 h-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-3/4 xl:hidden">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav className="mt-6 flex flex-col gap-1">
            <Link
              to={tabs[0].to}
              onClick={() => setOpen(false)}
              className={`px-3 py-2.5 rounded-lg text-base font-medium transition-colors ${
                pathname === tabs[0].to ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {tabs[0].label}
            </Link>

            <div className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">About</div>
            {ABOUT_TABS.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                onClick={() => setOpen(false)}
                className={`px-3 py-2.5 rounded-lg text-base font-medium transition-colors ${
                  pathname === t.to ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {t.label}
              </Link>
            ))}

            <div className="my-1 border-t border-border" />
            {tabs.slice(1).map((t) => (
              <Link
                key={t.to}
                to={t.to}
                onClick={() => setOpen(false)}
                className={`px-3 py-2.5 rounded-lg text-base font-medium transition-colors ${
                  pathname === t.to ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

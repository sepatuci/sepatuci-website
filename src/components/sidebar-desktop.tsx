'use client';

import { SidebarButton } from './sidebar-button';
import { SidebarItems } from '@/types';
import Link from 'next/link';
import { Separator } from './ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { LogOut, MoreHorizontal, Settings } from 'lucide-react';
import { usePathname } from 'next/navigation';

// Import the SEP logo
import SepLogo from '../assets/logos/sep_white.png';

interface SidebarDesktopProps {
  sidebarItems: SidebarItems;
}

export function SidebarDesktop(props: SidebarDesktopProps) {
  const pathname = usePathname();
  return (
    <aside className='w-[270px] max-w-xs h-screen fixed left-0 top-0 z-40 border-r'>
      <div className='h-full px-3 py-4'>
        {/* Replace the text with the SEP logo */}
        <div className='mx-3'>
          <img src={SepLogo.src} alt="SEP Logo" className='h-12 w-auto' />
        </div>
        <div className='mt-5'>
          <div className='flex flex-col gap-1 w-full'>
            {props.sidebarItems.links.map((link, index) => (
              <Link key={index} href={link.href}>
                <SidebarButton
                  variant={pathname === link.href ? 'secondary' : 'ghost'}
                  icon={link.icon}
                  className='w-full'
                >
                  {link.label}
                </SidebarButton>
              </Link>
            ))}
          </div>           
        </div>
      </div>
    </aside>
  );
}

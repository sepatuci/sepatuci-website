"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

interface DialogContentProps {
  title: string
  description?: string
  className?: string
  children: React.ReactNode
  /**
   * Stays open until closed on purpose: a click outside or the Escape key does
   * nothing. For windows showing something that cannot be shown again.
   */
  persistent?: boolean
}

const DialogContent: React.FC<DialogContentProps> = ({
  title,
  description,
  className,
  children,
  persistent = false,
}) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-[200] bg-overlay backdrop-blur-sm" />
    <DialogPrimitive.Content
      onInteractOutside={persistent ? (event) => event.preventDefault() : undefined}
      onEscapeKeyDown={persistent ? (event) => event.preventDefault() : undefined}
      className={cn(
        "fixed left-1/2 top-1/2 z-[201] max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 font-normal text-card-foreground shadow-2xl focus:outline-none",
        className
      )}
    >
      <DialogPrimitive.Title className="pr-8 text-lg font-medium text-foreground">
        {title}
      </DialogPrimitive.Title>
      {description ? (
        <DialogPrimitive.Description className="mt-1.5 text-sm text-muted-foreground">
          {description}
        </DialogPrimitive.Description>
      ) : null}
      {children}
      {persistent ? null : (
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
)

export { Dialog, DialogTrigger, DialogClose, DialogContent }

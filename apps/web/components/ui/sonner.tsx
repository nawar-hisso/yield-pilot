"use client";

import { Toaster as SonnerToaster } from "sonner";

/** Global toast surface. Mount once in Providers. */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      theme="dark"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group border border-border bg-card text-card-foreground shadow-glow rounded-lg",
          description: "text-muted-foreground",
          actionButton: "bg-accent text-accent-foreground",
          cancelButton: "bg-muted text-muted-foreground",
        },
      }}
    />
  );
}

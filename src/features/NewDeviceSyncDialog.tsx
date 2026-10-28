"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2Icon } from "lucide-react";

export function NewDeviceSyncDialog({
  open,
  syncing = false,
  onReconcile,
  onLogOut,
}: {
  open: boolean;
  syncing?: boolean;
  onReconcile: () => void;
  onLogOut: () => void;
}) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        {syncing ? (
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
              Syncing…
            </AlertDialogTitle>
            <AlertDialogDescription>
              Reconciling this device with Drive. This can take a moment.
            </AlertDialogDescription>
          </AlertDialogHeader>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Sync this device?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    This device has local data that has not synced with this Google
                    account yet. Syncing will reconcile it with the data already in Drive.
                  </p>
                  <p>
                    To use the Drive copy instead, back up your data first, then sign out
                    and clear this device’s local data in Settings before signing in
                    again.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={onLogOut}>Log out</AlertDialogAction>
              <AlertDialogAction onClick={onReconcile}>
                Sync and reconcile
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

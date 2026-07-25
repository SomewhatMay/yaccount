"use client";

import { LoaderCircleIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BLOCKING_OPERATION_COPY,
  type BlockingOperationState,
} from "@/features/settings/blocking-operation";

export function BlockingOperationOverlay({
  operation,
}: {
  operation: NonNullable<BlockingOperationState>;
}) {
  return (
    <AlertDialog open onOpenChange={() => undefined}>
      <AlertDialogContent
        aria-busy="true"
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <AlertDialogHeader>
          <LoaderCircleIcon
            className="text-primary mb-2 size-7 animate-spin"
            aria-hidden
          />
          <AlertDialogTitle>{BLOCKING_OPERATION_COPY[operation.kind]}</AlertDialogTitle>
          <AlertDialogDescription role="status" aria-live="assertive">
            {BLOCKING_OPERATION_COPY.keepOpen}
          </AlertDialogDescription>
        </AlertDialogHeader>
      </AlertDialogContent>
    </AlertDialog>
  );
}

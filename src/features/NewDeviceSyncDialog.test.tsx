import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { NewDeviceSyncDialog } from "./NewDeviceSyncDialog";

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));

it("explains reconcile and the safe local-clear route", () => {
  const html = renderToStaticMarkup(
    <NewDeviceSyncDialog open onReconcile={vi.fn()} onLogOut={vi.fn()} />,
  );

  expect(html).toContain("Sync this device?");
  expect(html).toContain("Sync and reconcile");
  expect(html).toContain("Log out");
  expect(html).toContain("back up");
  expect(html).toContain("sign out");
  expect(html).toContain("clear this device’s local data");
});

it("replaces the choice with a syncing state while reconciling", () => {
  const html = renderToStaticMarkup(
    <NewDeviceSyncDialog open syncing onReconcile={vi.fn()} onLogOut={vi.fn()} />,
  );

  expect(html).toContain("Syncing…");
  expect(html).not.toContain("Sync and reconcile");
  expect(html).not.toContain("Log out");
});

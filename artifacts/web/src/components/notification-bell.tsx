import { useState } from "react";
import { Bell, AlertTriangle, CalendarClock, CheckCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListNotificationsQueryKey,
  useListNotifications,
  useAckNotification,
  useAckAllNotifications,
} from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const queryKey = getListNotificationsQueryKey();
  const { data } = useListNotifications({
    query: { queryKey, refetchInterval: 60_000, staleTime: 30_000 },
  });
  const ack = useAckNotification();
  const ackAll = useAckAllNotifications();

  const notifications = data?.notifications ?? [];
  const unread = data?.unreadCount ?? 0;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
          className="relative"
          data-testid="button-notifications"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 inline-flex min-h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white"
              data-testid="badge-notifications-unread"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="border-b border-border pb-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sm">Position alerts</SheetTitle>
            {unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  ackAll.mutate(undefined, { onSuccess: invalidate })
                }
                disabled={ackAll.isPending}
                data-testid="button-ack-all"
                className="text-xs"
              >
                <CheckCheck className="mr-1 h-3.5 w-3.5" /> Mark all read
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex flex-col divide-y divide-border overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              No alerts yet. We'll notify you here when a tracked put goes
              in-the-money or has 3 or fewer days to expiration.
            </div>
          ) : (
            notifications.map((n) => {
              const isItm = n.kind === "itm";
              const Icon = isItm ? AlertTriangle : CalendarClock;
              const isRead = n.acknowledgedAt != null;
              return (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 text-sm transition-colors",
                    !isRead && "bg-accent/30",
                  )}
                  data-testid={`notification-${n.id}`}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      isItm ? "text-rose-500" : "text-amber-500",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold tracking-tight">
                        {n.ticker}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {fmtRelative(n.triggeredAt)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "mt-0.5 text-xs leading-relaxed",
                        isRead ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {n.message}
                    </p>
                    {!isRead && (
                      <button
                        type="button"
                        onClick={() =>
                          ack.mutate(
                            { id: n.id },
                            { onSuccess: invalidate },
                          )
                        }
                        className="mt-1 text-[11px] font-medium text-primary hover:underline"
                        data-testid={`button-ack-${n.id}`}
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

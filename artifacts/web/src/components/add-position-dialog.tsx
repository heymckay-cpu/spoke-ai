import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { useCreatePosition } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SpokeSpinner } from "@/components/spoke-spinner";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const PositionFormSchema = z.object({
  ticker: z.string().min(1, "Ticker required"),
  strike: z.number().positive("Strike must be > 0"),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  premium: z.number().min(0, "Premium must be ≥ 0"),
  contracts: z.number().int().min(1, "At least 1 contract"),
});

type FormValues = z.infer<typeof PositionFormSchema>;

export interface AddPositionInitialValues {
  ticker?: string;
  strike?: number;
  expiry?: string;
  premium?: number;
  contracts?: number;
}

export interface AddPositionDialogProps {
  defaultExpiry: string;
  onCreated?: () => void;
  initialValues?: AddPositionInitialValues;
  trigger?: ReactNode;
}

export function AddPositionDialog({
  defaultExpiry,
  onCreated,
  initialValues,
  trigger,
}: AddPositionDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const create = useCreatePosition();

  const buildDefaults = (): FormValues => ({
    ticker: initialValues?.ticker ?? "",
    strike: initialValues?.strike ?? 0,
    expiry: initialValues?.expiry ?? defaultExpiry,
    premium: initialValues?.premium ?? 0,
    contracts: initialValues?.contracts ?? 1,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(PositionFormSchema),
    defaultValues: buildDefaults(),
  });

  // When the dialog opens, reset the form to current initial values so the
  // prefilled candidate row data is reflected.
  useEffect(() => {
    if (open) {
      form.reset(buildDefaults());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = (values: FormValues) => {
    create.mutate(
      {
        data: {
          ticker: values.ticker.toUpperCase(),
          strike: values.strike,
          expiry: values.expiry,
          premium: values.premium,
          contracts: values.contracts,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Position logged",
            description: `${values.ticker.toUpperCase()} ${values.strike}P ${values.expiry}`,
          });
          form.reset(buildDefaults());
          setOpen(false);
          onCreated?.();
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : "Unknown error";
          toast({ variant: "destructive", title: "Failed to log position", description: message });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button data-testid="button-add-position">
            <Plus className="mr-1 h-4 w-4" /> Log position
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log a sold put</DialogTitle>
          <DialogDescription>
            Track a put you've already sold. Live P/L is computed from the current bid.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            data-testid="form-add-position"
          >
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="ticker"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ticker</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="AAPL"
                        autoCapitalize="characters"
                        className="uppercase"
                        data-testid="input-position-ticker"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contracts"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contracts</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="tabular-nums"
                        data-testid="input-position-contracts"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="strike"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Strike ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.5"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="tabular-nums"
                        data-testid="input-position-strike"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="premium"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Premium / share ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="tabular-nums"
                        data-testid="input-position-premium"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expiry"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Expiration</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        className="tabular-nums"
                        data-testid="input-position-expiry"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                data-testid="button-cancel-position"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={create.isPending}
                data-testid="button-save-position"
              >
                {create.isPending ? (
                  <span className="inline-flex items-center gap-1.5">
                    <SpokeSpinner size={12} label="Saving position" />
                    <span aria-hidden="true">Saving…</span>
                  </span>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

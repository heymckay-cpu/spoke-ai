import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { useCreateHolding } from "@workspace/api-client-react";
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

const HoldingFormSchema = z.object({
  ticker: z.string().min(1, "Ticker required"),
  shares: z.number({ invalid_type_error: "Required" }).int().min(1, "At least 1 share"),
  avgCost: z.number({ invalid_type_error: "Required" }).positive("Average cost must be > 0"),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof HoldingFormSchema>;

export interface AddHoldingInitialValues {
  ticker?: string;
  shares?: number;
  avgCost?: number;
  notes?: string;
}

export interface AddHoldingDialogProps {
  onCreated?: () => void;
  initialValues?: AddHoldingInitialValues;
  trigger?: ReactNode;
}

export function AddHoldingDialog({
  onCreated,
  initialValues,
  trigger,
}: AddHoldingDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const create = useCreateHolding();

  // Use `undefined` (not 0) for empty numeric defaults so the inputs render
  // blank — a literal 0 default makes the field appear "stuck" because
  // backspacing an empty string back to Number(0) just re-renders "0".
  const buildDefaults = (): FormValues => ({
    ticker: initialValues?.ticker ?? "",
    shares: initialValues?.shares ?? 100,
    avgCost: initialValues?.avgCost ?? (undefined as unknown as number),
    notes: initialValues?.notes ?? "",
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(HoldingFormSchema),
    defaultValues: buildDefaults(),
  });

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
          shares: values.shares,
          avgCost: values.avgCost,
          notes: values.notes && values.notes.length > 0 ? values.notes : null,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Holding logged",
            description: `${values.ticker.toUpperCase()} · ${values.shares} sh @ $${values.avgCost}`,
          });
          form.reset(buildDefaults());
          setOpen(false);
          onCreated?.();
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : "Unknown error";
          toast({
            variant: "destructive",
            title: "Failed to log holding",
            description: message,
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button data-testid="button-add-holding">
            <Plus className="mr-1 h-4 w-4" /> Log holding
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log a stock holding</DialogTitle>
          <DialogDescription>
            Track shares you own (often from put assignment). Used to recommend covered calls and avoid over-concentration.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            data-testid="form-add-holding"
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
                        data-testid="input-holding-ticker"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="shares"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shares</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          field.onChange(v === "" ? undefined : Number(v));
                        }}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        className="tabular-nums"
                        data-testid="input-holding-shares"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="avgCost"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Average cost / share ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="0.00"
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          field.onChange(v === "" ? undefined : Number(v));
                        }}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        className="tabular-nums"
                        data-testid="input-holding-avgcost"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g. assigned from $50P May 24"
                        data-testid="input-holding-notes"
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
                data-testid="button-cancel-holding"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={create.isPending}
                data-testid="button-save-holding"
              >
                {create.isPending ? (
                  <span className="inline-flex items-center gap-1.5">
                    <SpokeSpinner size={12} label="Saving holding" />
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

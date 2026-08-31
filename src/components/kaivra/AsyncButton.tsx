import { forwardRef, useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/median";
import { cn } from "@/lib/utils";

type ButtonProps = React.ComponentProps<typeof Button>;

export interface AsyncButtonProps extends Omit<ButtonProps, "onClick"> {
  /** Async handler. The button locks itself for the whole promise lifetime. */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => unknown | Promise<unknown>;
  /** Label shown while the action is running. Falls back to the normal children. */
  pendingLabel?: ReactNode;
  /** Extra disabled condition coming from the caller. */
  disabled?: boolean;
}

/**
 * Standard async action button.
 *
 * The pending state flips synchronously inside the click handler so the user
 * always sees feedback in the same frame as their click — never after the
 * network round trip. Duplicate clicks are ignored while the promise is in
 * flight, and the button always resets in `finally`, so it can never stay
 * stuck spinning after an error.
 */
export const AsyncButton = forwardRef<HTMLButtonElement, AsyncButtonProps>(function AsyncButton(
  { onClick, pendingLabel, children, disabled, className, ...rest },
  ref,
) {
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const handle = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (lock.current) {
        event.preventDefault();
        return;
      }
      if (!onClick) return;
      lock.current = true;
      setPending(true); // synchronous: visible within the same frame
      void (async () => {
        try {
          await onClick(event);
        } finally {
          lock.current = false;
          if (mounted.current) setPending(false);
        }
      })();
    },
    [onClick],
  );

  return (
    <Button
      ref={ref}
      {...rest}
      className={cn("transition-transform duration-150 active:scale-[0.98]", className)}
      aria-busy={pending}
      disabled={disabled || pending}
      onClick={handle}
    >
      {pending ? <Loader2 className="mr-2 size-4 shrink-0 animate-spin" /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
});

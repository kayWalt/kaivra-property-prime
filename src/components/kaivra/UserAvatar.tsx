import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAvatarSrc } from "@/hooks/useAvatarSrc";

export function UserAvatar({
  url,
  name,
  className,
  iconClassName,
}: {
  url?: string | null | undefined;
  name?: string | null | undefined;
  className?: string;
  iconClassName?: string;
}) {
  const { src, onError } = useAvatarSrc(url);

  if (src) {
    return (
      <img
        loading="lazy"
        decoding="async"
        src={src}
        onError={onError}
        alt={name ? `${name}'s profile picture` : "Profile picture"}
        className={cn("size-9 rounded-full border border-border object-cover", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex size-9 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      <User className={cn("size-4", iconClassName)} aria-hidden />
    </span>
  );
}

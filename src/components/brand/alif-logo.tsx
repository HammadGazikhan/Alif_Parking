import Image from "next/image";
import { cn } from "@/lib/utils";

/** Product mark shared by the portal navigation and authentication screens. */
export function AlifMark({ className }: { className?: string }) {
  return (
    <Image
      src="/icons/alif-icon-180.png"
      alt=""
      aria-hidden="true"
      width={180}
      height={180}
      className={cn("size-9 object-contain", className)}
    />
  );
}

export function AlifLogo({
  className,
  tone = "light",
  subtitle = "Parking Portal",
}: {
  className?: string;
  tone?: "light" | "dark";
  subtitle?: string | null;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <AlifMark />
      <div className="flex flex-col leading-none">
        <span
          className={cn(
            "text-[15px] font-bold tracking-tight",
            tone === "light" ? "text-white" : "text-foreground",
          )}
        >
          Alif
          <span className="text-gold ml-1">.</span>
        </span>
        {subtitle ? (
          <span
            className={cn(
              "mt-1 text-[10px] font-semibold tracking-[0.18em] uppercase",
              tone === "light" ? "text-white/50" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </span>
        ) : null}
      </div>
    </div>
  );
}

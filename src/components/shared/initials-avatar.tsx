"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

const palette = [
  "bg-[#141824] text-white",
  "bg-gold text-ink",
  "bg-[#e9e7df] text-ink",
  "bg-[#2b2f3a] text-white",
  "bg-[#f4ecc2] text-ink",
];

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function InitialsAvatar({
  name,
  src,
  className,
  size = "md",
}: {
  name: string;
  /** Profile photo. Initials are used when this is missing or fails to load. */
  src?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const frame = cn(
    "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold",
    size === "sm" && "size-7 text-[10px]",
    size === "md" && "size-9 text-xs",
    size === "lg" && "size-14 text-base",
    className,
  );

  if (src && !failed) {
    return (
      <span className={frame}>
        <Image src={src} alt="" fill sizes="56px" unoptimized onError={() => setFailed(true)} className="object-cover" />
      </span>
    );
  }

  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span aria-hidden className={cn(frame, palette[hash % palette.length])}>
      {initialsOf(name)}
    </span>
  );
}

import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlifLogo } from "@/components/brand/alif-logo";

export default function NotFound() {
  return (
    <div className="ink-surface relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="bay-grid absolute inset-0" aria-hidden />
      <div className="relative">
        <AlifLogo className="justify-center" />
        <div className="mx-auto mt-12 flex size-14 items-center justify-center rounded-2xl bg-gold text-ink">
          <Compass className="size-6" />
        </div>
        <p className="eyebrow mt-6 text-gold">404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">This bay is empty</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-white/60">
          The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Button asChild className="mt-8">
          <Link href="/">Back to portal</Link>
        </Button>
      </div>
    </div>
  );
}

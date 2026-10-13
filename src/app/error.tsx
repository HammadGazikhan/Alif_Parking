"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/states";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="surface-card w-full max-w-lg">
        <ErrorState
          title="We hit a snag"
          description="An unexpected error occurred while loading this page. Your data is safe — please try again."
          onRetry={reset}
        />
      </div>
    </div>
  );
}

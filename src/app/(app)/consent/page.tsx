"use client";

import { useRouter } from "next/navigation";
import { ConsentForm } from "@/components/ConsentForm";

export default function ConsentPage() {
  const router = useRouter();
  return (
    <div className="pt-6">
      <ConsentForm onDone={() => router.replace("/")} />
    </div>
  );
}

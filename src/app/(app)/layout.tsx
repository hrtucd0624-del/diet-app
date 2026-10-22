import { BottomNav } from "@/components/BottomNav";
import { ProfileProvider } from "@/components/ProfileProvider";
import { DayChangeReload } from "@/components/DayChangeReload";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProfileProvider>
      <main className="pt-safe mx-auto max-w-md px-4 pb-28">{children}</main>
      <BottomNav />
      <DayChangeReload />
    </ProfileProvider>
  );
}

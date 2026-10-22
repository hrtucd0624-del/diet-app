import { ProfileProvider } from "@/components/ProfileProvider";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProfileProvider>
      <main className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8">{children}</main>
    </ProfileProvider>
  );
}

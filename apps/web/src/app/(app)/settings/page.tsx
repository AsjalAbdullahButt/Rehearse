import { SettingsForm } from "@/components/settings/settings-form";
import { Card } from "@/components/ui/card";
import { fetchProfile } from "@/lib/interview/server";

export default async function SettingsPage() {
  const profile = await fetchProfile();

  if (profile === null) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="flex max-w-sm flex-col items-center gap-2 text-center">
          <p className="text-text text-sm">Couldn&apos;t load your settings right now.</p>
          <p className="text-muted text-xs">Refresh the page to try again.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <SettingsForm initialProfile={profile} />
    </div>
  );
}

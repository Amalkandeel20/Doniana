import { t } from "@/i18n";
import { BlocksCard } from "../settings/BlocksCard";
import { BreaksCard } from "../settings/BreaksCard";
import { PageHeader } from "../settings/common";
import { SchedulingCard } from "../settings/SchedulingCard";
import { WeeklyHoursCard } from "../settings/WeeklyHoursCard";

export default function AvailabilityPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("admin.settings.availability.title")} text={t("admin.settings.availability.text")} />
      <div className="space-y-6">
        <WeeklyHoursCard />
        <BlocksCard />
        <BreaksCard />
        <SchedulingCard />
      </div>
    </div>
  );
}

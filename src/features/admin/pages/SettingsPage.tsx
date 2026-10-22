import { t } from "@/i18n";
import { BusinessInfoCard, NotificationSettingsCard } from "../settings/BusinessForms";
import { PageHeader } from "../settings/common";
import { TemplatesCard } from "../settings/TemplatesCard";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("admin.settings.settings.title")} />
      <div className="space-y-6">
        <BusinessInfoCard />
        <NotificationSettingsCard />
        <TemplatesCard />
      </div>
    </div>
  );
}

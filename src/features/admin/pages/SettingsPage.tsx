import { t } from "@/i18n";
import { BusinessInfoCard, NotificationSettingsCard } from "../settings/BusinessForms";
import { SitePhotosCard } from "../settings/SitePhotosCard";
import { AccountCard } from "../settings/AccountCard";
import { PageHeader } from "../settings/common";
import { TemplatesCard } from "../settings/TemplatesCard";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("admin.settings.settings.title")} />
      <div className="space-y-6">
        <BusinessInfoCard />
        <SitePhotosCard />
        <NotificationSettingsCard />
        <TemplatesCard />
        <AccountCard />
      </div>
    </div>
  );
}

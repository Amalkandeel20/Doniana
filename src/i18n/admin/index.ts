import { appointmentsAr } from "./appointments.ar";
import { settingsAr } from "./settings.ar";
import { shellAr } from "./shell.ar";

/** Admin strings, available as t("admin.…"). */
export const adminAr = { ...shellAr, appointments: appointmentsAr, settings: settingsAr };

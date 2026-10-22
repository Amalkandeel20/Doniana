-- LOCAL DEVELOPMENT ONLY (applied by `supabase db reset`). Never run against production.
-- Opening hours below are PLACEHOLDERS so the booking flow can be exercised locally; the client
-- has not supplied real working hours yet.
update public.business_hours set is_open = true, open_time = '09:00', close_time = '18:00' where weekday between 0 and 4;
update public.business_hours set is_open = true, open_time = '09:00', close_time = '14:00' where weekday = 5;
update public.business_hours set is_open = false where weekday = 6;

update public.notification_settings set owner_phone = '+972500000001';

-- Local admin: admin@doniana.local / see docs/INSTALL.md (created by scripts/create-admin.mjs).

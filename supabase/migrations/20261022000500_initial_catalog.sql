-- DONIANA — client-approved initial catalog (prices in agorot). Editable later by the admin.
-- Weekly hours are inserted CLOSED: the client has not supplied working hours yet, so nothing is
-- bookable in production until the owner sets them in /admin/availability.

insert into public.business_settings (id) values (true) on conflict do nothing;
insert into public.notification_settings (id) values (true) on conflict do nothing;

insert into public.business_hours (weekday, is_open)
select d, false from generate_series(0, 6) as d
on conflict do nothing;

with brows as (
  insert into public.services (category, slug, name_ar, name_en, description_ar, description_en, price_agorot, duration_minutes, sort_order)
  values
    ('brows', 'eyebrow-shaping', 'تنظيف وتنسيق الحواجب + شارب', 'Eyebrow Shaping', null, null, 7000, 25, 10),
    ('brows', 'brow-lamination', 'رفع الحواجب', 'Brow Lamination',
      'يشمل تنظيف الحواجب والشارب. إمكانية إضافة صبغة للحواجب.',
      'Includes eyebrow and upper-lip cleaning. Optional eyebrow tint.', 22000, 75, 20),
    ('brows', 'brow-lamination-facial', 'رفع الحواجب مع إزالة شعر الوجه', 'Brow Lamination + Facial Hair Removal', null, null, 25000, 90, 30),
    ('brows', 'eyebrow-shaping-facial', 'تنظيف الحواجب مع إزالة شعر الوجه', 'Eyebrow Shaping + Facial Hair Removal', null, null, 10000, 60, 40)
  returning id, slug
)
insert into public.service_addons (service_id, slug, name_ar, name_en, price_agorot, extra_duration_minutes, sort_order)
select id, 'eyebrow-tint', 'صبغة الحواجب', 'Eyebrow Tint', 1000, 0, 10
  from brows where slug = 'brow-lamination';

with piercing as (
  insert into public.services (category, slug, name_ar, name_en, description_ar, description_en, price_agorot, duration_minutes, location_required, sort_order)
  values ('piercing', 'body-piercing', 'بيرسينغ الأذن أو الأنف أو السّرّة', 'Body Piercing', null, null, 15000, 15, true, 10)
  returning id
)
insert into public.service_locations (service_id, code, name_ar, name_en, sort_order)
select piercing.id, v.code, v.name_ar, v.name_en, v.sort_order
  from piercing,
  (values ('ear', 'الأذن', 'Ear', 10), ('nose', 'الأنف', 'Nose', 20), ('navel', 'السّرّة', 'Navel', 30))
    as v (code, name_ar, name_en, sort_order);

-- Default Arabic SMS templates. Placeholders: {{business}} {{name}} {{phone}} {{service}}
-- {{date}} {{time}} {{price}} {{reference}} {{link}}. Editable in /admin/settings.
insert into public.notification_templates (event, body_ar) values
  ('booking_confirmed', E'مرحباً {{name}}، تم تأكيد موعدك في {{business}}.\n{{service}}\n{{date}} الساعة {{time}} · {{price}}\nلإدارة الموعد: {{link}}'),
  ('owner_new_booking', E'حجز جديد ({{reference}})\n{{name}} · {{phone}}\n{{service}}\n{{date}} الساعة {{time}} · {{price}}'),
  ('owner_cancellation', E'إلغاء من الزبونة ({{reference}})\n{{name}} · {{phone}}\n{{service}}\n{{date}} الساعة {{time}}'),
  ('reminder_24h', E'تذكير من {{business}}: موعدك ({{service}}) يوم {{date}} الساعة {{time}}.\nلإدارة الموعد: {{link}}'),
  ('cancelled_by_owner', E'مرحباً {{name}}، نعتذر، تم إلغاء موعدك في {{business}} يوم {{date}} الساعة {{time}}. للاستفسار يرجى التواصل معنا.'),
  ('appointment_changed', E'مرحباً {{name}}، تم تعديل موعدك في {{business}}:\n{{service}}\n{{date}} الساعة {{time}}\nللتفاصيل: {{link}}')
on conflict (event) do nothing;

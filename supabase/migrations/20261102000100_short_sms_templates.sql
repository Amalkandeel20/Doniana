-- Shorter default SMS texts: Arabic SMS are billed per 70-character segment (67 when split), so
-- a booking now costs about 4 segments instead of 8. Only rows still holding the original
-- defaults are replaced; texts the owner already edited are left alone.
with defaults(event, old_body, new_body) as (values
  ('booking_confirmed',
   E'مرحباً {{name}}، تم تأكيد موعدك في {{business}}.\n{{service}}\n{{date}} الساعة {{time}} · {{price}}\nلإدارة الموعد: {{link}}',
   E'تم تأكيد موعدك يوم {{date}} الساعة {{time}}\nللتفاصيل أو الإلغاء: {{link}}'),
  ('owner_new_booking',
   E'حجز جديد ({{reference}})\n{{name}} · {{phone}}\n{{service}}\n{{date}} الساعة {{time}} · {{price}}',
   E'حجز جديد: {{name}} {{phone}}\n{{date}} {{time}}'),
  ('owner_cancellation',
   E'إلغاء من الزبونة ({{reference}})\n{{name}} · {{phone}}\n{{service}}\n{{date}} الساعة {{time}}',
   E'إلغاء: {{name}} {{phone}}\n{{date}} {{time}}'),
  ('reminder_24h',
   E'تذكير من {{business}}: موعدك ({{service}}) يوم {{date}} الساعة {{time}}.\nلإدارة الموعد: {{link}}',
   E'تذكير من {{business}}: موعدك {{date}} الساعة {{time}}'),
  ('cancelled_by_owner',
   E'مرحباً {{name}}، نعتذر، تم إلغاء موعدك في {{business}} يوم {{date}} الساعة {{time}}. للاستفسار يرجى التواصل معنا.',
   E'نعتذر، أُلغي موعدك {{date}} {{time}}. للاستفسار تواصلي معنا'),
  ('appointment_changed',
   E'مرحباً {{name}}، تم تعديل موعدك في {{business}}:\n{{service}}\n{{date}} الساعة {{time}}\nللتفاصيل: {{link}}',
   E'تغيّر موعدك إلى {{date}} الساعة {{time}}\nالتفاصيل: {{link}}')
)
update public.notification_templates t
   set body_ar = d.new_body
  from defaults d
 where t.event = d.event::public.notification_event and t.body_ar = d.old_body;

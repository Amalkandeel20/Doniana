-- Client request: a 10-minute break after every appointment (cleaning / preparation).
-- Still editable in /admin/availability. Existing appointments keep the buffer they were booked with.
alter table public.business_settings alter column buffer_minutes set default 10;
update public.business_settings set buffer_minutes = 10 where id and buffer_minutes = 0;

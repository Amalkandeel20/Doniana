-- Pin search_path on the two helpers that lacked it (Supabase security advisor 0011).
alter function private.lock_schedule() set search_path = '';
alter function private.minutes_of(time) set search_path = '';

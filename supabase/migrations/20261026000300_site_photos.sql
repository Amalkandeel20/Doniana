-- Owner-managed photos for the home page hero and the two category cards.
-- Values are object paths in the public 'portfolio' bucket; null means "show the placeholder".
alter table public.business_settings
  add column hero_image_path text check (char_length(hero_image_path) <= 300),
  add column brows_card_image_path text check (char_length(brows_card_image_path) <= 300),
  add column piercing_card_image_path text check (char_length(piercing_card_image_path) <= 300);

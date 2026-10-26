// Row shapes as returned by the Supabase Data API (snake_case, matching the migrations).

export type ServiceCategory = "brows" | "piercing";
export type AppointmentStatus = "confirmed" | "cancelled" | "completed";

export interface ServiceAddon {
  id: string;
  service_id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  price_agorot: number;
  extra_duration_minutes: number;
  is_active: boolean;
  sort_order: number;
}

export interface ServiceLocation {
  id: string;
  service_id: string;
  code: string;
  name_ar: string;
  name_en: string;
  price_delta_agorot: number;
  duration_delta_minutes: number;
  is_active: boolean;
  sort_order: number;
}

export interface Service {
  id: string;
  category: ServiceCategory;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  price_agorot: number;
  duration_minutes: number;
  image_path: string | null;
  location_required: boolean;
  is_active: boolean;
  sort_order: number;
  service_addons: ServiceAddon[];
  service_locations: ServiceLocation[];
}

export interface BusinessHours {
  weekday: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
}

export interface BusinessSettings {
  business_name: string;
  tagline: string;
  instagram_url: string | null;
  whatsapp_phone: string | null;
  contact_phone: string | null;
  address_ar: string | null;
  maps_url: string | null;
  slot_interval_minutes: number;
  buffer_minutes: number;
  min_notice_minutes: number;
  booking_horizon_days: number;
  hero_image_path: string | null;
  brows_card_image_path: string | null;
  piercing_card_image_path: string | null;
}

export interface PortfolioImage {
  id: string;
  storage_path: string;
  alt_ar: string;
  category: ServiceCategory | null;
  sort_order: number;
  is_published: boolean;
}

export interface Appointment {
  id: string;
  reference: string;
  status: AppointmentStatus;
  source: "online" | "admin";
  service_id: string;
  location_id: string | null;
  category: ServiceCategory;
  service_name_ar: string;
  service_name_en: string;
  location_name_ar: string | null;
  service_price_agorot: number;
  total_price_agorot: number;
  duration_minutes: number;
  starts_at: string;
  ends_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_by: "customer" | "admin" | "system" | null;
  cancellation_reason: string | null;
  completed_at: string | null;
  created_at: string;
  appointment_addons?: { addon_id: string | null; name_ar: string; price_agorot: number }[];
}

/** What the management link reveals (see private.public_appointment_json). */
export interface PublicAppointment {
  reference: string;
  status: AppointmentStatus;
  category: ServiceCategory;
  serviceNameAr: string;
  serviceNameEn: string;
  locationNameAr: string | null;
  addons: { nameAr: string; nameEn: string; priceAgorot: number }[];
  totalPriceAgorot: number;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  customerName: string | null;
  phoneLast3: string | null;
  cancelledBy: "customer" | "admin" | "system" | null;
  cancellationDeadline: string;
  canCancel: boolean;
}

export interface AvailabilityResponse {
  durationMinutes: number;
  totalPriceAgorot: number;
  days: { date: string; slots: { startsAt: string; time: string }[] }[];
}

export interface BookingResponse {
  manageToken: string;
  appointment: {
    reference: string;
    status: AppointmentStatus;
    startsAt: string;
    endsAt: string;
    totalPriceAgorot: number;
    durationMinutes: number;
    serviceNameAr: string;
    serviceNameEn: string;
    locationNameAr: string | null;
  };
}

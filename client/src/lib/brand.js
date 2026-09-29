/** Product name and the kinds of business that use it. */
export const PRODUCT_NAME = 'Waitwell';

export const CATEGORIES = {
  SALON: { label: 'Salons & beauty', short: 'Salon', dot: 'bg-apricot' },
  CLINIC: { label: 'Clinics & health', short: 'Clinic', dot: 'bg-sage' },
  REPAIR: { label: 'Repairs', short: 'Repair shop', dot: 'bg-butter' },
  OFFICE: { label: 'Offices & admin', short: 'Office', dot: 'bg-[#9DB4C8]' },
  HELPDESK: { label: 'Help desks & IT', short: 'Help desk', dot: 'bg-[#B7A6D6]' },
  BANK: { label: 'Banks & finance', short: 'Bank', dot: 'bg-[#8FB8A8]' },
  FOOD: { label: 'Food & takeaway', short: 'Food', dot: 'bg-rose' },
  OTHER: { label: 'Other services', short: 'Other', dot: 'bg-ink-muted' },
};

export const categoryLabel = (key) => (CATEGORIES[key] || CATEGORIES.OTHER).short;

export const SOURCE_LABELS = { ONLINE: 'Joined online', WALK_IN: 'Walk-in', BOOKING: 'Booked' };

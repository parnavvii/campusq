/**
 * Demo businesses: five very different businesses sharing one Waitwell platform.
 * All of them are created by `npm run db:seed`.
 *
 * Every business has five services in the same roles, so the demo story and the
 * automated checks work for any of them:
 *   [0] main    — busy counter: a token being served and two waiting
 *   [1] second  — a walk-in customer waiting
 *   [2] third   — quiet, has history
 *   [3] paused  — paused with customers still in line
 *   [4] fresh   — brand new, no history (uses the default estimate)
 */
module.exports = {
  salon: {
    centre: { name: 'Glow & Go Salon', type: 'SALON', tagline: 'Hair, beauty & grooming', address: '14 MG Road, Bengaluru' },
    people: { admin: 'Rohit Bansal', staff: ['Meera Iyer', 'Arjun Nair'] },
    services: [
      { name: 'Haircut & Styling', location: 'Styling chairs 1–3', prefix: 'H', avg: 20, slot: 20, capacity: 2, open: '10:00', close: '20:00' },
      { name: 'Hair Colour & Spa', location: 'Colour bar', prefix: 'C', avg: 35, slot: 45, capacity: 1, open: '10:00', close: '19:00' },
      { name: 'Beard & Grooming', location: 'Chair 4', prefix: 'B', avg: 12, slot: 15, capacity: 1, open: '10:00', close: '20:00' },
      { name: 'Manicure & Pedicure', location: 'Nail station', prefix: 'M', avg: 30, slot: 30, capacity: 1, open: '10:00', close: '19:00' },
      { name: 'Bridal & Party Makeup', location: 'Studio room', prefix: 'P', avg: 45, slot: 60, capacity: 1, open: '11:00', close: '18:00' },
    ],
  },
  clinic: {
    centre: { name: 'CityCare Family Clinic', type: 'CLINIC', tagline: 'General practice & diagnostics', address: 'Sector 5, Salt Lake, Kolkata' },
    people: { admin: 'Dr. Kavita Mehta', staff: ['Farah Qureshi', 'Joel D’Souza'] },
    services: [
      { name: 'General Consultation', location: 'Room 1 · Dr. Mehta', prefix: 'G', avg: 8, slot: 10, capacity: 2, open: '09:00', close: '19:00' },
      { name: 'Paediatrics', location: 'Room 2 · Dr. Rao', prefix: 'P', avg: 10, slot: 15, capacity: 1, open: '10:00', close: '16:00' },
      { name: 'Blood Tests & Lab', location: 'Lab counter', prefix: 'L', avg: 4, slot: 10, capacity: 3, open: '08:00', close: '12:00' },
      { name: 'Vaccination', location: 'Room 3', prefix: 'V', avg: 5, slot: 10, capacity: 2, open: '10:00', close: '14:00' },
      { name: 'Physiotherapy', location: 'Therapy room', prefix: 'T', avg: 30, slot: 30, capacity: 1, open: '10:00', close: '18:00' },
    ],
  },
  repair: {
    centre: { name: 'FixIt Hub', type: 'REPAIR', tagline: 'Phone, laptop & appliance repairs', address: 'Main Market, Lajpat Nagar, Delhi' },
    people: { admin: 'Harpreet Singh', staff: ['Nikhil Jain', 'Ayesha Khan'] },
    services: [
      { name: 'Phone Repair', location: 'Counter 1', prefix: 'P', avg: 12, slot: 15, capacity: 2, open: '10:00', close: '20:00' },
      { name: 'Laptop & PC Service', location: 'Counter 2', prefix: 'L', avg: 20, slot: 30, capacity: 1, open: '10:00', close: '19:00' },
      { name: 'Device Pickup', location: 'Pickup desk', prefix: 'D', avg: 3, slot: 10, capacity: 3, open: '10:00', close: '20:00' },
      { name: 'Appliance Repair Desk', location: 'Service desk', prefix: 'A', avg: 10, slot: 15, capacity: 1, open: '10:00', close: '18:00' },
      { name: 'Data Recovery', location: 'Recovery lab', prefix: 'R', avg: 25, slot: 30, capacity: 1, open: '11:00', close: '18:00' },
    ],
  },
  office: {
    centre: { name: 'Riverside College Student Services', type: 'OFFICE', tagline: 'Certificates, fees & ID cards', address: 'Admin Block, Riverside College, Chennai' },
    people: { admin: 'Lakshmi Narayanan', staff: ['Suresh Babu', 'Divya Menon'] },
    services: [
      { name: 'Certificate Section', location: 'Admin Block, Ground Floor, Counter 2', prefix: 'A', avg: 3, slot: 10, capacity: 2, open: '09:30', close: '16:30' },
      { name: 'Administrative Help Desk', location: 'Admin Block, Room 104', prefix: 'H', avg: 5, slot: 10, capacity: 1, open: '09:30', close: '16:30' },
      { name: 'Computer Lab Access', location: 'CS Block, Lab 3', prefix: 'L', avg: 4, slot: 15, capacity: 2, open: '09:00', close: '17:00' },
      { name: 'Fee Payment Counter', location: 'Accounts Office, Counter 1', prefix: 'F', avg: 4, slot: 10, capacity: 2, open: '10:00', close: '15:00' },
      { name: 'Library ID Card Desk', location: 'Central Library, Entrance', prefix: 'C', avg: 2, slot: 10, capacity: 2, open: '09:30', close: '16:30' },
    ],
  },
  helpdesk: {
    centre: { name: 'TechAssist IT Help Desk', type: 'HELPDESK', tagline: 'Walk-in IT support for staff', address: 'Building B, Ground Floor, Pune' },
    people: { admin: 'Anil Kulkarni', staff: ['Tanvi Shah', 'Rohan Das'] },
    services: [
      { name: 'Password & Account Help', location: 'Desk 1', prefix: 'A', avg: 5, slot: 10, capacity: 2, open: '09:00', close: '18:00' },
      { name: 'Laptop & Device Setup', location: 'Desk 2', prefix: 'D', avg: 15, slot: 20, capacity: 1, open: '09:00', close: '18:00' },
      { name: 'Network & Wi-Fi Issues', location: 'Desk 3', prefix: 'N', avg: 8, slot: 15, capacity: 1, open: '09:00', close: '18:00' },
      { name: 'Hardware Drop-off', location: 'Drop-off counter', prefix: 'H', avg: 6, slot: 10, capacity: 2, open: '10:00', close: '16:00' },
      { name: 'Software Installation', location: 'Desk 4', prefix: 'S', avg: 10, slot: 15, capacity: 1, open: '09:00', close: '18:00' },
    ],
  },
};

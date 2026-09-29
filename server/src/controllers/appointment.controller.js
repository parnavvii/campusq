const appointments = require('../services/appointment.service');
const { emitQueueChanged, emitToUser } = require('../socket');

exports.book = async (req, res) => {
  const appointment = await appointments.book(req.user, req.body);
  emitQueueChanged(appointment.serviceId, 'booked');
  res.status(201).json({ success: true, message: `Booked. Your booking code is ${appointment.code}.`, appointment });
};

exports.mine = async (req, res) => {
  res.json({ success: true, ...(await appointments.listMine(req.user)) });
};

exports.cancel = async (req, res) => {
  const { serviceId, appointment } = await appointments.cancel(req.user, req.params.id);
  emitQueueChanged(serviceId, 'booking-cancelled');
  res.json({ success: true, message: 'Booking cancelled.', appointment });
};

exports.checkIn = async (req, res) => {
  const { entry, userId, appointment } = await appointments.checkIn(req.user, req.params.id);
  emitQueueChanged(entry.serviceId, 'checked-in');
  // If staff checked the customer in at the desk, the customer's own screen updates too.
  if (userId !== req.user.id) emitToUser(userId, 'booking:updated', { id: appointment.id, status: appointment.status });
  res.json({ success: true, message: `Checked in. Your token is ${entry.token}.`, appointment, entry });
};

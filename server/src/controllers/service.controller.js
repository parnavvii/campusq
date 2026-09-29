const catalog = require('../services/catalog.service');
const reports = require('../services/report.service');
const appointments = require('../services/appointment.service');
const { emitQueueChanged } = require('../socket');

exports.list = async (req, res) => {
  res.json({ success: true, services: await catalog.listServices(req.user, req.query.business) });
};

exports.get = async (req, res) => {
  res.json({ success: true, service: await catalog.getService(req.user, req.params.id) });
};

exports.create = async (req, res) => {
  const service = await catalog.createService(req.user, req.body);
  emitQueueChanged(service.id, 'service-created');
  res.status(201).json({ success: true, message: 'Service created.', service });
};

exports.update = async (req, res) => {
  const service = await catalog.updateService(req.user, req.params.id, req.body);
  emitQueueChanged(service.id, 'service-updated');
  res.json({ success: true, message: 'Service updated.', service });
};

exports.pause = async (req, res) => {
  const service = await catalog.setPaused(req.user, req.params.id, true);
  emitQueueChanged(service.id, 'paused');
  res.json({ success: true, message: `${service.name} is paused. New customers cannot join.`, service });
};

exports.resume = async (req, res) => {
  const service = await catalog.setPaused(req.user, req.params.id, false);
  emitQueueChanged(service.id, 'resumed');
  res.json({ success: true, message: `${service.name} is open again.`, service });
};

exports.statistics = async (req, res) => {
  res.json({ success: true, statistics: await reports.getStatistics(req.user, req.params.id) });
};

exports.insights = async (req, res) => {
  res.json({ success: true, insights: await reports.getInsights(req.params.id) });
};

exports.slots = async (req, res) => {
  res.json({ success: true, ...(await appointments.getSlots(req.user, req.params.id, req.query.date)) });
};

exports.appointments = async (req, res) => {
  res.json({ success: true, ...(await appointments.listForService(req.user, req.params.id, req.query.date)) });
};

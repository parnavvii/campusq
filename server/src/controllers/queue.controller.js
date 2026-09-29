const queue = require('../services/queue.service');
const { emitQueueChanged, emitToUser } = require('../socket');

/** Personal events only go to customers with an account (walk-ins have none). */
const notify = (entry, event, payload = entry) => {
  if (entry?.userId) emitToUser(entry.userId, event, payload);
};

/** Tell whoever is now first in line that they're next (clients de-duplicate by token id). */
async function notifyHeadOfLine(serviceId) {
  notify(await queue.getHeadOfLine(serviceId), 'token:next');
}

exports.join = async (req, res) => {
  const entry = await queue.joinQueue(req.user, req.body.serviceId);
  emitQueueChanged(entry.serviceId, 'joined');
  res.status(201).json({ success: true, message: `You're in the queue. Your token is ${entry.token}.`, entry });
};

exports.walkIn = async (req, res) => {
  const entry = await queue.addWalkIn(req.user, req.params.serviceId, { name: req.body.name, phone: req.body.phone });
  emitQueueChanged(entry.serviceId, 'walk-in');
  res.status(201).json({ success: true, message: `Token ${entry.token} issued to ${req.body.name}.`, entry });
};

exports.myPosition = async (req, res) => {
  res.json({ success: true, entries: await queue.getMyPositions(req.user) });
};

exports.myHistory = async (req, res) => {
  res.json({ success: true, entries: await queue.getMyHistory(req.user) });
};

exports.getQueue = async (req, res) => {
  res.json({ success: true, ...(await queue.getQueue(req.user, req.params.serviceId)) });
};

exports.cancel = async (req, res) => {
  const entry = await queue.cancelEntry(req.user, req.params.queueId);
  emitQueueChanged(entry.serviceId, 'cancelled');
  await notifyHeadOfLine(entry.serviceId);
  res.json({ success: true, message: `Token ${entry.token} cancelled.`, entry });
};

exports.callNext = async (req, res) => {
  const serviceId = req.params.serviceId;
  const result = await queue.callNext(req.user, serviceId);
  const where = { serviceName: result.serviceName, serviceLocation: result.serviceLocation };
  notify(result.completed, 'token:completed', { ...result.completed, ...where });
  notify(result.serving, 'token:called', { ...result.serving, ...where });
  await notifyHeadOfLine(serviceId);
  emitQueueChanged(serviceId, 'called-next');
  const message = result.serving
    ? `Now serving ${result.serving.token}${result.serving.guestName ? ` (${result.serving.guestName})` : ''}.`
    : `${result.completed.token} completed. No one else is waiting.`;
  res.json({ success: true, message, completed: result.completed, serving: result.serving });
};

exports.complete = async (req, res) => {
  const entry = await queue.completeEntry(req.user, req.params.queueId);
  notify(entry, 'token:completed');
  emitQueueChanged(entry.serviceId, 'completed');
  res.json({ success: true, message: `Token ${entry.token} completed.`, entry });
};

exports.skip = async (req, res) => {
  const entry = await queue.skipEntry(req.user, req.params.queueId);
  notify(entry, 'token:skipped');
  emitQueueChanged(entry.serviceId, 'skipped');
  await notifyHeadOfLine(entry.serviceId);
  res.json({ success: true, message: `Token ${entry.token} skipped.`, entry });
};

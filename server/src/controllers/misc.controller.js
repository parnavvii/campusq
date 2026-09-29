/** Small controllers: the daily report and the public (login-free) board and tracking. */
const reports = require('../services/report.service');
const publicViews = require('../services/public.service');

exports.dailyReport = async (req, res) => {
  const report = await reports.getDailyReport(req.user, { date: req.query.date, serviceId: req.query.serviceId });
  res.json({ success: true, report });
};

exports.board = async (req, res) => {
  res.json({ success: true, ...(await publicViews.getBoard(req.params.slug)) });
};

exports.track = async (req, res) => {
  res.json({ success: true, entry: await publicViews.trackToken(req.params.slug, req.query.serviceId, req.query.token) });
};

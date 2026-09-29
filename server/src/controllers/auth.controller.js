const authService = require('../services/auth.service');
const { emitQueueChanged } = require('../socket');

exports.register = async (req, res) => {
  const { name, email, phone, password } = req.body;
  const result = await authService.register({ name, email, phone, password });
  res.status(201).json({ success: true, message: 'Account created.', ...result });
};

exports.login = async (req, res) => {
  const result = await authService.login({ email: req.body.email, password: req.body.password });
  res.json({ success: true, message: 'Logged in.', ...result });
};

exports.me = async (req, res) => {
  res.json({ success: true, user: await authService.userWithBusiness(req.user) });
};

exports.listStaff = async (req, res) => {
  res.json({ success: true, staff: await authService.listStaff(req.user.business_id) });
};

exports.createStaff = async (req, res) => {
  const { name, email, password, serviceIds } = req.body;
  const staff = await authService.createStaff(req.user.business_id, { name, email, password, serviceIds });
  // Assigned-staff lists on those services changed — let open screens refresh.
  staff.services.forEach((s) => emitQueueChanged(s.id, 'service-updated'));
  res.status(201).json({ success: true, message: `Staff account created for ${staff.name}.`, staff });
};

const businesses = require('../services/business.service');
const publicViews = require('../services/public.service');
const { userWithBusiness } = require('../services/auth.service');
const { signToken } = require('../utils/jwt');
const { emitQueueChanged } = require('../socket');

/** GET /api/businesses — public directory. */
exports.list = async (req, res) => {
  res.json({ success: true, businesses: await publicViews.listBusinesses({ q: req.query.q, category: req.query.category }) });
};

/** GET /api/businesses/:slug — public business page with its services. */
exports.page = async (req, res) => {
  res.json({ success: true, ...(await publicViews.getBusinessPage(req.params.slug)) });
};

/** POST /api/businesses — a new business signs up; its owner is logged in straight away. */
exports.signup = async (req, res) => {
  const b = req.body;
  const { user } = await businesses.registerBusiness({
    business: { name: b.businessName, category: b.category, tagline: b.tagline, address: b.address, timezone: b.timezone },
    owner: { name: b.name, email: b.email, phone: b.phone, password: b.password },
  });
  res.status(201).json({ success: true, message: 'Your business is ready. Add your first service to open the queue.', token: signToken(user), user: await userWithBusiness(user) });
};

/** GET /api/businesses/mine — the signed-in staff member's or admin's business. */
exports.mine = async (req, res) => {
  res.json({ success: true, business: publicViews.publicBusiness(await businesses.getBusiness(req.user.business_id)) });
};

/** PUT /api/businesses/mine — admin edits their business's details and rules. */
exports.updateMine = async (req, res) => {
  const business = await businesses.updateBusiness(req.user.business_id, req.body);
  emitQueueChanged(0, 'business-updated', business.id);
  res.json({ success: true, message: 'Saved.', business: publicViews.publicBusiness(business) });
};

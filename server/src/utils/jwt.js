const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ALGORITHM = 'HS256';

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, name: user.name }, env.jwt.secret, {
    algorithm: ALGORITHM,
    expiresIn: env.jwt.expiresIn,
  });
}

/** Throws if the token is invalid/expired. Algorithm is pinned to block "alg" confusion attacks. */
function verifyToken(token) {
  return jwt.verify(token, env.jwt.secret, { algorithms: [ALGORITHM] });
}

module.exports = { signToken, verifyToken };

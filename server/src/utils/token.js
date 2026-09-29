/** Display format for tokens: prefix + zero-padded number, e.g. ('A', 24) -> 'A024'. */
function formatToken(prefix, number) {
  return `${prefix}${String(number).padStart(3, '0')}`;
}

module.exports = { formatToken };

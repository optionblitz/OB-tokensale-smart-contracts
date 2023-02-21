const {BigInteger, BigDecimal} = require("bigdecimal");

const PRECISION = new BigInteger("18446744073709551616");

function _bigdec (x) {
    return new BigDecimal(x.toString());
}

function _bigint (x) {
    return new BigInteger(x.toString());
}

// all int128 input parameters should be multiplied by 2^64. It`s their precision
function _param (x) {
    return _bigdec(PRECISION).multiply(_bigdec(x)).toBigInteger().toString();
}

function _makeDouble(x) {
    return (new BigDecimal(x.toString())).doubleValue();
}

function _val (x) {
    return _bigdec(x).divide(_bigdec(PRECISION));
}

const _range = (start, stop, step = 1) =>
  Array(Math.ceil((stop - start) / step)).fill(start).map((x, y) => x + y * step);

const _cartesian = (...a) =>
    a.reduce((a, b) => a.flatMap(d => b.map(e => [...d, e])), [[]]);

module.exports = {
    PRECISION,
    BigInteger, BigDecimal,
    _bigdec, _bigint,
    _param, _val,
    _makeDouble,
    _range, _cartesian
}

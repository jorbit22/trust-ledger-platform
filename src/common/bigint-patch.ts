// JSON.stringify cannot handle BigInt by default
// This patch ensures all BigInt values serialize as strings
// Must be imported before any module that returns BigInt values
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

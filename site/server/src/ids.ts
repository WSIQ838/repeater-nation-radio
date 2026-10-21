// 24-hex ids shaped like the Mongo ObjectIds Base44 used (4-byte timestamp + 8 random
// bytes), so ids from the old system and new records sort and look the same.
export function newId(): string {
  const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const rnd = crypto.getRandomValues(new Uint8Array(8));
  return ts + Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('');
}

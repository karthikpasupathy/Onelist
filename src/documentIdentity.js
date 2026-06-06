function createDocumentKey(userId, year) {
  return `${userId}:${year}`;
}

function cyrb128(input) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

function toHex32(value) {
  return value.toString(16).padStart(8, '0');
}

export function createDocumentIdentity(userId, year) {
  const key = createDocumentKey(userId, year);
  const hex = cyrb128(`onelist-document:${key}`).map(toHex32).join('').split('');

  hex[12] = '5';
  const variant = (parseInt(hex[16], 16) & 0x3) | 0x8;
  hex[16] = variant.toString(16);

  const uuid = hex.join('');
  return {
    docId: [
      uuid.slice(0, 8),
      uuid.slice(8, 12),
      uuid.slice(12, 16),
      uuid.slice(16, 20),
      uuid.slice(20),
    ].join('-'),
    docKey: key,
  };
}

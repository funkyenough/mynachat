// Locating what to reveal in the response. Mirrors verifier/src/disclosure.rs:
// the verifier only accepts a `"key":"value"` pair whose whole span is revealed.

// Group criteria come from groups/catalog.json, copied into dist/ by build.mjs
// (the verifier compiles in the same file).
let catalog;

/** Drug stems a group accepts for the prescription method. */
export async function stemsForGroup(groupId) {
  catalog ??= await fetch(new URL('./catalog.json', import.meta.url)).then((r) => r.json());
  const group = catalog.groups.find((g) => g.id === groupId);
  return group?.methods?.prescription?.drugStems ?? [];
}

const QUOTE = 0x22, BACKSLASH = 0x5c, COLON = 0x3a;
const decoder = new TextDecoder('utf-8', { fatal: true });

function stringEnd(bytes, start) {
  for (let i = start + 1; i < bytes.length; i++) {
    if (bytes[i] === BACKSLASH) i++;
    else if (bytes[i] === QUOTE) return i + 1;
  }
  return -1;
}

function decode(bytes, start, end) {
  try {
    return JSON.parse(decoder.decode(bytes.subarray(start, end)));
  } catch {
    return null;
  }
}

/** All compact-JSON `"key":"value"` string pairs, with byte ranges into `bytes`. */
export function jsonStringPairs(bytes, offset = 0) {
  const out = [];
  let i = offset;
  while (i < bytes.length) {
    if (bytes[i] !== QUOTE) { i++; continue; }
    const keyEnd = stringEnd(bytes, i);
    if (keyEnd < 0) break;
    if (bytes[keyEnd] === COLON && bytes[keyEnd + 1] === QUOTE) {
      const valEnd = stringEnd(bytes, keyEnd + 1);
      if (valEnd > 0) {
        const key = decode(bytes, i, keyEnd);
        const value = decode(bytes, keyEnd + 1, valEnd);
        if (typeof key === 'string' && typeof value === 'string') {
          out.push({ start: i, end: valEnd, key, value });
          i = valEnd;
          continue;
        }
      }
    }
    i = keyEnd;
  }
  return out;
}

export function indexOfSeq(bytes, seq, from = 0) {
  outer: for (let i = from; i <= bytes.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) if (bytes[i + j] !== seq[j]) continue outer;
    return i;
  }
  return -1;
}

/** First `drugN` pair in the HTTP response whose value contains one of `stems`. */
export function findMatchingDrug(recv, stems) {
  const bodyStart = indexOfSeq(recv, [13, 10, 13, 10]);
  const pairs = jsonStringPairs(recv, bodyStart < 0 ? 0 : bodyStart + 4);
  const drugs = pairs.filter((p) => p.key === 'drugN');
  const match = drugs.find((p) => stems.some((s) => p.value.includes(s))) ?? null;
  return { drugCount: drugs.length, match };
}

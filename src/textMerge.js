// Line-based three-way merge (diff3) used for silent multi-device sync.
//
// Given a common ancestor (`base`) and two independently edited versions
// (`mine` and `theirs`), produce a merged result. Edits that touch different
// regions are combined losslessly. When both sides changed the exact same
// region in different ways, both versions are kept in a deterministic conflict
// block so sync never silently discards text.

function splitLines(text) {
  return (text ?? '').split('\n');
}

function slicesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function formatConflictBlock(mineSlice, theirsSlice) {
  return [
    '<<<<<<< ONELIST LOCAL',
    ...mineSlice,
    '||||||| ONELIST REMOTE',
    ...theirsSlice,
    '>>>>>>> ONELIST MERGE CONFLICT',
  ];
}

// Largest dynamic-programming table (rows x columns) the exact LCS may build.
// 4M Uint16 cells is about 8 MB; anything bigger goes through the anchor-based
// path below so a long file can never exhaust memory on a phone.
const MAX_LCS_CELLS = 4_000_000;

// Exact LCS over the sub-ranges a[aStart, aEnd) and b[bStart, bEnd).
function lcsPairsExact(a, aStart, aEnd, b, bStart, bEnd, pairs) {
  const n = aEnd - aStart;
  const m = bEnd - bStart;
  const width = m + 1;
  const dp = new Uint16Array((n + 1) * width);

  for (let i = n - 1; i >= 0; i--) {
    const row = i * width;
    const next = row + width;
    for (let j = m - 1; j >= 0; j--) {
      if (a[aStart + i] === b[bStart + j]) {
        dp[row + j] = dp[next + j + 1] + 1;
      } else {
        dp[row + j] = dp[next + j] >= dp[row + j + 1] ? dp[next + j] : dp[row + j + 1];
      }
    }
  }

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[aStart + i] === b[bStart + j]) {
      pairs.push([aStart + i, bStart + j]);
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      i++;
    } else {
      j++;
    }
  }
}

// Lines that occur exactly once in each range, matched up and reduced to the
// longest run that keeps its order in both (patience diff). Linear memory.
function uniqueLineAnchors(a, aStart, aEnd, b, bStart, bEnd) {
  const seenInA = new Map();
  for (let i = aStart; i < aEnd; i++) {
    seenInA.set(a[i], seenInA.has(a[i]) ? -1 : i);
  }
  const seenInB = new Map();
  for (let j = bStart; j < bEnd; j++) {
    seenInB.set(b[j], seenInB.has(b[j]) ? -1 : j);
  }

  // Candidate matches ordered by position in `a`.
  const candidates = [];
  for (let i = aStart; i < aEnd; i++) {
    if (seenInA.get(a[i]) !== i) continue;
    const j = seenInB.get(a[i]);
    if (j === undefined || j === -1) continue;
    candidates.push([i, j]);
  }

  // Longest increasing subsequence on the `b` position.
  const tails = [];
  const previous = new Int32Array(candidates.length).fill(-1);
  for (let k = 0; k < candidates.length; k++) {
    const target = candidates[k][1];
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (candidates[tails[mid]][1] < target) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) previous[k] = tails[lo - 1];
    tails[lo] = k;
  }

  const anchors = [];
  for (let k = tails.length ? tails[tails.length - 1] : -1; k !== -1; k = previous[k]) {
    anchors.push(candidates[k]);
  }
  return anchors.reverse();
}

function lcsPairsInRange(a, aStart, aEnd, b, bStart, bEnd, pairs) {
  // Lines shared at the start and end of the range match trivially.
  while (aStart < aEnd && bStart < bEnd && a[aStart] === b[bStart]) {
    pairs.push([aStart, bStart]);
    aStart++;
    bStart++;
  }
  const suffix = [];
  while (aStart < aEnd && bStart < bEnd && a[aEnd - 1] === b[bEnd - 1]) {
    aEnd--;
    bEnd--;
    suffix.push([aEnd, bEnd]);
  }

  const n = aEnd - aStart;
  const m = bEnd - bStart;

  if (n > 0 && m > 0) {
    if ((n + 1) * (m + 1) <= MAX_LCS_CELLS && Math.min(n, m) < 65535) {
      lcsPairsExact(a, aStart, aEnd, b, bStart, bEnd, pairs);
    } else {
      // Too big for an exact table: split around unique lines and solve the
      // gaps between them. A gap with no unique line is treated as changed,
      // which can only make the merge more cautious, never lossy.
      const anchors = uniqueLineAnchors(a, aStart, aEnd, b, bStart, bEnd);
      let prevA = aStart;
      let prevB = bStart;
      for (const [anchorA, anchorB] of anchors) {
        lcsPairsInRange(a, prevA, anchorA, b, prevB, anchorB, pairs);
        pairs.push([anchorA, anchorB]);
        prevA = anchorA + 1;
        prevB = anchorB + 1;
      }
      if (anchors.length) {
        lcsPairsInRange(a, prevA, aEnd, b, prevB, bEnd, pairs);
      }
    }
  }

  for (let k = suffix.length - 1; k >= 0; k--) {
    pairs.push(suffix[k]);
  }
}

// Common subsequence between two line arrays, returned as matched index pairs
// [aIndex, bIndex] in increasing order. Exact (longest) for normal inputs.
export function lcsPairs(a, b) {
  const pairs = [];
  lcsPairsInRange(a, 0, a.length, b, 0, b.length, pairs);
  return pairs;
}

// Base line indices that are unchanged in BOTH mine and theirs. These anchor
// the merge: the regions between anchors are resolved independently.
function commonAnchors(baseLines, mineLines, theirsLines) {
  const mineByBase = new Map();
  for (const [baseIdx, mineIdx] of lcsPairs(baseLines, mineLines)) {
    mineByBase.set(baseIdx, mineIdx);
  }

  const anchors = [];
  for (const [baseIdx, theirsIdx] of lcsPairs(baseLines, theirsLines)) {
    if (mineByBase.has(baseIdx)) {
      anchors.push({ baseIdx, mineIdx: mineByBase.get(baseIdx), theirsIdx });
    }
  }
  return anchors;
}

export function mergeThreeWay(base, mine, theirs) {
  const baseStr = base ?? '';
  const mineStr = mine ?? '';
  const theirsStr = theirs ?? '';

  if (mineStr === theirsStr) return mineStr;
  if (baseStr === mineStr) return theirsStr;
  if (baseStr === theirsStr) return mineStr;

  const baseLines = splitLines(baseStr);
  const mineLines = splitLines(mineStr);
  const theirsLines = splitLines(theirsStr);

  const anchors = commonAnchors(baseLines, mineLines, theirsLines);

  const merged = [];
  let prevBase = -1;
  let prevMine = -1;
  let prevTheirs = -1;

  const resolveRegion = (baseEnd, mineEnd, theirsEnd) => {
    const baseSlice = baseLines.slice(prevBase + 1, baseEnd);
    const mineSlice = mineLines.slice(prevMine + 1, mineEnd);
    const theirsSlice = theirsLines.slice(prevTheirs + 1, theirsEnd);

    const mineChanged = !slicesEqual(mineSlice, baseSlice);
    const theirsChanged = !slicesEqual(theirsSlice, baseSlice);

    if (!mineChanged && !theirsChanged) {
      merged.push(...baseSlice);
    } else if (mineChanged && !theirsChanged) {
      merged.push(...mineSlice);
    } else if (!mineChanged && theirsChanged) {
      merged.push(...theirsSlice);
    } else if (slicesEqual(mineSlice, theirsSlice)) {
      merged.push(...mineSlice);
    } else {
      merged.push(...formatConflictBlock(mineSlice, theirsSlice));
    }
  };

  for (const anchor of anchors) {
    resolveRegion(anchor.baseIdx, anchor.mineIdx, anchor.theirsIdx);
    merged.push(baseLines[anchor.baseIdx]);
    prevBase = anchor.baseIdx;
    prevMine = anchor.mineIdx;
    prevTheirs = anchor.theirsIdx;
  }

  resolveRegion(baseLines.length, mineLines.length, theirsLines.length);

  return merged.join('\n');
}

// Merge two versions when their common ancestor is unknown. The lines both
// sides share stand in for the ancestor, so nothing from either side is dropped.
export function mergeWithoutBase(mine, theirs) {
  const mineLines = splitLines(mine);
  const theirsLines = splitLines(theirs);
  const shared = lcsPairs(mineLines, theirsLines).map(([mineIdx]) => mineLines[mineIdx]);
  return mergeThreeWay(shared.join('\n'), mine, theirs);
}

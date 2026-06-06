// Line-based three-way merge (diff3) used for silent multi-device sync.
//
// Given a common ancestor (`base`) and two independently edited versions
// (`mine` and `theirs`), produce a merged result. Edits that touch different
// regions are combined losslessly. When both sides changed the exact same
// region in different ways, the `conflictWinner` side is kept (callers pass the
// newer document's side so "newest wins").

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

// Longest common subsequence between two line arrays, returned as matched
// index pairs [aIndex, bIndex] in increasing order.
function lcsPairs(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = [];
  for (let i = 0; i <= n; i++) {
    dp.push(new Uint32Array(m + 1));
  }

  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i];
    const next = dp[i + 1];
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        row[j] = next[j + 1] + 1;
      } else {
        row[j] = next[j] >= row[j + 1] ? next[j] : row[j + 1];
      }
    }
  }

  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
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

export function mergeThreeWay(base, mine, theirs, { conflictWinner = 'mine' } = {}) {
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
      merged.push(...(conflictWinner === 'theirs' ? theirsSlice : mineSlice));
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

// Convenience wrapper that picks the conflict winner from save timestamps so
// the most recently written side prevails on a true line-level conflict.
export function mergeByRecency(base, mine, theirs, { mineUpdatedAt = 0, theirsUpdatedAt = 0 } = {}) {
  const conflictWinner = (theirsUpdatedAt || 0) > (mineUpdatedAt || 0) ? 'theirs' : 'mine';
  return mergeThreeWay(base, mine, theirs, { conflictWinner });
}

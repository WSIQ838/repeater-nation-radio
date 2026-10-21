import { haversineKm } from './geo';

// Fetch OSRM table API for distance + duration matrices
async function getOSRMMatrix(points) {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.distances || !data.durations) {
    throw new Error('OSRM table request failed');
  }
  return {
    distances: data.distances.map((row) => row.map((v) => (v != null ? v / 1000 : 0))), // m -> km
    durations: data.durations.map((row) => row.map((v) => (v != null ? v / 60 : 0))), // s -> min
  };
}

// Fallback: haversine distance matrix (duration approximated by distance / 60 km/h)
function buildHaversineMatrix(points) {
  const n = points.length;
  const distances = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineKm(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
      distances[i][j] = d;
      distances[j][i] = d;
    }
  }
  return distances;
}

export async function getMatrix(points) {
  if (points.length < 2) return { distances: [[0]], durations: [[0]] };
  try {
    return await getOSRMMatrix(points);
  } catch {
    const distances = buildHaversineMatrix(points);
    // Approximate duration: assume 60 km/h average
    const durations = distances.map((row) => row.map((v) => v / 60));
    return { distances, durations };
  }
}

function routeCost(matrix, route) {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += matrix[route[i]][route[i + 1]] || 0;
  }
  return total;
}

// 2-opt local search improvement
function twoOpt(matrix, route, keepStart, keepEnd) {
  let best = [...route];
  let improved = true;
  let iter = 0;
  const maxIter = 200;
  while (improved && iter < maxIter) {
    improved = false;
    iter++;
    const iStart = keepStart ? 1 : 0;
    const jEnd = keepEnd ? best.length - 2 : best.length - 1;
    for (let i = iStart; i < jEnd; i++) {
      for (let j = i + 1; j <= jEnd; j++) {
        const candidate = [...best];
        const reversed = candidate.slice(i, j + 1).reverse();
        candidate.splice(i, j - i + 1, ...reversed);
        if (routeCost(matrix, candidate) < routeCost(matrix, best) - 0.001) {
          best = candidate;
          improved = true;
        }
      }
    }
  }
  return best;
}

// Nearest-neighbor heuristic
function nearestNeighbor(matrix, optimizable, startIdx, endIdx, opts) {
  const { keepStartFixed, keepEndFixed, roundTrip } = opts;
  const route = [];
  const unvisited = new Set(optimizable);

  if (keepStartFixed && startIdx != null) {
    route.push(startIdx);
  } else if (optimizable.length > 0) {
    route.push(optimizable[0]);
    unvisited.delete(optimizable[0]);
  }

  let current = route.length > 0 ? route[route.length - 1] : null;
  while (unvisited.size > 0) {
    let nearest = -1;
    let minVal = Infinity;
    for (const i of unvisited) {
      const val = current != null ? matrix[current][i] : 0;
      if (val < minVal) {
        minVal = val;
        nearest = i;
      }
    }
    route.push(nearest);
    unvisited.delete(nearest);
    current = nearest;
  }

  if (keepEndFixed && !roundTrip && endIdx != null) {
    route.push(endIdx);
  }
  if (roundTrip && startIdx != null) {
    route.push(startIdx);
  }
  return route;
}

// Determine which point indices are optimizable
function getOptimizable(allPoints, opts) {
  const { keepStartFixed, keepEndFixed, roundTrip, includeCustomStops, includeRepeaters } = opts;
  const n = allPoints.length;
  const startIdx = 0;
  const endIdx = roundTrip ? null : n - 1;
  const optimizable = [];
  for (let i = 0; i < n; i++) {
    if (keepStartFixed && i === startIdx) continue;
    if (keepEndFixed && endIdx != null && i === endIdx) continue;
    if (roundTrip && i === n - 1) continue; // always skip return-to-start
    const pt = allPoints[i];
    const isRepeater = pt.type === 'repeater';
    const isCustom = !isRepeater; // stop or custom
    if (isRepeater && !includeRepeaters) continue;
    if (isCustom && !includeCustomStops) continue;
    optimizable.push(i);
  }
  return { optimizable, startIdx, endIdx };
}

// Optimize using a pre-fetched matrix
export function optimizeWithMatrix(allPoints, matrix, opts) {
  const { metric, keepStartFixed, keepEndFixed, roundTrip, includeCustomStops, includeRepeaters } = opts;
  const n = allPoints.length;
  if (n < 3) return { route: allPoints.map((_, i) => i), cost: 0 };

  const { optimizable, startIdx, endIdx } = getOptimizable(allPoints, opts);
  if (optimizable.length < 2) return { route: allPoints.map((_, i) => i), cost: 0 };

  const mat = metric === 'duration' ? matrix.durations : matrix.distances;
  let route = nearestNeighbor(mat, optimizable, startIdx, endIdx, { keepStartFixed, keepEndFixed, roundTrip });
  route = twoOpt(mat, route, keepStartFixed, keepEndFixed);
  const cost = routeCost(mat, route);
  return { route, cost };
}

// Full optimize: fetch matrix + solve
export async function optimizeRoute(allPoints, opts) {
  const matrix = await getMatrix(allPoints);
  const result = optimizeWithMatrix(allPoints, matrix, opts);
  return { ...result, matrix };
}

// Calculate total distance and duration for a given route order
export function calculateRouteStats(route, matrix) {
  let distanceKm = 0;
  let durationMin = 0;
  for (let i = 0; i < route.length - 1; i++) {
    if (matrix.distances) distanceKm += matrix.distances[route[i]][route[i + 1]] || 0;
    if (matrix.durations) durationMin += matrix.durations[route[i]][route[i + 1]] || 0;
  }
  return { distanceKm, durationMin };
}
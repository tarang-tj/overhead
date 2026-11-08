// Turns each propagation sweep into the numbers the UI shows (counts per category, what
// could be seen now) and the trail picks for Look Up. Observer and horizon are read live.
import { sunElevationDeg } from "../orbit/sky.js";
import { scanSky } from "./sky-scan.js";
import { CATEGORY_KEYS } from "./categories.js";

export function createSweepStats({ satsObj, trails, getObs, getProfile }) {
  let stat = {
    propagated: 0, msPerSweep: 0, visibleAboveHorizon: { leo: 0, starlink: 0 },
    aboveHorizonByCategory: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, 0])), seeableNow: 0,
  };
  return {
    get: () => ({ ...stat }),
    /** res = { positions, flags, timeMs, valid, ms } from the propagator. */
    run(res) {
      const date = new Date(res.timeMs), obs = getObs(), visible = [];
      const scan = scanSky({ positions: res.positions, flags: res.flags, catIdx: satsObj.categoryIdx, date, obs, profile: getProfile(), sunElDeg: sunElevationDeg(date, obs) }, (i) => visible.push(i));
      trails.setPicks(visible, res.flags);
      stat = {
        propagated: res.valid, msPerSweep: res.ms,
        visibleAboveHorizon: { leo: scan.byCategory.leo, starlink: scan.byCategory.starlink },
        aboveHorizonByCategory: scan.byCategory, seeableNow: scan.seeable,
      };
    },
  };
}

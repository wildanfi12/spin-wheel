import { openDB } from "idb";
import { initial, validate, type State } from "./model";

const db = openDB("howell-booth", 1, {
  upgrade(db) {
    db.createObjectStore("app");
  },
});

export async function mutate(fn: (s: State) => void) {
  const d = await db;
  const tx = d.transaction("app", "readwrite");
  const s: State = (await tx.store.get("state")) || initial();

  if (
    !s.segments ||
    s.segments.length !== 7 ||
    !s.prizes?.some((p) => p.id === "tws") ||
    !s.prizes?.some((p) => p.id === "hdmi") ||
    !s.prizes?.find((p) => p.id === "tws")?.image ||
    !s.prizes?.find((p) => p.id === "tws")?.sku
  ) {
    const init = initial();
    s.prizes = init.prizes;
    s.segments = init.segments;
    s.settings = init.settings;
    if (!s.dailyTwsClaims) {
      s.dailyTwsClaims = {};
    }
  }

  try {
    fn(s);
    validate(s);
    await tx.store.put(s, "state");
    await tx.done;
    return s;
  } catch (e) {
    tx.abort();
    await tx.done.catch(() => {});
    throw e;
  }
}

export const read = () => mutate(() => {});
export const restore = (s: State) => {
  validate(s);
  return mutate((old) => Object.assign(old, s));
};

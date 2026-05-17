import { dispatch } from "lib/batch.js";
 
export async function main(ns) {
  ns.disableLog("ALL");
  await dispatch(ns, "tprint");
}

import { dispatch } from "lib.js";
 
export async function main(ns) {
  ns.disableLog("ALL");
  await dispatch(ns, "tprint");
}

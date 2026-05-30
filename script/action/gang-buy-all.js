const EQUIP_TYPES = ["Weapon", "Armor", "Vehicle", "Augmentation"];

/** @param {NS} ns */
export async function main(ns) {
  const members   = ns.gang.getMemberNames();
  const equipment = ns.gang.getEquipmentNames()
    .filter(eq => EQUIP_TYPES.includes(ns.gang.getEquipmentType(eq)));

  let bought = 0;

  for (const name of members) {
    const info = ns.gang.getMemberInformation(name);
    const owned = new Set([...info.upgrades, ...info.augmentations]);

    for (const eq of equipment) {
      if (owned.has(eq)) continue;
      if (ns.gang.getEquipmentCost(eq) > ns.getPlayer().money) continue;
      ns.gang.purchaseEquipment(name, eq);
      ns.tprint(`BUY   ${name.padEnd(15)} ${eq}`);
      bought++;
    }
  }

  ns.tprint(`DONE  bought ${bought} item(s) across ${members.length} members`);
}

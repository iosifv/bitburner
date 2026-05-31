/**
 * singularity-companies.js
 *
 * Lists all companies, their rep, favor, and available job positions.
 */

const COMPANIES = [
  // Sector-12
  { name: "MegaCorp",              city: "Sector-12" },
  { name: "Blade Industries",      city: "Sector-12" },
  { name: "Four Sigma",            city: "Sector-12" },
  { name: "Bachman & Associates",  city: "Sector-12" },
  { name: "Clarke Incorporated",   city: "Sector-12" },
  { name: "Carmichael Security",   city: "Sector-12" },
  { name: "Joe's Guns",            city: "Sector-12" },
  // Aevum
  { name: "ECorp",                 city: "Aevum" },
  { name: "AeroCorp",              city: "Aevum" },
  { name: "Galactic Cybersystems", city: "Aevum" },
  { name: "Fulcrum Technologies",  city: "Aevum" },
  { name: "Watchdog Security",     city: "Aevum" },
  { name: "Rho Construction",      city: "Aevum" },
  { name: "Synaptic Enhancement Labs", city: "Aevum" },
  { name: "Applied Ethics Corp",   city: "Aevum" },
  // Chongqing
  { name: "KuaiGong International",city: "Chongqing" },
  { name: "Solaris Space Systems", city: "Chongqing" },
  // New Tokyo
  { name: "Global Pharmaceuticals",city: "New Tokyo" },
  { name: "Noodle Bar",            city: "New Tokyo" },
  { name: "VitaLife",              city: "New Tokyo" },
  // Ishima
  { name: "Storm Technologies",    city: "Ishima" },
  { name: "Nova Medical",          city: "Ishima" },
  { name: "Omega Software",        city: "Ishima" },
  { name: "Lexo-corp",             city: "Ishima" },
  // Volhaven
  { name: "NWO",                   city: "Volhaven" },
  { name: "OmniTek Incorporated",  city: "Volhaven" },
  { name: "Helios Labs",           city: "Volhaven" },
  { name: "CompuTek",              city: "Volhaven" },
  { name: "Omnia Cybersystems",    city: "Volhaven" },
  { name: "SysCore Securities",    city: "Volhaven" },
  // Criminal
  { name: "Slum Snakes",           city: "Sector-12" },
  { name: "Tetrads",               city: "Chongqing" },
];

export async function main(ns) {
  ns.disableLog("ALL");
  const s = ns.singularity;

  ns.tprint("── Companies ─────────────────────────────────────────────────────────────────");
  ns.tprint(`${"Company".padEnd(28)} ${"City".padEnd(12)} ${"Rep".padStart(10)} ${"Favor".padStart(10)} ${"Positions".padStart(10)}`);
  ns.tprint("─".repeat(78));

  let currentCity = "";

  for (const { name, city } of COMPANIES) {
    if (city !== currentCity) {
      currentCity = city;
      ns.tprint(`  [ ${city} ]`);
    }

    let rep   = null;
    let favor = null;
    let positions = [];

    try { rep   = s.getCompanyRep(name);   } catch { }
    try { favor = s.getCompanyFavor(name); } catch { }
    try { positions = s.getCompanyPositions(name); } catch { }

    if (rep === null) {
      ns.tprint(`  ✗ ${name.padEnd(26)} (not accessible)`);
      continue;
    }

    const repStr   = ns.format.number(rep);
    const favorStr = favor !== null ? favor.toFixed(0) : "?";
    ns.tprint(`  ✓ ${name.padEnd(26)} ${city.padEnd(12)} ${repStr.padStart(10)} ${favorStr.padStart(10)} ${positions.length.toString().padStart(10)}`);

  }

  ns.tprint("── done ───────────────────────────────────────────────────────────────────────");
}

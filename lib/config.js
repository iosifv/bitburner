const FILE = "config.json";

function load(ns) {
  const raw = ns.read(FILE);
  return raw && raw !== "NULL PORT DATA" ? JSON.parse(raw) : {};
}

export function getConfig(ns, key) {
  const cfg = load(ns);
  if (cfg[key] === undefined) throw new Error(`config.json: missing key "${key}" — add it and restart`);
  return cfg[key].value;
}

export function setConfig(ns, key, value) {
  const cfg = load(ns);
  if (cfg[key] !== undefined) cfg[key].value = value;
  ns.write(FILE, JSON.stringify(cfg, null, 2), "w");
}

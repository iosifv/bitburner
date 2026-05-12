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

export function getAllConfig(ns) {
  const cfg = load(ns);
  return Object.fromEntries(
    Object.entries(cfg)
      .filter(([, entry]) => entry !== null)
      .map(([key, entry]) => [key, entry.value])
  );
}

export function setConfig(ns, key, value) {
  const raw = ns.read(FILE);
  if (!raw || raw === "NULL PORT DATA") throw new Error(`config.json not found`);
  const updated = raw.replace(
    new RegExp(`("${key}"\\s*:\\s*\\{[^}]*"value"\\s*:\\s*)("[^"]*"|[^,}\\s]+)`),
    `$1${JSON.stringify(value)}`
  );
  ns.write(FILE, updated, "w");
}

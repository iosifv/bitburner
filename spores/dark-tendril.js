const DARKNET_ROAMING_PORT   = 666;
const DARKNET_BROADCAST_PORT = 1666;
const SPORE         = "spores/dark-tendril.js";
const STASIS_SPORE  = "spores/dark-stasis.js";

const LOOP_MS       = 2_000;
const DEBUG_DUMP    = true;


function sporeFingerprint(content) {
  let h = 0;
  for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) >>> 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ── Auth safety limits ────────────────────────────────────────────────────────
// These prevent a server-controlled passwordLength / data field from producing
// a candidate space large enough to OOM the browser tab (black-screen crash).
const MAX_CANDIDATE_SPACE = 200_000; // refuse to materialise a search space larger than this
const MAX_AUTH_ATTEMPTS   = 400;     // hard ceiling on authenticate() calls per crack invocation
const CRACK_TRACE         = "crack-trace.txt"; // breadcrumb cleared after every crack; non-empty after reload = crash site

// ── DarkAuthenticator ─────────────────────────────────────────────────────────
// Strategy contract: crack(ns, node, server) → { success: bool, detail?: string }
// Strategies are keyed by exact modelId. No match → { success: false }.

class DarkAuthenticator {
  #knownSecrets = new Map(); // node → secret (downlinked from engine)

  syncSecrets(obj) {
    this.#knownSecrets = new Map(Object.entries(obj ?? {}));
  }

  static #strategies = new Map([
    ["DeskMemo_3.1", {
      async crack(ns, node, server) {
        const detail = server.passwordHint.replace(/\D/g, "");
        return { success: await ns.dnet.authenticate(node, detail), detail };
      },
    }],
    ["PHP 5.4", {
      /**
        Hint: The PIN uses 2589
        Data:  2589
        Length: 4
        Format: numeric
        Model: PHP 5.4
       */
      async crack(ns, node, server) {
        const digits = server.data.replace(/\D/g, "").split("");
        if (digits.length > 8)
          return { success: false, debug: { aborted: true, reason: "permute-too-large", digits: digits.length } };
        // Generator: yields one permutation at a time so we never hold all n! arrays in memory at once.
        function* permute(arr) {
          if (arr.length <= 1) { yield arr; return; }
          for (let i = 0; i < arr.length; i++) {
            const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
            for (const p of permute(rest)) yield [arr[i], ...p];
          }
        }
        let attempts = 0;
        for (const perm of permute(digits)) {
          if (++attempts > MAX_AUTH_ATTEMPTS)
            return { success: false, debug: { aborted: true, reason: "max-attempts", attempts, model: "PHP 5.4" } };
          const detail = perm.join("");
          if (await ns.dnet.authenticate(node, detail)) return { success: true, detail };
        }
        return { success: false };
      },
    }],
    ["CloudBlare(tm)", {
      async crack(ns, node, server) {
        const detail = server.data.replace(/\D/g, "");
        return { success: await ns.dnet.authenticate(node, detail), detail };
      },
    }],
    ["FreshInstall_1.0", {
      async crack(ns, node, server) {
        let detail = null;
        if (server.passwordFormat == "numeric") {
          if (server.passwordLength == 4) detail = "0000";
          if (server.passwordLength == 5) detail = "12345";
        }
        if (server.passwordFormat == "alphabetic") {
          if (server.passwordLength == 5) detail = "admin";
          if (server.passwordLength == 8) detail = "password";
        }
        if (!detail) return { success: false };
        return { success: await ns.dnet.authenticate(node, detail), detail };
      },
    }],
    ["ZeroLogon", {
      async crack(ns, node) {
        const detail = "";
        return { success: await ns.dnet.authenticate(node, detail), detail };
      },
    }],
    ["Laika4", {
      async crack(ns, node, server) {
        const commonDogNames = ["fido", "spot", "rover", "max"];
        const candidates = server.passwordLength
          ? commonDogNames.filter(n => n.length === server.passwordLength)
          : commonDogNames;
        for (const detail of candidates) {
          if (await ns.dnet.authenticate(node, detail)) return { success: true, detail };
        }
        return { success: false };
      },
    }],
    ["RateMyPix.Auth", {
      /**
       * Hint: !!🌶️!!
        Length: 6
        Format: numeric
        Model: RateMyPix.Auth
       */
      async crack(ns, node, server) {
        const len          = server.passwordLength;
        const space        = 10 ** len;
        if (space > MAX_CANDIDATE_SPACE)
          return { success: false, debug: { aborted: true, reason: "space-too-large", space, len, model: "RateMyPix.Auth" } };

        const countPeppers = str => (String(str).match(/🌶️/gu) ?? []).length;
        const pepperScore  = (guess, target) => {
          let score = 0;
          for (let i = 0; i < len; i++) if (guess[i] === target[i]) score++;
          return score;
        };

        let candidates = Array.from({ length: space }, (_, i) => i.toString().padStart(len, "0"));

        try {
          const logs = await ns.dnet.heartbleed(node) ?? [];
          for (const entry of logs) {
            if (entry.passwordAttempted == null) continue;
            const guess   = String(entry.passwordAttempted).padStart(len, "0");
            const peppers = countPeppers(entry.data);
            candidates    = candidates.filter(c => pepperScore(guess, c) === peppers);
          }
        } catch {}

        let guess = candidates[0] ?? "0".repeat(len);
        let attempts = 0;

        while (candidates.length > 0) {
          if (++attempts > MAX_AUTH_ATTEMPTS)
            return { success: false, debug: { aborted: true, reason: "max-attempts", attempts, model: "RateMyPix.Auth" } };
          if (await ns.dnet.authenticate(node, guess)) return { success: true, detail: guess };

          let peppers = 0;
          try {
            const logs  = await ns.dnet.heartbleed(node) ?? [];
            const entry = [...logs].reverse().find(e => String(e.passwordAttempted).padStart(len, "0") === guess);
            if (entry) peppers = countPeppers(entry.data);
          } catch {}

          // Always exclude the tried guess — prevents stale heartbleed data from locking the loop.
          candidates = candidates.filter(c => c !== guess && pepperScore(guess, c) === peppers);
          if (!candidates.length) break;
          guess = candidates[0];
        }

        return { success: false };
      },
    }],
    ["BellaCuore", {
      /**
      Hint: The password is between 'XXXV' and 'LXXIII'
      Data:  XXXV,LXXIII
      Length: 2
      Format: numeric
      Model: BellaCuore

      message: The password is between 'XXXV' and 'LXXIII'
      data: PARUM BREVIS
      passwordAttempted: NaN
      code: 401
      */
      async crack(ns, node, server) {
        const fromRoman = s => {
          const vals = { I:1, V:5, X:10, L:50, C:100, D:500, M:1000 };
          let n = 0;
          for (let i = 0; i < s.length; i++) {
            const cur = vals[s[i]], nxt = vals[s[i+1]];
            n += (nxt && cur < nxt) ? -cur : cur;
          }
          return n;
        };

        // Single-value mode: "The password is the value of the number 'LXV'"
        const singleMatch = String(server.passwordHint).match(/['"]([IVXLCDM]+)['"]/i);
        if (singleMatch) {
          const detail = String(fromRoman(singleMatch[1].toUpperCase()));
          return { success: await ns.dnet.authenticate(node, detail), detail };
        }

        // Range mode: server.data = "XXXV,LXXIII"
        const parts = String(server.data).split(",");
        if (parts.length < 2) return { success: false };
        let lo = fromRoman(parts[0].trim());
        let hi = fromRoman(parts[1].trim());

        try {
          for (const entry of await ns.dnet.heartbleed(node) ?? []) {
            const n = parseInt(entry.passwordAttempted);
            if (isNaN(n)) continue;
            // "PARUM BREVIS" = too small; anything else = too big
            if (String(entry.data).toLowerCase().includes("parum")) lo = Math.max(lo, n + 1);
            else                                                     hi = Math.min(hi, n - 1);
          }
        } catch {}

        while (lo <= hi) {
          const mid    = Math.floor((lo + hi) / 2);
          const detail = mid.toString().padStart(2, "0");
          if (await ns.dnet.authenticate(node, detail)) return { success: true, detail };

          try {
            const logs  = await ns.dnet.heartbleed(node) ?? [];
            const entry = [...logs].reverse().find(e => parseInt(e.passwordAttempted) === mid);
            if (entry) {
              if (String(entry.data).toLowerCase().includes("parum")) { lo = mid + 1; continue; }
              else                                                     { hi = mid - 1; continue; }
            }
          } catch {}
          break;
        }

        return { success: false };
      },
    }],
    ["TopPass", {
      async crack(ns, node) {
        const passwords = [
          "",
          "password", "12345678",
          "qwerty", "123456789", "12345", "1234", "111111", "1234567",
          "dragon", "123123", "baseball", "abc123", "football", "monkey", "letmein",
          "zxcvbn", "555555", "11111111", "131313", "freedom", "777777", "pass",
          "maggie", "159753", "aaaaaa", "ginger", "princess", "joshua", "cheese", "amanda",
          "sunshine", "iloveyou", "2000", "charlie", "robert", "thomas", "hockey",
          "ranger", "daniel", "starwars", "112233", "george", "computer", "michelle", "jessica",
        ];
        for (const detail of passwords) {
          if (await ns.dnet.authenticate(node, detail)) return { success: true, detail };
        }
        return { success: false };
      },
    }],
    ["KingOfTheHill", {
      async crack(ns, node, server) {
        const len    = server.passwordLength ?? 3;
        const maxVal = 10 ** len - 1;

        const parsePeak = msg => {
          const match = String(msg ?? "").match(/highest peak:\s*([\d,]+)/i);
          return match ? parseInt(match[1].replace(/,/g, ""), 10) : null;
        };

        // Altitude variant: message contains "highest peak: X" — to crack, submit peak + 1.
        const tryAltitudeModel = async (logs) => {
          let currentPeak = -1;
          for (const entry of logs) {
            const peak = parsePeak(entry.message);
            if (peak != null) currentPeak = Math.max(currentPeak, peak);
          }
          if (currentPeak < 0) return null;
          const target = currentPeak + 1;
          if (target > maxVal) return { success: false, debug: { variant: "altitude", currentPeak, maxVal, reason: "peak exceeds digit limit" } };
          const detail = String(target);
          return { success: await ns.dnet.authenticate(node, detail), detail };
        };

        // Direction variant: data is "higher" / "lower" — binary search.
        const tryDirectionModel = async (logs) => {
          let lo = 0, hi = maxVal;
          for (const entry of logs) {
            const n    = parseInt(entry.passwordAttempted);
            const hint = String(entry.data).trim().toLowerCase();
            if (isNaN(n)) continue;
            if (hint === "higher") lo = Math.max(lo, n + 1);
            if (hint === "lower")  hi = Math.min(hi, n - 1);
          }
          while (lo <= hi) {
            const mid    = Math.floor((lo + hi) / 2);
            const detail = String(mid);
            try {
              if (await ns.dnet.authenticate(node, detail)) return { success: true, detail };
            } catch (e) {
              return { success: false, debug: { variant: "direction", lo, hi, error: e?.message ?? String(e) } };
            }
            try {
              const freshRaw = await ns.dnet.heartbleed(node);
              const fresh    = Array.isArray(freshRaw) ? Array.from(freshRaw) : [];
              const entry    = [...fresh].reverse().find(e => parseInt(e.passwordAttempted) === mid);
              if (entry) {
                const hint = String(entry.data).trim().toLowerCase();
                if (hint === "higher") { lo = mid + 1; continue; }
                if (hint === "lower")  { hi = mid - 1; continue; }
              }
            } catch {}
            break;
          }
          return { success: false, debug: { variant: "direction", lo, hi } };
        };

        try {
          const raw  = await ns.dnet.heartbleed(node);
          const logs = Array.isArray(raw) ? Array.from(raw) : [];
          const hasAltitudeFeedback = logs.some(e => parsePeak(e.message) != null);
          if (hasAltitudeFeedback) {
            const result = await tryAltitudeModel(logs);
            if (result) return result;
          }
          return await tryDirectionModel(logs);
        } catch (e) {
          return { success: false, debug: { error: e?.message ?? String(e) } };
        }
      },
    }],
    ["AccountsManager_4.2", {   
       /**
     * Can improve, with quick sort
     * 
      message: The password is a number between 0 and 10
      data: Higher
      passwordAttempted: 5
      code: 401
     */
      async crack(ns, node) {
        let lo = 0, hi = 10;

        try {
          for (const entry of await ns.dnet.heartbleed(node) ?? []) {
            const n = parseInt(entry.passwordAttempted);
            if (isNaN(n)) continue;
            const hint = String(entry.data).trim().toLowerCase();
            if (hint === "higher") lo = Math.max(lo, n + 1);
            if (hint === "lower")  hi = Math.min(hi, n - 1);
          }
        } catch {}

        while (lo <= hi) {
          const mid    = Math.floor((lo + hi) / 2);
          const detail = mid.toString().padStart(2, "0");
          if (await ns.dnet.authenticate(node, detail)) return { success: true, detail };

          try {
            const logs  = await ns.dnet.heartbleed(node) ?? [];
            const entry = [...logs].reverse().find(e => parseInt(e.passwordAttempted) === mid);
            if (entry) {
              const hint = String(entry.data).trim().toLowerCase();
              if (hint === "higher")     { lo = mid + 1; continue; }
              if (hint === "lower")      { hi = mid - 1; continue; }
            }
          } catch {}
          break;
        }

        return { success: false };
      },
    }],
    ["Factori-Os", {
      async crack(ns, node) {
        const primes = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97];

        // Check heartbleed for a divisibility hint to narrow the search
        let candidates = null;
        try {
          const logs = await ns.dnet.heartbleed(node) ?? [];
          for (const entry of logs) {
            const match = String(entry.message ?? "").match(/Password IS divisible by '(\d+)'/i);
            if (match) {
              const divisor = parseInt(match[1]);
              candidates = [];
              for (let n = divisor; n <= 99; n += divisor) candidates.push(String(n));
              break;
            }
          }
        } catch {}

        for (const detail of candidates ?? primes.map(String)) {
          if (await ns.dnet.authenticate(node, detail)) return { success: true, detail };
        }
        return { success: false };
      },
    }],
    ["OpenWebAccessPoint", {
      /**
        Hint: (I'm busy browsing social media at the cafe)
        Length: 5
        Format: numeric
        Model: OpenWebAccessPoint

        message: (I'm busy browsing social media at the cafe)
        data:  But I am already saved, for the Machine is immortal... even in death I serve it  No characters are in the right place. I just discovered  hydro.citadel:84230 a new zero-day exploit. It could be worth a lot of cred. 
        passwordAttempted: 33213
        code: 401

        Note to self: 6 and 5 are important.
        message: (I'm busy browsing social media at the cafe)
        data: 63032721705170911111111654321819 Begone you filth! My gift must be the first modification that your body should have! baseba hydro%phantom:56564 ll29798 Note to self: 4 and 5 are important.
        passwordAttempted: admin
        code: 401
      */
      async crack(ns, node) {
        const parseExact = data => {
          const match = String(data).match(/(no|\d+) characters? (?:is|are) in the right place/i);
          if (!match) return null;
          return match[1].toLowerCase() === "no" ? 0 : parseInt(match[1]);
        };

        const exactScore = (guess, target) => {
          let count = 0;
          for (let i = 0; i < guess.length; i++) if (guess[i] === target[i]) count++;
          return count;
        };

        let candidates = Array.from({ length: 100000 }, (_, i) => i.toString().padStart(5, "0"));

        try {
          for (const entry of await ns.dnet.heartbleed(node) ?? []) {
            const data = String(entry.data ?? "");

            // Exact-match positional feedback
            const exact = parseExact(data);
            if (exact !== null && entry.passwordAttempted != null) {
              const guess = String(entry.passwordAttempted).padStart(5, "0");
              candidates = candidates.filter(c => exactScore(guess, c) === exact);
            }

            // "Note to self: X and Y are important" → those digits must appear in the password
            const noteMatch = data.match(/note to self:\s*(\d+) and (\d+) are important/i);
            if (noteMatch) {
              const [, a, b] = noteMatch;
              candidates = candidates.filter(c => c.includes(a) && c.includes(b));
            }
          }
        } catch {}

        let attempts = 0;
        while (candidates.length > 0) {
          if (++attempts > MAX_AUTH_ATTEMPTS)
            return { success: false, debug: { aborted: true, reason: "max-attempts", attempts, model: "OpenWebAccessPoint" } };
          const detail = candidates[0];
          if (await ns.dnet.authenticate(node, detail)) return { success: true, detail };

          try {
            const logs  = await ns.dnet.heartbleed(node) ?? [];
            const entry = [...logs].reverse().find(e => String(e.passwordAttempted).padStart(5, "0") === detail);
            if (entry) {
              const exact = parseExact(String(entry.data ?? ""));
              // Exclude the tried candidate regardless — prevents stale data locking the loop.
              if (exact !== null) { candidates = candidates.filter(c => c !== detail && exactScore(detail, c) === exact); continue; }
            }
          } catch {}

          candidates = candidates.slice(1);
        }

        return { success: false };
      },
    }],
    ["Pr0verFl0", {
      /**
        Hint: Warning: password buffer is 4 bytes
        Length: 4
        Format: alphanumeric
        Model: Pr0verFl0

        message: auth failed: received 'ˍˍˍˍ', expected '■■■■'
        passwordAttempted: ˍˍˍˍ
        passwordExpected: ■■■■
        code: 401
      */
      async crack(ns, node, server) {
        const len = server.passwordLength ?? 4;
        // Alphanumeric chars only — used to extract a candidate from free-text fields.
        const reCandidate = new RegExp(`[A-Za-z0-9]{${len}}`, "g");

        // Scan heartbleed logs newest-first for any leaked password candidate.
        // `sent` is the string we just sent so we can skip it as a false-positive.
        const scanHeartbleed = async (sent = null) => {
          try {
            const logs = await ns.dnet.heartbleed(node) ?? [];
            for (const entry of [...logs].reverse()) {
              // Direct leak: passwordExpected partially or fully un-redacted.
              const leaked = String(entry.passwordExpected ?? "");
              if (leaked && !/^[■\s]+$/.test(leaked)) {
                const clean = leaked.replace(/■/g, "").trim();
                if (clean.length > 0) return clean;
              }

              // Overflow side-channel: password appears verbatim in message or data.
              // Quotes around it are optional — some overflow payloads strip them.
              for (const field of [entry.message, entry.data]) {
                const text = String(field ?? "");
                // Prefer quoted form first, then fall back to bare alphanumeric match.
                const quoted = text.match(/expected ['"]([^'"■]+)['"]/i);
                if (quoted && quoted[1] !== sent) return quoted[1];

                const bare = [...text.matchAll(reCandidate)]
                  .map(m => m[0])
                  .find(m => m !== sent);
                if (bare) return bare;
              }
            }
          } catch {}
          return null;
        };

        // Try any existing heartbleed data first (free — no auth call needed).
        let detail = await scanHeartbleed();
        if (detail && await ns.dnet.authenticate(node, detail)) return { success: true, detail };

        // Buffer overflow: sending a string LONGER than the buffer corrupts the
        // censoring logic, causing heartbleed to leak passwordExpected uncensored.
        // Also check whether the overflow itself bypasses the auth check.
        for (let overflowLen = len + 1; overflowLen <= len + 64; overflowLen++) {
          const overflow = "A".repeat(overflowLen);
          if (await ns.dnet.authenticate(node, overflow)) return { success: true, detail: overflow };
          detail = await scanHeartbleed(overflow);
          if (detail && await ns.dnet.authenticate(node, detail)) return { success: true, detail };
        }

        return { success: false };
      },
    }],
    ["BigMo%od", {
      /**
        Hint: (password % n) % (n % 32)
        Length: 5
        Format: numeric
        Model: BigMo%od

        message: (Password % 123454) % (123454 % 32) = 23
        data: 23
        passwordAttempted: 123454
        code: 401

        message: (Password % 10000) % (10000 % 32) = 3
        data: 3
        passwordAttempted: 10000
        code: 401
      */
      async crack(ns, node) {
        let candidates = Array.from({ length: 100000 }, (_, i) => i);
        const seen = new Set();

        const applyConstraint = (n, result) => {
          const key = `${n}:${result}`;
          if (seen.has(key) || (n % 32) === 0) return;
          seen.add(key);
          candidates = candidates.filter(c => (c % n) % (n % 32) === result);
        };

        const readHeartbleed = async () => {
          try {
            for (const entry of await ns.dnet.heartbleed(node) ?? []) {
              const n = parseInt(entry.passwordAttempted), result = parseInt(entry.data);
              if (!isNaN(n) && !isNaN(result)) applyConstraint(n, result);
            }
          } catch {}
        };

        await readHeartbleed();

        // Probe with n > 99999: password % n = password, so result = password % (n%32)
        // Moduli 29, 31, 23, 19 are coprime; their LCM > 99999 → guaranteed isolation
        for (const n of [100029, 100031, 100023, 100019]) {
          if (candidates.length <= 1) break;
          await ns.dnet.authenticate(node, String(n));
          await readHeartbleed();
        }

        let attempts = 0;
        for (const c of candidates) {
          if (++attempts > MAX_AUTH_ATTEMPTS)
            return { success: false, debug: { aborted: true, reason: "max-attempts", attempts, model: "BigMo%od" } };
          const detail = c.toString().padStart(5, "0");
          if (await ns.dnet.authenticate(node, detail)) return { success: true, detail };
        }
        return { success: false };
      },
    }],
    ["DeepGreen", {
      /**
        Hint: Only a true master may pass
        Length: 3
        Format: numeric
        Model: DeepGreen

        message: Hint: 0 symbols are match exactly,  and 0 symbols match but are in the wrong place.
        data: 0,0
        passwordAttempted: 
        code: 401
      */
      async crack(ns, node) {
        const score = (guess, target) => {
          let exact = 0, misplaced = 0;
          const gCounts = {}, tCounts = {};
          for (let i = 0; i < 3; i++) {
            if (guess[i] === target[i]) { exact++; continue; }
            gCounts[guess[i]] = (gCounts[guess[i]] ?? 0) + 1;
            tCounts[target[i]] = (tCounts[target[i]] ?? 0) + 1;
          }
          for (const d of Object.keys(gCounts)) misplaced += Math.min(gCounts[d], tCounts[d] ?? 0);
          return { exact, misplaced };
        };

        let candidates = Array.from({ length: 1000 }, (_, i) => i.toString().padStart(3, "0"));

        try {
          for (const entry of await ns.dnet.heartbleed(node) ?? []) {
            if (entry.passwordAttempted == null || !entry.data) continue;
            const guess = String(entry.passwordAttempted).padStart(3, "0");
            const [exact, misplaced] = String(entry.data).split(",").map(Number);
            if (!isNaN(exact) && !isNaN(misplaced))
              candidates = candidates.filter(c => { const s = score(guess, c); return s.exact === exact && s.misplaced === misplaced; });
          }
        } catch {}

        let attempts = 0;
        while (candidates.length > 0) {
          if (++attempts > MAX_AUTH_ATTEMPTS)
            return { success: false, debug: { aborted: true, reason: "max-attempts", attempts, model: "DeepGreen" } };
          const detail = candidates[0];
          if (await ns.dnet.authenticate(node, detail)) return { success: true, detail };

          try {
            const logs  = await ns.dnet.heartbleed(node) ?? [];
            const entry = [...logs].reverse().find(e => String(e.passwordAttempted).padStart(3, "0") === detail);
            if (entry) {
              const [exact, misplaced] = String(entry.data).split(",").map(Number);
              if (!isNaN(exact) && !isNaN(misplaced)) {
                // Exclude the tried candidate regardless — prevents stale data locking the loop.
                candidates = candidates.filter(c => { if (c === detail) return false; const s = score(detail, c); return s.exact === exact && s.misplaced === misplaced; });
                continue;
              }
            }
          } catch {}

          candidates = candidates.slice(1); // heartbleed unavailable — drop tried candidate
        }

        return { success: false };
      },
    }],
    ["NIL", {
      /**
        Hint: you are one who's'nt authorized
        Length: 4
        Format: numeric
        Model: NIL

        message: that wasn't right
        data: yesn't,yesn't,yes,yesn't
        passwordAttempted: 5555
        code: 401
      */
      async crack(ns, node, server) {
        const len = server.passwordLength;

        // Track possible digits per position independently — avoids 10^len explosion.
        const possible = Array.from({ length: len }, () => new Set("0123456789".split("")));

        const applyFeedback = (guess, data) => {
          const parts = String(data).split(",").map(s => s.trim().toLowerCase());
          for (let i = 0; i < Math.min(parts.length, len); i++) {
            if (parts[i] === "yes") {
              possible[i].clear();
              possible[i].add(guess[i]);
            } else {
              possible[i].delete(guess[i]);
            }
          }
        };

        const makeGuess = () => possible.map(s => [...s][0] ?? "0").join("");

        try {
          for (const entry of await ns.dnet.heartbleed(node) ?? []) {
            if (entry.passwordAttempted == null || !entry.data) continue;
            applyFeedback(String(entry.passwordAttempted).padStart(len, "0"), entry.data);
          }
        } catch {}

        let attempts = 0;
        while (possible.every(s => s.size > 0)) {
          if (++attempts > MAX_AUTH_ATTEMPTS)
            return { success: false, debug: { aborted: true, reason: "max-attempts", attempts, model: "NIL" } };
          const detail = makeGuess();
          if (await ns.dnet.authenticate(node, detail)) return { success: true, detail };

          try {
            const logs  = await ns.dnet.heartbleed(node) ?? [];
            const entry = [...logs].reverse().find(e => String(e.passwordAttempted).padStart(len, "0") === detail);
            if (entry?.data) { applyFeedback(detail, entry.data); continue; }
          } catch {}

          // No feedback — eliminate this digit from each undecided position and advance.
          for (let i = 0; i < len; i++) {
            if (possible[i].size > 1) possible[i].delete(detail[i]);
          }
        }

        return { success: false };
      },
    }],
    ["EuroZone Free", {
      /**
        Hint: My favorite EU country
        Length: 18
        Format: ASCII
        Model: EuroZone Free

        message: My favorite EU country
        data: 
        passwordAttempted: dasdas
        code: 401
        2:23:15 AM: quantum^com - heartbeat check (alive)
        I must use i & f!
      */
      async crack(ns, node, server) {
        // Hint: "My favorite EU country", length 18, ASCII — try all 18-char EU formal names.
        const candidates = [
          "Kingdom of Belgium", "Republic of Cyprus",  "Republic of Latvia",
          "Republic of France",  "Republic of Greece",  "Kingdom of Denmark",
          "Republic of Poland",
        ];
        for (const detail of candidates) {
          if (await ns.dnet.authenticate(node, detail)) return { success: true, detail };
        }
        for (const detail of candidates) {
          const lower = detail.toLowerCase();
          if (await ns.dnet.authenticate(node, lower)) return { success: true, detail: lower };
        }
        return { success: false };
      },
    }],
    ["OrdoXenos", {
      /**
        Hint: XOR mask encrypted password: "Ns6a@".
        Data:  Ns6a@;00000100 00010010 00000100 00010011 00001000
        Length: 5
        Format: alphanumeric
        Model: OrdoXenos


        message: XOR mask encrypted password: "Ns6a@".
        data: Ns6a@;00000100 00010010 00000100 00010011 00001000
        passwordAttempted: abncf
        code: 401
      */
      async crack(ns, node, server) {
        const [encrypted, maskStr] = String(server.data).split(";");
        const mask   = maskStr.trim().split(/\s+/).map(b => parseInt(b, 2));
        const detail = [...encrypted].map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ (mask[i] ?? 0))).join("");
        return { success: await ns.dnet.authenticate(node, detail), detail };
      },
    }],
    ["PrimeTime 2", {
      /**
        Hint: The password is the largest prime factor of 87097703871
        Data:  87097703871
        Length: 4
        Format: numeric
        Model: PrimeTime 2
      */
      async crack(ns, node, server) {
        let n = BigInt(server.data.trim());
        let largestFactor = 1n;
        for (let f = 2n; f * f <= n; f++) {
          while (n % f === 0n) {
            largestFactor = f;
            n /= f;
          }
        }
        if (n > 1n) largestFactor = n;
        const detail = largestFactor.toString();
        return { success: await ns.dnet.authenticate(node, detail), detail };
      },
    }],
    ["OctantVoxel", {
      /**
        Hint: the password is the base 2 number 1010011 in base 10
        Data:  2,1010011
        Length: 2
        Format: numeric
        Model: OctantVoxel

        message: the password is the base 2 number 1010011 in base 10
        data: 2,1010011
        passwordAttempted: 
        code: 401
      */
      async crack(ns, node, server) {
        const [base, numStr] = String(server.data).split(",");
        const detail = String(parseInt(numStr.trim(), parseInt(base.trim())));
        return { success: await ns.dnet.authenticate(node, detail), detail };
      },
    }],
    ["MathML", {
      /**
        "hint": "The password is the evaluation of this expression",
      "data": "59 * 52 / 58",
      "length": 17,
      "format": "ASCII",
      "model": "MathML"

      */
      async crack(ns, node, server) {
        const expression = String(server.data).trim()
          .replace(/➕/g,        "+")
          .replace(/➖|−/g,      "-")
          .replace(/[✖×ҳ]/g,   "*")
          .replace(/[➗÷]/g,     "/");
        let result;
        try {
          result = eval(expression);
        } catch {
          return { success: false };
        }
        const detail = String(result);
        return { success: await ns.dnet.authenticate(node, detail), detail };
      },
    }],
    ["110100100", {
      /**
      "hint": "beep boop",
      "data": "01001001 01110110 01101011 01101011 01000111",
      "length": 5,
      "format": "alphabetic",
      "model": "110100100"

      */
      async crack(ns, node, server) {
        const binaryStr = String(server.data).trim();
        const chars = binaryStr.split(/\s+/).map(b => String.fromCharCode(parseInt(b, 2)));
        const detail = chars.join("");
        return { success: await ns.dnet.authenticate(node, detail), detail };
      },
    }],
    ["2G_cellular", {
      /**
        Hint: I thought about it for some time, but that is not the password.
        Length: 6
        Format: numeric
        Model: 2G_cellular

        message: Found a mismatch while checking each character (0)
        data: Response time: 500ms
        passwordAttempted: 567567
        code: 401

        message: Found a mismatch while checking each character (1)
        data: Response time: 650ms
        passwordAttempted: 321321
        code: 401
      */
      async crack(ns, node, server) {
        const length = server.passwordLength ?? 6;
        const known  = [];
        let attempts = 0;

        outer: while (known.length < length) {
          for (let digit = 0; digit <= 9; digit++) {
            if (++attempts > MAX_AUTH_ATTEMPTS)
              return { success: false, debug: { aborted: true, reason: "max-attempts", attempts, model: "2G_cellular" } };
            const candidate = known.join("") + String(digit) + "0".repeat(length - known.length - 1);

            if (await ns.dnet.authenticate(node, candidate)) return { success: true, detail: candidate };

            try {
              const logs  = await ns.dnet.heartbleed(node) ?? [];
              const entry = [...logs].reverse().find(e => String(e.passwordAttempted) === candidate);
              if (entry) {
                const match = String(entry.message).match(/\((\d+)\)/);
                if (match && parseInt(match[1]) > known.length) {
                  known.push(String(digit));
                  continue outer;
                }
              }
            } catch {}
          }
          break;
        }

        return { success: false };
      },
    }],
    ["m3rc1l3ss_l4byr1nth", {
      /**
       
      */
      async crack(ns, node, server) {
        

        return { success: false };
      },
    }],
  ]);


  async authenticate(ns, node, server) {
    // Tier 0: live session — no auth call needed at all
    if (server.hasSession) {
      return { success: true, strategy: "session", secret: this.#knownSecrets.get(node) };
    }

    // Tier 1: cached secret from engine downlink — single auth call
    const cached = this.#knownSecrets.get(node);
    if (cached != null) {
      if (await ns.dnet.authenticate(node, cached)) {
        return { success: true, strategy: "cached", secret: cached };
      }
    }

    // Tier 2: cold path — exact modelId lookup
    const strategy = DarkAuthenticator.#strategies.get(server.modelId);
    if (strategy) {
      // Write a breadcrumb before starting; cleared immediately after. A non-empty
      // crack-trace.txt surviving a reload pinpoints which strategy caused the crash.
      try { ns.write(CRACK_TRACE, JSON.stringify({ ts: Date.now(), host: ns.getHostname(), node, model: server.modelId, len: server.passwordLength }), "w"); } catch {}
      try {
        const r = await strategy.crack(ns, node, server);
        try { ns.write(CRACK_TRACE, "", "w"); } catch {}
        if (r.success) {
          return { success: true, strategy: server.modelId, secret: r.detail };
        }
        return { success: false, strategy: null, secret: undefined, debug: r.debug ?? { tried: r.detail } };
      } catch (e) {
        try { ns.write(CRACK_TRACE, "", "w"); } catch {}
        return { success: false, strategy: null, secret: undefined, debug: { error: e?.message ?? String(e) } };
      }
    }

    return { success: false, strategy: null, secret: undefined };
  }
}

// ── DarkAction ────────────────────────────────────────────────────────────────
// Strategy contract: canAttempt(ns, node, server) → bool
//                    execute(ns, node) → { success: bool, ...details }

class DarkAction {
  static #strategies = [
    {
      name: "propagate",
      canAttempt(ns, node, server) {
        return server.isOnline && server.isConnectedToCurrentServer && server.hasSession;
      },
      async execute(ns, node) {
        if (ns.isRunning(SPORE, node)) ns.kill(SPORE, node);
        ns.scp([SPORE, STASIS_SPORE], node);
        const pid = ns.exec(SPORE, node, { preventDuplicates: true });
        return { success: pid > 0 };
      },
    },
    {
      name: "stasisLink",
      canAttempt(ns, node, server) {
        const wantsStasis = node === "m3rc1l3ss_l4byr1nth"
          || ns.ls(node).some(f => f.toUpperCase() === "STORM_SEED.EXE");
        return server.isOnline && server.isConnectedToCurrentServer && server.hasSession && wantsStasis;
      },
      async execute(ns, node) {
        // For m3rc1l3ss_l4byr1nth: stasis the PARENT (this host) to buy cracking time.
        // For storm-seed nodes: stasis the node itself so we can work on it remotely.
        const target = node === "m3rc1l3ss_l4byr1nth" ? ns.getHostname() : node;
        if (ns.isRunning(STASIS_SPORE, target)) return { success: true };
        ns.scp(STASIS_SPORE, target);
        const pid = ns.exec(STASIS_SPORE, target, { preventDuplicates: true });
        return { success: pid > 0 };
      },
    },
    {
      name: "exfiltrate",
      canAttempt(ns, node, server) {
        return server.isOnline && server.isConnectedToCurrentServer && server.hasSession;
      },
      async execute(ns, node) {
        const files = ns.ls(node).filter(f => f.endsWith(".txt") || f.endsWith(".lit"));
        if (!files.length) return { success: true };

        // Stage on this host to read contents, then clean up — engine stores in darknet.json
        ns.scp(files, ns.getHostname(), node);
        const loot = {};
        for (const f of files) {
          loot[f.split("/").at(-1)] = ns.read(f);
          ns.rm(f);
        }
        return { success: true, loot };
      },
    },
    {
      name: "memoryReallocation",
      canAttempt(ns, node, server) {
        return server.isOnline && server.isConnectedToCurrentServer && server.hasSession;
      },
      async execute(ns, node) {
        try {
          const result = await ns.dnet.memoryReallocation(node);
          return { success: !!result, result };
        } catch {
          return { success: false };
        }
      },
    },
    // {
    //   name: "induceServerMigration",
    //   canAttempt(ns, node, server) {
    //     return server.isOnline && server.isConnectedToCurrentServer && server.hasSession;
    //   },
    //   async execute(ns, node) {
    //     try {
    //       const result = await ns.dnet.induceServerMigration(node);
    //       return { success: !!result, result };
    //     } catch {
    //       return { success: false };
    //     }
    //   },
    // },
  ];
  

  // Runs all applicable action strategies against a node; returns result array.
  async runAction(ns, node, server) {
    const results = [];
    for (const action of DarkAction.#strategies) {
      if (!action.canAttempt(ns, node, server)) continue;
      results.push({ name: action.name, ...(await action.execute(ns, node)) });
    }
    return results;
  }
}

// ── DarkTendril ───────────────────────────────────────────────────────────────

class DarkTendril {
  constructor(ns) {
    this.ns      = ns;
    this.myV     = sporeFingerprint(ns.read(SPORE));
    this.host    = ns.getHostname();
    this.auth    = new DarkAuthenticator();
    this.actions = new DarkAction();
  }

  #report(payload) {
    this.ns.tryWritePort(DARKNET_ROAMING_PORT, JSON.stringify({ v: this.myV, host: this.host, ...payload }));
  }

  // Peek the engine downlink and refresh the authenticator's secret cache
  #syncSecrets() {
    const raw = this.ns.peek(DARKNET_BROADCAST_PORT);
    if (!raw || raw === "NULL PORT DATA") return;
    try { this.auth.syncSecrets(JSON.parse(raw)); } catch {}
  }

  async #phish() {
    const result = await this.ns.dnet.phishingAttack();
    this.#report({ phishing: result });
  }

  async #openCaches() {
    const allFiles   = this.ns.ls(this.host);
    const cacheFiles = allFiles.filter(f => f.endsWith(".cache"));
    this.#report({ caches: allFiles });
    if (!cacheFiles.length) return;

    const results = [];
    for (const filename of cacheFiles) {
      try {
        const content = await this.ns.dnet.openCache(filename);
        results.push({ filename, content });
      } catch (e) {
        results.push({ filename, error: e?.message ?? String(e) });
      }
    }
    this.#report({ caches: results });
  }

  async tick() {
    this.#syncSecrets();
    let hostServer = null;
    try { hostServer = this.ns.dnet.getServerDetails(this.host); } catch {}
    this.#report({ ts: Date.now(), hostServer });

    for (const node of this.ns.dnet.probe()) {
      const server      = this.ns.dnet.getServerDetails(node);
      const authStart   = Date.now();
      const auth        = await this.auth.authenticate(this.ns, node, server);
      const authMs      = Date.now() - authStart;
      const freshServer = auth.success ? this.ns.dnet.getServerDetails(node) : server;

      if (DEBUG_DUMP && auth.success) this.#report({ dbg: "server-dump", node, server: freshServer });

      let depth = null, charismaReq = null;
      try { depth       = this.ns.dnet.getDepth(node); }                       catch {}
      try { charismaReq = this.ns.dnet.getServerRequiredCharismaLevel(node); } catch {}

      // Report auth result + live connectivity so engine always has current state
      this.#report({
        node,
        auth:        { success: auth.success, strategy: auth.strategy },
        secret:      auth.secret,
        isOnline:    freshServer.isOnline,
        hasSession:  freshServer.hasSession,
        serverInfo:  auth.success ? undefined : server,
        depth,
        charismaReq,
        authMs,
        crackingInfo: {
          hint:   server.passwordHint,
          data:   server.data,
          length: server.passwordLength,
          format: server.passwordFormat,
          model:  server.modelId,
        },
        crackDebug:  auth.success ? undefined : auth.debug,
        ts:          Date.now(),
      });

      if (auth.success && this.ns.ls(node).some(f => f.toUpperCase() === "STORM_SEED.EXE")) {
        this.#report({ node, hasStormSeed: true });
      }

      const actionResults = await this.actions.runAction(this.ns, node, freshServer);
      for (const result of actionResults) {
        if (result.loot) this.#report({ node, loot: result.loot });
      }
    }

    await this.#phish();
    await this.#openCaches();
  }
}

export async function main(ns) {
  ns.disableLog("ALL");
  const tendril = new DarkTendril(ns);

  ns.atExit(() => {
    ns.tryWritePort(DARKNET_ROAMING_PORT, JSON.stringify({
      v:    tendril.myV,
      host: tendril.host,
      died: true,
      ts:   Date.now(),
    }));
  });

  while (true) {
    await tendril.tick();
    await ns.sleep(LOOP_MS);
  }
}


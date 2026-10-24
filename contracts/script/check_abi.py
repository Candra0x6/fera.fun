import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT.parent / "docs" / "handoffs" / "contracts.md"
SLASH2 = "/" + "/"


def strip_comments(text):
    return "\n".join(line.split(SLASH2)[0] for line in text.splitlines())


def spec_blocks():
    text = SPEC.read_text()
    start = text.index("### 2.1 ")
    end = text.index("### 2.6 ")
    section = text[start:end]
    blocks = re.findall(r"```solidity\n(.*?)```", section, re.S)
    return [strip_comments(b) for b in blocks]


def parse_params(raw):
    out = []
    raw = raw.strip()
    if not raw:
        return out
    for part in raw.split(","):
        toks = [t for t in part.split() if t not in ("calldata", "memory", "storage")]
        indexed = "indexed" in toks
        toks = [t for t in toks if t != "indexed"]
        out.append({"type": toks[0], "name": toks[1] if len(toks) > 1 else "", "indexed": indexed})
    return out


def parse_spec():
    blocks = spec_blocks()
    code = "\n".join(blocks)
    structs, enums, funcs, events = {}, {}, {}, {}
    for m in re.finditer(r"struct\s+(\w+)\s*\{(.*?)\}", code, re.S):
        fields = []
        for decl in m.group(2).split(";"):
            decl = decl.strip()
            if decl:
                t, n = decl.split()
                fields.append((t, n))
        structs[m.group(1)] = fields
    for m in re.finditer(r"enum\s+(\w+)\s*\{(.*?)\}", code, re.S):
        enums[m.group(1)] = [x.strip() for x in m.group(2).split(",") if x.strip()]
    for m in re.finditer(r"function\s+(\w+)\s*\(([^)]*)\)\s*([^;{]*);", code, re.S):
        name, params, tail = m.group(1), m.group(2), " ".join(m.group(3).split())
        rets = re.search(r"returns\s*\(([^)]*)\)", tail)
        mut = "payable" if " payable" in " " + tail.split("returns")[0] else (
            "view" if " view" in " " + tail.split("returns")[0] else "nonpayable")
        funcs[name] = {
            "inputs": parse_params(params),
            "outputs": parse_params(rets.group(1)) if rets else [],
            "mut": mut,
            "iface": "ISeedSource" if name in ("requestSeed", "fee") else "Arena",
        }
    for m in re.finditer(r"event\s+(\w+)\s*\((.*?)\);", code, re.S):
        events[m.group(1)] = parse_params(" ".join(m.group(2).split()))
    return structs, enums, funcs, events


def canon(t, structs, enums):
    suffix = ""
    while t.endswith("]"):
        i = t.rindex("[")
        suffix = t[i:] + suffix
        t = t[:i]
    if t in structs:
        base = "(" + ",".join(canon(ft, structs, enums) for ft, _ in structs[t]) + ")"
    elif t in enums:
        base = "uint8"
    else:
        base = t
    return base + suffix


def abi_canon(p):
    t = p["type"]
    if t.startswith("tuple"):
        inner = ",".join(abi_canon(c) for c in p["components"])
        return "(" + inner + ")" + t[len("tuple"):]
    return t


def collect_structs(params, found):
    for p in params:
        if p["type"].startswith("tuple"):
            internal = p.get("internalType", "")
            m = re.match(r"struct (?:\w+\.)?(\w+)", internal)
            if m:
                found[m.group(1)] = [(abi_canon(c), c["name"]) for c in p["components"]]
            collect_structs(p["components"], found)
        it = p.get("internalType", "")
        m = re.match(r"enum (?:\w+\.)?(\w+)", it)
        if m:
            found.setdefault("enum:" + m.group(1), True)


def main():
    structs, enums, funcs, events = parse_spec()
    abis = {n: json.loads((ROOT / "abi" / (n + ".json")).read_text()) for n in ("Arena", "ISeedSource")}
    errors = []
    checked = 0
    for name, f in funcs.items():
        abi = abis[f["iface"]]
        match = [e for e in abi if e["type"] == "function" and e["name"] == name]
        if len(match) != 1:
            errors.append("function missing or ambiguous: " + name)
            continue
        e = match[0]
        want_in = [canon(p["type"], structs, enums) for p in f["inputs"]]
        got_in = [abi_canon(p) for p in e["inputs"]]
        want_out = [canon(p["type"], structs, enums) for p in f["outputs"]]
        got_out = [abi_canon(p) for p in e["outputs"]]
        if want_in != got_in:
            errors.append("function %s inputs: want %s got %s" % (name, want_in, got_in))
        if want_out != got_out:
            errors.append("function %s outputs: want %s got %s" % (name, want_out, got_out))
        if [p["name"] for p in f["inputs"]] != [p["name"] for p in e["inputs"]]:
            errors.append("function %s input names differ" % name)
        if f["mut"] != e["stateMutability"]:
            errors.append("function %s mutability: want %s got %s" % (name, f["mut"], e["stateMutability"]))
        checked += 1
    arena = abis["Arena"]
    for name, params in events.items():
        match = [e for e in arena if e["type"] == "event" and e["name"] == name]
        if len(match) != 1:
            errors.append("event missing or ambiguous: " + name)
            continue
        e = match[0]
        want = [(canon(p["type"], structs, enums), p["name"], p["indexed"]) for p in params]
        got = [(abi_canon(p), p["name"], p["indexed"]) for p in e["inputs"]]
        if want != got:
            errors.append("event %s: want %s got %s" % (name, want, got))
        checked += 1
    found = {}
    for e in arena:
        if e["type"] in ("function", "event"):
            collect_structs(e.get("inputs", []), found)
            collect_structs(e.get("outputs", []), found)
    for sname, fields in structs.items():
        want = [(canon(t, structs, enums), n) for t, n in fields]
        if sname not in found:
            errors.append("struct not in ABI: " + sname)
        elif found[sname] != want:
            errors.append("struct %s: want %s got %s" % (sname, want, found[sname]))
        checked += 1
    for ename in enums:
        if "enum:" + ename not in found:
            errors.append("enum not in ABI: " + ename)
        checked += 1
    extra_fns = sorted(
        e["name"] for e in arena if e["type"] == "function" and e["name"] not in funcs
    )
    extra_events = sorted(e["name"] for e in arena if e["type"] == "event" and e["name"] not in events)
    print("checked %d spec items (%d functions, %d events, %d structs, %d enums)"
          % (checked, len(funcs), len(events), len(structs), len(enums)))
    print("extra Arena functions not in spec: %s" % (extra_fns or "none"))
    print("extra Arena events not in spec: %s" % (extra_events or "none"))
    if errors:
        for err in errors:
            print("FAIL " + err)
        sys.exit(1)
    print("OK")


main()

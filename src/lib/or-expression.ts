// Parser + evaluator for PostgREST-style `.or()` expressions, e.g.
// "and(is_active.eq.true,is_verified.eq.true),is_demo.eq.true"
// "pharmacy_id.is.null,pharmacy_id.eq.abc"
type Row = Record<string, unknown>;
export type OrNode =
  | { kind: "cond"; field: string; op: string; value: unknown }
  | { kind: "and" | "or"; children: OrNode[] };

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(current); current = ""; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function castValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function parseNode(part: string): OrNode | null {
  const group = part.match(/^(and|or)\((.*)\)$/s);
  if (group) {
    return { kind: group[1] as "and" | "or", children: splitTopLevel(group[2]).map(parseNode).filter(Boolean) as OrNode[] };
  }
  const [field, op, ...rest] = part.split(".");
  if (!field || !op || rest.length === 0) return null;
  const raw = rest.join(".");
  const value = op === "in" ? raw.replace(/^\(|\)$/g, "").split(",").map(castValue) : castValue(raw);
  return { kind: "cond", field, op, value };
}

export function parseOrExpression(expression: string): OrNode {
  return { kind: "or", children: splitTopLevel(expression).map(parseNode).filter(Boolean) as OrNode[] };
}

function matchCond(row: Row, field: string, op: string, value: unknown): boolean {
  const actual = row[field];
  switch (op) {
    case "eq": return actual === value || (typeof actual === "number" && String(actual) === String(value));
    case "neq": return actual !== value;
    case "is": return value === null ? actual === null || actual === undefined : actual === value;
    case "gt": return Number(actual) > Number(value);
    case "gte": return Number(actual) >= Number(value);
    case "lt": return Number(actual) < Number(value);
    case "lte": return Number(actual) <= Number(value);
    case "in": return Array.isArray(value) && value.includes(actual);
    case "like":
    case "ilike": {
      const needle = String(value).replaceAll("%", "").replaceAll("*", "");
      const hay = String(actual ?? "");
      return op === "ilike" ? hay.toLowerCase().includes(needle.toLowerCase()) : hay.includes(needle);
    }
    default: return false;
  }
}

export function evaluateOrNode(node: OrNode, row: Row): boolean {
  if (node.kind === "cond") return matchCond(row, node.field, node.op, node.value);
  if (node.children.length === 0) return true;
  return node.kind === "and"
    ? node.children.every((c) => evaluateOrNode(c, row))
    : node.children.some((c) => evaluateOrNode(c, row));
}

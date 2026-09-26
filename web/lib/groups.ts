// Single loader for groups and proof methods. Source: ../groups/catalog.json,
// with an in-code fallback if the file is missing or unreadable.
import fs from "node:fs";
import path from "node:path";

export type Bilingual = { ja: string; en: string };

export type MethodInfo = {
  id: string;
  name: Bilingual;
  available: boolean;
  note?: string;
};

export type Group = {
  id: string;
  name: Bilingual;
  description?: Bilingual;
  methods: string[]; // method ids the group accepts
};

type Catalog = { methods: Record<string, MethodInfo>; groups: Group[] };

const FALLBACK: Catalog = {
  methods: {
    prescription: { id: "prescription", name: { ja: "処方薬による証明", en: "Prescription proxy" }, available: true },
    nanbyo: { id: "nanbyo", name: { ja: "指定難病の認定", en: "指定難病 certification" }, available: true },
    diagnosis: {
      id: "diagnosis",
      name: { ja: "傷病名 (電子カルテ)", en: "Diagnosis record" },
      available: false,
      note: "coming 2027",
    },
  },
  groups: [
    { id: "hayfever", name: { ja: "花粉症", en: "Hay fever" }, methods: ["prescription"] },
    { id: "nanbyo-any", name: { ja: "指定難病（全般）", en: "指定難病 (any)" }, methods: ["nanbyo"] },
  ],
};

const CATALOG_PATH = path.resolve(process.cwd(), "..", "groups", "catalog.json");

function bilingual(v: unknown, fallback: string): Bilingual {
  if (typeof v === "string") return { ja: v, en: v };
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const ja = typeof o.ja === "string" ? o.ja : undefined;
    const en = typeof o.en === "string" ? o.en : undefined;
    return { ja: ja ?? en ?? fallback, en: en ?? ja ?? fallback };
  }
  return { ja: fallback, en: fallback };
}

function parseCatalog(raw: any): Catalog {
  const methods: Record<string, MethodInfo> = { ...FALLBACK.methods };
  for (const [id, m] of Object.entries<any>(raw.methods ?? {})) {
    methods[id] = { id, name: bilingual(m?.name, id), available: m?.available !== false, note: m?.note };
  }
  const groups: Group[] = (raw.groups ?? []).map((g: any) => ({
    id: String(g.id),
    name: bilingual(g.name, String(g.id)),
    description: g.description ? bilingual(g.description, "") : undefined,
    methods: Array.isArray(g.methods) ? g.methods.map(String) : Object.keys(g.methods ?? {}),
  }));
  return { methods, groups };
}

let cache: { mtimeMs: number; catalog: Catalog } | null = null;

export function loadCatalog(): Catalog {
  try {
    const { mtimeMs } = fs.statSync(CATALOG_PATH);
    if (cache?.mtimeMs === mtimeMs) return cache.catalog;
    const catalog = parseCatalog(JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")));
    cache = { mtimeMs, catalog };
    return catalog;
  } catch {
    return FALLBACK;
  }
}

export const listGroups = () => loadCatalog().groups;
export const getGroup = (id: string) => loadCatalog().groups.find((g) => g.id === id);
export const getMethod = (id: string): MethodInfo =>
  loadCatalog().methods[id] ?? { id, name: { ja: id, en: id }, available: false };

/** True if the group lists the method and the method is currently usable. */
export function groupAcceptsMethod(groupId: string, method: string): boolean {
  const g = getGroup(groupId);
  return !!g && g.methods.includes(method) && getMethod(method).available;
}

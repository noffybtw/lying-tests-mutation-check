// Keeps copies, so reading a record back shows what was saved, not the caller's object.
export function createMemoryDb() {
  const rows = new Map();
  return {
    async save(record) {
      rows.set(record.id, structuredClone(record));
    },
    async findById(id) {
      return rows.has(id) ? structuredClone(rows.get(id)) : null;
    },
  };
}

export const db = createMemoryDb();

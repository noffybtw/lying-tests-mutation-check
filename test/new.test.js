import { describe, it, expect } from 'vitest';
import { toClientView } from '../src/clientView.js';
import { saveClient } from '../src/saveClient.js';
import { createMemoryDb } from '../src/db.js';

const client = { id: 'c-42', name: 'Olena Koval', phone: '+380001234567' };

describe('toClientView', () => {
  it('returns the id, name and phone', () => {
    expect(toClientView(client)).toStrictEqual({
      id: 'c-42',
      name: 'Olena Koval',
      phone: '+380001234567',
    });
  });
});

describe('saveClient', () => {
  it('saves the id, name and phone', async () => {
    const db = createMemoryDb();

    await saveClient(client, db);

    expect(await db.findById('c-42')).toStrictEqual({
      id: 'c-42',
      name: 'Olena Koval',
      phone: '+380001234567',
    });
  });
});

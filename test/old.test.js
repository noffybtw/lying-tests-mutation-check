// The original tests, unchanged. Both still pass after the two bugs described in the README.
import { it, expect, vi } from 'vitest';
import { toClientView } from '../src/clientView.js';
import { saveClient } from '../src/saveClient.js';
import { db } from '../src/db.js';

vi.mock('../src/db.js', () => ({ db: { save: vi.fn() } }));

const c = { id: '1', name: 'A' };

it('returns correct shape', () => { expect(toClientView(c)).toEqual({ id: '1', name: 'A', phone: undefined }); });
it('saves client', async () => { await saveClient(c); expect(db.save).toHaveBeenCalled(); });

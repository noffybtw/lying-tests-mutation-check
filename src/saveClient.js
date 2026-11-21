import { db } from './db.js';

export async function saveClient(client, store = db) {
  await store.save({
    id: client.id,
    name: client.name,
    phone: client.phone,
  });
}

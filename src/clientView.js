export function toClientView(client) {
  return {
    id: client.id,
    name: client.name,
    phone: client.phone,
  };
}

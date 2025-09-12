// src/api/tables.ts
// Fetches all table names from the remote database API

export async function fetchTableNames(): Promise<string[]> {
  const response = await fetch('https://mentify.srv880406.hstgr.cloud/api/tables', {
    method: 'GET',
    headers: {
      'accept': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch table names');
  }
  return response.json();
}

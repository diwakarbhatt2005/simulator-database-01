// src/api/updateApi.ts
// Client helper for updating existing rows via the backend
// Endpoint: PUT https://mentify.srv880406.hstgr.cloud/api/tables/update

export interface UpdateResponse {
  success: boolean;
  message: string;
  details: any;
}

export interface UpdateErrorDetail {
  loc: (string | number)[];
  msg: string;
  type: string;
}

/**
 * Update existing rows in a table.
 * - `primaryKeyColumn` must be provided and present on each update object.
 * - Primary key values are used to identify rows and are not changed by this function.
 * - Empty/null/undefined fields are removed from each update payload.
 *
 * Throws an object like { detail: string | UpdateErrorDetail[] } on error.
 */
export async function updateTableDataApi(
  tableName: string,
  primaryKeyColumn: string,
  updates: any[],
): Promise<UpdateResponse> {
  if (!tableName || !primaryKeyColumn) {
    throw { detail: 'tableName and primaryKeyColumn are required' };
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    throw { detail: 'updates must be a non-empty array' };
  }


  // API expects PK value as 'primary_key_value' in each update object
  const cleaned: any[] = [];
  const missingPkIndexes: number[] = [];

  updates.forEach((u, idx) => {
    if (!u || typeof u !== 'object') {
      missingPkIndexes.push(idx);
      return;
    }

    // Accept PK value from either the PK column or 'primary_key_value'
    let pkValue = u[primaryKeyColumn];
    if (pkValue === undefined) pkValue = u['primary_key_value'];

    if (pkValue === null || pkValue === undefined || pkValue === '') {
      missingPkIndexes.push(idx);
      return;
    }

    // Build payload: always use 'primary_key_value' for PK
    const payload: Record<string, any> = { primary_key_value: pkValue };
    Object.keys(u).forEach((k) => {
      if (k === primaryKeyColumn || k === 'primary_key_value') return;
      const v = u[k];
      if (v === null || v === undefined || v === '') return; // drop empty
      payload[k] = v;
    });

    // Only include if there is at least one field to update (besides PK)
    const hasUpdateFields = Object.keys(payload).some(k => k !== 'primary_key_value');
    if (hasUpdateFields) {
      cleaned.push(payload);
    }
  });

  if (missingPkIndexes.length > 0) {
    throw { detail: `Each update must include a valid primary key value (column '${primaryKeyColumn}' or 'primary_key_value'). Missing at indexes: ${missingPkIndexes.join(', ')}` };
  }

  const url = 'https://mentify.srv880406.hstgr.cloud/api/tables/update';
  const body = { table_name: tableName, primary_key_column: primaryKeyColumn, updates: cleaned };

  console.log('updateTableDataApi payload:', body);

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  let resData: any;
  try {
    resData = await res.json();
  } catch (e) {
    // Non-JSON response
    if (!res.ok) throw { detail: `Request failed with status ${res.status}` };
    throw { detail: 'Invalid JSON response from server' };
  }

  console.log('updateTableDataApi response:', res.status, resData);

  if (!res.ok) {
    // Surface backend errors in a consistent shape
    if (resData && typeof resData.detail === 'string') {
      throw { detail: resData.detail };
    }
    if (resData && Array.isArray(resData.detail)) {
      throw { detail: resData.detail };
    }
    // Fallback: include message or status
    throw { detail: resData?.detail ?? `Update failed with status ${res.status}` };
  }

  // Success
  return resData as UpdateResponse;
}

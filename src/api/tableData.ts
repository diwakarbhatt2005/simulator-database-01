// Bulk replace all data in a table
export interface BulkReplaceResponse {
  success: boolean;
  message: string;
  details: any;
}

export async function bulkReplaceTableData(tableName: string, data: any[]): Promise<BulkReplaceResponse> {
  const url = `https://mentify.srv880406.hstgr.cloud/api/tables/${encodeURIComponent(tableName)}/bulk-replace`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ table_name: tableName, data }),
  });
  const resData = await response.json();
  if (!response.ok) {
    // Validation error or other error
    throw resData;
  }
  return resData;
}
// src/api/tableData.ts
// Fetches data from a specific table with pagination

export interface TableDataResponse {
  table_name: string;
  data: any[];
  total_count: number;
  limit: number;
  offset: number;
}

export interface ValidationError {
  detail: Array<{
    loc: (string | number)[];
    msg: string;
    type: string;
  }>;
}

export async function fetchTableData(tableName: string, limit = 1000, offset = 0): Promise<TableDataResponse> {
  const url = `https://mentify.srv880406.hstgr.cloud/api/tables/${encodeURIComponent(tableName)}/data?limit=${limit}&offset=${offset}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'accept': 'application/json',
    },
  });
  const data = await response.json();
  if (!response.ok) {
    // Validation error or other error
    throw data;
  }
  return data;
}

// Centralized validation and auto-fix logic
export function validateAndAutoFixData(data: any[], originalData: any[]): any[] {
  if (!data || data.length === 0) {
    return [];
  }

  // Determine column types from original data for consistency
  const columnTypes: { [key: string]: 'int' | 'float' | 'bool' | 'date' | 'string' } = {};
  if (originalData.length > 0) {
    const sample = originalData.slice(0, 50);
    for (const col in originalData[0]) {
      let isInt = true, isFloat = true, isBool = true, isDate = true;
      for (const row of sample) {
        const v = row[col];
        if (v === null || v === undefined || v === '') continue;
        const str = String(v).trim().toLowerCase();
        if (!['true', 'false'].includes(str)) isBool = false;
        if (!/^-?\d+$/.test(str)) isInt = false;
        if (isNaN(Number(str))) isFloat = false;
        if (!/^\d{4}-\d{2}-\d{2}/.test(str) && !/^\d{1,2}\/\d{1,2}\/\d{4}/.test(str)) isDate = false;
      }
      if (isBool) columnTypes[col] = 'bool';
      else if (isInt) columnTypes[col] = 'int';
      else if (isFloat) columnTypes[col] = 'float';
      else if (isDate) columnTypes[col] = 'date';
      else columnTypes[col] = 'string';
    }
  }

  const errors: string[] = [];
  const fixedData = data.map((row, rowIndex) => {
    const fixedRow = { ...row };
    for (const col in fixedRow) {
      const type = columnTypes[col] || 'string';
      let value = fixedRow[col];
      if (value === null || value === undefined || value === '') continue;

      const strValue = String(value).trim();
      const lowerValue = strValue.toLowerCase();

      try {
        switch (type) {
          case 'bool':
            if (['true', '1', 'yes'].includes(lowerValue)) fixedRow[col] = true;
            else if (['false', '0', 'no'].includes(lowerValue)) fixedRow[col] = false;
            else throw new Error(`must be a boolean (true/false)`);
            break;
          case 'int':
            if (!/^-?\d+$/.test(strValue)) throw new Error(`must be an integer`);
            fixedRow[col] = parseInt(strValue, 10);
            break;
          case 'float':
            if (isNaN(Number(strValue))) throw new Error(`must be a number`);
            fixedRow[col] = parseFloat(strValue);
            break;
          case 'date':
            if (!/^\d{4}-\d{2}-\d{2}/.test(strValue) && !/^\d{1,2}\/\d{1,2}\/\d{4}/.test(strValue)) {
              throw new Error(`must be a date (YYYY-MM-DD)`);
            }
            // Optional: auto-format date to YYYY-MM-DD
            break;
        }
      } catch (e: any) {
        errors.push(`Row ${rowIndex + 1}, Column '${col}': Invalid value '${value}'. It ${e.message}.`);
      }
    }
    return fixedRow;
  });

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return fixedData;
}

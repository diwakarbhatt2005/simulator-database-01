// src/api/api3.ts
// API 3: Bulk operations for table data
// Note: The /bulk-replace endpoint actually performs INSERT operations (not replace)

export interface BulkReplaceResponse {
  success: boolean;
  message: string;
  details: any;
}

export interface BulkReplaceError {
  detail: string | Array<{
    loc: (string | number)[];
    msg: string;
    type: string;
  }>;
}

export async function bulkReplaceTableDataApi3(tableName: string, data: any[]): Promise<BulkReplaceResponse> {
  // New API: POST /api/tables/insert with payload { table_name, data }
  const url = `https://mentify.srv880406.hstgr.cloud/api/tables/insert`;
  // Debug: log payload
  console.log('API3 bulk replace (insert) payload:', { table_name: tableName, data });
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ table_name: tableName, data }),
  });
  const resData = await response.json();
  // Debug: log response
  console.log('API3 bulk replace response:', response.status, resData);
  if (!response.ok) {
    // Handle common backend error shapes
    if (resData) {
      if (typeof resData.detail === 'string') {
        throw { detail: resData.detail, status: response.status };
      }
      if (Array.isArray(resData.detail)) {
        // join validation errors into a readable string
        const msg = resData.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
        throw { detail: msg, raw: resData.detail, status: response.status };
      }
      // fallback: include full response
      throw { detail: JSON.stringify(resData), status: response.status };
    }
    throw { detail: 'Unknown error occurred.', status: response.status };
  }
  // Notify on success
  if (typeof window !== 'undefined' && window?.alert) {
    window.alert('Data saved/updated successfully!');
  }
  return resData;
}

// Keep the row-by-row insert function as well for compatibility
export async function insertTableDataApi3(tableName: string, data: any[]): Promise<BulkReplaceResponse> {
  // Use the new insert endpoint
  const url = `https://mentify.srv880406.hstgr.cloud/api/tables/insert`;
  
  // Filter and clean the data
  const cleanData = data.filter(row => {
    if (!row || typeof row !== 'object') return false;
    
    const keys = Object.keys(row).filter(k => !/^additionalProp\d*$/i.test(k));
    return keys.length > 0 && keys.some(k => row[k] !== undefined && row[k] !== null && row[k] !== '');
  }).map(row => {
    let cleanRow = { ...row };
    
    // Remove 'id' field for auto-increment
    delete cleanRow.id;
    
    // Remove empty/null/undefined fields
    Object.keys(cleanRow).forEach(key => {
      if (cleanRow[key] === null || cleanRow[key] === undefined || cleanRow[key] === '') {
        delete cleanRow[key];
      }
    });
    
    return cleanRow;
  });

  if (cleanData.length === 0) {
    throw { detail: 'No valid data provided for insertion' };
  }

  console.log('API3 bulk insert payload (insert endpoint):', { table_name: tableName, data: cleanData });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ table_name: tableName, data: cleanData }),
  });
  
  const resData = await response.json();
  console.log('API3 bulk insert response:', response.status, resData);
  
  if (!response.ok) {
    if (resData) {
      if (typeof resData.detail === 'string') {
        throw { detail: resData.detail, status: response.status };
      }
      if (Array.isArray(resData.detail)) {
        const msg = resData.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
        throw { detail: msg, raw: resData.detail, status: response.status };
      }
      throw { detail: JSON.stringify(resData), status: response.status };
    }
    throw { detail: 'Bulk insert failed', status: response.status };
  }

  // Success notification
  if (typeof window !== 'undefined' && window?.alert) {
    window.alert(`${cleanData.length} rows inserted successfully!`);
  }

  return {
    success: true,
    message: `${cleanData.length} rows inserted successfully`,
    details: { inserted: cleanData.length, failed: 0, errors: [] }
  };
}
// src/api/insertApi.ts
// API for inserting new rows without affecting existing data

export interface InsertResponse {
  success: boolean;
  message: string;
  inserted_count: number;
}

export interface InsertError {
  detail: string | Array<{
    loc: (string | number)[];
    msg: string;
    type: string;
  }>;
}

// Insert single row
export async function insertSingleRow(tableName: string, rowData: any): Promise<InsertResponse> {
  // Use insert endpoint for single row
  const url = `https://mentify.srv880406.hstgr.cloud/api/tables/insert`;
  
  // Filter out empty fields and remove 'id' field for auto-increment
  let cleanData = { ...rowData };
  
  // Remove 'id' field completely for insert (let database auto-generate)
  delete cleanData.id;
  
  // Remove empty/null/undefined fields
  Object.keys(cleanData).forEach(key => {
    if (cleanData[key] === null || cleanData[key] === undefined || cleanData[key] === '') {
      delete cleanData[key];
    }
  });

  // Check if we have any data to insert
  if (Object.keys(cleanData).length === 0) {
    throw { detail: 'No valid data provided for insertion' };
  }

  console.log('Insert single row payload (insert endpoint):', { table_name: tableName, data: [cleanData] });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ table_name: tableName, data: [cleanData] }),
  });
  
  const resData = await response.json();
  console.log('Insert single row response:', response.status, resData);
  
  if (!response.ok) {
    if (resData) {
      if (typeof resData.detail === 'string') {
        throw { detail: resData.detail, status: response.status };
      }
      if (Array.isArray(resData.detail)) {
        const msg = resData.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
        throw { detail: msg, raw: resData.detail, status: response.status };
      }
      throw { detail: JSON.stringify(resData), status: response.status };
    }
    throw { detail: 'Failed to insert row', status: response.status };
  }
  
  // Success message
  if (typeof window !== 'undefined' && window?.alert) {
    window.alert('New row inserted successfully!');
  }
  
  return { success: true, message: 'Row inserted successfully', inserted_count: 1 };
}

// Insert multiple rows
export async function insertMultipleRows(tableName: string, rowsData: any[]): Promise<InsertResponse> {
  let successCount = 0;
  let errors: string[] = [];
  
  for (const row of rowsData) {
    try {
      await insertSingleRow(tableName, row);
      successCount++;
    } catch (err: any) {
      const errorMsg = err.detail || 'Unknown error';
      errors.push(`Row ${successCount + 1}: ${errorMsg}`);
    }
  }
  
  if (errors.length > 0) {
    throw { detail: `${successCount} rows inserted, ${errors.length} failed: ${errors.join('; ')}` };
  }
  
  if (typeof window !== 'undefined' && window?.alert) {
    window.alert(`${successCount} new rows inserted successfully!`);
  }
  
  return { success: true, message: `${successCount} rows inserted successfully`, inserted_count: successCount };
}

// Update single row by primary key (first column). Does not allow changing the primary key value.
// (Update logic removed - this module provides insert/bulk-replace helpers only)
 
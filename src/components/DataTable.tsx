import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ValidationError, fetchTableData, validateAndAutoFixData } from '@/api/tableData';
import { bulkReplaceTableDataApi3, insertTableDataApi3 } from '@/api/api3';
import { Button } from '@/components/ui/button';
import { sendToWebhook } from '@/api/api4';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Edit3, 
  Save, 
  X, 
  Plus, 
  Trash2, 
  RotateCcw, 
  Loader2,
  AlertCircle 
} from 'lucide-react';
import { useDashboardStore } from '@/store/dashboardStore';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';

export const DataTable = () => {
  const [chatInput, setChatInput] = useState('');
  const [chatResponse, setChatResponse] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const handleAskChatbot = async () => {
    if (!chatInput.trim()) return;
    setChatLoading(true);
    setChatError(null);
    setChatResponse(null);
    try {
      const answer = await sendToWebhook(chatInput);
      setChatResponse(answer);
    } catch (err: any) {
      setChatError(err.message || 'Failed to get response');
    } finally {
      setChatLoading(false);
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 100);
    }
  };
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkPasteValue, setBulkPasteValue] = useState('');
  const [bulkPasteError, setBulkPasteError] = useState('');
  
  const [mode, setMode] = useState<'insert' | 'update' | null>(null);
  // CSV upload state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  // CSV upload handler
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) {
        setCsvError('Failed to read file.');
        return;
      }
      // Parse CSV: first row = headers
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        setCsvError('CSV must have a header and at least one data row.');
        return;
      }
      const headers = lines[0].split(',').map(h => h.trim());
      const newRows = lines.slice(1).map(line => {
        const cells = line.split(',');
        const rowObj: Record<string, any> = {};
        headers.forEach((h, i) => {
          rowObj[h] = cells[i] || '';
        });
        // Fill missing columns with ''
        columns.forEach(col => {
          if (!(col in rowObj)) rowObj[col] = '';
        });
        return rowObj;
      });
      addMultipleRows(newRows.length);
      setTimeout(() => {
        const startIdx = tableData.length;
        newRows.forEach((row, i) => {
          columns.forEach(col => {
            updateCell(startIdx + i, col, row[col]);
          });
        });
        toast({ title: 'CSV Upload Success', description: `Added ${newRows.length} rows from CSV.` });
      }, 200);
    };
    reader.onerror = () => setCsvError('Failed to read file.');
    reader.readAsText(file);
  };
  
  const {
    tableData,
    selectedDatabase,
    isEditMode,
    error,
    setEditMode,
    updateCell,
    addRow,
    addMultipleRows,
    insertRowAtTop,
  } = useDashboardStore();

  // Enhanced addRow function that adds at the top
  const handleAddRowAtTop = () => {
    if (tableData.length > 0) {
      const firstRow = tableData[0];
      const newRow: Record<string, any> = {};
      Object.keys(firstRow).forEach(key => {
        if (key === 'id') {
          const maxId = Math.max(0, ...tableData.map(r => Number(r.id) || 0));
          newRow[key] = String(maxId + 1);
        } else {
          newRow[key] = '';
        }
      });
      // Insert at the very top (index 0)
      const newTableData = [newRow, ...tableData];
      setTableData(newTableData);
      
      toast({
        title: "Row Added",
        description: "New row added at the top. You can now enter data.",
      });
    }
  };

  const {
    addColumn,
    deleteRow,
    renameColumn,
    resetToOriginal,
    saveChanges,
    setError,
    setTableData,
  } = useDashboardStore();

  const handleCellChange = (rowIndex: number, field: string, value: any) => {
    // In update mode, prevent changing the primary key (first column)
    if (mode === 'update' && columns.length > 0 && field === columns[0]) {
      toast({ title: 'Primary Key Locked', description: 'Primary key cannot be changed in Update mode.', variant: 'destructive' });
      return;
    }
    // All validation is now handled by `validateAndAutoFixData` before saving.
    updateCell(rowIndex, field, value);
  };

  const columns = useMemo(() => {
    if (!tableData || tableData.length === 0) return [] as string[];
    // Prefer keys from the first row to preserve intended column order.
    const firstRowKeys = Object.keys(tableData[0] || {});
    const extra = new Set<string>();
    tableData.forEach((row, idx) => {
      if (idx === 0) return;
      Object.keys(row).forEach(k => {
        if (!firstRowKeys.includes(k)) extra.add(k);
      });
    });
    return [...firstRowKeys, ...Array.from(extra)];
  }, [tableData]);

  // commas/tabs inside balanced brackets/braces/parentheses as part of the field.
  const parseRow = (line: string, delim: string) => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    let bracketDepth = 0; // []
    let braceDepth = 0;   // {}
    let parenDepth = 0;   // ()

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '"') {
        // handle escaped quotes inside quotes
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i++; // skip escaped quote
          continue;
        }
        inQuotes = !inQuotes;
        cur += ch; // keep quotes for later trimming if needed
        continue;
      }

      if (!inQuotes) {
        if (ch === '[') bracketDepth++;
        else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
        else if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
        else if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
      }

      const nested = bracketDepth > 0 || braceDepth > 0 || parenDepth > 0;

      if (ch === delim && !inQuotes && !nested) {
        result.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }

    result.push(cur);
    return result.map(cell => cell.trim());
  };

  const findPrimaryAddressIndex = (cols: string[]) => {
    const lower = cols.map(c => c.toLowerCase());
    // prefer exact matches
    let idx = lower.findIndex(c => c === 'address' || c === 'addr');
    if (idx >= 0) return idx;
    // otherwise prefer common address-like names
    idx = lower.findIndex(c => /address|addr|street|line|location|city|state|area/.test(c));
    return idx; // may be -1
  };

  const handlePaste = useCallback((e: React.ClipboardEvent, rowIndex: number, field: string) => {
    e.preventDefault();
    
    // Ensure we're working with the current selected table
    if (!selectedDatabase) {
      toast({
        title: "Paste Error",
        description: "No table selected. Please select a table first.",
        variant: "destructive",
      });
      return;
    }
    
    const pastedData = e.clipboardData.getData('text');
    
    const rows = pastedData.split('\n').filter(row => row.trim());
    
    if (rows.length === 0) {
      toast({
        title: "Paste Error",
        description: "No valid data found to paste.",
        variant: "destructive",
      });
      return;
    }
    
    const hasTab = pastedData.includes('\t');
    const sampleRow = rows[0];
    const delimiterGuess = hasTab ? '\t' : ',';
    
    // Paste behavior depends on mode:
    // - insert: only allow pasting into new rows (preserve existing insert flow)
    // - update: allow pasting into existing rows (but do not change primary key)
    if (mode !== 'update' && rowIndex < originalDataLength) {
      toast({
        title: "Paste Not Allowed",
        description: "You can only paste data in new rows while in Insert mode.",
        variant: "destructive",
      });
      return;
    }
    
    // Calculate how many new rows we need
    const neededRows = Math.max(0, (rowIndex + rows.length) - tableData.length);
    
    // Add required rows all at once
    if (neededRows > 0) {
      addMultipleRows(neededRows);
    }
    
    // Use setTimeout to ensure rows are added before updating cells
    setTimeout(() => {
      let pastedCells = 0;
      let truncatedCells = 0;
      const startFieldIndex = columns.indexOf(field);

      rows.forEach((row, rowOffset) => {
        // Choose parsing strategy per row: prefer tabs; only split on commas
        // if parsed fields fit within available columns. If parsed CSV
        // produces more tokens than available columns, try to merge the
        // fragments containing commas stay together.
        let cells: string[] = [];
        if (hasTab) {
          cells = parseRow(row, '\t').map(cell => cell.replace(/^"|"$/g, ''));
        } else {
          const csvParsed = parseRow(row, ',').map(cell => cell.replace(/^"|"$/g, ''));
          const neededCols = columns.length - startFieldIndex;
          if (csvParsed.length === neededCols) {
            cells = csvParsed;
          } else if (csvParsed.length < neededCols) {
            // not enough tokens: place tokens and pad
            cells = [...csvParsed];
          } else {
            // too many tokens: find address-like column to absorb extras
            const primaryAddr = findPrimaryAddressIndex(columns);
            const mergeIndex = (primaryAddr >= startFieldIndex && primaryAddr < startFieldIndex + neededCols)
              ? primaryAddr
              : startFieldIndex;

            const mapped: string[] = [];
            let p = 0;
            const endIdx = startFieldIndex + neededCols - 1;
            for (let colIdx = startFieldIndex; colIdx <= endIdx; colIdx++) {
              if (colIdx < mergeIndex) {
                mapped.push(csvParsed[p++] || '');
              } else if (colIdx === mergeIndex) {
                const remainingColsAfter = endIdx - colIdx;
                const tokensForThis = Math.max(1, csvParsed.length - p - remainingColsAfter);
                const val = csvParsed.slice(p, p + tokensForThis).join(', ').trim();
                mapped.push(val);
                p += tokensForThis;
              } else {
                mapped.push(csvParsed[p++] || '');
              }
            }
            cells = mapped;
          }
        }
        const currentRowIndex = rowIndex + rowOffset;
        
        cells.forEach((cell, cellIndex) => {
          const fieldIndex = startFieldIndex + cellIndex;
          const currentField = columns[fieldIndex];
          if (currentField && currentRowIndex < tableData.length + neededRows) {
            // In update mode, never modify the primary key (first column)
            if (mode === 'update' && currentField === columns[0]) {
              // skip primary key updates
            } else {
              updateCell(currentRowIndex, currentField, cell);
              pastedCells++;
            }
          } else if (!currentField) {
            truncatedCells++;
          }
        });
      });
      
      toast({
        title: "Data Pasted Successfully",
        description: `Pasted ${pastedCells} cells across ${rows.length} rows.${truncatedCells > 0 ? ` ${truncatedCells} cells were truncated.` : ''}`,
      });
    }, 200);
  }, [columns, tableData, updateCell, addMultipleRows, toast]);
  // Store original data length to block edit/delete (set only once after first data load)
  const [originalDataLength, setOriginalDataLength] = useState(0);
  useEffect(() => {
    if (originalDataLength === 0 && tableData.length > 0 && !isEditMode) {
      setOriginalDataLength(tableData.length);
    }
  }, [tableData, originalDataLength, isEditMode]);

  const handleSave = async () => {
    if (!selectedDatabase || typeof selectedDatabase !== 'string' || !selectedDatabase.trim()) {
      toast({
        title: 'Save Error',
        description: 'No table selected. Please select a valid table before saving.',
        variant: 'destructive',
      });
      return;
    }
    
    if (!mode) {
      toast({
        title: 'Mode Selection Required',
        description: 'Please select Insert or Update mode before saving.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      if (mode === 'insert') {
        // INSERT MODE: Only new rows (after original data length)
        const newRows = tableData.filter((row, index) => {
          // Check if this is a new row (has empty or auto-generated values)
          const isNewRow = index >= originalDataLength || 
            Object.values(row).some(value => value === '' || value === null || value === undefined);
          return isNewRow;
        });
        
        if (newRows.length === 0) {
          toast({
            title: 'No New Data',
            description: 'Please add new rows to save.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
        
        // Filter out completely empty rows
        const validNewRows = newRows.filter(row => {
          return Object.values(row).some(value => 
            value !== '' && value !== null && value !== undefined
          );
        });
        
        if (validNewRows.length === 0) {
          toast({
            title: 'No Valid Data',
            description: 'Please fill in at least one field in the new rows.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }

        console.log('Inserting rows:', validNewRows);
        const result = await insertTableDataApi3(selectedDatabase, validNewRows);
        
        // Refresh table data after successful insert
        try {
          const refreshedData = await fetchTableData(selectedDatabase, 1000, 0);
          setTableData(refreshedData.data);
          setOriginalDataLength(refreshedData.data.length);
        } catch (refreshError) {
          console.warn('Could not refresh data after insert:', refreshError);
        }
        
        toast({
          title: 'Success',
          description: `${validNewRows.length} rows inserted successfully!`,
        });
        
        // Reset mode after successful insert
        setMode(null);
        setEditMode(false);
        
      } else if (mode === 'update') {
        if (!columns || columns.length === 0 || !columns[0] || typeof columns[0] !== 'string' || !columns[0].trim()) {
          toast({
            title: 'Save Error',
            description: 'Primary key column is missing or invalid. Please check your table structure.',
            variant: 'destructive',
          });
          return;
        }
        
        const pk = columns[0];
        
        // Only send rows that have changed (diff originalData vs tableData)
        // Try to get originalData from store, fallback to local copy
        let originalRows = [];
        if (typeof useDashboardStore.getState === 'function' && useDashboardStore.getState().originalData) {
          originalRows = useDashboardStore.getState().originalData;
        } else {
          originalRows = tableData.slice(0, originalDataLength);
        }
        const updates: any[] = [];
        for (let i = 0; i < originalRows.length; i++) {
          const orig = originalRows[i];
          const curr = tableData[i];
          if (!orig || !curr) continue;
          // Find changed fields (excluding primary key)
          const changed: Record<string, any> = {};
          columns.forEach((col, idx) => {
            if (col === pk) {
              changed[col] = curr[col]; // always include PK for identification
            } else if (curr[col] !== orig[col]) {
              changed[col] = curr[col];
            }
          });
          // Only push if at least one non-PK field changed
          if (Object.keys(changed).length > 1) {
            updates.push({ ...changed, _rowIndex: i });
          }
        }
        // Validate that all updates have a non-empty PK value
        const missingPKIndex = updates.findIndex((u) => u[pk] === undefined || u[pk] === null || u[pk] === '');
        if (missingPKIndex !== -1) {
          const badUpdate = updates[missingPKIndex];
          console.error('Update error: missing PK value', { update: badUpdate, pk, updates });
          toast({
            title: 'Update Error',
            description: `Row ${badUpdate._rowIndex + 1} is missing a value for the primary key column ('${pk}'). Please ensure all rows have a valid primary key value before saving.`,
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
        updates.forEach((u, idx) => {
          console.log(`Update row ${u._rowIndex + 1}: PK (${pk}) =`, u[pk], u);
        });
        // Remove _rowIndex before sending
        const updatesToSend = updates.map(({ _rowIndex, ...rest }) => rest);
        if (updatesToSend.length === 0) {
          toast({
            title: 'No Changes',
            description: 'No changes to update.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
        const { updateTableDataApi } = await import('@/api/updateApi');
        await updateTableDataApi(selectedDatabase, pk, updatesToSend);
        // Refresh table data after successful update
        try {
          const refreshedData = await fetchTableData(selectedDatabase, 1000, 0);
          setTableData(refreshedData.data);
          setOriginalDataLength(refreshedData.data.length);
        } catch (refreshError) {
          console.warn('Could not refresh data after update:', refreshError);
        }
        
        toast({
          title: 'Success',
          description: `${updatesToSend.length} row(s) updated successfully!`,
        });
        
        // Reset mode after successful update
        setMode(null);
        setEditMode(false);
      }
    } catch (err: any) {
      console.error('Save error:', err);
      if (err && err.detail) {
        let msg = '';
        if (Array.isArray(err.detail)) {
          msg = err.detail.map((d: any) => d.msg).join(', ');
        } else {
          msg = err.detail;
        }
        setError(msg);
        toast({
          title: mode === 'update' ? 'Update Error' : 'Insert Error',
          description: msg,
          variant: 'destructive',
        });
      } else if (err && err.message) {
        setError(err.message);
        toast({
          title: 'Error',
          description: err.message,
          variant: 'destructive',
        });
      } else {
        setError('Failed to save data. Please try again.');
        toast({
          title: 'Error',
          description: 'Failed to save data. Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleColumnRename = (oldName: string, newName: string) => {
    if (newName.trim() && newName !== oldName) {
      renameColumn(oldName, newName);
      toast({
        title: "Column Renamed",
        description: `Column "${oldName}" renamed to "${newName}".`,
      });
    }
    setEditingColumn(null);
    setNewColumnName('');
  };
  // Bulk Add logic
  const handleBulkAdd = () => {
    setBulkPasteValue('');
    setBulkPasteError('');
    setBulkModalOpen(true);
  };

  const handleBulkPaste = () => {
    setBulkPasteError('');
    const lines = bulkPasteValue.split('\n').filter(line => line.trim());
    const hasTab = bulkPasteValue.includes('\t');
    if (lines.length === 0) {
      setBulkPasteError('No data found.');
      return;
    }
    if (lines.length > 500) {
      setBulkPasteError('You can paste up to 500 rows at once.');
      return;
    }
    const newRows = lines.map(line => {
      let cells: string[] = [];
      if (hasTab) {
        cells = parseRow(line, '\t').map(cell => cell.replace(/^"|"$/g, ''));
      } else {
        const csvParsed = parseRow(line, ',').map(cell => cell.replace(/^"|"$/g, ''));
        const neededCols = columns.length;
        if (csvParsed.length === neededCols) {
          cells = csvParsed;
        } else if (csvParsed.length < neededCols) {
          cells = [...csvParsed];
        } else {
          // merge extras into address-like column
          const primaryAddr = findPrimaryAddressIndex(columns);
          const mergeIndex = primaryAddr >= 0 ? primaryAddr : 0;
          const mapped: string[] = [];
          let p = 0;
          const endIdx = neededCols - 1;
          for (let colIdx = 0; colIdx <= endIdx; colIdx++) {
            if (colIdx < mergeIndex) {
              mapped.push(csvParsed[p++] || '');
            } else if (colIdx === mergeIndex) {
              const remainingColsAfter = endIdx - colIdx;
              const tokensForThis = Math.max(1, csvParsed.length - p - remainingColsAfter);
              const val = csvParsed.slice(p, p + tokensForThis).join(', ').trim();
              mapped.push(val);
              p += tokensForThis;
            } else {
              mapped.push(csvParsed[p++] || '');
            }
          }
          cells = mapped;
        }
      }
      const rowObj: Record<string, any> = {};
      columns.forEach((col, i) => {
        rowObj[col] = cells[i] || '';
      });
      return rowObj;
    });
    addMultipleRows(newRows.length);
    setTimeout(() => {
      const startIdx = tableData.length;
      newRows.forEach((row, i) => {
        columns.forEach(col => {
          updateCell(startIdx + i, col, row[col]);
        });
      });
      setBulkModalOpen(false);
      toast({
        title: 'Bulk Add Success',
        description: `Added ${newRows.length} rows.`,
      });
    }, 200);
  };

  if (!tableData || tableData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">No data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-card shadow-card border-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">
                {selectedDatabase?.replace('admin_panel_db/', '').replace('_', ' ').toUpperCase()}
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                {tableData.length} records • {columns.length} columns
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {/* Mode selector: Insert or Update. Default null until user chooses. */}
              <Button
                size="sm"
                variant={mode === 'insert' ? 'default' : 'outline'}
                onClick={() => { setMode('insert'); setEditMode(true); }}
                className={`${mode === 'insert' ? 'bg-green-600 hover:bg-green-700 text-white' : 'hover:bg-green-50 hover:text-green-700'}`}
              >
                Insert
              </Button>
              <Button
                size="sm"
                variant={mode === 'update' ? 'default' : 'outline'}
                onClick={() => { setMode('update'); setEditMode(true); }}
                className={`${mode === 'update' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'hover:bg-blue-50 hover:text-blue-700'}`}
              >
                Update
              </Button>
              {!isEditMode ? (
                <Button
                  onClick={() => setEditMode(true)}
                  className="bg-gradient-primary hover:bg-primary-hover text-white shadow-primary transition-smooth"
                >
                  <Edit3 className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              ) : (
                <div className="flex items-center space-x-2">
                  <Button
                    onClick={() => { resetToOriginal(); setMode(null); }}
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive hover:text-white transition-smooth"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-accent hover:bg-accent/90 text-white shadow-primary transition-smooth"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Row Actions (only in edit mode) */}
      {isEditMode && (
        <Card className="bg-gradient-card shadow-card border-0">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 flex-wrap">
              <Button
                onClick={handleAddRowAtTop}
                variant="outline"
                className="border-accent text-accent hover:bg-accent hover:text-white transition-smooth"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Row
              </Button>
              <Button
                onClick={handleBulkAdd}
                variant="outline"
                className="border-primary text-primary hover:bg-primary hover:text-white transition-smooth"
              >
                <Plus className="w-4 h-4 mr-2" />
                Bulk Add
              </Button>
              {/* CSV Upload Button (Insert mode only) */}
              {mode === 'insert' && (
                <>
                  <input
                    type="file"
                    accept=".csv"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleCsvUpload}
                  />
                  <Button
                    variant="outline"
                    className="border-success text-success hover:bg-success hover:text-white transition-smooth"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload CSV
                  </Button>
                </>
              )}
              <Button
                onClick={resetToOriginal}
                variant="outline"
                className="border-muted-foreground text-muted-foreground hover:bg-muted transition-smooth"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset All
              </Button>
            </div>
            {csvError && <div className="text-red-500 text-xs mt-2">{csvError}</div>}
            {/* Bulk Add Modal */}
            {bulkModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
                <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg mx-2 animate-fade-in">
                  <h2 className="text-lg font-semibold mb-2">Bulk Add Rows</h2>
                  <textarea
                    className="w-full h-40 p-2 border rounded text-sm bg-background text-foreground mb-2"
                    placeholder="Paste up to 500 rows (tab or comma separated)"
                    value={bulkPasteValue}
                    onChange={e => setBulkPasteValue(e.target.value)}
                  />
                  {bulkPasteError && <div className="text-red-500 text-xs mb-2">{bulkPasteError}</div>}
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setBulkModalOpen(false)} className="h-8 px-3">Cancel</Button>
                    <Button onClick={handleBulkPaste} className="h-8 px-3">Add</Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Data Table */}
      <Card className="bg-gradient-card shadow-card border-0">
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[600px] max-w-full relative border rounded-lg">
            <table className="min-w-max w-full border-separate border-spacing-0 text-xs md:text-sm">
              <thead className="sticky top-0 bg-table-header text-white z-10 shadow-md">
                <tr>
                  {isEditMode && (
                    <th className="px-2 py-1 md:px-3 md:py-2 text-left font-medium bg-table-header sticky left-0 z-20 border-b border-table-border">Actions</th>
                  )}
                  {columns.map((column, index) => (
                    <th key={column} className={`px-2 py-1 md:px-3 md:py-2 text-left font-medium min-w-[120px] md:min-w-[150px] bg-table-header border-b border-table-border ${index === 0 && !isEditMode ? 'sticky left-0 z-20' : ''}`}>
                      {isEditMode ? (
                        <div className="flex items-center space-x-2">
                          {editingColumn === column ? (
                            <div className="flex items-center space-x-1">
                              <Input
                                value={newColumnName}
                                onChange={(e) => setNewColumnName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleColumnRename(column, newColumnName);
                                  } else if (e.key === 'Escape') {
                                    setEditingColumn(null);
                                    setNewColumnName('');
                                  }
                                }}
                                className="h-7 md:h-8 text-xs md:text-sm text-black"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                onClick={() => handleColumnRename(column, newColumnName)}
                                className="h-6 w-6 p-0"
                              >
                                <Save className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <span>{column.replace('_', ' ').toUpperCase()}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingColumn(column);
                                  setNewColumnName(column);
                                }}
                                className="h-6 w-6 p-0 text-white hover:bg-white/20"
                              >
                                <Edit3 className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      ) : (
                        column.replace('_', ' ').toUpperCase()
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, rowIndex) => (
                  <tr 
                    key={rowIndex}
                    className={`border-b border-table-border transition-smooth ${
                      mode === 'insert' && rowIndex < originalDataLength 
                        ? 'opacity-60 bg-gray-50' 
                        : 'hover:bg-table-row-hover'
                    }`}
                  >
                    {isEditMode && (
                      <td className="px-2 py-1 md:px-3 md:py-2 sticky left-0 bg-background z-15 border-r border-table-border">
                        {(mode === 'insert' || rowIndex >= originalDataLength) && (
                          <Button
                            onClick={() => deleteRow(rowIndex)}
                            size="sm"
                            variant="outline"
                            className="border-destructive text-destructive hover:bg-destructive hover:text-white transition-smooth"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </td>
                    )}
                    {columns.map((column, colIndex) => (
                      <td key={`${rowIndex}-${column}`} className={`px-2 py-1 md:px-3 md:py-2 border-r border-table-border ${colIndex === 0 && !isEditMode ? 'sticky left-0 bg-background z-15' : ''}`}>
                        {isEditMode ? (
                          // In Update mode, prevent editing the first column (primary key)
                          columns[0] === column && mode === 'update' ? (
                            <Input
                              value={row[column] || ''}
                              readOnly
                              disabled
                              className="border-input bg-gray-100 text-xs md:text-sm"
                              title={`Primary key is locked in Update mode`}
                            />
                          ) : (
                            <Input
                              value={row[column] || ''}
                              onChange={(e) => handleCellChange(rowIndex, column, e.target.value)}
                              onPaste={(e) => handlePaste(e, rowIndex, column)}
                              className={`border-input focus:border-primary transition-smooth text-xs md:text-sm ${
                                mode === 'insert' && rowIndex < originalDataLength 
                                  ? 'bg-gray-50 text-gray-500' 
                                  : 'bg-white'
                              }`}
                              placeholder={`Enter ${column}`}
                              title={`Paste data here to auto-fill multiple cells. Row ${rowIndex + 1}, Column: ${column}`}
                              readOnly={mode === 'insert' && rowIndex < originalDataLength}
                            />
                          )
                        ) : (
                          <span className="text-foreground">
                            {row[column] || '-'}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isEditMode && (
            <div className="p-2 md:p-4 border-t border-table-border bg-muted/30">
              <p className="text-xs md:text-sm text-muted-foreground">
                💡 <strong>Copy-Paste Tip:</strong> Copy data from Excel/Sheets and paste in any cell. 
                Data will auto-expand to fill rows and columns. New rows will be created automatically if needed.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
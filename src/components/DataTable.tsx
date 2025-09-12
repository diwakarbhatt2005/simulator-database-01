import { useState, useMemo, useCallback, useEffect } from 'react';
import { ValidationError, fetchTableData, validateAndAutoFixData } from '@/api/tableData';
import { bulkReplaceTableDataApi3, insertTableDataApi3 } from '@/api/api3';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@/components/ui/button';
import { sendToWebhook } from '@/api/api4';
import { useRef } from 'react';
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

export const DataTable = () => {
  // ...existing code...
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
  // Local mode: insert or update. Kept local so insertion logic remains unchanged.
  const [mode, setMode] = useState<'insert' | 'update' | null>(null);
  
  const {
    tableData,
    selectedDatabase,
    isEditMode,
    error,
    setEditMode,
    updateCell,
    addRow,
    addMultipleRows,
    addColumn,
    deleteRow,
    renameColumn,
    resetToOriginal,
    saveChanges,
    setError,
    setTableData,
  } = useDashboardStore();

  // Remove all local validation logic from handleCellChange
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

  // Robust CSV/TSV row parser: respects quoted fields and also keeps
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

  // Find primary address-like column index (prefer exact 'address' or 'addr')
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
    
  // Support both tab and comma separated data
  const rows = pastedData.split('\n').filter(row => row.trim());
    
    if (rows.length === 0) {
      toast({
        title: "Paste Error",
        description: "No valid data found to paste.",
        variant: "destructive",
      });
      return;
    }
    
  // Validate and detect delimiter preference: prefer tabs (Excel/Sheets).
  const hasTab = pastedData.includes('\t');
  const sampleRow = rows[0];
  const delimiterGuess = hasTab ? '\t' : ',';

  // use shared parseRow above
    
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
        // extra tokens into a likely "address-like" column so address
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
    if (originalDataLength === 0 && tableData.length > 0) {
      setOriginalDataLength(tableData.length);
    }
  }, [tableData, originalDataLength]);

  // INSERT ONLY - Auto-fix and add new rows
  const handleSave = async () => {
    if (!selectedDatabase) return;
    try {
      setIsSaving(true);
      setError(null);

      // Get only NEW rows (after original data length)
      const newRows = tableData.slice(originalDataLength);
      
      if (newRows.length === 0) {
        toast({
          title: 'No New Data',
          description: 'Please add new rows to save.',
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }

      // Validate and auto-fix data before sending
      const fixedRows = validateAndAutoFixData(newRows, tableData.slice(0, originalDataLength));

      // Use INSERT ONLY API with the fixed data
      const result = await insertTableDataApi3(selectedDatabase, fixedRows);
      
      // Refresh table data after successful insert
      try {
        const refreshedData = await fetchTableData(selectedDatabase, 1000, 0);
        setTableData(refreshedData.data); // Use .data property from TableDataResponse
      } catch (refreshError) {
        console.warn('Could not refresh data after insert:', refreshError);
      }
      
      toast({
        title: 'Success',
        description: `${newRows.length} rows inserted successfully with auto-fix applied!`,
      });
      
    } catch (err: any) {
      console.error('Insert error:', err);
      
      if (err && err.detail) {
        let msg = '';
        if (Array.isArray(err.detail)) {
          msg = err.detail.map((d: any) => d.msg).join(', ');
        } else {
          msg = err.detail;
        }
        setError(msg);
        toast({
          title: 'Insert Error',
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
        setError('Failed to insert data. Please try again.');
        toast({
          title: 'Error',
          description: 'Failed to insert data. Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ...existing code remains; update logic was removed per request

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
    const lines = bulkPasteValue.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) {
      setBulkPasteError('No data found.');
      return;
    }
    if (lines.length > 500) {
      setBulkPasteError('You can paste up to 500 rows at once.');
      return;
    }
    const hasTab = bulkPasteValue.includes('\t');
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
      const rowObj = {} as Record<string, any>;
      columns.forEach((col, i) => {
        rowObj[col] = cells[i] || '';
      });
      return rowObj;
    });
    addMultipleRows(newRows.length);
    setTimeout(() => {
      // Fill new rows
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

  if (tableData.length === 0) {
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
                variant={mode === 'insert' ? 'ghost' : 'outline'}
                onClick={() => { setMode('insert'); setEditMode(true); }}
                className={`${mode === 'insert' ? 'bg-accent text-white' : ''}`}
              >
                Insert
              </Button>
              <Button
                size="sm"
                variant={mode === 'update' ? 'ghost' : 'outline'}
                onClick={() => { setMode('update'); setEditMode(true); }}
                className={`${mode === 'update' ? 'bg-primary text-white' : ''}`}
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
                onClick={addRow}
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
              <Button
                onClick={resetToOriginal}
                variant="outline"
                className="border-muted-foreground text-muted-foreground hover:bg-muted transition-smooth"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset All
              </Button>
              <Button
                onClick={() => {
                  // Example: sum all values in a column named 'amount' for the current month
                  const now = new Date();
                  const thisMonth = now.getMonth();
                  const thisYear = now.getFullYear();
                  let sum = 0;
                  tableData.forEach(row => {
                    // Try to find a date column
                    const dateCol = Object.keys(row).find(k => k.toLowerCase().includes('date'));
                    const amountCol = Object.keys(row).find(k => k.toLowerCase().includes('amount'));
                    if (dateCol && amountCol && row[dateCol] && row[amountCol]) {
                      const d = new Date(row[dateCol]);
                      if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) {
                        const val = Number(row[amountCol]);
                        if (!isNaN(val)) sum += val;
                      }
                    }
                  });
                  alert(`Total for this month: ${sum}`);
                }}
                variant="outline"
                className="border-info text-info hover:bg-info hover:text-white transition-smooth"
              >
                Calculate Month Data
              </Button>
            </div>
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
          <div className="overflow-x-auto max-h-[70vh] relative">
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
                    className="border-b border-table-border hover:bg-table-row-hover transition-smooth"
                  >
                    {isEditMode && (
                      <td className="px-2 py-1 md:px-3 md:py-2 sticky left-0 bg-background z-15 border-r border-table-border">
                        {rowIndex >= originalDataLength && (
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
                              className="border-input focus:border-primary transition-smooth text-xs md:text-sm"
                              placeholder={`Enter ${column}`}
                              title={`Paste data here to auto-fill multiple cells. Row ${rowIndex + 1}, Column: ${column}`}
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
    {/* ...existing code... */}

    {/* Chatbot Assistant UI */}
    <Card className="mt-6 bg-gradient-card shadow-card border-0">
      <CardHeader>
        <CardTitle className="text-lg font-bold">Chatbot Assistant</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row items-stretch gap-2">
          <Input
            ref={chatInputRef}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1"
            disabled={chatLoading}
            onKeyDown={e => { if (e.key === 'Enter') handleAskChatbot(); }}
          />
          <Button onClick={handleAskChatbot} disabled={chatLoading || !chatInput.trim()}>
            {chatLoading ? "Asking..." : "Ask"}
          </Button>
        </div>
        {chatError && <div className="text-red-500 mt-2">{chatError}</div>}
        {chatResponse && (
          <div className="mt-3 p-3 rounded bg-muted text-foreground border">
            <strong>Response:</strong> {chatResponse}
          </div>
        )}
      </CardContent>
    </Card>
  </div>
  );
};
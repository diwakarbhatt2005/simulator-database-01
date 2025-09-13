import { create } from 'zustand';

export interface DatabaseRow {
  [key: string]: any;
}

export interface DashboardState {
  // Database selection
  databases: string[];
  selectedDatabase: string | null;
  
  // Data table
  tableData: DatabaseRow[];
  originalData: DatabaseRow[];
  isEditMode: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Chatbot
  chatMessages: Array<{ id: string; text: string; isUser: boolean; timestamp: Date }>;
  isChatOpen: boolean;
  isChatLoading: boolean;
  
  // Actions
  setDatabases: (databases: string[]) => void;
  setSelectedDatabase: (database: string) => void;
  setTableData: (data: DatabaseRow[]) => void;
  setEditMode: (isEdit: boolean) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  updateCell: (rowIndex: number, field: string, value: any) => void;
  addRow: () => void;
  addMultipleRows: (count: number) => void;
  insertRowAtTop: () => void;
  addColumn: (columnName: string) => void;
  deleteRow: (rowIndex: number) => void;
  renameColumn: (oldName: string, newName: string) => void;
  resetToOriginal: () => void;
  saveChanges: () => void;
  
  // Chat actions
  setChatOpen: (isOpen: boolean) => void;
  addChatMessage: (text: string, isUser: boolean) => void;
  setChatLoading: (isLoading: boolean) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  // Initial state
  databases: [],
  selectedDatabase: null,
  tableData: [],
  originalData: [],
  isEditMode: false,
  isLoading: false,
  error: null,
  chatMessages: [
    {
      id: '1',
      text: 'Hello! I\'m your AI assistant. How can I help you with your database management today?',
      isUser: false,
      timestamp: new Date(),
    },
  ],
  isChatOpen: false,
  isChatLoading: false,

  // Actions
  setDatabases: (databases) => set({ databases }),
  setSelectedDatabase: (database) => set({ selectedDatabase: database }),
  setTableData: (data) => set({ 
    tableData: data, 
    originalData: JSON.parse(JSON.stringify(data)) // Deep copy
  }),
  setEditMode: (isEdit) => set({ isEditMode: isEdit }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  
  updateCell: (rowIndex, field, value) => {
    const { tableData } = get();
    const newData = [...tableData];
    if (newData[rowIndex]) {
      newData[rowIndex] = { ...newData[rowIndex], [field]: value };
      set({ tableData: newData });
    }
  },
  
  addRow: () => {
    const { tableData } = get();
    if (tableData.length > 0) {
      // Create a new row with the same structure as existing rows
      const firstRow = tableData[0];
      const newRow: DatabaseRow = {};
      Object.keys(firstRow).forEach(key => {
        if (key === 'id') {
          // Generate a unique id (max id + 1 or 1 if none)
          const maxId = Math.max(0, ...tableData.map(r => Number(r.id) || 0));
          newRow[key] = String(maxId + 1);
        } else {
          newRow[key] = '';
        }
      });
      const newTableData = [...tableData, newRow];
      set({ tableData: newTableData });
      console.log('Added row, new length:', newTableData.length);
    }
  },
  
  insertRowAtTop: () => {
    const { tableData } = get();
    if (tableData.length > 0) {
      const firstRow = tableData[0];
      const newRow: DatabaseRow = {};
      Object.keys(firstRow).forEach(key => {
        if (key === 'id') {
          const maxId = Math.max(0, ...tableData.map(r => Number(r.id) || 0));
          newRow[key] = String(maxId + 1);
        } else {
          newRow[key] = '';
        }
      });
      // Insert at the top (index 0)
      const newTableData = [newRow, ...tableData];
      set({ tableData: newTableData });
    }
  },
  
  addMultipleRows: (count: number) => {
    const { tableData } = get();
    if (tableData.length > 0 && count > 0) {
      const firstRow = tableData[0];
      const newRows: DatabaseRow[] = [];
      let maxId = Math.max(0, ...tableData.map(r => Number(r.id) || 0));
      for (let i = 0; i < count; i++) {
        const newRow: DatabaseRow = {};
        Object.keys(firstRow).forEach(key => {
          if (key === 'id') {
            newRow[key] = String(++maxId);
          } else {
            newRow[key] = '';
          }
        });
        newRows.push(newRow);
      }
      const newTableData = [...tableData, ...newRows];
      set({ tableData: newTableData });
      console.log(`Added ${count} rows, new length:`, newTableData.length);
    }
  },
  
  deleteRow: (rowIndex) => {
    const { tableData } = get();
    const newData = tableData.filter((_, index) => index !== rowIndex);
    set({ tableData: newData });
  },
  
  addColumn: (columnName: string) => {
    const { tableData } = get();
    const newData = tableData.map(row => ({ ...row, [columnName]: '' }));
    set({ tableData: newData });
  },

  renameColumn: (oldName: string, newName: string) => {
    const { tableData } = get();
    const newData = tableData.map(row => {
      const newRow = { ...row };
      if (oldName in newRow) {
        newRow[newName] = newRow[oldName];
        delete newRow[oldName];
      }
      return newRow;
    });
    set({ tableData: newData });
  },

  saveChanges: () => {
    const { tableData } = get();
    set({ 
      originalData: JSON.parse(JSON.stringify(tableData)),
      isEditMode: false 
    });
  },

  resetToOriginal: () => {
    const { originalData } = get();
    set({ 
      tableData: JSON.parse(JSON.stringify(originalData)),
      isEditMode: false 
    });
  },
  
  // Chat actions
  setChatOpen: (isOpen) => set({ isChatOpen: isOpen }),
  addChatMessage: (text, isUser) => {
    const { chatMessages } = get();
    const newMessage = {
      id: Date.now().toString(),
      text,
      isUser,
      timestamp: new Date(),
    };
    set({ chatMessages: [...chatMessages, newMessage] });
  },
  setChatLoading: (isLoading) => set({ isChatLoading: isLoading }),
}));
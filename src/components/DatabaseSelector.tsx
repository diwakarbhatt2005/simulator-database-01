import { useState, useEffect } from 'react';
import { fetchTableNames } from '@/api/tables';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Database, Loader2, AlertCircle } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboardStore';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { fetchTableData } from '@/api/tableData';
// ...existing code...

// filepath: c:\Users\dev\OneDrive\Desktop\A.OFFICE WORK\data-updations-main\src\components\DatabaseSelector.tsx
// filepath: c:\Users\dev\OneDrive\Desktop\A.OFFICE WORK\data-updations-main\src\components\DatabaseSelector.tsx
// ...existing code...

export const DatabaseSelector = () => {
  const navigate = useNavigate();
  const [selectedDb, setSelectedDb] = useState<string>('');
  const [tables, setTables] = useState<string[]>([]);
  
  const {
    isLoading,
    error,
    setSelectedDatabase,
    setTableData,
    setLoading,
    setError,
  } = useDashboardStore();

  // Fetch tables from API on mount
  useEffect(() => {
    const getTables = async () => {
      setLoading(true);
      setError(null);
      try {
        const apiTables = await fetchTableNames();
        setTables(apiTables);
      } catch (err) {
        setError('Failed to fetch tables. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    getTables();
  }, [setLoading, setError]);

  const handleDatabaseSelect = async () => {
    if (!selectedDb) return;
    try {
      setLoading(true);
      setError(null);
      setSelectedDatabase(selectedDb);
      // Fetch table data immediately
      const data = await fetchTableData(selectedDb, 1000, 0);
      setTableData(data.data);
      navigate('/view-data');
    } catch (err) {
      setError('Failed to fetch data. Please check your connection and try again.');
      setTableData([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dashboard-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Card className="bg-gradient-card shadow-elevation border-0">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto shadow-primary">
              <Database className="w-8 h-8 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                Database Admin Dashboard
              </CardTitle>
              <CardDescription className="text-muted-foreground mt-2">
                Select a table to view and manage your data
              </CardDescription>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Select a Table to View
              </label>
              <Select 
                value={selectedDb} 
                onValueChange={setSelectedDb}
                disabled={isLoading}
              >
                <SelectTrigger className="h-12 border-2 transition-smooth focus:border-primary hover:border-primary/50">
                  <SelectValue placeholder="Choose Table..." />
                </SelectTrigger>
                <SelectContent className="bg-white shadow-elevation border-0 max-h-64 overflow-y-auto z-50">
                  {tables.map((table) => (
                    <SelectItem 
                      key={table} 
                      value={table}
                      className="hover:bg-gradient-hover transition-smooth"
                    >
                      {table.replace(/_/g, ' ').toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleDatabaseSelect}
              disabled={!selectedDb || isLoading}
              className="w-full h-12 bg-gradient-primary hover:bg-primary-hover text-white font-medium shadow-primary transition-smooth disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                'Load Table'
              )}
            </Button>

            {isLoading && !error && (
              <div className="text-center text-sm text-muted-foreground">
                Fetching table information...
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
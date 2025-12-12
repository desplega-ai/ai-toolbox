import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef, type GridReadyEvent } from 'ag-grid-community';
import type { QueryResponse } from '@/types/api';

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

interface ResultsGridProps {
  data: QueryResponse;
}

export function ResultsGrid({ data }: ResultsGridProps) {
  const columnDefs = useMemo<ColDef[]>(() => {
    return data.columns.map((col, index) => ({
      field: `col_${index}`,
      headerName: col,
      sortable: true,
      filter: true,
      resizable: true,
      // Format timestamps
      valueFormatter: (params) => {
        if (col === 'time' && params.value) {
          return new Date(params.value as string).toLocaleString();
        }
        return params.value;
      },
    }));
  }, [data.columns]);

  const rowData = useMemo(() => {
    return data.rows.map(row => {
      const obj: Record<string, unknown> = {};
      row.forEach((val, i) => {
        obj[`col_${i}`] = val;
      });
      return obj;
    });
  }, [data.rows]);

  const onGridReady = (event: GridReadyEvent) => {
    event.api.sizeColumnsToFit();
  };

  return (
    <div className="w-full h-full">
      <AgGridReact
        columnDefs={columnDefs}
        rowData={rowData}
        onGridReady={onGridReady}
        defaultColDef={{
          sortable: true,
          filter: true,
          resizable: true,
        }}
        animateRows={true}
        rowSelection="multiple"
      />
    </div>
  );
}

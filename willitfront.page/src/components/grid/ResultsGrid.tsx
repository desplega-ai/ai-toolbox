import { useMemo, useRef, useState, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef, type GridReadyEvent } from 'ag-grid-community';
import type { QueryResponse } from '@/types/api';

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

const MIN_COLUMN_WIDTH = 100;

interface ResultsGridProps {
  data: QueryResponse;
}

export function ResultsGrid({ data }: ResultsGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Guard against missing columns
  const columns = data.columns || [];
  const rows = data.rows || [];

  // Determine if columns should flex or have fixed min width
  const totalMinWidth = columns.length * MIN_COLUMN_WIDTH;
  const shouldFlex = containerWidth > 0 && totalMinWidth < containerWidth;

  const columnDefs = useMemo<ColDef[]>(() => {
    return columns.map((col, index) => ({
      field: `col_${index}`,
      headerName: col,
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: MIN_COLUMN_WIDTH,
      // Use flex when columns fit, otherwise fixed width for scrolling
      ...(shouldFlex ? { flex: 1 } : {}),
      // Format timestamps
      valueFormatter: (params) => {
        if (col === 'time' && params.value) {
          return new Date(params.value as string).toLocaleString();
        }
        return params.value;
      },
    }));
  }, [columns, shouldFlex]);

  const rowData = useMemo(() => {
    return rows.map(row => {
      const obj: Record<string, unknown> = {};
      row.forEach((val, i) => {
        obj[`col_${i}`] = val;
      });
      return obj;
    });
  }, [rows]);

  const onGridReady = (event: GridReadyEvent) => {
    // Only size to fit if columns should flex
    if (shouldFlex) {
      event.api.sizeColumnsToFit();
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full">
      <AgGridReact
        columnDefs={columnDefs}
        rowData={rowData}
        onGridReady={onGridReady}
        defaultColDef={{
          sortable: true,
          filter: true,
          resizable: true,
          minWidth: MIN_COLUMN_WIDTH,
        }}
        animateRows={true}
        rowSelection="multiple"
        suppressHorizontalScroll={false}
      />
    </div>
  );
}

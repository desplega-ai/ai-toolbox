import { tool } from 'ai';
import { z } from 'zod';

const MAX_CHART_ROWS = 1000;

const chartTypeSchema = z.enum(['bar', 'line', 'pie', 'metric']).optional();

const renderChartParams = z.object({
  data: z.object({
    columns: z.array(z.string()).describe('Column names'),
    rows: z.array(z.array(z.unknown())).describe('Data rows'),
  }).describe('Chart data in QueryResponse format'),
  chartType: chartTypeSchema.describe('Chart type - if omitted, auto-detected from data shape'),
  title: z.string().optional().describe('Chart title'),
  xAxisLabel: z.string().optional().describe('X-axis label (for bar/line charts)'),
  yAxisLabel: z.string().optional().describe('Y-axis label (for bar/line charts)'),
});

type RenderChartParams = z.infer<typeof renderChartParams>;

/**
 * Auto-detect chart type based on data shape
 */
function detectChartType(columns: string[], rows: unknown[][]): 'bar' | 'line' | 'pie' | 'metric' {
  // Single value = metric
  if (rows.length === 1 && columns.length === 1) {
    return 'metric';
  }

  // Two columns where first is string/category = bar or pie
  if (columns.length === 2 && rows.length > 0) {
    const firstColValues = rows.map(r => r[0]);
    const allStrings = firstColValues.every(v => typeof v === 'string');

    // Small number of categories (2-8) with numeric values = pie
    if (allStrings && rows.length >= 2 && rows.length <= 8) {
      const secondColValues = rows.map(r => r[1]);
      const allNumeric = secondColValues.every(v => typeof v === 'number');
      if (allNumeric) {
        return 'pie';
      }
    }
  }

  // Time-based first column = line
  if (columns.length >= 2 && rows.length > 0) {
    const firstCol = columns[0].toLowerCase();
    const timeIndicators = ['date', 'time', 'day', 'month', 'year', 'hour', 'week', 'quarter'];
    if (timeIndicators.some(t => firstCol.includes(t))) {
      return 'line';
    }

    // Check if first column values look like dates
    const firstValue = rows[0]?.[0];
    if (typeof firstValue === 'string' && !isNaN(Date.parse(firstValue))) {
      return 'line';
    }
  }

  // Default to bar
  return 'bar';
}

export function createRenderChartTool() {
  return tool({
    description: `Render a chart visualization. Use this after querying data with querySql.

Chart types:
- bar: Categorical comparisons (e.g., posts by type, users by karma)
- line: Time series or trends (e.g., posts over time, daily activity)
- pie: Part-to-whole relationships (best for 2-8 categories)
- metric: Single value display (e.g., total count, average)

If chartType is omitted, the system auto-detects based on data shape.
Data should come from a querySql result.`,
    inputSchema: renderChartParams,
    execute: async ({ data, chartType, title, xAxisLabel, yAxisLabel }: RenderChartParams) => {
      try {
        const { columns, rows } = data;

        // Validate data
        if (!columns || columns.length === 0) {
          return {
            success: false as const,
            error: 'No columns provided',
          };
        }

        if (!rows || rows.length === 0) {
          return {
            success: false as const,
            error: 'No data rows provided',
          };
        }

        // Enforce row limit
        const truncatedRows = rows.slice(0, MAX_CHART_ROWS);
        const wasTruncated = rows.length > MAX_CHART_ROWS;

        // Auto-detect chart type if not specified
        const resolvedChartType = chartType || detectChartType(columns, truncatedRows);

        // Validate chart type against data
        if (resolvedChartType === 'metric' && (columns.length !== 1 || truncatedRows.length !== 1)) {
          // Metric requested but data doesn't fit - use first value
          return {
            success: true as const,
            chartType: 'metric' as const,
            title,
            data: {
              columns: [columns[0]],
              rows: [[truncatedRows[0]?.[0] ?? 0]],
              row_count: 1,
            },
            wasTruncated: false,
          };
        }

        return {
          success: true as const,
          chartType: resolvedChartType,
          title,
          xAxisLabel,
          yAxisLabel,
          data: {
            columns,
            rows: truncatedRows,
            row_count: truncatedRows.length,
          },
          wasTruncated,
          originalRowCount: wasTruncated ? rows.length : undefined,
        };
      } catch (error) {
        return {
          success: false as const,
          error: error instanceof Error ? error.message : 'Failed to render chart',
        };
      }
    },
  });
}

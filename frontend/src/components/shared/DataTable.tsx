/**
 * DataTable — reusable sortable/filterable table using @tanstack/react-table.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type CellContext,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown, Check, ClipboardCopy, Download, Search } from 'lucide-react';
import { copyTableToClipboard } from '../../utils/clipboard';
import { downloadWorkbook } from '../../utils/excel';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../ui/table';

interface DataTableProps<T> {
  data: T[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  filterPlaceholder?: string;
  enableGlobalFilter?: boolean;
  exportFileName?: string;
  stickyFirstColumn?: boolean;
  enableRowSelection?: boolean;
  onSelectionChange?: (selectedRows: T[]) => void;
}

function extractExportValue<T>(cellContext: CellContext<T, unknown>) {
  const rawValue = cellContext.getValue();
  if (rawValue != null && (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean')) {
    return rawValue;
  }

  const rowValue = cellContext.row.original as Record<string, unknown>;
  const columnId = cellContext.column.id;
  if (rowValue && columnId in rowValue) {
    return rowValue[columnId];
  }

  return rawValue;
}

export function DataTable<T>({
  data,
  columns,
  filterPlaceholder = 'Search...',
  enableGlobalFilter = true,
  exportFileName = 'table-export',
  stickyFirstColumn = false,
  enableRowSelection = false,
  onSelectionChange,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [tableCopied, setTableCopied] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset selection when data changes (e.g. after bulk delete)
  useEffect(() => {
    setRowSelection({});
  }, [data]);

  const handleCopyTable = useCallback(async () => {
    if (!tableRef.current) return;
    const ok = await copyTableToClipboard(tableRef.current);
    if (ok) {
      setTableCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setTableCopied(false), 2000);
    }
  }, []);

  /* ── Checkbox column for row selection ── */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectorColumn: ColumnDef<T, any> = useMemo(() => ({
    id: '_selector',
    header: ({ table: t }) => (
      <input
        type="checkbox"
        checked={t.getIsAllPageRowsSelected()}
        onChange={t.getToggleAllPageRowsSelectedHandler()}
        aria-label="Select all rows"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
  }), []);

  const allColumns = useMemo(
    () => enableRowSelection ? [selectorColumn, ...columns] : columns,
    [enableRowSelection, selectorColumn, columns],
  );

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    enableRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Notify parent when selection changes
  useEffect(() => {
    if (!enableRowSelection || !onSelectionChange) return;
    const selected = table.getSelectedRowModel().rows.map((r) => r.original);
    onSelectionChange(selected);
  }, [rowSelection, enableRowSelection, onSelectionChange, table]);

  const exportColumns = useMemo(() => (
    table
      .getAllLeafColumns()
      .filter((column) => {
        const meta = column.columnDef.meta as { exportable?: boolean } | undefined;
        return column.getIsVisible() && column.id !== '_selector' && meta?.exportable !== false;
      })
      .map((column) => {
        const headerDef = column.columnDef.header;
        const header = typeof headerDef === 'string'
          ? headerDef
          : typeof column.id === 'string'
            ? column.id
            : 'Column';
        return { id: column.id, header };
      })
  ), [table]);

  const handleExportExcel = () => {
    const rows = table.getRowModel().rows.map((row) =>
      Object.fromEntries(
        exportColumns.map((column) => {
          const cell = row.getAllCells().find((candidate) => candidate.column.id === column.id);
          return [column.header, cell ? extractExportValue(cell.getContext()) : ''];
        }),
      ),
    );

    downloadWorkbook(exportFileName, [{ name: 'Filtered data', rows }]);
  };

  /* ── Keyboard shortcuts ── */
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const handler = (e: KeyboardEvent) => {
      // Ctrl+C (no shift) — copy table
      if (e.ctrlKey && !e.shiftKey && e.key === 'c') {
        // Only intercept when nothing is selected in the document
        const sel = window.getSelection();
        if (sel && sel.toString().length > 0) return;
        e.preventDefault();
        handleCopyTable();
      }
      // Ctrl+Shift+E — export Excel
      if (e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
        e.preventDefault();
        handleExportExcel();
      }
    };

    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [handleCopyTable, handleExportExcel]);

  return (
    <div className="data-table-wrapper" ref={wrapperRef} tabIndex={-1}>
      <div className="data-table-toolbar">
        {enableGlobalFilter && (
          <div className="table-filter">
            <Search size={16} />
            <input
              type="text"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={filterPlaceholder}
              className="table-filter-input"
            />
          </div>
        )}
        <div className="data-table-toolbar-actions">
          <button type="button" className="table-export-button" onClick={handleCopyTable} title="Ctrl+C">
            {tableCopied ? <Check size={15} /> : <ClipboardCopy size={15} />}
            {tableCopied ? 'Copied!' : 'Copy table'}
          </button>
          <button type="button" className="table-export-button" onClick={handleExportExcel} title="Ctrl+Shift+E">
            <Download size={15} />
            Export Excel
          </button>
        </div>
      </div>
      <div className="data-table-scroll">
        <Table className={`data-table${stickyFirstColumn ? ' data-table--sticky-col' : ''}`} ref={tableRef}>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent border-b-0">
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={header.column.getCanSort() ? 'sortable cursor-pointer select-none' : ''}
                  >
                    <div className="th-content">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && <ArrowUpDown size={14} />}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className={row.getIsSelected() ? 'row-selected' : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={allColumns.length} className="table-empty text-center">
                  No data available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="table-footer">
        <span>
          {table.getRowModel().rows.length} rows
          {enableRowSelection && Object.keys(rowSelection).length > 0 && (
            <> · {Object.keys(rowSelection).length} selected</>
          )}
        </span>
      </div>
    </div>
  );
}

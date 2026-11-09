"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/shared/empty-state"
import { TableSkeleton } from "@/components/shared/skeletons"
import { cn } from "@/lib/utils"

export type { ColumnDef } from "@tanstack/react-table"

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  getRowId?: (row: T) => string
  /** Card usado no mobile (< md). Sem ele, a tabela rola na horizontal. */
  mobileCard?: (row: T) => React.ReactNode
  onRowClick?: (row: T) => void
  selectable?: boolean
  /** Barra de ações em massa, renderizada quando há linhas selecionadas. */
  bulkActions?: (rows: T[], clear: () => void) => React.ReactNode
  loading?: boolean
  empty?: React.ReactNode
  pageSize?: number
  initialSorting?: SortingState
  className?: string
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  mobileCard,
  onRowClick,
  selectable,
  bulkActions,
  loading,
  empty,
  pageSize = 15,
  initialSorting = [],
  className,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting)
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  const allColumns = React.useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!selectable) return columns
    const select: ColumnDef<T, unknown> = {
      id: "__select",
      enableSorting: false,
      size: 36,
      header: ({ table }) => (
        <Checkbox
          aria-label="Selecionar todos"
          checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(Boolean(v))}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Selecionar linha"
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(Boolean(v))}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    }
    return [select, ...columns]
  }, [columns, selectable])

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: allColumns,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: selectable,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    autoResetPageIndex: true,
  })

  const selected = table.getSelectedRowModel().rows.map((r) => r.original)
  const clear = () => setRowSelection({})

  if (loading) return <TableSkeleton className={className} />

  const rows = table.getRowModel().rows
  const pageCount = table.getPageCount()
  const { pageIndex } = table.getState().pagination

  return (
    <div className={cn("space-y-3", className)}>
      {selectable && selected.length > 0 && bulkActions && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/35 bg-brand-soft px-4 py-3 text-sm">
          <Check className="size-4 text-primary" /><span className="num font-medium text-primary">{selected.length}</span>
          <span className="text-muted-foreground">selecionado(s)</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">{bulkActions(selected, clear)}</div>
        </div>
      )}

      {data.length === 0 ? (
        (empty ?? <EmptyState title="Nada por aqui ainda" description="Ajuste os filtros ou cadastre um novo registro." />)
      ) : (
        <>
          <div className={cn("overflow-hidden rounded-2xl border bg-card shadow-[0_2px_6px_#17243b03]", mobileCard && "hidden md:block")}>
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="hover:bg-transparent">
                    {hg.headers.map((header) => {
                      const canSort = header.column.getCanSort()
                      const dir = header.column.getIsSorted()
                      return (
                        <TableHead key={header.id} style={header.column.columnDef.size ? { width: header.column.columnDef.size } : undefined} aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined} className="h-12 text-[11px] text-muted-foreground">
                          {header.isPlaceholder ? null : canSort ? (
                            <button type="button" className="inline-flex min-h-8 items-center gap-1.5 rounded px-1 -mx-1 transition-colors hover:text-foreground" onClick={header.column.getToggleSortingHandler()}>
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {dir === "asc" ? <ArrowUp className="size-3" /> : dir === "desc" ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onRowClick?.(row.original) } }}
                    className={cn(onRowClick && "cursor-pointer focus-visible:bg-accent", "data-[state=selected]:bg-accent")}
                    onClick={event => { if (!(event.target as HTMLElement).closest("a, button, input, select, textarea, [role=checkbox], [role=switch], [role=combobox]")) onRowClick?.(row.original) }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-3.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {mobileCard && (
            <div className="space-y-2 md:hidden">
              {rows.map((row: Row<T>) => (
                <div
                  key={row.id}
                  className={cn("flex gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-input", row.getIsSelected() && "border-primary/35")}
                  onClick={event => { if (!(event.target as HTMLElement).closest("a, button, input, select, textarea, [role=checkbox], [role=switch], [role=combobox]")) onRowClick?.(row.original) }}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onRowClick?.(row.original) } }}
                >
                  {selectable && (
                    <Checkbox
                      className="mt-0.5"
                      aria-label="Selecionar"
                      checked={row.getIsSelected()}
                      onCheckedChange={(v) => row.toggleSelected(Boolean(v))}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <div className="min-w-0 flex-1">{mobileCard(row.original)}</div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1 text-xs text-muted-foreground">
            <span role="status" aria-live="polite" className="tabular-nums">{pageIndex * table.getState().pagination.pageSize + 1}–{Math.min((pageIndex + 1) * table.getState().pagination.pageSize, data.length)} de {data.length} registros</span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">Por página<select aria-label="Registros por página" value={table.getState().pagination.pageSize} onChange={event => table.setPageSize(Number(event.target.value))} className="h-8 rounded-lg border bg-card px-2 text-xs text-foreground">{[...new Set([10, 15, 25, 50, pageSize])].sort((a, b) => a - b).map(size => <option key={size} value={size}>{size}</option>)}</select></label>
              {pageCount > 1 && <div className="flex items-center gap-1"><Button variant="ghost" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Página anterior"><ChevronLeft /></Button><span className="px-1 tabular-nums">{pageIndex + 1} / {pageCount}</span><Button variant="ghost" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Próxima página"><ChevronRight /></Button></div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

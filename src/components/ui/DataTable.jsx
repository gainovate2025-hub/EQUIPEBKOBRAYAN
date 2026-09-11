export default function DataTable({ columns, rows, totalRow, renderCell }) {
  const gridTemplateColumns = columns.map((c) => c.width || '1fr').join(' ')

  return (
    <div className="team-table">
      <div className="team-table-head" style={{ gridTemplateColumns, gap: 16 }}>
        {columns.map((c) => (
          <span key={c.key} style={{ textAlign: c.align || 'left' }}>{c.label}</span>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="px-6 py-10 text-center text-sm text-muted">Nenhum registro ainda.</div>
      )}

      {rows.map((row) => (
        <div key={row.key} className="team-table-row" style={{ gridTemplateColumns, gap: 16 }}>
          {columns.map((c) => (
            <span key={c.key} style={{ textAlign: c.align || 'left' }}>
              {renderCell ? renderCell(row, c.key) : row[c.key]}
            </span>
          ))}
        </div>
      ))}

      {totalRow && (
        <div className="team-table-total" style={{ gridTemplateColumns, gap: 16 }}>
          {columns.map((c) => (
            <span key={c.key} style={{ textAlign: c.align || 'left' }}>{totalRow[c.key]}</span>
          ))}
        </div>
      )}
    </div>
  )
}

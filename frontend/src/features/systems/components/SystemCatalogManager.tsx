import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../../components/Button';
import {
  SystemCatalogColumnDefinition,
  SystemCatalogColumnType,
  SystemCatalogDefinition,
  SystemCatalogEntryDefinition
} from '../../../types/system';

type Props = {
  catalogs: SystemCatalogDefinition[];
  onChange: (catalogs: SystemCatalogDefinition[]) => void;
  disabled?: boolean;
};

const COLUMN_TYPE_OPTIONS: Array<{ value: SystemCatalogColumnType; label: string }> = [
  { value: 'text', label: 'Texte' },
  { value: 'textarea', label: 'Texte long' },
  { value: 'number', label: 'Nombre' },
  { value: 'checkbox', label: 'Case à cocher' },
  { value: 'select', label: 'Liste' }
];
const RESERVED_COLUMN_KEYS = new Set(['id']);

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeIdentifier(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function ensureUniqueIdentifier(baseInput: string, existing: Set<string>, fallback = 'champ'): string {
  const normalized = normalizeIdentifier(baseInput) || fallback;
  if (!existing.has(normalized) && !RESERVED_COLUMN_KEYS.has(normalized)) {
    return normalized;
  }
  let index = 2;
  let candidate = `${normalized}_${index}`;
  while (existing.has(candidate) || RESERVED_COLUMN_KEYS.has(candidate)) {
    index += 1;
    candidate = `${normalized}_${index}`;
  }
  return candidate;
}

function defaultValueForType(type: SystemCatalogColumnType): string | number | boolean {
  if (type === 'number') {
    return 0;
  }
  if (type === 'checkbox') {
    return false;
  }
  return '';
}

function createEmptyCatalog(existing: SystemCatalogDefinition[]): SystemCatalogDefinition {
  const existingKeys = new Set(existing.map((catalog) => catalog.key));
  const label = `Nouveau catalogue ${existing.length + 1}`;
  return {
    id: makeId('catalog'),
    label,
    key: ensureUniqueIdentifier(label, existingKeys, 'catalogue'),
    columns: [],
    entries: []
  };
}

function createColumn(catalog: SystemCatalogDefinition): SystemCatalogColumnDefinition {
  const existingKeys = new Set(catalog.columns.map((column) => column.key));
  const label = `Colonne ${catalog.columns.length + 1}`;
  return {
    id: makeId('column'),
    label,
    key: ensureUniqueIdentifier(label, existingKeys),
    type: 'text'
  };
}

function createEmptyEntry(catalog: SystemCatalogDefinition): SystemCatalogEntryDefinition {
  return {
    id: makeId('entry'),
    values: Object.fromEntries(catalog.columns.map((column) => [column.key, defaultValueForType(column.type)]))
  };
}

function formatCellValue(value: string | number | boolean | undefined): string {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

function parseCellValue(raw: string, column: SystemCatalogColumnDefinition): string | number | boolean {
  if (column.type === 'number') {
    const normalized = raw.trim();
    return normalized === '' ? 0 : Number(normalized) || 0;
  }
  if (column.type === 'checkbox') {
    return ['true', '1', 'oui', 'yes', 'x'].includes(raw.trim().toLowerCase());
  }
  return raw;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value !== '')) {
        rows.push(row);
      }
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value !== '')) {
      rows.push(row);
    }
  }

  return rows.map((currentRow) => currentRow.map((value) => value.trim()));
}

function resolveCsvColumnIndex(
  headerIndex: Map<string, number>,
  column: SystemCatalogColumnDefinition
): number | undefined {
  const normalizedKey = normalizeIdentifier(column.key);
  const normalizedLabel = normalizeIdentifier(column.label);
  if (headerIndex.has(normalizedKey)) {
    return headerIndex.get(normalizedKey);
  }
  if (headerIndex.has(normalizedLabel)) {
    return headerIndex.get(normalizedLabel);
  }
  return undefined;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportCatalogAsCsv(catalog: SystemCatalogDefinition): string {
  const headers = ['id', ...catalog.columns.map((column) => column.key)];
  const rows = catalog.entries.map((entry) => [
    entry.id,
    ...catalog.columns.map((column) => formatCellValue(entry.values[column.key] as string | number | boolean | undefined))
  ]);
  return [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\n');
}

export default function SystemCatalogManager({ catalogs, onChange, disabled = false }: Props) {
  const [selectedCatalogId, setSelectedCatalogId] = useState(catalogs[0]?.id ?? '');
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!catalogs.length) {
      setSelectedCatalogId('');
      return;
    }
    if (!catalogs.some((catalog) => catalog.id === selectedCatalogId)) {
      setSelectedCatalogId(catalogs[0].id);
    }
  }, [catalogs, selectedCatalogId]);

  const selectedCatalog = useMemo(
    () => catalogs.find((catalog) => catalog.id === selectedCatalogId) ?? catalogs[0] ?? null,
    [catalogs, selectedCatalogId]
  );
  const visibleColumns = useMemo(
    () => selectedCatalog?.columns.filter((column) => !RESERVED_COLUMN_KEYS.has(column.key)) ?? [],
    [selectedCatalog]
  );

  const updateCatalog = (catalogId: string, updater: (catalog: SystemCatalogDefinition) => SystemCatalogDefinition) => {
    onChange(catalogs.map((catalog) => (catalog.id === catalogId ? updater(catalog) : catalog)));
  };

  const handleAddCatalog = () => {
    const nextCatalog = createEmptyCatalog(catalogs);
    onChange([...catalogs, nextCatalog]);
    setSelectedCatalogId(nextCatalog.id);
  };

  const handleDeleteCatalog = () => {
    if (!selectedCatalog) {
      return;
    }
    const nextCatalogs = catalogs.filter((catalog) => catalog.id !== selectedCatalog.id);
    onChange(nextCatalogs);
    setSelectedCatalogId(nextCatalogs[0]?.id ?? '');
  };

  const handleAddColumn = () => {
    if (!selectedCatalog) {
      return;
    }
    const nextColumn = createColumn(selectedCatalog);
    updateCatalog(selectedCatalog.id, (catalog) => ({
      ...catalog,
      columns: [...catalog.columns, nextColumn],
      entries: catalog.entries.map((entry) => ({
        ...entry,
        values: {
          ...entry.values,
          [nextColumn.key]: defaultValueForType(nextColumn.type)
        }
      }))
    }));
  };

  const handleUpdateColumn = (columnId: string, updater: (column: SystemCatalogColumnDefinition) => SystemCatalogColumnDefinition) => {
    if (!selectedCatalog) {
      return;
    }
    updateCatalog(selectedCatalog.id, (catalog) => {
      const currentColumn = catalog.columns.find((column) => column.id === columnId);
      if (!currentColumn) {
        return catalog;
      }
      const nextColumn = updater(currentColumn);
      const existingKeys = new Set(catalog.columns.filter((column) => column.id !== columnId).map((column) => column.key));
      const normalizedKey = ensureUniqueIdentifier(nextColumn.key || nextColumn.label, existingKeys, currentColumn.key || 'champ');
      const finalColumn: SystemCatalogColumnDefinition = {
        ...nextColumn,
        key: normalizedKey
      };
      return {
        ...catalog,
        columns: catalog.columns.map((column) => (column.id === columnId ? finalColumn : column)),
        entries: catalog.entries.map((entry) => {
          const nextValues = { ...entry.values };
          if (currentColumn.key !== finalColumn.key) {
            nextValues[finalColumn.key] = nextValues[currentColumn.key] ?? defaultValueForType(finalColumn.type);
            delete nextValues[currentColumn.key];
          } else if (!(finalColumn.key in nextValues)) {
            nextValues[finalColumn.key] = defaultValueForType(finalColumn.type);
          }
          return { ...entry, values: nextValues };
        })
      };
    });
  };

  const handleMoveColumn = (columnId: string, direction: -1 | 1) => {
    if (!selectedCatalog) {
      return;
    }
    updateCatalog(selectedCatalog.id, (catalog) => {
      const index = catalog.columns.findIndex((column) => column.id === columnId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= catalog.columns.length) {
        return catalog;
      }
      const nextColumns = [...catalog.columns];
      const [moved] = nextColumns.splice(index, 1);
      nextColumns.splice(nextIndex, 0, moved);
      return { ...catalog, columns: nextColumns };
    });
  };

  const handleDeleteColumn = (columnId: string) => {
    if (!selectedCatalog) {
      return;
    }
    updateCatalog(selectedCatalog.id, (catalog) => {
      const column = catalog.columns.find((item) => item.id === columnId);
      if (!column) {
        return catalog;
      }
      return {
        ...catalog,
        columns: catalog.columns.filter((item) => item.id !== columnId),
        entries: catalog.entries.map((entry) => {
          const nextValues = { ...entry.values };
          delete nextValues[column.key];
          return { ...entry, values: nextValues };
        })
      };
    });
  };

  const handleAddEntry = () => {
    if (!selectedCatalog) {
      return;
    }
    updateCatalog(selectedCatalog.id, (catalog) => ({
      ...catalog,
      entries: [...catalog.entries, createEmptyEntry(catalog)]
    }));
  };

  const handleDuplicateEntry = (entryId: string) => {
    if (!selectedCatalog) {
      return;
    }
    updateCatalog(selectedCatalog.id, (catalog) => {
      const entry = catalog.entries.find((item) => item.id === entryId);
      if (!entry) {
        return catalog;
      }
      return {
        ...catalog,
        entries: [...catalog.entries, { ...entry, id: makeId('entry'), values: { ...entry.values } }]
      };
    });
  };

  const handleDeleteEntry = (entryId: string) => {
    if (!selectedCatalog) {
      return;
    }
    updateCatalog(selectedCatalog.id, (catalog) => ({
      ...catalog,
      entries: catalog.entries.filter((entry) => entry.id !== entryId)
    }));
  };

  const handleUpdateEntryValue = (entryId: string, column: SystemCatalogColumnDefinition, rawValue: string | boolean) => {
    if (!selectedCatalog) {
      return;
    }
    updateCatalog(selectedCatalog.id, (catalog) => ({
      ...catalog,
      entries: catalog.entries.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              values: {
                ...entry.values,
                [column.key]: typeof rawValue === 'boolean' ? rawValue : parseCellValue(rawValue, column)
              }
            }
          : entry
      )
    }));
  };

  const handleImportCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectedCatalog) {
      return;
    }
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const text = await file.text();
    const rows = parseCsv(text);
    const [headerRow, ...dataRows] = rows;
    if (!headerRow || headerRow.length === 0) {
      return;
    }
    const keyIndex = new Map(headerRow.map((header, index) => [normalizeIdentifier(header || ''), index]));
    updateCatalog(selectedCatalog.id, (catalog) => ({
      ...catalog,
      entries: dataRows
        .filter((row) => row.some((value) => value.trim() !== ''))
        .map((row) => {
          const providedId = row[keyIndex.get('id') ?? -1]?.trim();
          const values = catalog.columns.reduce<Record<string, string | number | boolean>>((accumulator, column) => {
            const rowIndex = resolveCsvColumnIndex(keyIndex, column);
            const rawValue = rowIndex === undefined ? '' : row[rowIndex] ?? '';
            accumulator[column.key] = parseCellValue(rawValue, column);
            return accumulator;
          }, {});
          return {
            id: providedId || makeId('entry'),
            values
          };
        })
    }));
  };

  const handleExportCsv = () => {
    if (!selectedCatalog) {
      return;
    }
    const blob = new Blob([exportCatalogAsCsv(selectedCatalog)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedCatalog.key || 'catalogue'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="system-catalog-manager">
      <aside className="system-catalog-manager__sidebar">
        <div className="system-catalog-manager__sidebar-header">
          <div>
            <strong>Catalogues</strong>
            <small>{catalogs.length} catalogue{catalogs.length > 1 ? 's' : ''}</small>
          </div>
          <Button type="button" onClick={handleAddCatalog} disabled={disabled}>
            Nouveau catalogue
          </Button>
        </div>
        <div className="system-catalog-manager__catalog-list">
          {catalogs.length === 0 ? (
            <div className="card" style={{ margin: 0 }}>
              Aucun catalogue pour le moment.
            </div>
          ) : (
            catalogs.map((catalog) => (
              <button
                key={catalog.id}
                type="button"
                className={`system-catalog-manager__catalog-item ${selectedCatalog?.id === catalog.id ? 'is-active' : ''}`.trim()}
                onClick={() => setSelectedCatalogId(catalog.id)}
              >
                <strong>{catalog.label}</strong>
                <small>{catalog.key}</small>
                <small>
                  {catalog.columns.length} colonne{catalog.columns.length > 1 ? 's' : ''} • {catalog.entries.length} entrée{catalog.entries.length > 1 ? 's' : ''}
                </small>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="system-catalog-manager__content">
        {selectedCatalog ? (
          <>
            <div className="card system-catalog-panel" style={{ margin: 0 }}>
              <div className="system-catalog-panel__header">
                <div>
                  <strong>Métadonnées du catalogue</strong>
                  <small>Nom, clé technique et import/export CSV.</small>
                </div>
                <div className="system-catalog-panel__header-actions">
                  <Button type="button" variant="secondary" onClick={() => importInputRef.current?.click()} disabled={disabled}>
                    Importer CSV
                  </Button>
                  <Button type="button" variant="secondary" onClick={handleExportCsv} disabled={disabled}>
                    Exporter CSV
                  </Button>
                  <Button type="button" variant="secondary" onClick={handleDeleteCatalog} disabled={disabled}>
                    Supprimer
                  </Button>
                  <input ref={importInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(event) => void handleImportCsv(event)} />
                </div>
              </div>
              <div className="grid">
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span>Nom</span>
                  <input
                    value={selectedCatalog.label}
                    onChange={(event) =>
                      updateCatalog(selectedCatalog.id, (catalog) => ({
                        ...catalog,
                        label: event.target.value
                      }))
                    }
                    disabled={disabled}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span>Clé technique</span>
                  <input
                    value={selectedCatalog.key}
                    onChange={(event) =>
                      updateCatalog(selectedCatalog.id, (catalog) => {
                        const existingKeys = new Set(catalogs.filter((item) => item.id !== catalog.id).map((item) => item.key));
                        return {
                          ...catalog,
                          key: ensureUniqueIdentifier(event.target.value, existingKeys, 'catalogue')
                        };
                      })
                    }
                    disabled={disabled}
                  />
                </label>
              </div>
            </div>

            <div className="card system-catalog-panel" style={{ margin: 0 }}>
              <div className="system-catalog-panel__header">
                <div>
                  <strong>Colonnes</strong>
                  <small>Définis la structure du catalogue.</small>
                </div>
                <Button type="button" variant="secondary" onClick={handleAddColumn} disabled={disabled}>
                  Nouvelle colonne
                </Button>
              </div>
              <div className="system-catalog-manager__column-list">
              {selectedCatalog.columns.length === 0 ? (
                <div className="card" style={{ margin: 0 }}>
                  Aucune colonne pour le moment.
                </div>
              ) : (
                  selectedCatalog.columns.map((column, index) => (
                    <article key={column.id} className="system-catalog-manager__column-card">
                      <div className="grid">
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Libellé</span>
                          <input
                            value={column.label}
                            onChange={(event) =>
                              handleUpdateColumn(column.id, (current) => ({
                                ...current,
                                label: event.target.value,
                                key: current.key || normalizeIdentifier(event.target.value)
                              }))
                            }
                            disabled={disabled}
                          />
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Clé</span>
                          <input
                            value={column.key}
                            onChange={(event) => handleUpdateColumn(column.id, (current) => ({ ...current, key: event.target.value }))}
                            disabled={disabled}
                          />
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Type</span>
                          <select
                            value={column.type}
                            onChange={(event) =>
                              handleUpdateColumn(column.id, (current) => ({
                                ...current,
                                type: event.target.value as SystemCatalogColumnType,
                                options: event.target.value === 'select' ? current.options ?? [''] : undefined
                              }))
                            }
                            disabled={disabled}
                          >
                            {COLUMN_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {column.type === 'select' ? (
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Options (une par ligne)</span>
                          <textarea
                            rows={4}
                            value={(column.options ?? []).join('\n')}
                            onChange={(event) =>
                              handleUpdateColumn(column.id, (current) => ({
                                ...current,
                                options: event.target.value
                                  .split('\n')
                                  .map((value) => value.trim())
                                  .filter(Boolean)
                              }))
                            }
                            disabled={disabled}
                          />
                        </label>
                      ) : null}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <Button type="button" variant="secondary" onClick={() => handleMoveColumn(column.id, -1)} disabled={disabled || index === 0}>
                          Monter
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => handleMoveColumn(column.id, 1)}
                          disabled={disabled || index === selectedCatalog.columns.length - 1}
                        >
                          Descendre
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => handleDeleteColumn(column.id)} disabled={disabled}>
                          Supprimer
                        </Button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>

            <div className="card system-catalog-panel" style={{ margin: 0 }}>
              <div className="system-catalog-panel__header">
                <div>
                  <strong>Entrées</strong>
                  <small>Remplis le catalogue en grille, ou importe un CSV.</small>
                </div>
                <Button type="button" variant="secondary" onClick={handleAddEntry} disabled={disabled || selectedCatalog.columns.length === 0}>
                  Nouvelle ligne
                </Button>
              </div>
              {visibleColumns.length === 0 ? (
                <div className="card" style={{ margin: 0 }}>
                  Ajoute d’abord au moins une colonne avant de saisir des entrées.
                </div>
              ) : (
                <div className="system-catalog-manager__table-wrap">
                  <table className="system-catalog-manager__table">
                    <thead>
                      <tr>
                        {visibleColumns.map((column) => (
                          <th key={column.id}>{column.label}</th>
                        ))}
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCatalog.entries.length === 0 ? (
                        <tr>
                          <td colSpan={visibleColumns.length + 1}>Aucune entrée pour le moment.</td>
                        </tr>
                      ) : (
                        selectedCatalog.entries.map((entry) => (
                          <tr key={entry.id}>
                            {visibleColumns.map((column) => (
                              <td key={`${entry.id}-${column.id}`}>
                                {column.type === 'textarea' ? (
                                  <textarea
                                    rows={3}
                                    value={formatCellValue(entry.values[column.key] as string | number | boolean | undefined)}
                                    onChange={(event) => handleUpdateEntryValue(entry.id, column, event.target.value)}
                                    disabled={disabled}
                                  />
                                ) : column.type === 'checkbox' ? (
                                  <input
                                    type="checkbox"
                                    checked={Boolean(entry.values[column.key])}
                                    onChange={(event) => handleUpdateEntryValue(entry.id, column, event.target.checked)}
                                    disabled={disabled}
                                  />
                                ) : column.type === 'select' ? (
                                  <select
                                    value={formatCellValue(entry.values[column.key] as string | number | boolean | undefined)}
                                    onChange={(event) => handleUpdateEntryValue(entry.id, column, event.target.value)}
                                    disabled={disabled}
                                  >
                                    <option value="">Choisir…</option>
                                    {(column.options ?? []).map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type={column.type === 'number' ? 'number' : 'text'}
                                    value={formatCellValue(entry.values[column.key] as string | number | boolean | undefined)}
                                    onChange={(event) => handleUpdateEntryValue(entry.id, column, event.target.value)}
                                    disabled={disabled}
                                  />
                                )}
                              </td>
                            ))}
                            <td>
                              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                <Button type="button" variant="secondary" onClick={() => handleDuplicateEntry(entry.id)} disabled={disabled}>
                                  Dupliquer
                                </Button>
                                <Button type="button" variant="secondary" onClick={() => handleDeleteEntry(entry.id)} disabled={disabled}>
                                  Supprimer
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="card" style={{ margin: 0 }}>
            Crée ton premier catalogue pour commencer.
          </div>
        )}
      </section>
    </section>
  );
}

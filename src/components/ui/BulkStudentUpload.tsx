import { useRef, useState, useEffect, useCallback } from 'react';
import { Upload, Download, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { createStudent } from '@/services/api';
import type { Class, Section } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BulkStudentUploadProps {
  open: boolean;
  onClose: () => void;
  schoolId: string;
  classes: (Class & { sections: Section[] })[];
  onSuccess: () => void;
}

interface ParsedRow {
  admission_number: string;
  full_name: string;
  father_name: string;
  mother_name: string;
  parent_email: string;
  date_of_birth: string;
  gender: string;
  class_id: string;
  section_id: string;
  address: string;
  admission_date: string;
  // display only
  class_name: string;
  section_name: string;
  errors: string[];
}

interface ImportResult {
  success: number;
  failed: number;
  failedDetails: Array<{ rowIndex: number; admission_number: string; error: string }>;
  skipped: Array<{ rowIndex: number; admission_number: string; errors: string[] }>;
}

type Phase = 'upload' | 'preview' | 'importing' | 'done';

// ---------------------------------------------------------------------------
// Pure CSV parser (no external libraries)
// ---------------------------------------------------------------------------

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead for escaped quote ("")
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
        i++;
      } else if (ch === '\r') {
        // handle \r\n or lone \r
        row.push(field.trim());
        field = '';
        rows.push(row);
        row = [];
        if (i + 1 < text.length && text[i + 1] === '\n') i++;
        i++;
      } else if (ch === '\n') {
        row.push(field.trim());
        field = '';
        rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Push the last field / row
  row.push(field.trim());
  if (row.some((f) => f !== '')) rows.push(row);

  return rows;
}

// ---------------------------------------------------------------------------
// Sample CSV content
// ---------------------------------------------------------------------------

const SAMPLE_CSV = [
  'admission_number,full_name,father_name,mother_name,parent_email,date_of_birth,gender,class_name,section_name,address,admission_date',
  '2024001,Rahul Sharma,Raj Sharma,Meena Sharma,sharma.family@example.com,2010-05-15,male,Class 6,A,123 Main Street,2024-04-01',
  '2024002,Priya Singh,Anil Singh,Renu Singh,singh.family@example.com,2011-03-20,female,Class 7,B,456 Park Avenue,2024-04-01',
].join('\n');

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sample_students.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkStudentUpload({ open, onClose, schoolId, classes, onSuccess }: BulkStudentUploadProps) {
  const [phase, setPhase] = useState<Phase>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep a ref to the latest onSuccess so the effect below never goes stale
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => { onSuccessRef.current = onSuccess; });

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setPhase('upload');
      setParsedRows([]);
      setImporting(false);
      setImportResult(null);
      setDragOver(false);
    }
  }, [open]);

  // Call onSuccess when we move to 'done' and there were successes
  useEffect(() => {
    if (phase === 'done' && importResult && importResult.success > 0) {
      onSuccessRef.current();
    }
  }, [phase, importResult]);

  function reset() {
    setPhase('upload');
    setParsedRows([]);
    setImportResult(null);
  }

  function handleClose() {
    onClose();
    reset();
  }

  // ----- File handling -----

  const processFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.csv')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target?.result as string) ?? '';
        const rows = parseCSV(text);
        if (rows.length < 2) return; // no data rows

        const headerRow = rows[0].map((h) => h.toLowerCase().trim());
        const col = (name: string) => headerRow.indexOf(name);

        const iAdm = col('admission_number');
        const iName = col('full_name');
        const iFather = col('father_name');
        const iMother = col('mother_name');
        const iParentEmail = col('parent_email');
        const iDob = col('date_of_birth');
        const iGender = col('gender');
        const iClass = col('class_name');
        const iSection = col('section_name');
        const iAddress = col('address');
        const iAdmDate = col('admission_date');

        const parsed: ParsedRow[] = [];

        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          // Skip completely empty rows
          if (r.every((f) => f === '')) continue;

          const get = (idx: number) => (idx >= 0 ? (r[idx] ?? '').trim() : '');

          const admission_number = get(iAdm);
          const full_name = get(iName);
          const father_name = get(iFather);
          const mother_name = get(iMother);
          const parent_email = get(iParentEmail);
          const date_of_birth = get(iDob);
          const gender = get(iGender) || 'male';
          const class_name = get(iClass);
          const section_name = get(iSection);
          const address = get(iAddress);
          const admission_date = get(iAdmDate);

          const errors: string[] = [];

          if (!admission_number) errors.push('Admission number required');
          if (!full_name) errors.push('Full name required');

          let class_id = '';
          let section_id = '';

          if (!class_name) {
            errors.push('Class name required');
          } else {
            const matchedClass = classes.find(
              (c) => c.name.toLowerCase() === class_name.toLowerCase()
            );
            if (!matchedClass) {
              errors.push(`Class "${class_name}" not found`);
            } else {
              class_id = matchedClass.id;
              if (!section_name) {
                errors.push('Section name required');
              } else {
                const matchedSection = matchedClass.sections.find(
                  (s) => s.name.toLowerCase() === section_name.toLowerCase()
                );
                if (!matchedSection) {
                  errors.push(`Section "${section_name}" not found in ${class_name}`);
                } else {
                  section_id = matchedSection.id;
                }
              }
            }
          }

          parsed.push({
            admission_number,
            full_name,
            father_name,
            mother_name,
            parent_email,
            date_of_birth,
            gender,
            class_id,
            section_id,
            address,
            admission_date,
            class_name,
            section_name,
            errors,
          });
        }

        setParsedRows(parsed);
        setPhase('preview');
      };
      reader.readAsText(file);
    },
    [classes]
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // reset so the same file can be re-selected
    e.target.value = '';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  // ----- Import -----

  async function handleImport() {
    if (!schoolId) return;
    setPhase('importing');
    const valid = parsedRows.filter((r) => r.errors.length === 0);
    let success = 0;
    let failed = 0;
    const failedDetails: Array<{ rowIndex: number; admission_number: string; error: string }> = [];

    // Collect skipped (invalid) rows before the loop
    const skipped = parsedRows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => row.errors.length > 0)
      .map(({ row, idx }) => ({
        rowIndex: idx + 1,
        admission_number: row.admission_number,
        errors: row.errors,
      }));

    for (let i = 0; i < valid.length; i++) {
      const row = valid[i];
      // find original 1-based row index in parsedRows
      const rowIndex = parsedRows.indexOf(row) + 1;
      try {
        await createStudent({
          school_id: schoolId,
          admission_number: row.admission_number,
          full_name: row.full_name,
          father_name: row.father_name || null,
          mother_name: row.mother_name || null,
          parent_email: row.parent_email || null,
          date_of_birth: row.date_of_birth || null,
          gender: row.gender || null,
          class_id: row.class_id,
          section_id: row.section_id,
          address: row.address || null,
          admission_date: row.admission_date || null,
          status: 'active',
        });
        success++;
      } catch (err) {
        failed++;
        failedDetails.push({
          rowIndex,
          admission_number: row.admission_number,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    setImportResult({ success, failed, failedDetails, skipped });
    setPhase('done');
  }

  // ----- Derived -----

  const validCount = parsedRows.filter((r) => r.errors.length === 0).length;
  const invalidCount = parsedRows.length - validCount;

  // ----- Render helpers -----

  function renderUploadPhase() {
    return (
      <>
        {/* Drop zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
          }`}
        >
          <Upload className="h-10 w-10 text-gray-400 mb-3" />
          <p className="font-medium text-gray-600 text-sm">Drag &amp; drop a CSV file here, or click to browse</p>
          <p className="mt-1 text-xs text-gray-400">Only .csv files are accepted</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Sample download */}
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" size="sm" icon={<Download className="h-4 w-4" />} onClick={downloadSampleCsv}>
            Download Sample CSV
          </Button>
        </div>

        {/* Column reference */}
        <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Expected CSV columns</p>
          <p className="text-xs text-gray-400 font-mono break-all">
            admission_number, full_name, father_name, mother_name, parent_email, date_of_birth, gender, class_name, section_name, address, admission_date
          </p>
          <p className="mt-1 text-xs text-gray-400">Required: admission_number, full_name, class_name, section_name</p>
        </div>
      </>
    );
  }

  function renderPreviewPhase() {
    return (
      <>
        {/* Summary */}
        <div className="mb-3 flex items-center gap-3 text-sm">
          <span>
            <span className="font-semibold text-green-600">{validCount} valid</span>
          </span>
          {invalidCount > 0 && (
            <span>
              <span className="font-semibold text-red-500">{invalidCount} invalid</span>
            </span>
          )}
          <span className="text-gray-400">rows found</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-3 py-2 font-semibold text-gray-600">#</th>
                <th className="px-3 py-2 font-semibold text-gray-600">Admission No.</th>
                <th className="px-3 py-2 font-semibold text-gray-600">Full Name</th>
                <th className="px-3 py-2 font-semibold text-gray-600">Father's Name</th>
                <th className="px-3 py-2 font-semibold text-gray-600">Mother's Name</th>
                <th className="px-3 py-2 font-semibold text-gray-600">Class</th>
                <th className="px-3 py-2 font-semibold text-gray-600">Section</th>
                <th className="px-3 py-2 font-semibold text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {parsedRows.map((row, idx) => (
                <tr key={idx} className={row.errors.length > 0 ? 'bg-red-50' : ''}>
                  <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                  <td className="px-3 py-2 text-gray-700">{row.admission_number || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{row.full_name || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{row.father_name || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{row.mother_name || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{row.class_name || '—'}</td>
                  <td className="px-3 py-2 text-gray-700">{row.section_name || '—'}</td>
                  <td className="px-3 py-2">
                    {row.errors.length === 0 ? (
                      <span className="text-green-600 font-medium">Valid</span>
                    ) : (
                      <span className="text-red-500">{row.errors.join('; ')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  function renderImportingPhase() {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
        <p className="text-sm text-gray-600">Importing students, please wait…</p>
      </div>
    );
  }

  function renderDonePhase() {
    if (!importResult) return null;
    return (
      <div className="flex flex-col py-8 gap-4">
        <div className="flex flex-col items-center gap-2">
          {importResult.success > 0 && (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-6 w-6" />
              <span className="font-semibold">{importResult.success} student{importResult.success !== 1 ? 's' : ''} added successfully</span>
            </div>
          )}
          {importResult.failed > 0 && (
            <div className="flex items-center gap-2 text-red-500">
              <XCircle className="h-6 w-6" />
              <span className="font-semibold">{importResult.failed} student{importResult.failed !== 1 ? 's' : ''} failed to import</span>
            </div>
          )}
          {importResult.success === 0 && importResult.failed === 0 && importResult.skipped.length === 0 && (
            <p className="text-sm text-gray-500">No students were imported.</p>
          )}
        </div>

        {/* Skipped rows (validation errors) */}
        {importResult.skipped.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-amber-700">
              Skipped Rows (validation errors) — {importResult.skipped.length} row{importResult.skipped.length !== 1 ? 's' : ''}
            </p>
            <ul className="space-y-0.5">
              {importResult.skipped.map((item) => (
                <li key={item.rowIndex} className="text-xs text-amber-800">
                  Row {item.rowIndex} ({item.admission_number || 'no admission no.'}): {item.errors.join('; ')}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Import errors */}
        {importResult.failedDetails.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-red-700">
              Import Errors — {importResult.failedDetails.length} row{importResult.failedDetails.length !== 1 ? 's' : ''}
            </p>
            <ul className="space-y-0.5">
              {importResult.failedDetails.map((item) => (
                <li key={item.rowIndex} className="text-xs text-red-800">
                  Row {item.rowIndex} ({item.admission_number}): {item.error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // ----- Footer per phase -----

  function renderFooter() {
    if (phase === 'upload') {
      return <Button variant="outline" onClick={handleClose}>Cancel</Button>;
    }

    if (phase === 'preview') {
      return (
        <>
          <Button variant="outline" onClick={reset}>Back</Button>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleImport}
            loading={importing}
            disabled={validCount === 0}
          >
            Import {validCount} student{validCount !== 1 ? 's' : ''}
          </Button>
        </>
      );
    }

    if (phase === 'importing') {
      return null;
    }

    // done
    return <Button onClick={handleClose}>Done</Button>;
  }

  // ----- Title per phase -----

  const titles: Record<Phase, string> = {
    upload: 'Bulk Student Entry',
    preview: 'Preview CSV Data',
    importing: 'Importing Students…',
    done: 'Import Complete',
  };

  return (
    <Modal
      open={open}
      onClose={phase === 'importing' ? () => {} : handleClose}
      title={titles[phase]}
      description={
        phase === 'upload'
          ? 'Upload a CSV file to add multiple students at once'
          : phase === 'preview'
          ? 'Review the data before importing'
          : undefined
      }
      size="xl"
      footer={renderFooter() ?? undefined}
    >
      {phase === 'upload' && renderUploadPhase()}
      {phase === 'preview' && renderPreviewPhase()}
      {phase === 'importing' && renderImportingPhase()}
      {phase === 'done' && renderDonePhase()}
    </Modal>
  );
}

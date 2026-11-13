import { useNavigate } from 'react-router-dom';
import { Plus, X, Check } from 'lucide-react';
import { Select } from '@/components/ui/Form';
import { cn } from '@/lib/utils';
import type { Class, Section, Subject } from '@/types';
import { newAllotmentRow, type AllotmentRow, type ExistingAllotment } from './allotmentRows';

interface Props {
  rows: AllotmentRow[];
  onChange: (rows: AllotmentRow[]) => void;
  classes: (Class & { sections: Section[] })[];
  subjects: Subject[];
  /** All subject allotments in the school, to flag subjects held by another teacher. */
  existing: ExistingAllotment[];
  /** Teacher being edited (their own allotments are not flagged). */
  teacherId?: string;
}

export function SubjectAllotmentEditor({ rows, onChange, classes, subjects, existing, teacherId }: Props) {
  const navigate = useNavigate();

  const update = (key: string, patch: Partial<AllotmentRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => onChange(rows.filter((r) => r.key !== key));
  const add = () => onChange([...rows, newAllotmentRow()]);

  const heldBy = (sectionId: string, subjectId: string) => {
    const a = existing.find((x) => x.section_id === sectionId && x.subject_id === subjectId);
    return a && a.teacher_id !== teacherId ? a.teacher?.full_name ?? 'another teacher' : null;
  };

  if (classes.length === 0) {
    return (
      <p className="rounded-[20px] border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
        No classes yet. Create classes and add their subjects first, then allot them here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const cls = classes.find((c) => c.id === row.class_id);
        const sectionSubjects = row.section_id
          ? subjects.filter((s) => s.section_ids.includes(row.section_id))
          : [];
        // A section already chosen in another row can't be picked again.
        const takenSections = new Set(rows.filter((r) => r.key !== row.key).map((r) => r.section_id));

        return (
          <div key={row.key} className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
            <div className="flex items-start gap-2">
              <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                <Select
                  value={row.class_id}
                  onChange={(e) => update(row.key, { class_id: e.target.value, section_id: '', subject_ids: [] })}
                >
                  <option value="">Select class</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <Select
                  value={row.section_id}
                  disabled={!cls}
                  onChange={(e) => update(row.key, { section_id: e.target.value, subject_ids: [] })}
                >
                  <option value="">{cls ? 'Select section' : 'Select class first'}</option>
                  {cls?.sections.map((s) => (
                    <option key={s.id} value={s.id} disabled={takenSections.has(s.id)}>
                      Section {s.name}{takenSections.has(s.id) ? ' (already added)' : ''}
                    </option>
                  ))}
                </Select>
              </div>
              <button
                type="button"
                onClick={() => remove(row.key)}
                className="mt-1.5 rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                title="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {row.section_id && (
              <div className="mt-3">
                {sectionSubjects.length === 0 ? (
                  <p className="text-xs text-amber-600">
                    No subjects added for this section yet.{' '}
                    <button type="button" onClick={() => navigate('/admin/subjects')} className="font-semibold underline">
                      Add subjects
                    </button>
                  </p>
                ) : (
                  <>
                    <p className="mb-1.5 text-xs font-medium text-slate-500">Which subjects will this teacher teach here?</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sectionSubjects.map((s) => {
                        const on = row.subject_ids.includes(s.id);
                        const other = heldBy(row.section_id, s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => update(row.key, {
                              subject_ids: on ? row.subject_ids.filter((x) => x !== s.id) : [...row.subject_ids, s.id],
                            })}
                            title={other ? `Currently taught by ${other}. Selecting moves it to this teacher.` : undefined}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                              on
                                ? 'border-[#5B6EE8] bg-[#EEF0FD] text-[#5B6EE8]'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                            )}
                          >
                            {on && <Check className="h-3 w-3" />}
                            {s.name}
                            {other && <span className={on ? 'text-amber-600' : 'text-slate-400'}>· {other}</span>}
                          </button>
                        );
                      })}
                    </div>
                    {row.subject_ids.some((id) => heldBy(row.section_id, id)) && (
                      <p className="mt-1.5 text-xs text-amber-600">
                        Subjects marked with another teacher's name will be moved to this teacher.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        className="flex w-full items-center justify-center gap-2 rounded-[20px] border border-dashed border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500 transition-colors hover:border-[#5B6EE8] hover:text-[#5B6EE8]"
      >
        <Plus className="h-4 w-4" /> {rows.length ? 'Add another class' : 'Allot a class & subjects'}
      </button>
    </div>
  );
}

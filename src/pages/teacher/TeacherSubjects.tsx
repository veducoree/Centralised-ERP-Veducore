import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Trash2, BookOpen, X } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader, LoadingSpinner } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchSubjects,
  createSubject,
  deleteSubject,
  fetchTeacherByUserId,
  fetchTeacherAssignments,
} from '@/services/api';
import type { Subject, ClassAssignment } from '@/types';
import { Badge } from '@/components/ui/Badge';

import { generateSubjectCode } from '@/lib/subjectUtils';

// ── Component ─────────────────────────────────────────────────────────────────
export default function TeacherSubjects() {
  const { profile } = useAuth();
  const toast = useToast();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [isClassIncharge, setIsClassIncharge] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form: single subject at a time with live code preview
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    if (!profile?.school_id || !profile?.id) return;
    setLoading(true);
    try {
      // Check if this teacher is a class incharge
      const teacher = await fetchTeacherByUserId(profile.id);
      if (teacher) {
        const assignments: ClassAssignment[] = await fetchTeacherAssignments(teacher.id);
        const incharge = assignments.some((a) => a.is_class_teacher || !a.subject_id);
        setIsClassIncharge(incharge);
        if (incharge) {
          const s = await fetchSubjects(profile.school_id);
          setSubjects(s);
        }
      }
    } catch {
      toast('Failed to load subjects', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.school_id, profile?.id, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  function openModal() {
    setSubjectName('');
    setSubjectCode('');
    setCodeManuallyEdited(false);
    setModalOpen(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }

  function handleNameChange(val: string) {
    setSubjectName(val);
    if (!codeManuallyEdited) {
      // Re-generate code live as user types, excluding existing codes
      const existingCodes = subjects.map((s) => s.code || '');
      setSubjectCode(generateSubjectCode(val, existingCodes));
    }
  }

  function handleCodeChange(val: string) {
    setSubjectCode(val.toUpperCase());
    setCodeManuallyEdited(true);
  }

  async function handleCreate() {
    if (!profile?.school_id || !subjectName.trim()) {
      toast('Enter a subject name', 'error');
      return;
    }

    // Final code: use generated or manual, ensure uniqueness
    const existingCodes = subjects.map((s) => s.code || '');
    let finalCode = subjectCode.trim();
    if (!finalCode) {
      finalCode = generateSubjectCode(subjectName, existingCodes);
    }

    setSaving(true);
    try {
      await createSubject(profile.school_id, subjectName.trim(), finalCode || undefined);
      toast(`Subject "${subjectName.trim()}" added`, 'success');
      setModalOpen(false);
      loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add subject', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteSubject(deleteId);
      toast('Subject deleted', 'success');
      loadData();
    } catch {
      toast('Failed to delete subject', 'error');
    }
  }

  return (
    <DashboardLayout title="Subjects">
      <div className="space-y-6">
        <PageHeader
          title="Subjects"
          description="Add subjects — a unique code is generated automatically"
          action={
            isClassIncharge ? (
              <Button icon={<Plus className="h-4 w-4" />} onClick={openModal}>
                Add Subject
              </Button>
            ) : null
          }
        />

        {loading ? (
          <LoadingSpinner />
        ) : !isClassIncharge ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-20 text-center">
            <BookOpen className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No class assigned</p>
            <p className="mt-1 text-sm text-gray-400">You need to be assigned as class incharge to manage subjects</p>
          </div>
        ) : subjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-20 text-center">
            <BookOpen className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No subjects yet</p>
            <p className="mt-1 text-sm text-gray-400">Click "Add Subject" to begin</p>
          </div>
        ) : (
          <Card className="p-5">
            <div className="flex flex-wrap gap-2">
              {subjects.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                    {s.code && (
                      <p className="text-xs font-mono font-medium text-blue-600">{s.code}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setDeleteId(s.id)}
                    className="ml-2 rounded-md p-1 text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Subject list as table for easier reading */}
        {isClassIncharge && subjects.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50/60">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-600">#</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Subject Name</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Code</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subjects.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-4 py-3">
                      {s.code ? (
                        <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs font-semibold text-blue-700">
                          {s.code}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setDeleteId(s.id)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add Subject Modal ── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Subject"
        description="Type the subject name — the code is generated automatically"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving}>Add Subject</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            ref={nameInputRef}
            label="Subject Name"
            required
            placeholder="e.g. English, Mathematics, Hindi"
            value={subjectName}
            onChange={(e) => handleNameChange(e.target.value)}
          />

          <div>
            <Input
              label="Subject Code"
              placeholder="Auto-generated"
              value={subjectCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              hint="Auto-generated from name. You can edit if needed."
            />
            {subjectCode && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-500">Preview:</span>
                <span className="rounded-md bg-blue-50 px-2.5 py-1 font-mono text-sm font-semibold text-blue-700">
                  {subjectCode}
                </span>
                {codeManuallyEdited && (
                  <button
                    onClick={() => {
                      setCodeManuallyEdited(false);
                      const existingCodes = subjects.map((s) => s.code || '');
                      setSubjectCode(generateSubjectCode(subjectName, existingCodes));
                    }}
                    className="text-xs text-gray-400 underline hover:text-blue-600"
                  >
                    reset
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Subject"
        message="Are you sure you want to delete this subject?"
        confirmText="Delete"
        variant="danger"
      />
    </DashboardLayout>
  );
}

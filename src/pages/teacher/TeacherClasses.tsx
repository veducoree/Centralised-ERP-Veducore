import { useEffect, useState, useCallback } from 'react';
import { BookOpen, GraduationCap, Layers } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { PageHeader, LoadingSpinner, SearchInput } from '@/components/ui/Primitives';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/auth/AuthContext';
import { fetchTeacherByUserId, fetchTeacherAssignments } from '@/services/api';
import type { Teacher, ClassAssignment } from '@/types';

interface SectionCard {
  key: string;           // classId-sectionId
  classId: string;
  sectionId: string;
  className: string;
  sectionName: string;
  isClassTeacher: boolean;
  subjects: { id: string; name: string; code: string | null }[];
}

export default function TeacherClasses() {
  const { profile } = useAuth();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [cards, setCards] = useState<SectionCard[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const t = await fetchTeacherByUserId(profile.id);
      if (!t) return;
      setTeacher(t);

      const assignments: ClassAssignment[] = await fetchTeacherAssignments(t.id);

      // Group by class + section
      const map = new Map<string, SectionCard>();

      for (const a of assignments) {
        const key = `${a.class_id}-${a.section_id}`;

        if (!map.has(key)) {
          map.set(key, {
            key,
            classId: a.class_id,
            sectionId: a.section_id,
            className: a.class?.name || '—',
            sectionName: a.section?.name || '—',
            isClassTeacher: false,
            subjects: [],
          });
        }

        const card = map.get(key)!;

        if (!a.subject_id) {
          // null subject = class teacher role
          card.isClassTeacher = true;
        } else if (a.subject) {
          card.subjects.push({
            id: a.subject_id,
            name: a.subject.name,
            code: a.subject.code ?? null,
          });
        }
      }

      setCards(Array.from(map.values()));
    } catch {
      /* handled */
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <DashboardLayout title="My Classes">
      <div className="space-y-6">
        <PageHeader
          title="My Classes"
          description="Classes and subjects assigned to you by admin"
        />

        <div className="max-w-sm">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by class name or section..." />
        </div>

        {loading ? (
          <LoadingSpinner variant="cards" />
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-20 text-center">
            <BookOpen className="h-12 w-12 text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">No classes assigned yet</p>
            <p className="mt-1 text-sm text-gray-400">Contact your administrator to assign classes</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.filter((c) => {
              const q = search.toLowerCase();
              if (!q) return true;
              return c.className.toLowerCase().includes(q) || c.sectionName.toLowerCase().includes(q);
            }).map((card) => (
              <Card key={card.key} className="p-5 flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50">
                    <BookOpen className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 leading-tight">
                      {card.className}
                    </h3>
                    <p className="text-sm text-gray-500">Section {card.sectionName}</p>
                  </div>
                  {card.isClassTeacher && (
                    <Badge variant="info" className="flex-shrink-0 flex items-center gap-1">
                      <GraduationCap className="h-3 w-3" />
                      Class Teacher
                    </Badge>
                  )}
                </div>

                {/* Subjects */}
                <div>
                  {card.subjects.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">
                      {card.isClassTeacher
                        ? 'No subject assigned — class teacher only'
                        : 'No subjects assigned'}
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
                        <Layers className="h-3 w-3" /> Subjects
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {card.subjects.map((subj) => (
                          <span
                            key={subj.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 border border-gray-200 px-2.5 py-1 text-xs"
                          >
                            <span className="font-medium text-gray-800">{subj.name}</span>
                            {subj.code && (
                              <span className="font-mono font-bold text-blue-600">{subj.code}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
